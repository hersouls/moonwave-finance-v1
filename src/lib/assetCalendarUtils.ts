import type { AssetItem, DailyValue } from '@/lib/types'

export interface DailyNetWorth {
  date: string
  totalAssets: number
  totalLiabilities: number
  netWorth: number
  change: number // vs previous day
}

/**
 * Computes daily net worth values for a month, using the latest available value
 * for each asset/liability item on or before each date.
 */
export function computeDailyNetWorth(
  items: AssetItem[],
  dailyValues: DailyValue[],
  daysInMonth: string[]
): Map<string, DailyNetWorth> {
  const result = new Map<string, DailyNetWorth>()

  // Group daily values by item
  const valuesByItem = new Map<number, DailyValue[]>()
  for (const dv of dailyValues) {
    const list = valuesByItem.get(dv.assetItemId) || []
    list.push(dv)
    valuesByItem.set(dv.assetItemId, list)
  }

  // Sort each item's values by date
  for (const [, vals] of valuesByItem) {
    vals.sort((a, b) => a.date.localeCompare(b.date))
  }

  let prevNetWorth = 0

  for (const dateStr of daysInMonth) {
    let totalAssets = 0
    let totalLiabilities = 0

    for (const item of items) {
      if (!item.id) continue
      const vals = valuesByItem.get(item.id)
      if (!vals || vals.length === 0) continue

      // Find the latest value on or before this date
      let latestValue = 0
      for (const v of vals) {
        if (v.date <= dateStr) {
          latestValue = v.value
        } else {
          break
        }
      }

      if (item.type === 'asset') {
        totalAssets += latestValue
      } else {
        totalLiabilities += latestValue
      }
    }

    const netWorth = totalAssets - totalLiabilities
    const change = netWorth - prevNetWorth

    result.set(dateStr, {
      date: dateStr,
      totalAssets,
      totalLiabilities,
      netWorth,
      change: result.size === 0 ? 0 : change,
    })

    prevNetWorth = netWorth
  }

  return result
}
