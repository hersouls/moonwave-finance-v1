import { useMemo } from 'react'
import type { AssetStats, CategoryBreakdown, MemberBreakdown } from '@/lib/types'
import { useAssetStore } from '@/stores/assetStore'
import { useDailyValueStore } from '@/stores/dailyValueStore'
import { useMemberStore } from '@/stores/memberStore'
import { getTodayString } from '@/lib/dateUtils'
import { groupValuesByItem, valueAsOf } from '@/services/assetAnalytics'

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
  // 전체 이력을 사용해야 "현재 가치"가 지난 달 기록이어도 0으로 사라지지 않는다.
  const allValues = useDailyValueStore((s) => s.allValues)

  return useMemo(() => {
    const today = getTodayString()
    const yesterday = getYesterday()
    const monthStart = getFirstDayOfMonth()
    const byItem = groupValuesByItem(allValues)

    let totalAssets = 0
    let totalLiabilities = 0
    let totalAssetsYesterday = 0
    let totalLiabilitiesYesterday = 0
    let totalAssetsMonthStart = 0
    let totalLiabilitiesMonthStart = 0

    for (const item of items) {
      if (!item.isActive || item.id == null) continue
      const series = byItem.get(item.id)

      // 각 기준일 이전(포함)의 가장 최근 값 (Forward-Fill)
      const currentValue = valueAsOf(series, today)
      const yesterdayValue = valueAsOf(series, yesterday)
      const monthStartValue = valueAsOf(series, monthStart)

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
  }, [items, allValues])
}

export function useCategoryBreakdown(type: 'asset' | 'liability'): CategoryBreakdown[] {
  const categories = useAssetStore((s) => s.categories)
  const items = useAssetStore((s) => s.items)
  const allValues = useDailyValueStore((s) => s.allValues)

  return useMemo(() => {
    const today = getTodayString()
    const byItem = groupValuesByItem(allValues)
    const typeCats = categories.filter(c => c.type === type)
    const breakdowns: CategoryBreakdown[] = []
    let grandTotal = 0

    for (const cat of typeCats) {
      const catItems = items.filter(i => i.categoryId === cat.id && i.isActive)
      let catTotal = 0

      for (const item of catItems) {
        if (item.id == null) continue
        catTotal += valueAsOf(byItem.get(item.id), today)
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
  }, [categories, items, allValues, type])
}

export function useMemberBreakdown(): MemberBreakdown[] {
  const members = useMemberStore((s) => s.members)
  const items = useAssetStore((s) => s.items)
  const allValues = useDailyValueStore((s) => s.allValues)

  return useMemo(() => {
    const today = getTodayString()
    const byItem = groupValuesByItem(allValues)

    return members.map(member => {
      const memberItems = items.filter(i => i.memberId === member.id && i.isActive)
      let totalAssets = 0
      let totalLiabilities = 0

      for (const item of memberItems) {
        if (item.id == null) continue
        const val = valueAsOf(byItem.get(item.id), today)
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
  }, [members, items, allValues])
}
