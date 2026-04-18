import { useMemo } from 'react'
import type { Transaction } from '@/lib/types'
import { getTodayString } from '@/lib/dateUtils'

/**
 * 최근 30일 거래 중 (type, categoryId, amount, memo) 기준 빈도 top 5
 * Quick Record Strip 용
 */
export function useQuickRecordCandidates(
  transactions: Transaction[],
  limit: number = 5,
): Transaction[] {
  return useMemo(() => {
    const today = getTodayString()
    const thirtyDaysAgo = new Date(today)
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const threshold = thirtyDaysAgo.toISOString().split('T')[0]

    const recent = transactions.filter(t => t.date >= threshold)
    const freq = new Map<string, { count: number; template: Transaction }>()
    for (const t of recent) {
      const key = `${t.type}:${t.categoryId ?? 'x'}:${t.amount}:${(t.memo ?? '').trim()}`
      const existing = freq.get(key)
      if (existing) existing.count++
      else freq.set(key, { count: 1, template: t })
    }
    return [...freq.values()]
      .filter(v => v.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
      .map(v => v.template)
  }, [transactions, limit])
}
