// ─── Subscription auto-detection from transactions ──────
//
// Scans the user's expense transactions and identifies recurring payment
// patterns — same/similar merchant + regular interval + stable amount —
// without requiring any separate "subscription" registration.
//
// The user's ledger is the single source of truth. Anything that looks like
// it's billed weekly / biweekly / monthly / quarterly / yearly with a stable
// amount is surfaced as a detected subscription.

import type { Transaction, TransactionCategory } from '@/lib/types'

// ─── Types ──────────────────────────────────────────────

export type DetectedCycle =
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'quarterly'
  | 'semi-annual'
  | 'yearly'
  | 'irregular'

export type DetectionConfidence = 'high' | 'medium' | 'low'

export interface DetectedSubscription {
  /** Stable identity key (normalized merchant) */
  key: string
  /** Display name — most recent memo as-is */
  name: string
  /** All matched transactions, sorted ascending by date */
  transactions: Transaction[]
  /** Number of detected payments */
  count: number
  /** Mean amount (rounded) */
  avgAmount: number
  /** Median amount (more robust to outliers) */
  medianAmount: number
  /** Min/max amount in detected payments */
  minAmount: number
  maxAmount: number
  /** Sum of all payments since first detection */
  totalSpent: number
  /** Detected billing cycle */
  cycle: DetectedCycle
  /** Mean inter-payment interval in days */
  avgIntervalDays: number
  /** Std-dev of intervals — measures regularity */
  intervalStdDev: number
  /** Coefficient of variation for amount (stdDev/mean) */
  amountCV: number
  /** How confident we are this is a real subscription */
  confidence: DetectionConfidence
  /** Date of first payment */
  firstDate: string
  /** Date of latest payment */
  lastDate: string
  /** Estimated next billing date (yyyy-MM-dd) */
  nextEstimatedDate: string
  /** Days since last payment */
  daysSinceLast: number
  /** Days until estimated next payment (negative = overdue) */
  daysUntilNext: number
  /** Most frequent categoryId across payments */
  categoryId: number | null
  /** Most frequent memberId across payments */
  memberId: number | null
  /** Display color — from category if available, else fallback hue */
  color: string
  /** Active = paid at least once within ~1.5 cycles */
  isActive: boolean
  /** Monthly-normalized amount (used for cross-cycle aggregation) */
  monthlyEquivalent: number
}

export interface SubscriptionStats {
  total: number
  active: number
  inactive: number
  totalMonthly: number
  totalYearly: number
  byCategory: Array<{
    categoryId: number | null
    name: string
    color: string
    totalMonthly: number
    count: number
    percent: number
  }>
  monthlyTrend: Array<{ month: string; total: number; count: number }>
  topItems: DetectedSubscription[]
}

// ─── Helpers ────────────────────────────────────────────

