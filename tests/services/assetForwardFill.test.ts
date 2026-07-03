import { describe, it, expect } from 'vitest'
import {
  groupValuesByItem,
  valueAsOf,
  latestAndPrev,
  calculateDailyNetWorth,
} from '@/services/assetAnalytics'
import type { AssetItem, DailyValue } from '@/lib/types'

function dv(assetItemId: string, date: string, value: number): DailyValue {
  return { id: `dv-${assetItemId}-${date}`, assetItemId, date, value, createdAt: '', updatedAt: '' }
}

function item(id: string, type: 'asset' | 'liability'): AssetItem {
  return {
    id,
    memberId: 'member-1',
    categoryId: 'cat-1',
    name: `item-${id}`,
    type,
    isActive: true,
    sortOrder: 0,
    createdAt: '',
    updatedAt: '',
  }
}

describe('forward-fill value resolution', () => {
  it('groups values by item sorted by date descending', () => {
    const map = groupValuesByItem([
      dv('a1', '2026-01-01', 100),
      dv('a1', '2026-03-01', 300),
      dv('a1', '2026-02-01', 200),
      dv('a2', '2026-01-15', 50),
    ])
    expect(map.get('a1')!.map(v => v.date)).toEqual(['2026-03-01', '2026-02-01', '2026-01-01'])
    expect(map.get('a2')!.map(v => v.value)).toEqual([50])
  })

  it('valueAsOf returns the most recent value at or before the asOf date', () => {
    const series = groupValuesByItem([
      dv('a1', '2026-01-10', 100),
      dv('a1', '2026-02-10', 200),
    ]).get('a1')
    // before any record
    expect(valueAsOf(series, '2026-01-01')).toBe(0)
    // exactly on a record
    expect(valueAsOf(series, '2026-01-10')).toBe(100)
    // between records → forward-fill the older one
    expect(valueAsOf(series, '2026-02-09')).toBe(100)
    // after the latest record → forward-fill the latest (the cross-month bug)
    expect(valueAsOf(series, '2026-05-30')).toBe(200)
  })

  it('valueAsOf returns 0 for items with no series', () => {
    expect(valueAsOf(undefined, '2026-05-30')).toBe(0)
    expect(valueAsOf([], '2026-05-30')).toBe(0)
  })

  it('latestAndPrev returns newest and the record before it', () => {
    const series = groupValuesByItem([
      dv('a1', '2026-01-10', 100),
      dv('a1', '2026-02-10', 250),
      dv('a1', '2026-03-10', 400),
    ]).get('a1')
    const { latest, prev, latestDate } = latestAndPrev(series)
    expect(latest).toBe(400)
    expect(prev).toBe(250)
    expect(latestDate).toBe('2026-03-10')
  })

  it('latestAndPrev collapses prev to latest when only one record exists', () => {
    const series = groupValuesByItem([dv('a1', '2026-01-10', 100)]).get('a1')
    expect(latestAndPrev(series)).toEqual({ latest: 100, prev: 100, latestDate: '2026-01-10' })
  })
})

describe('calculateDailyNetWorth forward-fill', () => {
  it('carries the last known value forward across days with no records', () => {
    const items = [item('a1', 'asset'), item('l1', 'liability')]
    // asset value set only on the 1st; liability only on the 1st
    const values = [dv('a1', '2026-03-01', 1_000_000), dv('l1', '2026-03-01', 400_000)]
    const snapshots = calculateDailyNetWorth('2026-03', items, values)
    expect(snapshots).toHaveLength(31)
    // every day should reflect the carried-forward net worth, not drop to 0
    expect(snapshots[0].netWorth).toBe(600_000)
    expect(snapshots[15].netWorth).toBe(600_000)
    expect(snapshots[30].netWorth).toBe(600_000)
  })

  it('carries a value recorded in a previous month into the current month', () => {
    const items = [item('a1', 'asset')]
    const values = [dv('a1', '2026-01-20', 5_000_000)] // recorded long ago
    const snapshots = calculateDailyNetWorth('2026-03', items, values)
    // The whole of March should show 5,000,000 — not 0 (the original bug)
    expect(snapshots.every(s => s.netWorth === 5_000_000)).toBe(true)
  })

  it('computes debt ratio from total assets, not net worth', () => {
    const items = [item('a1', 'asset'), item('l1', 'liability')]
    const values = [dv('a1', '2026-03-01', 1_000_000), dv('l1', '2026-03-01', 250_000)]
    const snapshots = calculateDailyNetWorth('2026-03', items, values)
    expect(snapshots[0].debtRatio).toBeCloseTo(25, 5)
  })
})
