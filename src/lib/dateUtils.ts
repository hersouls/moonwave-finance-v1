import { format, parseISO, differenceInDays, startOfDay, startOfMonth, endOfMonth, addMonths, getDaysInMonth } from 'date-fns'

export function getTodayString(): string {
  return new Date().toISOString().split('T')[0]
}

export function getCurrentMonthString(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
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
