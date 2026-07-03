import { useMemo } from 'react'
import { useTransactionStore } from '@/stores/transactionStore'
import { useMultiMonthTransactions } from './useMultiMonthTransactions'
import { getMonthDates, getCurrentMonthString, getPreviousMonth } from '@/lib/dateUtils'
import { format, subMonths } from 'date-fns'
import type { Transaction, TransactionCategory } from '@/lib/types'

// ─── Types ──────────────────────────────────────────────

export type InsightLevel = 'positive' | 'warning' | 'neutral'
export type InsightIcon =
  | 'trending-up' | 'trending-down'
  | 'sparkles' | 'badge-alert'
  | 'wallet' | 'piggy' | 'repeat' | 'undo' | 'flame'
export type InsightAnchor = 'hero' | 'cashflow' | 'category' | 'top-txns'

export interface Insight {
  id: string
  level: InsightLevel
  icon: InsightIcon
  title: string
  detail?: string
  anchor?: InsightAnchor
}

export interface CategoryAnalysis {
  categoryId: string | null
  name: string
  color: string
  icon?: string
  /** Signed sum (refunds reduce) for current month */
  current: number
  /** 3-month rolling average for the same category */
  avgBaseline: number
  /** current - avgBaseline */
  delta: number
  /** % change vs baseline; null when baseline is 0 */
  deltaPercent: number | null
  /** Per-month sums (3 months → current; left to right oldest → newest) */
  series: number[]
  /** Share of current-month total expense (0..1) */
  percentOfTotal: number
}

export interface LedgerAnalysis {
  month: string
  prevMonth: string
  isLoading: boolean

  /** Current month aggregates */
  current: {
    income: number
    expense: number           // signed (refunds reduce)
    refundsAbs: number        // |sum of negative expense amounts|
    net: number               // income - expense
    savingsRate: number | null
    txnCount: number
    activeCategories: number
    uniqueMerchants: number
  }
  prev: {
    income: number
    expense: number
    net: number
  }
  baseline: {
    avgExpense: number        // 3-month rolling avg (excludes current month)
    avgIncome: number
  }

  /** 6-month sparkline series (oldest → newest, last item = current month) */
  sparklines: {
    expense: number[]
    income: number[]
    net: number[]
    months: string[]
  }

  /** Daily cumulative spending in current vs previous month, aligned by day index */
  cashFlow: {
    days: string[]
    cumulative: number[]
    cumulativePrev: number[]
    /** Projected month-end spend based on running daily burn rate */
    projectedTotal: number
    /** Average daily spend so far */
    dailyAvgSoFar: number
    /** 1-based day position within month for "today"; 0 if month is not current */
    todayIndex: number
  }

  categories: CategoryAnalysis[]
  topTransactions: Array<{
    transaction: Transaction
    category: TransactionCategory | null
    rank: number
  }>
  newMerchants: string[]
  insights: Insight[]
}

// ─── Helpers ────────────────────────────────────────────

function monthKey(date: string): string {
  return date.slice(0, 7)
}

/** Sum signed amounts for a single transaction type in a transaction list. */
function sumByType(txns: Transaction[], type: 'expense' | 'income'): number {
  let s = 0
  for (const t of txns) if (t.type === type) s += t.amount
  return s
}