/** Normalize merchant text for grouping — strip junk, lowercase, collapse */
export function normalizeMerchantKey(s: string): string {
  return s
    .replace(/\([^)]*\)/g, ' ')         // (주), (청라)
    .replace(/주식회사|㈜/g, ' ')
    .replace(/\d{2}월\s*/g, '')          // "03월", "02월" prefix on telecom bills
    .replace(/\*+\d+[-_]?\d*/g, '')      // **65-8093 reference numbers
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')   // remove punctuation
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function daysBetween(a: string, b: string): number {
  const ad = new Date(a + 'T00:00:00').getTime()
  const bd = new Date(b + 'T00:00:00').getTime()
  return Math.abs(bd - ad) / 86_400_000
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0
  const sorted = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function mostFrequent<T extends string | number>(values: T[]): T | null {
  if (values.length === 0) return null
  const counts = new Map<T, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  let best: T = values[0]
  let bestCount = 0
  for (const [v, c] of counts) {
    if (c > bestCount) { best = v; bestCount = c }
  }
  return best
}

interface CycleMatch {
  cycle: DetectedCycle
  expectedDays: number
  windowLo: number
  windowHi: number
}

const CYCLES: CycleMatch[] = [
  { cycle: 'weekly',      expectedDays: 7,   windowLo: 6,   windowHi: 8 },
  { cycle: 'biweekly',    expectedDays: 14,  windowLo: 12,  windowHi: 16 },
  { cycle: 'monthly',     expectedDays: 30,  windowLo: 25,  windowHi: 35 },
  { cycle: 'quarterly',   expectedDays: 91,  windowLo: 85,  windowHi: 95 },
  { cycle: 'semi-annual', expectedDays: 182, windowLo: 175, windowHi: 188 },
  { cycle: 'yearly',      expectedDays: 365, windowLo: 355, windowHi: 375 },
]

function detectCycle(avgInterval: number): CycleMatch | null {
  for (const c of CYCLES) {
    if (avgInterval >= c.windowLo && avgInterval <= c.windowHi) return c
  }
  return null
}

function estimateNextDate(lastDate: string, cycleDays: number): string {
  const d = new Date(lastDate + 'T00:00:00')
  d.setDate(d.getDate() + cycleDays)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function cycleToMonthlyEquivalent(amount: number, cycle: DetectedCycle, avgIntervalDays: number): number {
  switch (cycle) {
    case 'weekly': return amount * (30 / 7)
    case 'biweekly': return amount * (30 / 14)
    case 'monthly': return amount
    case 'quarterly': return amount / 3
    case 'semi-annual': return amount / 6
    case 'yearly': return amount / 12
    case 'irregular':
    default:
      return avgIntervalDays > 0 ? amount * (30 / avgIntervalDays) : amount
  }
}

// ─── Core detection ─────────────────────────────────────

export interface DetectOptions {
  /** Minimum payment count to consider as a subscription. Default 2. */
  minCount?: number
  /** Reference date (yyyy-MM-dd). Default = today. Useful for tests. */
  today?: string
}

export function detectSubscriptions(
  transactions: Transaction[],
  categories: TransactionCategory[],
  options: DetectOptions = {},
): DetectedSubscription[] {
  const minCount = options.minCount ?? 2
  const todayStr = options.today ?? new Date().toISOString().slice(0, 10)
  const todayMs = new Date(todayStr + 'T00:00:00').getTime()

  // 1) Group expense transactions by normalized merchant key
  const groups = new Map<string, Transaction[]>()
  for (const t of transactions) {
    if (t.type !== 'expense' || !t.memo) continue
    if (t.amount <= 0) continue
    const key = normalizeMerchantKey(t.memo)
    if (key.length < 2) continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(t)
  }

  const detected: DetectedSubscription[] = []
  for (const [key, group] of groups) {
    if (group.length < minCount) continue
    const txns = [...group].sort((a, b) => a.date.localeCompare(b.date))

    // 2) Compute interval stats
    const intervals: number[] = []
    for (let i = 1; i < txns.length; i++) {
      intervals.push(daysBetween(txns[i - 1].date, txns[i].date))
    }
    const avgInterval = intervals.length > 0
      ? intervals.reduce((a, b) => a + b, 0) / intervals.length
      : 0
    const intervalVar = intervals.length > 0
      ? intervals.reduce((sum, x) => sum + (x - avgInterval) ** 2, 0) / intervals.length
      : 0
    const intervalStdDev = Math.sqrt(intervalVar)

    // 3) Cycle detection
    const cycleMatch = detectCycle(avgInterval)
    const cycle: DetectedCycle = cycleMatch?.cycle ?? 'irregular'

    // 4) Amount stats
    const amounts = txns.map(t => t.amount)
    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length
    const amountVar = amounts.reduce((sum, x) => sum + (x - avgAmount) ** 2, 0) / amounts.length
    const amountCV = avgAmount > 0 ? Math.sqrt(amountVar) / avgAmount : 0
    const medianAmount = median(amounts)
    const minAmount = Math.min(...amounts)
    const maxAmount = Math.max(...amounts)
    const totalSpent = amounts.reduce((a, b) => a + b, 0)

    // 5) Confidence scoring
    //    high  = clear cycle + stable amount + ≥3 payments
    //    medium= clear cycle + 2 payments OR slight variance
    //    low   = irregular / wide variance / cycle window miss
    let confidence: DetectionConfidence = 'low'
    if (cycle !== 'irregular') {
      const intervalCV = avgInterval > 0 ? intervalStdDev / avgInterval : 1
      if (intervalCV <= 0.15 && amountCV <= 0.15 && txns.length >= 3) confidence = 'high'
      else if (intervalCV <= 0.25 && amountCV <= 0.25) confidence = 'medium'
      else confidence = 'low'
    }

    // Filter out clearly irregular non-subscriptions: irregular AND high amount CV
    if (cycle === 'irregular' && (amountCV > 0.35 || txns.length < 3)) continue

    const lastTxn = txns[txns.length - 1]
    const expectedNextDays = cycleMatch?.expectedDays ?? Math.round(avgInterval) ?? 30
    const nextEstimatedDate = estimateNextDate(lastTxn.date, expectedNextDays)
    const lastMs = new Date(lastTxn.date + 'T00:00:00').getTime()
    const nextMs = new Date(nextEstimatedDate + 'T00:00:00').getTime()
    const daysSinceLast = Math.floor((todayMs - lastMs) / 86_400_000)
    const daysUntilNext = Math.floor((nextMs - todayMs) / 86_400_000)
    const isActive = daysSinceLast <= expectedNextDays * 1.5

    // Pick the most frequent category/member across the group
    const catIds = txns.map(t => t.categoryId).filter((x): x is number => x != null)
    const memIds = txns.map(t => t.memberId).filter((x): x is number => x != null)
    const categoryId = mostFrequent(catIds) ?? null
    const memberId = mostFrequent(memIds) ?? null
    const category = categoryId != null ? categories.find(c => c.id === categoryId) : null
    const fallbackColor = pickFallbackColor(key)
    const color = category?.color ?? fallbackColor

    detected.push({
      key,
      name: lastTxn.memo!,
      transactions: txns,
      count: txns.length,
      avgAmount: Math.round(avgAmount),
      medianAmount: Math.round(medianAmount),
      minAmount,
      maxAmount,
      totalSpent,
      cycle,
      avgIntervalDays: Math.round(avgInterval),
      intervalStdDev: Math.round(intervalStdDev * 10) / 10,
      amountCV: Math.round(amountCV * 100) / 100,
      confidence,
      firstDate: txns[0].date,
      lastDate: lastTxn.date,
      nextEstimatedDate,
      daysSinceLast,
      daysUntilNext,
      categoryId,
      memberId,
      color,
      isActive,
      monthlyEquivalent: Math.round(cycleToMonthlyEquivalent(avgAmount, cycle, avgInterval)),
    })
  }

  // Sort: active first, then by monthlyEquivalent desc
  return detected.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
    return b.monthlyEquivalent - a.monthlyEquivalent
  })
}

