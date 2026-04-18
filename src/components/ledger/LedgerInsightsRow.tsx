import { useState } from 'react'
import { BudgetRingCard } from './insights/BudgetRingCard'
import { TopCategoryCard } from './insights/TopCategoryCard'
import { CategoryDonutCard } from './insights/CategoryDonutCard'
import { SubscriptionCard } from './insights/SubscriptionCard'
import { UpcomingBillsCard } from './insights/UpcomingBillsCard'
import { BudgetDetailSheet } from './BudgetDetailSheet'
import { useBudgetStatus } from '@/hooks/useBudgetStatus'
import type { Budget, Transaction, TransactionCategory } from '@/lib/types'

interface LedgerInsightsRowProps {
  type: 'expense' | 'income'
  month: string
  transactions: Transaction[]
  categories: TransactionCategory[]
  budgets: Budget[]
  onCategoryFilter?: (categoryId: number | null) => void
}

export function LedgerInsightsRow({
  type, month, transactions, categories, budgets, onCategoryFilter,
}: LedgerInsightsRowProps) {
  const budgetStatus = useBudgetStatus(budgets, transactions, month)
  const [showBudgetSheet, setShowBudgetSheet] = useState(false)

  return (
    <>
      <div
        className="flex gap-3 overflow-x-auto scrollbar-none -mx-4 px-4 -my-1 py-1 snap-x snap-mandatory"
        role="region"
        aria-label="재무 인사이트"
      >
        <div className="snap-start">
          <BudgetRingCard status={budgetStatus} onClick={() => setShowBudgetSheet(true)} />
        </div>
        <div className="snap-start">
          <TopCategoryCard
            transactions={transactions}
            categories={categories}
            month={month}
            type={type}
            onClick={onCategoryFilter}
          />
        </div>
        <div className="snap-start">
          <CategoryDonutCard
            transactions={transactions}
            categories={categories}
            month={month}
            type={type}
            onCategorySelect={onCategoryFilter}
          />
        </div>
        <div className="snap-start">
          <SubscriptionCard />
        </div>
        <div className="snap-start">
          <UpcomingBillsCard />
        </div>
      </div>

      <BudgetDetailSheet
        open={showBudgetSheet}
        onClose={() => setShowBudgetSheet(false)}
        status={budgetStatus}
        budgets={budgets}
        transactions={transactions}
        categories={categories}
        month={month}
      />
    </>
  )
}
