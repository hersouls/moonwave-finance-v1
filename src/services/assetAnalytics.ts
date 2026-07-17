import { differenceInDays, addDays, parseISO, isBefore, isEqual, getDaysInMonth, format } from 'date-fns'
import type { AssetItem, DailyValue, NetWorthSnapshot } from '@/lib/types'

/* ──────────────────────────────────────────────
 * 퇴직금 계산
 * 공식: 퇴직금 = 월 평균임금(30일분) × 지급률(재직일수 / 365)
 * ────────────────────────────────────────────── */

/**
 * @param joinDate 입사일 (YYYY-MM-DD)
 * @param monthlyAvgWage 월 평균임금 — 30일분 (= 1일 평균임금 × 30)
 * @param targetDate 퇴직금을 계산할 기준일 (YYYY-MM-DD)
 * @returns 해당 일자 기준 예상 퇴직금
 */
export function calculateSeverancePay(joinDate: string, monthlyAvgWage: number, targetDate: string): number {
  const join = parseISO(joinDate)
  const target = parseISO(targetDate)

  if (isBefore(target, join)) return 0

  const daysOfService = differenceInDays(target, join) + 1
  const paymentRate = daysOfService / 365
  return Math.floor(monthlyAvgWage * paymentRate)
}

/**
 * 입사일~기준일 사이의 근속년수 (올림, 세금 계산용)
 */
export function getServiceYears(joinDate: string, targetDate: string): number {
  const join = parseISO(joinDate)
  const target = parseISO(targetDate)
  if (isBefore(target, join)) return 0
  const daysOfService = differenceInDays(target, join) + 1
  return Math.ceil(daysOfService / 365)
}

/* ──────────────────────────────────────────────
 * 퇴직세액 계산 (퇴직소득세 + 퇴직주민세)
 * 2024 세법 기준
 * ────────────────────────────────────────────── */
export interface SeveranceTaxResult {
  incomeTax: number    // 퇴직소득세
  residentTax: number  // 퇴직주민세 (소득세의 10%)
  totalTax: number
  netSeverance: number // 세후 퇴직금
}

export function calculateSeveranceTax(severancePay: number, serviceYears: number): SeveranceTaxResult {
  const zero: SeveranceTaxResult = { incomeTax: 0, residentTax: 0, totalTax: 0, netSeverance: severancePay }
  if (severancePay <= 0 || serviceYears <= 0) return zero

  // 1) 근속년수공제
  let serviceDeduction: number
  if (serviceYears <= 5) {
    serviceDeduction = 1_000_000 * serviceYears
  } else if (serviceYears <= 10) {
    serviceDeduction = 5_000_000 + 2_000_000 * (serviceYears - 5)
  } else if (serviceYears <= 20) {
    serviceDeduction = 15_000_000 + 2_500_000 * (serviceYears - 10)
  } else {
    serviceDeduction = 40_000_000 + 3_000_000 * (serviceYears - 20)
  }

  // 2) 환산급여 = (퇴직급여 - 근속년수공제) × 12 / 근속년수
  const taxableBase = Math.max(severancePay - serviceDeduction, 0)
  if (taxableBase === 0) return zero
  const convertedPay = Math.floor(taxableBase * 12 / serviceYears)

  // 3) 환산급여공제
  let convertedDeduction: number
  if (convertedPay <= 8_000_000) {
    convertedDeduction = convertedPay
  } else if (convertedPay <= 70_000_000) {
    convertedDeduction = 8_000_000 + Math.floor((convertedPay - 8_000_000) * 0.6)
  } else if (convertedPay <= 100_000_000) {
    convertedDeduction = 45_200_000 + Math.floor((convertedPay - 70_000_000) * 0.55)
  } else {
    convertedDeduction = 61_700_000 + Math.floor((convertedPay - 100_000_000) * 0.45)
  }

  // 4) 퇴직소득과세표준
  const taxBase = Math.max(convertedPay - convertedDeduction, 0)
  if (taxBase === 0) return zero

  // 5) 환산산출세액 (기본세율)
  let convertedTax: number
  if (taxBase <= 14_000_000) {
    convertedTax = Math.floor(taxBase * 0.06)
  } else if (taxBase <= 50_000_000) {
    convertedTax = 840_000 + Math.floor((taxBase - 14_000_000) * 0.15)
  } else if (taxBase <= 88_000_000) {
    convertedTax = 6_240_000 + Math.floor((taxBase - 50_000_000) * 0.24)
  } else if (taxBase <= 150_000_000) {
    convertedTax = 15_360_000 + Math.floor((taxBase - 88_000_000) * 0.35)
  } else if (taxBase <= 300_000_000) {
    convertedTax = 37_060_000 + Math.floor((taxBase - 150_000_000) * 0.38)
  } else if (taxBase <= 500_000_000) {
    convertedTax = 94_060_000 + Math.floor((taxBase - 300_000_000) * 0.40)
  } else if (taxBase <= 1_000_000_000) {
    convertedTax = 174_060_000 + Math.floor((taxBase - 500_000_000) * 0.42)
  } else {
    convertedTax = 384_060_000 + Math.floor((taxBase - 1_000_000_000) * 0.45)
  }

  // 6) 퇴직소득세 = 환산산출세액 × 근속년수 / 12, 10원 단위 절사
  const incomeTax = Math.floor(convertedTax * serviceYears / 12 / 10) * 10

  // 7) 퇴직주민세 = 퇴직소득세 × 10%, 10원 단위 절사
  const residentTax = Math.floor(incomeTax * 0.1 / 10) * 10

  const totalTax = incomeTax + residentTax
  return { incomeTax, residentTax, totalTax, netSeverance: severancePay - totalTax }
}