// Stable fallback color from key (HSL hue 0-360)
function pickFallbackColor(key: string): string {
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) & 0xffffffff
  }
  const hue = Math.abs(hash) % 360
  return `oklch(0.65 0.16 ${hue})`
}

// ─── Aggregate stats ────────────────────────────────────

export function computeSubscriptionStats(
  detected: DetectedSubscription[],
  categories: TransactionCategory[],
): SubscriptionStats {
  const active = detected.filter(s => s.isActive)
  const inactive = detected.filter(s => !s.isActive)
  const totalMonthly = active.reduce((sum, s) => sum + s.monthlyEquivalent, 0)
  const totalYearly = totalMonthly * 12

  // Group by category (active only)
  const catMap = new Map<string, { categoryId: number | null; name: string; color: string; totalMonthly: number; count: number }>()
  for (const sub of active) {
    const key = sub.categoryId != null ? String(sub.categoryId) : 'uncat'
    const cat = sub.categoryId != null ? categories.find(c => c.id === sub.categoryId) : null
    const entry = catMap.get(key) ?? {
      categoryId: sub.categoryId,
      name: cat?.name ?? '미분류',
      color: cat?.color ?? '#71717A',
      totalMonthly: 0,
      count: 0,
    }
    entry.totalMonthly += sub.monthlyEquivalent
    entry.count += 1
    catMap.set(key, entry)
  }
  const byCategory = Array.from(catMap.values())
    .map(c => ({ ...c, percent: totalMonthly > 0 ? (c.totalMonthly / totalMonthly) * 100 : 0 }))
    .sort((a, b) => b.totalMonthly - a.totalMonthly)

  // Monthly trend: actual spend per month across all detected subs' transactions
  const monthMap = new Map<string, { total: number; uniqueKeys: Set<string> }>()
  for (const sub of detected) {
    for (const t of sub.transactions) {
      const m = t.date.slice(0, 7)
      const entry = monthMap.get(m) ?? { total: 0, uniqueKeys: new Set<string>() }
      entry.total += t.amount
      entry.uniqueKeys.add(sub.key)
      monthMap.set(m, entry)
    }
  }
  const monthlyTrend = Array.from(monthMap.entries())
    .map(([month, v]) => ({ month, total: v.total, count: v.uniqueKeys.size }))
    .sort((a, b) => a.month.localeCompare(b.month))

  return {
    total: detected.length,
    active: active.length,
    inactive: inactive.length,
    totalMonthly,
    totalYearly,
    byCategory,
    monthlyTrend,
    topItems: [...active].sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent).slice(0, 5),
  }
}

// ─── Per-item monthly series ──────────────────────────
// Builds a monthly series of actual payments for a single detected sub —
// used by the detail sheet's price-evolution chart.

export interface MonthlyPayment {
  month: string      // yyyy-MM
  amount: number     // sum that month (typically 0 or one payment)
  date?: string      // actual payment date if any
}

export function buildMonthlyPayments(sub: DetectedSubscription, monthsBack = 12): MonthlyPayment[] {
  const result: MonthlyPayment[] = []
  const now = new Date()
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const payments = sub.transactions.filter(t => t.date.startsWith(month))
    const amount = payments.reduce((sum, t) => sum + t.amount, 0)
    result.push({
      month,
      amount,
      date: payments[0]?.date,
    })
  }
  return result
}
