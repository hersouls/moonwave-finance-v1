import { format, parseISO, differenceInDays, startOfDay, startOfMonth, endOfMonth, addMonths, addDays, getDaysInMonth } from 'date-fns'
import type { SubscriptionCycle } from '@/lib/types'

/**
 * UTC 프레임의 오늘 (toISOString 기준) — 저장 프레임 전용.
 * dailyValues 번들 키·자산 가치 시리즈·동기화 내부 등은 이 UTC 프레임을 유지해야 함.
 * ⚠️ KST에서는 00:00~09:00 사이 UTC 오늘 = 로컬 어제. 사용자 대면 "오늘"
 * (거래 입력 기본값, 달력 오늘 선택 등)에는 getLocalTodayString()을 사용할 것.
 */
export function getTodayString(): string {
  return new Date().toISOString().split('T')[0]
}

/**
 * 로컬(기기 시간대) 달력 기준 오늘 — yyyy-MM-dd.
 * 거래 입력 기본값·달력 오늘 선택 등 사용자 대면 "오늘" 전용.
 * 저장 프레임(dailyValues/자산 시리즈/동기화)은 UTC 기반 getTodayString()을 유지.
 */
export function getLocalTodayString(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

/**
 * Yesterday in the SAME UTC frame as getTodayString(), so forward-fill
 * day-over-day deltas (valueAsOf(today) - valueAsOf(yesterday)) line up with
 * the summary header. Asset values are a continuous daily series (forward-fill),
 * so "어제 대비" must compare the value AS OF each day, not the gap between records.
 */
export function getYesterdayString(): string {
  const d = new Date(getTodayString() + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().split('T')[0]
}

export function getCurrentMonthString(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토'] as const

/**
 * 대시보드 히어로용 날짜 라벨 — "6월 6일 (금)".
 * 사용자에게 보여주는 달력 날짜이므로 (UTC 프레임의 getTodayString과 달리) 로컬 시간 기준.
 */
export function formatMonthDayWeekKo(d: Date = new Date()): string {
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS_KO[d.getDay()]})`
}

export function formatDate(dateStr: string): string {
  const date = parseISO(dateStr)
  const today = startOfDay(new Date())
  const diff = differenceInDays(date, today)

  if (diff === 0) return '오늘'
  if (diff === 1) return '내일'
  if (diff === -1) return '어제'

  const year = date.getFullYear()
  const currentYear = today.getFullYear()

  if (year === currentYear) {
    return format(date, 'M월 d일')
  }
  return format(date, 'yyyy년 M월 d일')
}

export function formatRelativeDate(dateStr: string): string {
  const date = parseISO(dateStr)
  const now = new Date()
  const diff = differenceInDays(now, date)

  if (diff === 0) return '오늘'
  if (diff === 1) return '어제'
  if (diff < 7) return `${diff}일 전`
  if (diff < 30) return `${Math.floor(diff / 7)}주 전`
  return format(date, 'yyyy-MM-dd')
}

export function formatMonthLabel(month: string): string {
  const [y, m] = month.split('-')
  return `${y}년 ${Number(m)}월`
}

export function getMonthDates(month: string): string[] {
  const [year, mon] = month.split('-').map(Number)
  const daysInMonth = getDaysInMonth(new Date(year, mon - 1))
  return Array.from({ length: daysInMonth }, (_, i) => {
    const day = String(i + 1).padStart(2, '0')
    return `${month}-${day}`
  })
}

export function getPreviousMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const date = addMonths(new Date(y, m - 1), -1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function getNextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const date = addMonths(new Date(y, m - 1), 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function getMonthStartEnd(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number)
  const date = new Date(y, m - 1)
  const start = format(startOfMonth(date), 'yyyy-MM-dd')
  const end = format(endOfMonth(date), 'yyyy-MM-dd')
  return { start, end }
}

export function getDayOfMonth(dateStr: string): number {
  return parseISO(dateStr).getDate()
}

// ─── Subscription Billing Date Utilities ─────────────

export function getNextBillingDate(
  billingDay: number,
  cycle: SubscriptionCycle,
  billingMonth?: number,
  startDate?: string,
  customCycleDays?: number,
): Date {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() // 0-indexed

  // Interval-based cycles: weekly, biweekly, custom
  if (cycle === 'weekly' || cycle === 'biweekly' || cycle === 'custom') {
    const intervalDays = cycle === 'weekly' ? 7
      : cycle === 'biweekly' ? 14
      : Math.max(1, Math.min(365, customCycleDays ?? 30))
    const start = startDate ? new Date(startDate) : now
    // Find next occurrence >= today
    if (start > now) return start
    const daysSinceStart = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    const periodsPassed = Math.floor(daysSinceStart / intervalDays)
    let next = addDays(start, periodsPassed * intervalDays)
    if (next <= now) next = addDays(next, intervalDays)
    return next
  }

  if (cycle === 'yearly') {
    const bm = (billingMonth ?? 1) - 1 // 0-indexed
    let next = new Date(year, bm, Math.min(billingDay, getDaysInMonth(new Date(year, bm))))
    if (next <= now) {
      next = new Date(year + 1, bm, Math.min(billingDay, getDaysInMonth(new Date(year + 1, bm))))
    }
    return next
  }

  // Monthly interval-based cycles: quarterly, semi-annual
  if (cycle === 'quarterly' || cycle === 'semi-annual') {
    const monthInterval = cycle === 'quarterly' ? 3 : 6
    const start = startDate ? new Date(startDate) : now
    let current = new Date(start.getFullYear(), start.getMonth(), Math.min(billingDay, getDaysInMonth(start)))
    if (current < start) current = addMonths(current, monthInterval)
    while (current <= now) {
      current = addMonths(current, monthInterval)
      const maxDay = getDaysInMonth(current)
      current = new Date(current.getFullYear(), current.getMonth(), Math.min(billingDay, maxDay))
    }
    return current
  }

  // monthly (default)
  let next = new Date(year, month, Math.min(billingDay, getDaysInMonth(new Date(year, month))))
  if (next <= now) {
    const nextMonth = addMonths(new Date(year, month), 1)
    next = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), Math.min(billingDay, getDaysInMonth(nextMonth)))
  }
  return next
}

export function getDaysUntilBilling(
  billingDay: number,
  cycle: SubscriptionCycle,
  billingMonth?: number,
  startDate?: string,
  customCycleDays?: number,
): number {
  const next = getNextBillingDate(billingDay, cycle, billingMonth, startDate, customCycleDays)
  return differenceInDays(startOfDay(next), startOfDay(new Date()))
}

export function formatBillingSchedule(
  cycle: SubscriptionCycle,
  billingDay: number,
  billingMonth?: number,
  customCycleDays?: number,
): string {
  switch (cycle) {
    case 'weekly': return '매주'
    case 'biweekly': return '격주'
    case 'monthly': return `매월 ${billingDay}일`
    case 'quarterly': return `매 3개월 ${billingDay}일`
    case 'semi-annual': return `매 6개월 ${billingDay}일`
    case 'yearly': return `매년 ${billingMonth ?? 1}월 ${billingDay}일`
    case 'custom': return `매 ${customCycleDays ?? 30}일`
    default: return `매월 ${billingDay}일`
  }
}
