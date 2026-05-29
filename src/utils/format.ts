/** 1억 (hundred million) */
export const KOREAN_UNIT_EUK = 100_000_000
/** 1만 (ten thousand) */
export const KOREAN_UNIT_MAN = 10_000

export function formatKRW(value: number): string {
  if (!Number.isFinite(value)) return '0원'
  return Math.round(value).toLocaleString('ko-KR') + '원'
}

export function formatKoreanUnit(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return Math.round(value).toLocaleString('ko-KR')
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
  if (!Number.isFinite(value)) return '0%'
  return value.toFixed(decimals) + '%'
}

/** 보유 수량 표기 — 정수면 그대로, 소수(해외 단주)면 불필요한 0 제거 후 최대 4자리. */
export function formatShares(qty: number): string {
  if (!Number.isFinite(qty)) return '0'
  if (Number.isInteger(qty)) return qty.toLocaleString('ko-KR')
  return parseFloat(qty.toFixed(4)).toLocaleString('ko-KR', { maximumFractionDigits: 4 })
}

/** 이자율·수익률 등 % 표기 — 소수 2자리 고정(증권사 표기 관례). */
export function formatRatePercent(value: number): string {
  if (!Number.isFinite(value)) return '0.00%'
  return value.toFixed(2) + '%'
}

/** 환율 표기 — 1달러당 원 (KRW/USD). */
export function formatExchangeRate(rate: number): string {
  if (!Number.isFinite(rate)) return '-'
  return rate.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '원/$'
}

export function formatNumber(value: number): string {
  return Math.round(value).toLocaleString('ko-KR')
}

export function formatCurrency(value: number): string {
  return formatKRW(value)
}

export function formatUSD(value: number): string {
  if (!Number.isFinite(value)) return '$0.00'
  return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatSubscriptionAmount(value: number, currency: 'KRW' | 'USD'): string {
  return currency === 'KRW' ? formatKRW(value) : formatUSD(value)
}

export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return ''
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
