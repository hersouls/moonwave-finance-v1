import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db } from '@/services/database'
import { useSettingsStore } from '@/stores/settingsStore'
import {
  analyzeDuplicates,
  deleteDuplicates,
  allowDuplicateGroup,
  clearAllDuplicateAllowances,
} from '@/services/duplicateCleanup'
import type { Transaction } from '@/lib/types'

const NOW = '2026-01-01T00:00:00.000Z'
let seq = 0

function add(memo: string, amount: number, date: string, extra: Partial<Transaction> = {}) {
  return db.transactions.add({
    syncId: `dup-${seq++}`,
    memberId: null,
    type: 'expense',
    amount,
    categoryId: null,
    date,
    memo,
    isRecurring: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  } as Transaction) as Promise<number>
}

describe('analyzeDuplicates', () => {
  beforeEach(async () => {
    useSettingsStore.getState().setDeviceWriteEnabled(true)
    await db.transactions.clear()
  })
  afterEach(() => useSettingsStore.getState().setDeviceWriteEnabled(true))

  it('groups same memo+amount on the same day as an exact duplicate', async () => {
    await add('A마트', 5000, '2026-01-01')
    await add('A마트', 5000, '2026-01-01')
    await add('A마트', 5000, '2026-01-01')
    const { groups, totalDuplicates } = await analyzeDuplicates()
    const a = groups.find((g) => g.sampleMemo === 'A마트')
    expect(a).toBeTruthy()
    expect(a!.confidence).toBe('exact')
    expect(a!.count).toBe(3)
    expect(totalDuplicates).toBe(2) // keep 1, 2 deletable
  })

  it('grades confidence by date span (high ≤7d, medium ≤31d)', async () => {
    await add('B카페', 3000, '2026-01-01')
    await add('B카페', 3000, '2026-01-05') // 4 days → high
    await add('C샵', 7000, '2026-01-01')
    await add('C샵', 7000, '2026-01-31') // 30 days → medium
    const { groups } = await analyzeDuplicates()
    expect(groups.find((g) => g.sampleMemo === 'B카페')!.confidence).toBe('high')
    expect(groups.find((g) => g.sampleMemo === 'C샵')!.confidence).toBe('medium')
  })

  it('does NOT group transactions more than ~1 month apart', async () => {
    await add('D점', 9000, '2026-01-01')
    await add('D점', 9000, '2026-03-01') // ~59 days → separate clusters
    const { groups } = await analyzeDuplicates()
    expect(groups.find((g) => g.sampleMemo === 'D점')).toBeUndefined()
  })

  it('excludes auto-generated recurring rows (recurSourceId set)', async () => {
    await add('E넷플릭스', 17000, '2026-01-01', { recurSourceId: 1 })
    await add('E넷플릭스', 17000, '2026-01-01', { recurSourceId: 1 })
    const { groups } = await analyzeDuplicates()
    expect(groups.find((g) => g.sampleMemo === 'E넷플릭스')).toBeUndefined()
  })

  it('does not group different amounts or income', async () => {
    await add('F', 1000, '2026-01-01')
    await add('F', 2000, '2026-01-01') // different amount
    await add('G수입', 4000, '2026-01-01', { type: 'income' })
    await add('G수입', 4000, '2026-01-01', { type: 'income' })
    const { groups } = await analyzeDuplicates()
    expect(groups.find((g) => g.sampleMemo === 'F')).toBeUndefined()
    expect(groups.find((g) => g.sampleMemo === 'G수입')).toBeUndefined()
  })

  it('recommends keeping the earliest transaction', async () => {
    const id1 = await add('H', 1200, '2026-01-02')
    await add('H', 1200, '2026-01-10')
    // insert an earlier-dated one last to confirm sort-by-date, not insert order
    const earliest = await add('H', 1200, '2026-01-01')
    const { groups } = await analyzeDuplicates()
    const h = groups.find((g) => g.sampleMemo === 'H')!
    expect(h.recommendedKeepId).toBe(earliest)
    expect(h.recommendedKeepId).not.toBe(id1)
  })
})

