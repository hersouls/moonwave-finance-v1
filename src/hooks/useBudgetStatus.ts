import { useMemo } from 'react'
import type { Budget, Transaction } from '@/lib/types'
import { getTodayString } from '@/lib/dateUtils'

export type BudgetStatusLevel = 'safe' | 'warning' | 'critical' | 'exceeded'

export interface BudgetStatus {
  totalBudget: number
  totalUsed: number
  remaining: number
  percentUsed: number
  daysRemaining: number
  daysPassed: number
  totalDaysInMonth: number
  status: BudgetStatusLevel
  /** 현재 속도로 지속 시 예상 초과액 (초과 가능성 있을 때만) */
  projectedOverage: number | null
}

export function useBudgetStatus(
  budgets: Budget[],
  transactions: Transaction[],
  month: string,
  todayOverride?: string,
): BudgetStatus {
  return useMemo(() => {
    const today = todayOverride ?? getTodayString()
    const totalBudget = budgets.reduce((s, b) => s + b.amount, 0)

    const thisMonthExpenses = transactions.filter(
      t => t.type === 'expense' && t.date.startsWith(month)
    )
    const totalUsed = thisMonthExpenses.reduce((s, t) => s + t.amount, 0)
    const remaining = totalBudget - totalUsed
    const percentUsed = totalBudget > 0 ? (totalUsed / totalBudget) * 100 : 0

    // 월의 총 일수 계산
    const [y, m] = month.split('-').map(Number)
    const lastDay = new Date(y, m, 0).getDate()
    const todayDate = today.startsWith(month) ? Number(today.slice(8, 10)) : lastDay
    const daysPassed = Math.max(1, Math.min(todayDate, lastDay))
    const daysRemaining = Math.max(0, lastDay - daysPassed)

    // 투영
    let projectedOverage: number | null = null
    if (daysPassed > 0 && totalBudget > 0) {
      const dailyRate = totalUsed / daysPassed
      const projectedTotal = dailyRate * lastDay
      if (projectedTotal > totalBudget) projectedOverage = projectedTotal - totalBudget
    }

    const status: BudgetStatusLevel =
      percentUsed >= 100 ? 'exceeded' :
      percentUsed >= 80 ? 'critical' :
      percentUsed >= 60 ? 'warning' : 'safe'

    return {
      totalBudget,
      totalUsed,
      remaining,
      percentUsed,
      daysRemaining,
      daysPassed,
      totalDaysInMonth: lastDay,
      status,
      projectedOverage,
    }
  }, [budgets, transactions, month, todayOverride])
}