function normalizeMerchant(memo: string | undefined): string {
  if (!memo) return ''
  return memo
    .replace(/\([^)]*\)/g, ' ')
    .replace(/주식회사|㈜/g, ' ')
    .replace(/[^\p{L}\p{N}\s.]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

// ─── Hook ───────────────────────────────────────────────

const BASELINE_MONTHS = 3
const SPARKLINE_MONTHS = 6
const LOAD_MONTHS = Math.max(BASELINE_MONTHS, SPARKLINE_MONTHS) + 1 // include current

/**
 * Heavy-lifting analytics hook for the 가계부 분석 view. Loads the trailing
 * N months once and derives every panel's data from a single shared pass —
 * Hero deltas, sparklines, cashflow timeline, per-category trends, top
 * transactions, new-merchant detection, and auto-generated insights.
 *
 * Signed amounts: expense rows with `amount < 0` represent refunds and net
 * against the same category, matching how the form/card now store them.
 */
export function useLedgerAnalysis(month?: string): LedgerAnalysis {
  const targetMonth = month || getCurrentMonthString()
  const prevMonth = getPreviousMonth(targetMonth)
  const categories = useTransactionStore((s) => s.categories)
  const { transactions: allTxns, isLoading } = useMultiMonthTransactions(LOAD_MONTHS)

  return useMemo(() => {
    // Index transactions by yyyy-MM for cheap month-bucket access
    const byMonth = new Map<string, Transaction[]>()
    for (const t of allTxns) {
      const k = monthKey(t.date)
      if (!byMonth.has(k)) byMonth.set(k, [])
      byMonth.get(k)!.push(t)
    }
    const getMonth = (k: string) => byMonth.get(k) ?? []

    const curTxns = getMonth(targetMonth)
    const prevTxns = getMonth(prevMonth)

    // ── Current month aggregates ────────────────────────
    const expense = sumByType(curTxns, 'expense')
    const income = sumByType(curTxns, 'income')
    const refundsAbs = curTxns
      .filter((t) => t.type === 'expense' && t.amount < 0)
      .reduce((s, t) => s + Math.abs(t.amount), 0)
    const net = income - expense
    const savingsRate = income > 0 ? net / income : null
    const txnCount = curTxns.length
    const activeCategoryIds = new Set(
      curTxns.filter((t) => t.type === 'expense').map((t) => t.categoryId ?? -1),
    )
    const merchantSet = new Set(
      curTxns
        .filter((t) => t.type === 'expense' && t.memo)
        .map((t) => normalizeMerchant(t.memo))
        .filter(Boolean),
    )

    // ── Previous month for direct compare ────────────────
    const prevExpense = sumByType(prevTxns, 'expense')
    const prevIncome = sumByType(prevTxns, 'income')
    const prevNet = prevIncome - prevExpense

    // ── Baseline (rolling 3-month avg, excluding current) ─
    const baselineMonths: string[] = []
    for (let i = 1; i <= BASELINE_MONTHS; i++) {
      baselineMonths.push(format(subMonths(new Date(targetMonth + '-01'), i), 'yyyy-MM'))
    }
    let baselineExp = 0
    let baselineInc = 0
    for (const m of baselineMonths) {
      baselineExp += sumByType(getMonth(m), 'expense')
      baselineInc += sumByType(getMonth(m), 'income')
    }
    const avgExpense = baselineExp / BASELINE_MONTHS
    const avgIncome = baselineInc / BASELINE_MONTHS

    // ── 6-month sparkline series ────────────────────────
    const sparkMonths: string[] = []
    for (let i = SPARKLINE_MONTHS - 1; i >= 0; i--) {
      sparkMonths.push(format(subMonths(new Date(targetMonth + '-01'), i), 'yyyy-MM'))
    }
    const sparkExpense = sparkMonths.map((m) => sumByType(getMonth(m), 'expense'))
    const sparkIncome = sparkMonths.map((m) => sumByType(getMonth(m), 'income'))
    const sparkNet = sparkExpense.map((e, i) => sparkIncome[i] - e)

    // ── Daily cumulative cash flow ──────────────────────
    const days = getMonthDates(targetMonth)
    const prevDays = getMonthDates(prevMonth)

    const dailyByDate = (m: string) => {
      const map = new Map<string, number>()
      for (const t of getMonth(m)) {
        if (t.type !== 'expense') continue
        map.set(t.date, (map.get(t.date) ?? 0) + t.amount)
      }
      return map
    }
    const curDaily = dailyByDate(targetMonth)
    const prevDaily = dailyByDate(prevMonth)

    const cumulative: number[] = []
    let running = 0
    for (const d of days) {
      running += curDaily.get(d) ?? 0
      cumulative.push(running)
    }

    const cumulativePrev: number[] = []
    let runningPrev = 0
    for (let i = 0; i < days.length; i++) {
      const d = prevDays[i]
      runningPrev += d ? prevDaily.get(d) ?? 0 : 0
      cumulativePrev.push(runningPrev)
    }

    const today = new Date()
    const todayMonth = format(today, 'yyyy-MM')
    const todayIndex = todayMonth === targetMonth ? today.getDate() : 0
    const elapsed = todayIndex > 0 ? todayIndex : days.length
    const dailyAvgSoFar = elapsed > 0 ? expense / elapsed : 0
    const projectedTotal = todayIndex > 0 ? dailyAvgSoFar * days.length : expense

    // ── Per-category analysis ───────────────────────────
    const totalExpenseForShare = curTxns
      .filter((t) => t.type === 'expense')
      .reduce((s, t) => s + (t.amount > 0 ? t.amount : 0), 0)

    const catBuckets = new Map<string | null, { current: number; series: number[] }>()
    const ensure = (k: string | null) => {
      if (!catBuckets.has(k)) {
        catBuckets.set(k, { current: 0, series: new Array(BASELINE_MONTHS + 1).fill(0) })
      }
      return catBuckets.get(k)!
    }

    // Current month
    for (const t of curTxns) {
      if (t.type !== 'expense') continue
      ensure(t.categoryId ?? null).current += t.amount
    }
    // Previous BASELINE_MONTHS into series[0..BASELINE_MONTHS-1]
    for (let i = 0; i < BASELINE_MONTHS; i++) {
      const m = baselineMonths[BASELINE_MONTHS - 1 - i] // oldest first
      for (const t of getMonth(m)) {
        if (t.type !== 'expense') continue
        ensure(t.categoryId ?? null).series[i] += t.amount
      }
    }
    // Push current month as last series entry
    for (const [, bucket] of catBuckets) {
      bucket.series[BASELINE_MONTHS] = bucket.current
    }

    const categoryAnalyses: CategoryAnalysis[] = Array.from(catBuckets.entries())
      .map(([catId, b]) => {
        const cat = catId != null ? categories.find((c) => c.id === catId) : null
        const avgBaseline = (b.series.slice(0, BASELINE_MONTHS).reduce((s, v) => s + v, 0)) / BASELINE_MONTHS
        const delta = b.current - avgBaseline
        const deltaPercent = avgBaseline > 0 ? (delta / avgBaseline) * 100 : null
        return {
          categoryId: catId,
          name: cat?.name ?? '미분류',
          color: cat?.color ?? '#71717a',
          icon: cat?.icon,
          current: b.current,
          avgBaseline,
          delta,
          deltaPercent,
          series: b.series,
          percentOfTotal: totalExpenseForShare > 0 ? Math.max(0, b.current) / totalExpenseForShare : 0,
        }
      })
      .sort((a, b) => b.current - a.current)

    // ── Top transactions ────────────────────────────────
    const topTransactions = [...curTxns]
      .filter((t) => t.type === 'expense')
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
      .slice(0, 5)
      .map((t, i) => ({
        transaction: t,
        category: t.categoryId ? categories.find((c) => c.id === t.categoryId) ?? null : null,
        rank: i + 1,
      }))

    // ── New merchants (not seen in baseline) ─────────────
    const baselineMerchants = new Set<string>()
    for (const m of baselineMonths) {
      for (const t of getMonth(m)) {
        if (t.type !== 'expense' || !t.memo) continue
        baselineMerchants.add(normalizeMerchant(t.memo))
      }
    }
    const newMerchantSet = new Set<string>()
    for (const t of curTxns) {
      if (t.type !== 'expense' || !t.memo) continue
      const n = normalizeMerchant(t.memo)
      if (!n) continue
      if (!baselineMerchants.has(n)) newMerchantSet.add(t.memo.trim())
    }
    const newMerchants = Array.from(newMerchantSet)

    // ── Insights generation ─────────────────────────────
    const insights: Insight[] = []

    // 1) Overall spend vs baseline
    if (avgExpense > 0 && Math.abs(expense - avgExpense) / avgExpense >= 0.1) {
      const pct = Math.round(((expense - avgExpense) / avgExpense) * 100)
      insights.push({
        id: 'overall-vs-baseline',
        level: pct > 0 ? 'warning' : 'positive',
        icon: pct > 0 ? 'trending-up' : 'trending-down',
        title: `이번 달 지출이 평균 대비 ${pct > 0 ? '+' : ''}${pct}%`,
        detail: `최근 3개월 평균 ${Math.round(avgExpense).toLocaleString('ko-KR')}원`,
        anchor: 'hero',
      })
    }

    // 2) Standout categories (delta% >= 30% AND amount >= 10000)
    const standoutCategories = categoryAnalyses
      .filter((c) => c.deltaPercent != null && Math.abs(c.deltaPercent) >= 30 && Math.abs(c.delta) >= 10_000)
      .slice(0, 2)
    for (const c of standoutCategories) {
      const pct = Math.round(c.deltaPercent!)
      insights.push({
        id: `cat-${c.categoryId ?? 'none'}`,
        level: pct > 0 ? 'warning' : 'positive',
        icon: pct > 0 ? 'flame' : 'trending-down',
        title: `${c.name} 지출 ${pct > 0 ? '+' : ''}${pct}%`,
        detail: `평균 ${Math.round(c.avgBaseline).toLocaleString('ko-KR')}원 → 이번 달 ${Math.round(c.current).toLocaleString('ko-KR')}원`,
        anchor: 'category',
      })
    }

    // 3) New merchants
    if (newMerchants.length > 0) {
      insights.push({
        id: 'new-merchants',
        level: 'neutral',
        icon: 'sparkles',
        title: `이번 달 새 가맹점 ${newMerchants.length}곳`,
        detail: newMerchants.slice(0, 3).join(', ') + (newMerchants.length > 3 ? ` 외 ${newMerchants.length - 3}곳` : ''),
        anchor: 'top-txns',
      })
    }

    // 4) Refund total
    if (refundsAbs > 0) {
      insights.push({
        id: 'refunds',
        level: 'positive',
        icon: 'undo',
        title: `환급 ${Math.round(refundsAbs).toLocaleString('ko-KR')}원`,
        detail: '같은 카테고리에서 회수된 금액',
        anchor: 'top-txns',
      })
    }

    // 5) Subscription-flagged share
    const subShare = curTxns
      .filter((t) => t.type === 'expense' && t.subscriptionCategory && t.amount > 0)
      .reduce((s, t) => s + t.amount, 0)
    if (subShare > 0 && totalExpenseForShare > 0) {
      const pct = Math.round((subShare / totalExpenseForShare) * 100)
      if (pct >= 5) {
        insights.push({
          id: 'sub-share',
          level: pct > 20 ? 'warning' : 'neutral',
          icon: 'repeat',
          title: `구독성 지출 비중 ${pct}%`,
          detail: `${Math.round(subShare).toLocaleString('ko-KR')}원 / 전체 지출`,
          anchor: 'category',
        })
      }
    }

    // 6) Projection (only when viewing current month)
    if (todayIndex > 0 && projectedTotal > 0 && Math.abs(projectedTotal - avgExpense) / Math.max(avgExpense, 1) >= 0.15) {
      const pct = Math.round(((projectedTotal - avgExpense) / Math.max(avgExpense, 1)) * 100)
      insights.push({
        id: 'projection',
        level: pct > 0 ? 'warning' : 'positive',
        icon: 'badge-alert',
        title: `이대로면 월말 ${Math.round(projectedTotal).toLocaleString('ko-KR')}원 예상`,
        detail: `평균 대비 ${pct > 0 ? '+' : ''}${pct}% · 일평균 ${Math.round(dailyAvgSoFar).toLocaleString('ko-KR')}원`,
        anchor: 'cashflow',
      })
    }

    // 7) Savings rate
    if (savingsRate != null && Math.abs(savingsRate) >= 0.1) {
      insights.push({
        id: 'savings-rate',
        level: savingsRate >= 0.2 ? 'positive' : savingsRate <= 0 ? 'warning' : 'neutral',
        icon: 'piggy',
        title: `저축률 ${Math.round(savingsRate * 100)}%`,
        detail: `수입 ${Math.round(income).toLocaleString('ko-KR')}원 · 순저축 ${Math.round(net).toLocaleString('ko-KR')}원`,
        anchor: 'hero',
      })
    }

    return {
      month: targetMonth,
      prevMonth,
      isLoading,
      current: {
        income,
        expense,
        refundsAbs,
        net,
        savingsRate,
        txnCount,
        activeCategories: activeCategoryIds.size,
        uniqueMerchants: merchantSet.size,
      },
      prev: {
        income: prevIncome,
        expense: prevExpense,
        net: prevNet,
      },
      baseline: {
        avgExpense,
        avgIncome,
      },
      sparklines: {
        expense: sparkExpense,
        income: sparkIncome,
        net: sparkNet,
        months: sparkMonths,
      },
      cashFlow: {
        days,
        cumulative,
        cumulativePrev,
        projectedTotal,
        dailyAvgSoFar,
        todayIndex,
      },
      categories: categoryAnalyses,
      topTransactions,
      newMerchants,
      insights,
    }
  }, [allTxns, categories, targetMonth, prevMonth, isLoading])
}
