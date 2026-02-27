import type { Transaction } from '@/lib/types'

export interface DaySummary {
  income: number
  expense: number
  net: number
  count: number
}

export function computeDailySummaries(transactions: Transaction[]): Map<string, DaySummary> {
  const map = new Map<string, DaySummary>()

  for (const t of transactions) {
    const existing = map.get(t.date) || { income: 0, expense: 0, net: 0, count: 0 }
    if (t.type === 'income') {
      existing.income += t.amount
      existing.net += t.amount
    } else {
      existing.expense += t.amount
      existing.net -= t.amount
    }
    existing.count++
    map.set(t.date, existing)
  }

  return map
}
