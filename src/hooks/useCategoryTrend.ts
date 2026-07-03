import { useMemo } from 'react'
import type { Transaction } from '@/lib/types'
import { getPreviousMonth } from '@/lib/dateUtils'

export interface CategoryTrend {
  thisAmount: number
  previousAmount: number
  diff: number
  /** 전월 대비 % (null = 전월 데이터 0일 때) */
  percent: number | null
  direction: 'up' | 'down' | 'flat'
}

/**
 * 특정 카테고리의 전월 대비 지출 변화 계산
 */
export function useCategoryTrend(
  categoryId: string | null,
  month: string,
  transactions: Transaction[],
  type: 'expense' | 'income' = 'expense',
): CategoryTrend {
  return useMemo(() => {
    const prevMonth = getPreviousMonth(month)
    let thisAmount = 0
    let previousAmount = 0

    for (const t of transactions) {
      if (t.type !== type) continue
      if (t.categoryId !== categoryId) continue
      if (t.date.startsWith(month)) thisAmount += t.amount
      else if (t.date.startsWith(prevMonth)) previousAmount += t.amount
    }

    const diff = thisAmount - previousAmount
    if (previousAmount === 0) {
      return { thisAmount, previousAmount, diff, percent: null, direction: thisAmount > 0 ? 'up' : 'flat' }
    }
    const percent = (diff / previousAmount) * 100
    const direction: CategoryTrend['direction'] =
      Math.abs(percent) < 1 ? 'flat' : percent > 0 ? 'up' : 'down'
    return { thisAmount, previousAmount, diff, percent, direction }
  }, [categoryId, month, transactions, type])
}

/**
 * 전체 합계(월간)의 전월 대비 변화
 */
export function useMonthlyTrend(
  month: string,
  transactions: Transaction[],
  type: 'expense' | 'income' = 'expense',
): CategoryTrend {
  return useMemo(() => {
    const prevMonth = getPreviousMonth(month)
    let thisAmount = 0
    let previousAmount = 0
    for (const t of transactions) {
      if (t.type !== type) continue
      if (t.date.startsWith(month)) thisAmount += t.amount
      else if (t.date.startsWith(prevMonth)) previousAmount += t.amount
    }
    const diff = thisAmount - previousAmount
    if (previousAmount === 0) {
      return { thisAmount, previousAmount, diff, percent: null, direction: thisAmount > 0 ? 'up' : 'flat' }
    }
    const percent = (diff / previousAmount) * 100
    const direction: CategoryTrend['direction'] =
      Math.abs(percent) < 1 ? 'flat' : percent > 0 ? 'up' : 'down'
    return { thisAmount, previousAmount, diff, percent, direction }
  }, [month, transactions, type])
}
