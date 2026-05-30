import { useMemo } from 'react'
import type { AssetStats, CategoryBreakdown, MemberBreakdown } from '@/lib/types'
import { useAssetStore } from '@/stores/assetStore'
import { useDailyValueStore } from '@/stores/dailyValueStore'
import { useMemberStore } from '@/stores/memberStore'
import { getTodayString, getYesterdayString } from '@/lib/dateUtils'
import { groupValuesByItem, valueAsOf } from '@/services/assetAnalytics'

function addDaysStr(base: string, delta: number): string {
  const d = new Date(base + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().split('T')[0]
}

export interface NetWorthSeries {
  /** 과거 구간(통계용) 일별 순자산. */
  series: { date: string; value: number }[]
  /** 차트용 결합 시리즈(과거 + 미래 예측). */
  chart: { date: string; value: number }[]
  /** chart 에서 "오늘"의 인덱스 (이후가 미래 예측 = 점선). */
  todayIdx: number
  start: number
  end: number
  change: number
  /** Period growth rate (%) = change / |start| × 100. */
  growthRatePct: number
  /** 자산증식 기울기 — average net-worth change per day (KRW/day). */
  dailySlope: number
}

/**
 * Net worth as a continuous daily series (forward-fill + projection) over the
 * last `days` (and optionally `futureDays` forecast), with the
 * wealth-accumulation slope (avg KRW/day) and period growth rate.
 */
export function useNetWorthSeries(days: number, futureDays = 0): NetWorthSeries {
  const items = useAssetStore((s) => s.items)
  const allValues = useDailyValueStore((s) => s.allValues)

  return useMemo(() => {
    const byItem = groupValuesByItem(allValues)
    const today = getTodayString()
    const netWorthOn = (date: string) => {
      let assets = 0
      let liabilities = 0
      for (const item of items) {
        if (!item.isActive || item.id == null) continue
        const v = valueAsOf(byItem.get(item.id), date)
        if (item.type === 'asset') assets += v
        else liabilities += v
      }
      return assets - liabilities
    }

    const series: { date: string; value: number }[] = []
    for (let i = days - 1; i >= 0; i--) {
      const date = addDaysStr(today, -i)
      series.push({ date, value: netWorthOn(date) })
    }

    // 차트용: 과거(series) + 오늘 이후 미래 예측
    const chart = series.slice()
    const todayIdx = chart.length - 1
    for (let i = 1; i <= futureDays; i++) {
      const date = addDaysStr(today, i)
      chart.push({ date, value: netWorthOn(date) })
    }

    const start = series[0]?.value ?? 0
    const end = series[series.length - 1]?.value ?? 0
    const change = end - start
    const growthRatePct = start !== 0 ? (change / Math.abs(start)) * 100 : 0
    const dailySlope = days > 1 ? change / (days - 1) : 0

    return { series, chart, todayIdx, start, end, change, growthRatePct, dailySlope }
  }, [items, allValues, days, futureDays])
}

export function useAssetStats(): AssetStats {
  const items = useAssetStore((s) => s.items)
  // 전체 이력을 사용해야 "현재 가치"가 지난 달 기록이어도 0으로 사라지지 않는다.
  const allValues = useDailyValueStore((s) => s.allValues)

  return useMemo(() => {
    // today/yesterday/monthStart 를 모두 UTC 프레임으로 통일 — DailyValue.date(UTC) 및
    // forward-fill 기준일과 일치시킨다. 로컬시간 파생은 매월 1일 KST 새벽에 monthStart>today 가 되어
    // 미래 투영값을 읽는 버그를 유발한다. (AssetSummaryHeader 와도 동일 방식으로 일치)
    const today = getTodayString()
    const yesterday = getYesterdayString()
    const monthStart = today.slice(0, 8) + '01'
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
      // 자산/부채 각각의 월초 대비 증감(대시보드 '총자산/총부채' 카드 '이번달' 배지용).
      assetMonthlyChange: totalAssets - totalAssetsMonthStart,
      liabilityMonthlyChange: totalLiabilities - totalLiabilitiesMonthStart,
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
