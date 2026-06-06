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

/**
 * 차트 y축 눈금용 한국식 단위 표기 — 눈금 간격(step)에 맞춰 소수 자릿수를 정한다.
 *
 * 정수 억 반올림(`Math.round(num/1억) + '억'`)은 값이 같은 억 구간 안에서
 * 움직일 때(예: 5.1억~5.4억) 모든 눈금이 "5억"으로 붕괴해 축을 읽을 수 없다 —
 * 인접 눈금이 서로 다른 라벨이 되는 최소 자릿수를 step에서 역산한다(최대 3자리).
 *
 * @param ticks Chart.js tick 배열 — 인접 두 눈금의 간격으로 자릿수를 정한다.
 *              생략 시 소수 없이 반올림(기존 동작).
 */
export function formatKoreanAxisTick(
  value: number | string,
  ticks?: ReadonlyArray<{ value: number }>
): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (!Number.isFinite(num)) return String(value)

  const step = ticks && ticks.length > 1 ? Math.abs(ticks[1].value - ticks[0].value) : 0

  const withUnit = (unit: number, suffix: string): string => {
    let decimals = 0
    if (step > 0) {
      const ratio = step / unit
      decimals = ratio < 1 ? Math.min(3, Math.ceil(-Math.log10(ratio))) : 0
      // step이 해당 자릿수에서 떨어지지 않으면(예: 0.25억, 2.5만) 한 자리 더
      while (decimals < 3 && Math.abs(ratio * 10 ** decimals - Math.round(ratio * 10 ** decimals)) > 1e-6) {
        decimals++
      }
    }
    const fixed = (num / unit).toFixed(decimals)
    // 후행 0 제거: "5.0억" → "5억", "5.10억" → "5.1억"
    const trimmed = decimals > 0 ? fixed.replace(/\.?0+$/, '') : fixed
    return trimmed + suffix
  }

  if (Math.abs(num) >= KOREAN_UNIT_EUK) return withUnit(KOREAN_UNIT_EUK, '억')
  if (Math.abs(num) >= KOREAN_UNIT_MAN) return withUnit(KOREAN_UNIT_MAN, '만')
  return num.toLocaleString('ko-KR')
}

/**
 * 한국식 축약 금액 — "4.5억" / "3,450만" / "9,500". 히어로 칩처럼 좁은 공간 전용.
 * 선행 수가 100 미만이면 소수 1자리(4.5억, 98.5만), 이상이면 정수(3,450만).
 */
export function formatKoreanCompact(value: number): string {
  if (!Number.isFinite(value)) return '0'
  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(Math.round(value))
  const part = (n: number): string =>
    n >= 100
      ? Math.round(n).toLocaleString('ko-KR')
      : (Math.round(n * 10) / 10).toLocaleString('ko-KR') // .0은 toLocaleString이 자동 제거
  if (abs >= KOREAN_UNIT_EUK) return `${sign}${part(abs / KOREAN_UNIT_EUK)}억`
  if (abs >= KOREAN_UNIT_MAN) return `${sign}${part(abs / KOREAN_UNIT_MAN)}만`
  return `${sign}${abs.toLocaleString('ko-KR')}`
}

/** 부호 포함 축약 증감 — "+120만" / "-4.5억" / "0". */
export function formatKoreanCompactChange(value: number): string {
  const formatted = formatKoreanCompact(Math.abs(value))
  if (value > 0) return '+' + formatted
  if (value < 0) return '-' + formatted
  return formatted
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
