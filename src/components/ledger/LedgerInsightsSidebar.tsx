import { TopCategoryCard } from './insights/TopCategoryCard'
import { CategoryDonutCard } from './insights/CategoryDonutCard'
import { SubscriptionCard } from './insights/SubscriptionCard'
import { UpcomingBillsCard } from './insights/UpcomingBillsCard'
import type { Transaction, TransactionCategory } from '@/lib/types'

interface LedgerInsightsSidebarProps {
  type: 'expense' | 'income'
  month: string
  transactions: Transaction[]
  categories: TransactionCategory[]
  onCategoryFilter?: (categoryId: number | null) => void
}

/**
 * Desktop(lg+) 우측 sidebar 용 Insights 세로 레이아웃.
 * 각 card 에 w-full 강제 + space-y-3
 */
export function LedgerInsightsSidebar({
  type, month, transactions, categories, onCategoryFilter,
}: LedgerInsightsSidebarProps) {
  return (
    <aside
      className="space-y-3 [&>*]:!w-full"
      role="complementary"
      aria-label="재무 인사이트 사이드바"
    >
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
    </aside>
  )
}
