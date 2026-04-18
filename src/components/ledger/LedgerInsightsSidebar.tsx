import { useState } from 'react'
import { BudgetRingCard } from './insights/BudgetRingCard'
import { TopCategoryCard } from './insights/TopCategoryCard'
import { CategoryDonutCard } from './insights/CategoryDonutCard'
import { SubscriptionCard } from './insights/SubscriptionCard'
import { UpcomingBillsCard } from './insights/UpcomingBillsCard'
import { BudgetDetailSheet } from './BudgetDetailSheet'
import { useBudgetStatus } from '@/hooks/useBudgetStatus'
import type { Budget, Transaction, TransactionCategory } from '@/lib/types'

interface LedgerInsightsSidebarProps {
  type: 'expense' | 'income'
  month: string
  transactions: Transaction[]
  categories: TransactionCategory[]
  budgets: Budget[]
  onCategoryFilter?: (categoryId: number | null) => void
}

/**
 * Desktop(lg+) 우측 sidebar 용 Insights 세로 레이아웃.
 * 각 card 에 w-full 강제 + space-y-4
 */
export function LedgerInsightsSidebar({
  type, month, transactions, categories, budgets, onCategoryFilter,
}: LedgerInsightsSidebarProps) {
  const budgetStatus = useBudgetStatus(budgets, transactions, month)
  const [showBudgetSheet, setShowBudgetSheet] = useState(false)

  return (
    <aside
      className="space-y-3 [&>*]:!w-full"
      role="complementary"
      aria-label="재무 인사이트 사이드바"
    >
      <BudgetRingCard status={budgetStatus} onClick={() => setShowBudgetSheet(true)} />
      <TopCategoryCard
        transactions={transactions}
        categories={categories}
        month={month}
        type={type}
        onClick={onCategoryFilter}
      />
      <CategoryDonutCard
        transactions={transactions}
        categories={categories}
        month={month}
        type={type}
        onCategorySelect={onCategoryFilter}
      />
      <SubscriptionCard />
      <UpcomingBillsCard />

      <BudgetDetailSheet
        open={showBudgetSheet}
        onClose={() => setShowBudgetSheet(false)}
        status={budgetStatus}
        budgets={budgets}
        transactions={transactions}
        categories={categories}
        month={month}
      />
    </aside>
  )
}
