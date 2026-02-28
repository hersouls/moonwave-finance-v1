/** 1억 (hundred million) */
export const KOREAN_UNIT_EUK = 100_000_000
/** 1만 (ten thousand) */
export const KOREAN_UNIT_MAN = 10_000

export function formatKRW(value: number): string {
  return Math.round(value).toLocaleString('ko-KR') + '원'
}

export function formatKoreanUnit(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= KOREAN_UNIT_EUK) {
    return sign + Math.round(abs / KOREAN_UNIT_EUK) + '억'
  }
  if (abs >= KOREAN_UNIT_MAN) {
    return sign + Math.round(abs / KOREAN_UNIT_MAN).toLocaleString('ko-KR') + '만'
  }
  return value.toLocaleString('ko-KR')
}

export function formatChange(value: number): string {
  const formatted = formatKRW(Math.abs(value))
  if (value > 0) return '+' + formatted
  if (value < 0) return '-' + formatted
  return formatted
}

export function formatChangeUnit(value: number): string {
  const formatted = formatKoreanUnit(Math.abs(value))
  if (value > 0) return '+' + formatted
  if (value < 0) return '-' + formatted
  return formatted
}

export function formatPercent(value: number, decimals: number = 1): string {
  return value.toFixed(decimals) + '%'
}

export function formatNumber(value: number): string {
  return Math.round(value).toLocaleString('ko-KR')
}

export function formatCurrency(value: number): string {
  return formatKRW(value)
}

export function formatUSD(value: number): string {
  return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatSubscriptionAmount(value: number, currency: 'KRW' | 'USD'): string {
  return currency === 'KRW' ? formatKRW(value) : formatUSD(value)
}

export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return '오늘'
  if (diffDays === 1) return '어제'
  if (diffDays < 7) return `${diffDays}일 전`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}주 전`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}개월 전`
  return `${Math.floor(diffDays / 365)}년 전`
}
