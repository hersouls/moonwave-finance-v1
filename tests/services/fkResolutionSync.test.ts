import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/firebase', () => ({ firestore: {}, auth: {} }))

import { db } from '@/services/database'
import { mergeTableWithRemap } from '@/services/firestoreSync'
import type { Transaction, TransactionCategory } from '@/lib/types'

/**
 * Cross-device FK resolution. The cloud doc carries the WRITER's local id in
 * `categoryId` plus the definitive `categoryId_syncId` companion. On this
 * (reader) device the same category has a DIFFERENT local id. Correct sync must
 * resolve the FK via the syncId companion to the reader's id — not trust the
 * writer's raw numeric id, and not null it out.
 *
 * Regression guard for the strip-before-resolve ordering bug, which stripped the
 * companion before resolveFksOnRecord could use it, forcing the fragile legacy
 * id-mapping fallback.
 */
describe('cross-device FK resolution via *_syncId companion', () => {
  beforeEach(async () => {
    await db.transactions.clear()
    await db.transactionCategories.clear()
  })

  it('maps a transaction FK to THIS device local id, not the cloud writer id', async () => {
    const catSyncId = 'cat-식비-shared'
    const now = '2026-05-01T00:00:00.000Z'

    // Reader's local category. Its local id is whatever Dexie assigns here and is
    // deliberately NOT equal to the writer-side id we put in the cloud doc below.
    const localCatId = (await db.transactionCategories.add({
      name: '식비', type: 'expense', color: '#000', icon: 'X',
      sortOrder: 0, syncId: catSyncId, createdAt: now, updatedAt: now,
    } as TransactionCategory)) as number

    const writerCategoryId = localCatId + 1000 // writer's local id — meaningless here

    const cloudTxn: Record<string, unknown> = {
      syncId: 'txn-1',
      type: 'expense',
      amount: 12000,
      date: '2026-05-10',
      categoryId: writerCategoryId,
      categoryId_syncId: catSyncId, // definitive cross-device link
      memberId_syncId: null,
      paymentMethodItemId_syncId: null,
      subscriptionId_syncId: null,
      createdAt: now,
      updatedAt: now,
      __deviceId: 'device-writer',
      __schemaV: 2,
    }

    await mergeTableWithRemap('transactions', [cloudTxn])

    const rows = await db.transactions.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0].categoryId).toBe(localCatId)        // resolved via syncId
    expect(rows[0].categoryId).not.toBe(writerCategoryId)
    // The transport companion must not leak into the Dexie record.
    expect((rows[0] as Record<string, unknown>).categoryId_syncId).toBeUndefined()
    expect((rows[0] as Record<string, unknown>).__deviceId).toBeUndefined()
  })

  it('updates an existing local transaction FK using the companion', async () => {
    const catSyncId = 'cat-교통-shared'
    const now = '2026-05-01T00:00:00.000Z'
    const localCatId = (await db.transactionCategories.add({
      name: '교통비', type: 'expense', color: '#000', icon: 'X',
      sortOrder: 1, syncId: catSyncId, createdAt: now, updatedAt: now,
    } as TransactionCategory)) as number

    // Local transaction already exists (older), with a stale categoryId.
    await db.transactions.add({
      syncId: 'txn-2', type: 'expense', amount: 5000, date: '2026-05-02',
      categoryId: 0, createdAt: now, updatedAt: '2026-05-01T00:00:00.000Z',
    } as unknown as Transaction)

    const cloudTxn: Record<string, unknown> = {
      syncId: 'txn-2',
      type: 'expense',
      amount: 5500,
      date: '2026-05-02',
      categoryId: localCatId + 500,
      categoryId_syncId: catSyncId,
      createdAt: now,
      updatedAt: '2026-06-01T00:00:00.000Z', // newer → wins LWW
      __deviceId: 'device-writer',
      __schemaV: 2,
    }

    await mergeTableWithRemap('transactions', [cloudTxn])

    const rows = await db.transactions.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0].amount).toBe(5500)
    expect(rows[0].categoryId).toBe(localCatId)
  })
})