/**
 * 입사일부터 특정 일자까지의 각 날짜별 예상 퇴직금을 DailyValue 형태로 생성
 *
 * @param assetItemId 연결된 자산 아이템 ID
 * @param joinDate 입사일
 * @param monthlyAvgWage 월 평균임금 (30일분)
 * @param targetEndDate 값을 채울 마지막 일자 (보통 오늘)
 */
export function generateSeverancePayValues(
  assetItemId: string,
  joinDate: string,
  monthlyAvgWage: number,
  targetEndDate: string
): Omit<DailyValue, 'id' | 'createdAt' | 'updatedAt'>[] {
  const join = parseISO(joinDate)
  const end = parseISO(targetEndDate)

  if (isBefore(end, join)) return []

  const values: Omit<DailyValue, 'id' | 'createdAt' | 'updatedAt'>[] = []

  let current = join
  while (isBefore(current, end) || isEqual(current, end)) {
    const curDateStr = format(current, 'yyyy-MM-dd')
    values.push({
      assetItemId,
      date: curDateStr,
      value: calculateSeverancePay(joinDate, monthlyAvgWage, curDateStr)
    })
    current = addDays(current, 1)
  }

  return values
}

/* ──────────────────────────────────────────────
 * 일별 가치(DailyValue) 조회 헬퍼 — 전체 이력 기반 Forward-Fill
 *
 * 자산/부채의 "현재 가치"는 매일 기록되지 않으므로, 특정 일자 기준
 * "그 날 이전(포함)의 가장 최근 기록 값"을 사용해야 한다.
 * 월 단위로 잘린 데이터(values)가 아니라 전체 이력(allValues)을 넣어야 정확하다.
 * ────────────────────────────────────────────── */

/**
 * DailyValue 배열을 assetItemId 별로 그룹화하고, 각 그룹을 날짜 내림차순(최신 우선)으로 정렬한다.
 * 반복 조회(valueAsOf) 전에 한 번만 만들어 두면 O(n) 으로 재사용할 수 있다.
 */
export function groupValuesByItem(values: DailyValue[]): Map<string, DailyValue[]> {
  const map = new Map<string, DailyValue[]>()
  for (const v of values) {
    const arr = map.get(v.assetItemId)
    if (arr) arr.push(v)
    else map.set(v.assetItemId, [v])
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => b.date.localeCompare(a.date))
  }
  return map
}

/**
 * 날짜 내림차순으로 정렬된 한 항목의 DailyValue 목록에서
 * `asOf` (YYYY-MM-DD) 이전(포함)의 가장 최근 값을 반환한다 (Forward-Fill).
 * 해당하는 기록이 없으면 0 을 반환한다.
 *
 * @param sortedDesc groupValuesByItem 으로 만든, 날짜 내림차순 정렬 배열
 * @param asOf 기준일 (YYYY-MM-DD)
 */
export function valueAsOf(sortedDesc: DailyValue[] | undefined, asOf: string): number {
  if (!sortedDesc || sortedDesc.length === 0) return 0
  for (const v of sortedDesc) {
    if (v.date <= asOf) return v.value
  }
  return 0
}

/**
 * 최근 `days`일의 Forward-Fill 값 배열(시간순). 희소 저장(평탄 자산: 앵커 2개)이어도
 * 매일 유효값을 채워 스파크라인/추이가 항상 렌더되도록 한다. endYmd 기준 UTC 일계산.
 */
export function recentForwardFill(sortedDesc: DailyValue[] | undefined, days: number, endYmd: string): number[] {
  const out: number[] = []
  const end = new Date(endYmd + 'T00:00:00Z')
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end)
    d.setUTCDate(d.getUTCDate() - i)
    out.push(valueAsOf(sortedDesc, d.toISOString().split('T')[0]))
  }
  return out
}

