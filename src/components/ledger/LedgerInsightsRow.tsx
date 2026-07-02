import { TopCategoryCard } from './insights/TopCategoryCard'
import { CategoryDonutCard } from './insights/CategoryDonutCard'
import { SubscriptionCard } from './insights/SubscriptionCard'
import { UpcomingBillsCard } from './insights/UpcomingBillsCard'
import type { Transaction, TransactionCategory } from '@/lib/types'

interface LedgerInsightsRowProps {
  type: 'expense' | 'income'
  month: string
  transactions: Transaction[]
  categories: TransactionCategory[]
  onCategoryFilter?: (categoryId: string | null) => void
}

export function LedgerInsightsRow({
  type, month, transactions, categories, onCategoryFilter,
}: LedgerInsightsRowProps) {
  return (
    <div
      className="flex gap-3 overflow-x-auto scrollbar-none -mx-4 px-4 -my-1 py-1 snap-x snap-mandatory"
      role="region"
      aria-label="재무 인사이트"
    >
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
  )
}
