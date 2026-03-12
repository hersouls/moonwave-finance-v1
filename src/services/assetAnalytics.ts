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
  assetItemId: number,
  joinDate: string,
  monthlyAvgWage: number,
  targetEndDate: string
): Omit<DailyValue, 'id' | 'syncId' | 'createdAt' | 'updatedAt'>[] {
  const join = parseISO(joinDate)
  const end = parseISO(targetEndDate)

  if (isBefore(end, join)) return []

  const values: Omit<DailyValue, 'id' | 'syncId' | 'createdAt' | 'updatedAt'>[] = []

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
  
  // AssetItem ID별로 최신 값을 추적하기 위한 Map
  // 이력 데이터(values)를 정렬하여 빠르게 이전 값을 찾도록 준비할 수도 있으나,
  // 매일마다 반복하며 값을 유지(Forward Fill)하는 방식이 효율적.
  
  // 초기화 (1일 이전의 가장 최신 값을 불러오도록 설정해야 하지만, 일단 제공된 `values` 내에서 찾음)
  // 완벽한 Forward Fill을 위해서는 전월에서 넘어온 최종값도 `values`에 포함되어 있어야 함.
  
  // 빠른 조회를 위해 values를 파싱 및 정렬 (날짜 오름차순)
  const sortedValues = [...values].sort((a, b) => a.date.localeCompare(b.date))
  
  // 아이템별 최신 값을 저장할 맵
  const currentValuesMap = new Map<number, number>()
  
  // 1일부터 말일까지 순회
  for (let day = 1; day <= daysInMonth; day++) {
    const currentDateStr = `${month}-${String(day).padStart(2, '0')}`
    
    let totalAssets = 0
    let totalLiabilities = 0
    
    // 이 날짜까지의 최신 값으로 currentValuesMap 업데이트
    // (보통 API에서 가져올 때 오늘 이전 값을 모두 주면 좋지만, 최신값 조회를 위해)
    items.forEach(item => {
      // 1. 해당 일자의 명시적 값을 찾음
      const exactValue = sortedValues.find(v => v.assetItemId === item.id && v.date === currentDateStr)
      
      if (exactValue) {
        currentValuesMap.set(item.id!, exactValue.value)
      } else {
        // 없다면 기존에 맵에 있는 값 (어제까지의 최신값)을 그대로 사용 (Forward Fill)
        // 만약 맵에 없다면 (이번 달 1일이거나 처음), 당일 자정 기준 이전 기록 중 가장 최신 값을 탐색
        if (!currentValuesMap.has(item.id!)) {
          const pastValues = sortedValues
            .filter(v => v.assetItemId === item.id && v.date <= currentDateStr)
            .sort((a, b) => b.date.localeCompare(a.date)) // 내림차순
          
          if (pastValues.length > 0) {
            currentValuesMap.set(item.id!, pastValues[0].value)
          } else {
            currentValuesMap.set(item.id!, 0) // 아직 기록 없음
          }
        }
      }
      
      // 현재 값 합산
      const val = currentValuesMap.get(item.id!) || 0
      if (item.type === 'asset') {
        totalAssets += val
      } else if (item.type === 'liability') {
        totalLiabilities += val
      }
    })
    
    const netWorth = totalAssets - totalLiabilities
    const debtRatio = netWorth > 0 ? (totalLiabilities / totalAssets) * 100 : 0
    
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
