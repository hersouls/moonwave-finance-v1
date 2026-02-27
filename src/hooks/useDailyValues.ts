import { useMemo, useCallback } from 'react'
import { useAssetStore } from '@/stores/assetStore'
import { useDailyValueStore } from '@/stores/dailyValueStore'
import { getMonthDates } from '@/lib/dateUtils'
import type { AssetCategory, AssetItem } from '@/lib/types'

interface CategoryGroup {
  category: AssetCategory
  items: AssetItem[]
  subtotals: Map<string, number>
}

interface DailyValueGrid {
  dates: string[]
  assetGroups: CategoryGroup[]
  liabilityGroups: CategoryGroup[]
  assetTotals: Map<string, number>
  liabilityTotals: Map<string, number>
  netWorthByDate: Map<string, number>
}

export function useDailyValueGrid(memberId: number | null): DailyValueGrid {
  const categories = useAssetStore((s) => s.categories)
  const items = useAssetStore((s) => s.items)
  const values = useDailyValueStore((s) => s.values)
  const selectedMonth = useDailyValueStore((s) => s.selectedMonth)

  return useMemo(() => {
    const dates = getMonthDates(selectedMonth)
    const valueMap = new Map<string, number>()
    for (const v of values) {
      valueMap.set(`${v.assetItemId}-${v.date}`, v.value)
    }

    const filteredItems = memberId
      ? items.filter(i => i.memberId === memberId && i.isActive)
      : items.filter(i => i.isActive)

    function buildGroups(type: 'asset' | 'liability'): CategoryGroup[] {
      const typeCats = categories
        .filter(c => c.type === type)
        .sort((a, b) => a.sortOrder - b.sortOrder)

      return typeCats
        .map(cat => {
          const catItems = filteredItems
            .filter(i => i.categoryId === cat.id)
            .sort((a, b) => a.sortOrder - b.sortOrder)

          const subtotals = new Map<string, number>()
          for (const date of dates) {
            let sub = 0
            for (const item of catItems) {
              sub += valueMap.get(`${item.id}-${date}`) || 0
            }
            subtotals.set(date, sub)
          }

          return { category: cat, items: catItems, subtotals }
        })
        .filter(g => g.items.length > 0)
    }

    const assetGroups = buildGroups('asset')
    const liabilityGroups = buildGroups('liability')

    const assetTotals = new Map<string, number>()
    const liabilityTotals = new Map<string, number>()
    const netWorthByDate = new Map<string, number>()

    for (const date of dates) {
      let assetSum = 0
      let liabilitySum = 0
      for (const g of assetGroups) assetSum += g.subtotals.get(date) || 0
      for (const g of liabilityGroups) liabilitySum += g.subtotals.get(date) || 0
      assetTotals.set(date, assetSum)
      liabilityTotals.set(date, liabilitySum)
      netWorthByDate.set(date, assetSum - liabilitySum)
    }

    return { dates, assetGroups, liabilityGroups, assetTotals, liabilityTotals, netWorthByDate }
  }, [categories, items, values, selectedMonth, memberId])
}

export function useDailyValueCell() {
  const values = useDailyValueStore((s) => s.values)
  const setValue = useDailyValueStore((s) => s.setValue)

  const getValue = useCallback(
    (assetItemId: number, date: string): number | null => {
      const val = values.find(v => v.assetItemId === assetItemId && v.date === date)
      return val ? val.value : null
    },
    [values]
  )

  const getPreviousValue = useCallback(
    (assetItemId: number, date: string): number | null => {
      const d = new Date(date)
      d.setDate(d.getDate() - 1)
      const prevDate = d.toISOString().split('T')[0]
      const val = values.find(v => v.assetItemId === assetItemId && v.date === prevDate)
      return val ? val.value : null
    },
    [values]
  )

  return { getValue, getPreviousValue, setValue }
}