describe('analyzeDuplicates — safety fixes', () => {
  beforeEach(async () => {
    useSettingsStore.getState().setDeviceWriteEnabled(true)
    await db.transactions.clear()
  })
  afterEach(() => useSettingsStore.getState().setDeviceWriteEnabled(true))

  it('does not merge different branch suffixes (strict memo, not branch-stripped)', async () => {
    await add('스타벅스(강남)', 5000, '2026-01-01')
    await add('스타벅스(부산)', 5000, '2026-01-02')
    const { groups } = await analyzeDuplicates()
    expect(groups.length).toBe(0) // distinct memos → never grouped
  })

  it('auto-selects only same-day duplicates, not distinct-day same-price repeats', async () => {
    await add('A', 1000, '2026-01-01')
    await add('A', 1000, '2026-01-01') // same-day pair → exact
    await add('B', 2000, '2026-01-01')
    await add('B', 2000, '2026-01-05') // distinct-day pair → not auto-deletable
    const { groups, confidentDuplicates } = await analyzeDuplicates()
    const a = groups.find((g) => g.sampleMemo === 'A')!
    const b = groups.find((g) => g.sampleMemo === 'B')!
    expect(a.confidence).toBe('exact')
    expect(a.autoDeleteIds.length).toBe(1)
    expect(b.confidence).toBe('high')
    expect(b.autoDeleteIds.length).toBe(0) // distinct days → nothing pre-selected
    expect(confidentDuplicates).toBe(1) // only the genuine same-day extra
  })

  it('gives separate clusters distinct keys so keepers do not collide', async () => {
    await add('C', 3000, '2026-01-01')
    await add('C', 3000, '2026-01-01')
    await add('C', 3000, '2026-03-01') // >31 days → second cluster, same bucket
    await add('C', 3000, '2026-03-01')
    const cGroups = (await analyzeDuplicates()).groups.filter((g) => g.sampleMemo === 'C')
    expect(cGroups.length).toBe(2)
    expect(new Set(cGroups.map((g) => g.key)).size).toBe(2) // unique keys
    for (const g of cGroups) {
      expect(g.autoDeleteIds).not.toContain(g.recommendedKeepId) // keeper safe in each
    }
  })
})

describe('allow / clear duplicate allowances', () => {
  beforeEach(async () => {
    useSettingsStore.getState().setDeviceWriteEnabled(true)
    await db.transactions.clear()
  })
  afterEach(() => useSettingsStore.getState().setDeviceWriteEnabled(true))

  it('excludes an allowed pattern and re-includes it after clearing', async () => {
    await add('Z마트', 5000, '2026-01-01')
    await add('Z마트', 5000, '2026-01-01')

    let res = await analyzeDuplicates()
    const z = res.groups.find((g) => g.sampleMemo === 'Z마트')
    expect(z).toBeTruthy()

    await allowDuplicateGroup(z!.transactions.map((t) => t.id!))
    res = await analyzeDuplicates()
    expect(res.groups.find((g) => g.sampleMemo === 'Z마트')).toBeUndefined()
    expect(res.allowedPatterns).toBe(1)

    const cleared = await clearAllDuplicateAllowances()
    expect(cleared).toBe(2)
    res = await analyzeDuplicates()
    expect(res.groups.find((g) => g.sampleMemo === 'Z마트')).toBeTruthy()
    expect(res.allowedPatterns).toBe(0)
  })

  it('allowance also excludes future same-pattern rows', async () => {
    await add('Y샵', 3000, '2026-01-01')
    await add('Y샵', 3000, '2026-01-01')
    const z = (await analyzeDuplicates()).groups.find((g) => g.sampleMemo === 'Y샵')!
    await allowDuplicateGroup(z.transactions.map((t) => t.id!))

    // A NEW same-pattern pair arrives later — still excluded (pattern allowed).
    await add('Y샵', 3000, '2026-02-01')
    await add('Y샵', 3000, '2026-02-01')
    const res = await analyzeDuplicates()
    expect(res.groups.find((g) => g.sampleMemo === 'Y샵')).toBeUndefined()
  })
})

describe('deleteDuplicates', () => {
  beforeEach(async () => {
    useSettingsStore.getState().setDeviceWriteEnabled(true)
    await db.transactions.clear()
  })
  afterEach(() => useSettingsStore.getState().setDeviceWriteEnabled(true))

  it('deletes the given transactions and leaves the keeper', async () => {
    await add('I', 8000, '2026-01-01')
    await add('I', 8000, '2026-01-01')
    await add('I', 8000, '2026-01-01')
    const before = await analyzeDuplicates()
    const g = before.groups.find((x) => x.sampleMemo === 'I')!
    const toDelete = g.transactions.filter((t) => t.id !== g.recommendedKeepId).map((t) => t.id!)
    expect(toDelete.length).toBe(2)

    const deleted = await deleteDuplicates(toDelete)
    expect(deleted).toBe(2)
    expect(await db.transactions.count()).toBe(1)
    const after = await analyzeDuplicates()
    expect(after.groups.find((x) => x.sampleMemo === 'I')).toBeUndefined()
  })
})
