import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { canDeviceWrite, isDeviceReadOnly } from '@/lib/writeGuard'
import { useSettingsStore } from '@/stores/settingsStore'
import { db, addTransaction, setSyncWritingFlag } from '@/services/database'
import type { Transaction } from '@/lib/types'

function setReadOnly(readOnly: boolean) {
  useSettingsStore.getState().setDeviceWriteEnabled(!readOnly)
}

function makeTxn(): Omit<Transaction, 'id'> {
  const now = '2026-01-01T00:00:00.000Z'
  return {
    syncId: crypto.randomUUID(),
    memberId: null,
    type: 'expense',
    amount: 1000,
    categoryId: null,
    date: '2026-01-01',
    isRecurring: false,
    createdAt: now,
    updatedAt: now,
  }
}

describe('writeGuard flag semantics', () => {
  afterEach(() => setReadOnly(false))

  it('defaults to writable when the flag is undefined', () => {
    useSettingsStore.setState((s) => ({ settings: { ...s.settings, deviceWriteEnabled: undefined } }))
    expect(canDeviceWrite()).toBe(true)
    expect(isDeviceReadOnly()).toBe(false)
  })

  it('is read-only only when explicitly false', () => {
    setReadOnly(true)
    expect(canDeviceWrite()).toBe(false)
    expect(isDeviceReadOnly()).toBe(true)
    setReadOnly(false)
    expect(canDeviceWrite()).toBe(true)
  })
})

describe('local write gate (Dexie change-tracking hooks)', () => {
  beforeEach(async () => {
    setReadOnly(false)
    await db.transactions.clear()
  })
  afterEach(() => setReadOnly(false))

  it('allows user writes when writable', async () => {
    const id = await addTransaction(makeTxn())
    expect(typeof id).toBe('number')
    expect(await db.transactions.count()).toBe(1)
  })

  it('blocks user-initiated writes when read-only (nothing persisted)', async () => {
    setReadOnly(true)
    await expect(addTransaction(makeTxn())).rejects.toThrow()
    setReadOnly(false)
    expect(await db.transactions.count()).toBe(0)
  })

  it('still allows sync-flagged writes (downloads) on a read-only device', async () => {
    setReadOnly(true)
    // Sync ingestion path: setSyncWritingFlag(true) marks the write as
    // sync-originated so the read-only gate lets it through.
    setSyncWritingFlag(true)
    try {
      const id = await db.transactions.add(makeTxn() as Transaction)
      expect(id).toBeDefined()
    } finally {
      setSyncWritingFlag(false)
    }
    expect(await db.transactions.count()).toBe(1)
    setReadOnly(false)
  })

  it('blocks updates and deletes when read-only (state unchanged)', async () => {
    const id = await addTransaction(makeTxn())
    setReadOnly(true)
    await expect(db.transactions.update(id, { amount: 5 })).rejects.toThrow()
    await expect(db.transactions.delete(id)).rejects.toThrow()
    setReadOnly(false)
    const row = await db.transactions.get(id)
    expect(row?.amount).toBe(1000) // unchanged
  })
})