/**
 * 한 항목의 "가장 최근 기록"과 "그 직전 기록"을 반환한다.
 * 카드/상세 화면의 현재 가치·증감 표시에 사용한다.
 *
 * @param sortedDesc groupValuesByItem 으로 만든, 날짜 내림차순 정렬 배열
 * @param asOf 이 일자 이후의 (미래) 기록은 무시. 기본값 없음 → 전체 최신
 */
export function latestAndPrev(
  sortedDesc: DailyValue[] | undefined,
  asOf?: string
): { latest: number; prev: number; latestDate: string | null } {
  if (!sortedDesc || sortedDesc.length === 0) return { latest: 0, prev: 0, latestDate: null }
  const filtered = asOf ? sortedDesc.filter(v => v.date <= asOf) : sortedDesc
  if (filtered.length === 0) return { latest: 0, prev: 0, latestDate: null }
  const latest = filtered[0].value
  const prev = filtered[1]?.value ?? latest
  return { latest, prev, latestDate: filtered[0].date }
}

/**
 * 주어진 월(month)의 1일부터 말일까지 일자별 순자산(totalAssets - totalLiabilities)을 산출합니다.
 * 값이 매일 존재하지 않는 항목에 대해서는 "가져올 수 있는 가장 최근 과거 값(Forward Fill)"을 사용합니다.
 * 
 * @param month 기준 월 (YYYY-MM)
 * @param items 대상 자산 목록 (AssetItem[])
 * @param values 전체 월의 DailyValue 또는 지금까지의 모든 DailyValue 배열
 * @returns 일자별 NetWorthSnapshot 배열
 */
export function calculateDailyNetWorth(month: string, items: AssetItem[], values: DailyValue[]): NetWorthSnapshot[] {
  const snapshots: NetWorthSnapshot[] = []
  const [y, m] = month.split('-').map(Number)
  
  // Date-fns를 사용해 해당 월의 총 일수 계산
  const daysInMonth = getDaysInMonth(new Date(y, m - 1))
  
  // (아이템 × 일자)마다 전체 values 배열을 스캔하지 않도록 루프 전에 한 번만 인덱싱한다.
  // 1) byItem: 아이템별 날짜 내림차순 목록 — 월 초 이전 앵커의 Forward-Fill 시작값 조회용
  // 2) exactByItem: 아이템별 Map<날짜, 값> — 당일 명시적 기록의 O(1) 조회용
  //    (동일 날짜 중복 기록 시 첫 기록 우선 — 기존 오름차순 정렬 + find 의미 유지)
  const byItem = groupValuesByItem(values)
  const exactByItem = new Map<string, Map<string, number>>()
  for (const v of values) {
    let dateMap = exactByItem.get(v.assetItemId)
    if (!dateMap) {
      dateMap = new Map()
      exactByItem.set(v.assetItemId, dateMap)
    }
    if (!dateMap.has(v.date)) dateMap.set(v.date, v.value)
  }

  // 아이템별 최신 값을 저장할 맵 (Forward Fill 캐리)
  const currentValuesMap = new Map<string, number>()
  
  // 1일부터 말일까지 순회
  for (let day = 1; day <= daysInMonth; day++) {
    const currentDateStr = `${month}-${String(day).padStart(2, '0')}`
    
    let totalAssets = 0
    let totalLiabilities = 0
    
    // 이 날짜까지의 최신 값으로 currentValuesMap 업데이트
    items.forEach(item => {
      // 1. 해당 일자의 명시적 값을 찾음 — O(1)
      const exactValue = exactByItem.get(item.id)?.get(currentDateStr)

      if (exactValue !== undefined) {
        currentValuesMap.set(item.id, exactValue)
      } else if (!currentValuesMap.has(item.id)) {
        // 없다면 기존에 맵에 있는 값 (어제까지의 최신값)을 그대로 사용 (Forward Fill)
        // 맵에도 없다면 (이번 달 1일이거나 처음), 당일 이전(포함) 기록 중 가장 최신 값을 탐색
        // — 기록이 전혀 없으면 valueAsOf 가 0 을 반환 (기존 동작과 동일)
        currentValuesMap.set(item.id, valueAsOf(byItem.get(item.id), currentDateStr))
      }

      // 현재 값 합산
      const val = currentValuesMap.get(item.id) || 0
      if (item.type === 'asset') {
        totalAssets += val
      } else if (item.type === 'liability') {
        totalLiabilities += val
      }
    })
    
    const netWorth = totalAssets - totalLiabilities
    const debtRatio = totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0
    
    snapshots.push({
      date: currentDateStr,
      totalAssets,
      totalLiabilities,
      netWorth,
      debtRatio
    })
  }

  return snapshots
}
