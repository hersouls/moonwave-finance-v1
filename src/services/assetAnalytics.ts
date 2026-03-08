import { differenceInDays, addDays, parseISO, isBefore, isEqual, getDaysInMonth, format } from 'date-fns'
import type { AssetItem, DailyValue, NetWorthSnapshot } from '@/lib/types'

/**
 * 대한민국 퇴직금 공식:
 * 퇴직금 = 1일 평균임금 x 30일 x (재직일수 / 365일)
 *
 * @param joinDate 입사일 (YYYY-MM-DD)
 * @param averageDailyWage 1일 평균임금 (예상 금액)
 * @param targetDate 퇴직금을 계산할 기준일 (YYYY-MM-DD)
 * @returns 해당 일자 기준 예상 퇴직금
 */
export function calculateSeverancePay(joinDate: string, averageDailyWage: number, targetDate: string): number {
  const join = parseISO(joinDate)
  const target = parseISO(targetDate)
  
  if (isBefore(target, join)) {
    return 0
  }

  // 재직일수 계산 (입사일은 포함되어야 하므로 +1)
  const daysOfService = differenceInDays(target, join) + 1
  
  const severancePay = averageDailyWage * 30 * (daysOfService / 365)
  return Math.floor(severancePay)
}

/**
 * 입사일부터 현재(또는 특정 기간)까지의 각 날짜별 예상 퇴직금을 DailyValue 형태로 배열 생성
 * 초기 등록 시 또는 기간 내 값 생성을 위해 사용할 수 있습니다.
 *
 * @param assetItemId 연결된 자산 아이템 ID
 * @param joinDate 입사일
 * @param averageDailyWage 1일 평균임금
 * @param targetEndDate 값을 채울 마지막 일자 (보통 오늘)
 */
export function generateSeverancePayValues(
  assetItemId: number,
  joinDate: string,
  averageDailyWage: number,
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
      value: calculateSeverancePay(joinDate, averageDailyWage, curDateStr)
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
