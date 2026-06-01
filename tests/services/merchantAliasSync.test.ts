import { describe, it, expect, beforeEach, vi } from 'vitest'

// firestoreSync imports '@/lib/firebase', which calls initializeApp() at module
// load. Stub it so the import is side-effect-free in the test env — we only
// exercise the Dexie-level merge logic, never the network.
vi.mock('@/lib/firebase', () => ({ firestore: {}, auth: {} }))

import { db } from '@/services/database'
import { mergeTableWithRemap } from '@/services/firestoreSync'
import { setAlias } from '@/services/merchantAliasService'
import type { MerchantAlias, TransactionCategory } from '@/lib/types'

async function seedCategory(): Promise<{ id: number; syncId: string }> {
  const syncId = 'cat-식비'
  const now = '2026-01-01T00:00:00.000Z'
  const id = (await db.transactionCategories.add({
    name: '식비', type: 'expense', color: '#000', icon: 'X',
    sortOrder: 0, syncId, createdAt: now, updatedAt: now,
  } as TransactionCategory)) as number
  return { id, syncId }
}

describe('merchantAliases cross-device sync (unique merchantKey)', () => {
  beforeEach(async () => {
    await db.merchantAliases.clear()
    await db.transactionCategories.clear()
  })

  it('does not throw or duplicate when a peer alias shares the merchantKey', async () => {
    const cat = await seedCategory()

    // This device already learned "스타벅스" locally (older).
    await db.merchantAliases.add({
      syncId: 'local-A',
      merchantKey: '스타벅스',
      categoryId: cat.id,
      source: 'user-override',
      usageCount: 3,
      learnedAt: '2026-01-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    } as MerchantAlias)

    // A peer device uploaded the same merchant under a different syncId (newer).
    const cloud: Record<string, unknown> = {
      syncId: 'cloud-B',
      merchantKey: '스타벅스',
      categoryId: cat.id,
      categoryId_syncId: cat.syncId,
      source: 'ai-suggestion',
      usageCount: 9,
      learnedAt: '2026-01-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
      __deviceId: 'device-B',
      __schemaV: 2,
    }

    // Before the fix this threw ConstraintError on the &merchantKey index.
    await expect(mergeTableWithRemap('merchantAliases', [cloud])).resolves.toBeUndefined()

    const rows = await db.merchantAliases.toArray()
    expect(rows).toHaveLength(1) // converged, not duplicated
    // Newer cloud version won LWW and the row adopted the peer's syncId.
    expect(rows[0].syncId).toBe('cloud-B')
    expect(rows[0].source).toBe('ai-suggestion')
    expect(rows[0].usageCount).toBe(9)
    expect(rows[0].categoryId).toBe(cat.id)
  })

  it('keeps the local row (and does not duplicate) when it is newer than the peer', async () => {
    const cat = await seedCategory()

    await db.merchantAliases.add({
      syncId: 'local-A',
      merchantKey: '스타벅스',
      categoryId: cat.id,
      source: 'user-override',
      usageCount: 5,
      learnedAt: '2026-01-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z', // newer than cloud
    } as MerchantAlias)

    const cloud: Record<string, unknown> = {
      syncId: 'cloud-B',
      merchantKey: '스타벅스',
      categoryId: cat.id,
      categoryId_syncId: cat.syncId,
      source: 'ai-suggestion',
      usageCount: 1,
      learnedAt: '2026-01-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
      __deviceId: 'device-B',
      __schemaV: 2,
    }

    await expect(mergeTableWithRemap('merchantAliases', [cloud])).resolves.toBeUndefined()

    const rows = await db.merchantAliases.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0].source).toBe('user-override') // local kept
    expect(rows[0].usageCount).toBe(5)
  })

  it('setAlias assigns a deterministic syncId derived from the merchantKey', async () => {
    await setAlias({ merchant: '스타벅스 강남R점', categoryId: 1, source: 'user-override' })

    const rows = await db.merchantAliases.toArray()
    expect(rows).toHaveLength(1)
    // Deterministic ⇒ every device computes this same syncId for the same
    // merchant, so they write to the same Firestore doc and never duplicate.
    expect(rows[0].syncId).toBe(`alias:${rows[0].merchantKey}`)
  })

  it('collapses multiple cloud docs that share one merchantKey into a single row', async () => {
    const cat = await seedCategory()

    const mk = (syncId: string, updatedAt: string): Record<string, unknown> => ({
      syncId,
      merchantKey: '다이소',
      categoryId: cat.id,
      categoryId_syncId: cat.syncId,
      source: 'ai-suggestion',
      usageCount: 1,
      learnedAt: '2026-01-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt,
      __deviceId: 'device-X',
      __schemaV: 2,
    })

    // No local row yet; two peers each uploaded "다이소".
    await expect(
      mergeTableWithRemap('merchantAliases', [
        mk('cloud-B', '2026-02-01T00:00:00.000Z'),
        mk('cloud-C', '2026-03-01T00:00:00.000Z'),
      ]),
    ).resolves.toBeUndefined()

    const rows = await db.merchantAliases.toArray()
    expect(rows).toHaveLength(1)
  })
})
