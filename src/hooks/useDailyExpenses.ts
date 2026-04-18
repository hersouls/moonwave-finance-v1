import { useMemo } from 'react'
import type { Transaction } from '@/lib/types'
import { getMonthDates } from '@/lib/dateUtils'

/**
 * 월별 일별 지출(또는 수입) 합계 배열 — sparkline 용
 * @returns values: number[] (일별 합계, 길이 = 해당 월 일수)
 */
export function useDailyExpenses(
  month: string,
  transactions: Transaction[],
  type: 'expense' | 'income' = 'expense',
): number[] {
  return useMemo(() => {
    const days = getMonthDates(month)
    const byDate = new Map<string, number>()
    for (const t of transactions) {
      if (t.type !== type) continue
      if (!t.date.startsWith(month)) continue
      byDate.set(t.date, (byDate.get(t.date) || 0) + t.amount)
    }
    return days.map(d => byDate.get(d) || 0)
  }, [month, transactions, type])
}
