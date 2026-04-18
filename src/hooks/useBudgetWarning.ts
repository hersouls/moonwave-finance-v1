import { useMemo } from 'react'
import type { Budget, Transaction, TransactionType } from '@/lib/types'
import { BUDGET_THRESHOLDS } from '@/lib/ledgerConstants'
import { formatKoreanUnit } from '@/utils/format'

export interface BudgetWarning {
  budgetAmount: number
  used: number
  remaining: number
  percent: number
}

export type BudgetWarningLevel = 'over' | 'warning' | 'safe'

/**
 * 지출 카테고리에 대한 예산 사용률 계산.
 * type !== 'expense' 이거나 categoryId/budget 없으면 null.
 */
export function useBudgetWarning(
  type: TransactionType,
  categoryId: number | '' | null,
  budgets: Budget[],
  transactions: Transaction[],
): BudgetWarning | null {
  return useMemo(() => {
    if (type !== 'expense' || !categoryId) return null
    const budget = budgets.find(b => b.categoryId === categoryId)
    if (!budget) return null
    const used = transactions
      .filter(t => t.type === 'expense' && t.categoryId === categoryId)
      .reduce((sum, t) => sum + t.amount, 0)
    const remaining = budget.amount - used
    const percent = budget.amount > 0 ? (used / budget.amount) * 100 : 0
    return { budgetAmount: budget.amount, used, remaining, percent }
  }, [type, categoryId, budgets, transactions])
}

export function getBudgetWarningLevel(w: BudgetWarning): BudgetWarningLevel {
  if (w.percent > BUDGET_THRESHOLDS.OVER) return 'over'
  if (w.percent >= BUDGET_THRESHOLDS.WARNING) return 'warning'
  return 'safe'
}

/**
 * 예산 경보 메시지 포맷 — "단위(원)" 포함 여부 선택.
 */
export function formatBudgetWarning(w: BudgetWarning, withUnit = true): string {
  const unit = withUnit ? '원' : ''
  const budget = `${formatKoreanUnit(w.budgetAmount)}${unit}`
  const used = `${formatKoreanUnit(w.used)}${unit}`
  if (w.percent > BUDGET_THRESHOLDS.OVER) {
    return `예산 ${budget} 중 ${used} 사용 (${formatKoreanUnit(Math.abs(w.remaining))}${unit} 초과!)`
  }
  return `예산 ${budget} 중 ${used} 사용 (${formatKoreanUnit(w.remaining)}${unit} 남음)`
}
