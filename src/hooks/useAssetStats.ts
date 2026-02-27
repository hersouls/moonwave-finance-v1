import { useMemo } from 'react'
import type { AssetStats, CategoryBreakdown, MemberBreakdown } from '@/lib/types'
import { useAssetStore } from '@/stores/assetStore'
import { useDailyValueStore } from '@/stores/dailyValueStore'
import { useMemberStore } from '@/stores/memberStore'
import { getTodayString } from '@/lib/dateUtils'

function getYesterday(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
}

function getFirstDayOfMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export function useAssetStats(): AssetStats {
  const items = useAssetStore((s) => s.items)
  const values = useDailyValueStore((s) => s.values)

  return useMemo(() => {
    const today = getTodayString()
    const yesterday = getYesterday()
    const monthStart = getFirstDayOfMonth()

    let totalAssets = 0
    let totalLiabilities = 0
    let totalAssetsYesterday = 0
    let totalLiabilitiesYesterday = 0
    let totalAssetsMonthStart = 0
    let totalLiabilitiesMonthStart = 0

    for (const item of items) {
      if (!item.isActive) continue

      // Get today's value (or the most recent value)
      const todayVal = values.find(v => v.assetItemId === item.id && v.date === today)
      // If no value today, find latest value for this item
      const latestVal = todayVal || values
        .filter(v => v.assetItemId === item.id)
        .sort((a, b) => b.date.localeCompare(a.date))[0]
      const currentValue = latestVal?.value || 0

      const yesterdayVal = values.find(v => v.assetItemId === item.id && v.date === yesterday)
      const yesterdayValue = yesterdayVal?.value || currentValue

      const monthStartVal = values.find(v => v.assetItemId === item.id && v.date === monthStart)
      const monthStartValue = monthStartVal?.value || currentValue

      if (item.type === 'asset') {
        totalAssets += currentValue
        totalAssetsYesterday += yesterdayValue
        totalAssetsMonthStart += monthStartValue
      } else {
        totalLiabilities += currentValue
        totalLiabilitiesYesterday += yesterdayValue
        totalLiabilitiesMonthStart += monthStartValue
      }
    }

    const netWorth = totalAssets - totalLiabilities
    const netWorthYesterday = totalAssetsYesterday - totalLiabilitiesYesterday
    const netWorthMonthStart = totalAssetsMonthStart - totalLiabilitiesMonthStart
    const debtRatio = totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0

    return {
      totalAssets,
      totalLiabilities,
      netWorth,
      debtRatio,
      dailyChange: netWorth - netWorthYesterday,
      monthlyChange: netWorth - netWorthMonthStart,
    }
  }, [items, values])
}

export function useCategoryBreakdown(type: 'asset' | 'liability'): CategoryBreakdown[] {
  const categories = useAssetStore((s) => s.categories)
  const items = useAssetStore((s) => s.items)
  const values = useDailyValueStore((s) => s.values)

  return useMemo(() => {
    const typeCats = categories.filter(c => c.type === type)
    const breakdowns: CategoryBreakdown[] = []
    let grandTotal = 0

    for (const cat of typeCats) {
      const catItems = items.filter(i => i.categoryId === cat.id && i.isActive)
      let catTotal = 0

      for (const item of catItems) {
        const latestVal = values
          .filter(v => v.assetItemId === item.id)
          .sort((a, b) => b.date.localeCompare(a.date))[0]
        catTotal += latestVal?.value || 0
      }

      grandTotal += catTotal
      breakdowns.push({
        categoryId: cat.id!,
        categoryName: cat.name,
        categoryColor: cat.color,
        total: catTotal,
        percentage: 0,
      })
    }

    // Calculate percentages
    for (const bd of breakdowns) {
      bd.percentage = grandTotal > 0 ? (bd.total / grandTotal) * 100 : 0
    }

    return breakdowns.filter(b => b.total > 0).sort((a, b) => b.total - a.total)
  }, [categories, items, values, type])
}

export function useMemberBreakdown(): MemberBreakdown[] {
  const members = useMemberStore((s) => s.members)
  const items = useAssetStore((s) => s.items)
  const values = useDailyValueStore((s) => s.values)

  return useMemo(() => {
    return members.map(member => {
      const memberItems = items.filter(i => i.memberId === member.id && i.isActive)
      let totalAssets = 0
      let totalLiabilities = 0

      for (const item of memberItems) {
        const latestVal = values
          .filter(v => v.assetItemId === item.id)
          .sort((a, b) => b.date.localeCompare(a.date))[0]
        const val = latestVal?.value || 0

        if (item.type === 'asset') totalAssets += val
        else totalLiabilities += val
      }

      return {
        memberId: member.id!,
        memberName: member.name,
        memberColor: member.color,
        totalAssets,
        totalLiabilities,
        netWorth: totalAssets - totalLiabilities,
      }
    })
  }, [members, items, values])
}
