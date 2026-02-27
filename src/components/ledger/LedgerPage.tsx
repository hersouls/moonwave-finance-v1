import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTransactionStore } from '@/stores/transactionStore'
import { useMemberStore } from '@/stores/memberStore'
import { useUIStore } from '@/stores/uiStore'
import { useTransactionFilters } from '@/hooks/useTransactionFilters'
import { TransactionCard } from './TransactionCard'
import { TransactionCreateModal } from './TransactionCreateModal'
import { TransactionFilters } from './TransactionFilters'
import { MonthlySummary } from './MonthlySummary'
import { CategoryBreakdown } from './CategoryBreakdown'
import { LedgerEmptyState } from './LedgerEmptyState'
import { FAB } from '@/components/ui/FAB'
import { IconButton } from '@/components/ui/Button'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { formatMonthLabel, getPreviousMonth, getNextMonth } from '@/lib/dateUtils'

export function LedgerPage() {
  const [isLoading, setIsLoading] = useState(true)

  const loadAll = useTransactionStore((s) => s.loadAll)
  const loadMembers = useMemberStore((s) => s.loadMembers)
  const transactions = useTransactionStore((s) => s.transactions)
  const selectedMonth = useTransactionStore((s) => s.selectedMonth)
  const setSelectedMonth = useTransactionStore((s) => s.setSelectedMonth)
  const openTransactionCreateModal = useUIStore((s) => s.openTransactionCreateModal)

  const { filtered, summary, filters, setTypeFilter, setSearchQuery } = useTransactionFilters(transactions)

  useEffect(() => {
    const init = async () => {
      await Promise.all([loadAll(), loadMembers()])
      setIsLoading(false)
    }
    init()
  }, [])

  if (isLoading) {
    return (
      <div className="p-4 lg:p-6 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-zinc-200 dark:bg-zinc-700 rounded-xl animate-pulse" />
          ))}
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* Month Navigator */}
      <div className="flex items-center justify-between">
        <IconButton onClick={() => setSelectedMonth(getPreviousMonth(selectedMonth))} plain size="sm">
          <ChevronLeft className="w-5 h-5" />
        </IconButton>
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          {formatMonthLabel(selectedMonth)}
        </h2>
        <IconButton onClick={() => setSelectedMonth(getNextMonth(selectedMonth))} plain size="sm">
          <ChevronRight className="w-5 h-5" />
        </IconButton>
      </div>

      {/* Monthly Summary */}
      <MonthlySummary
        totalIncome={summary.totalIncome}
        totalExpense={summary.totalExpense}
        netSavings={summary.netSavings}
      />

      {/* Type Filter */}
      <TransactionFilters
        activeType={filters.type}
        onTypeChange={setTypeFilter}
        searchQuery={filters.searchQuery}
        onSearchChange={setSearchQuery}
      />

      {/* Category Breakdown */}
      {transactions.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <CategoryBreakdown transactions={transactions} type="expense" />
          <CategoryBreakdown transactions={transactions} type="income" />
        </div>
      )}

      {/* Transaction List */}
      {filtered.length === 0 ? (
        <LedgerEmptyState />
      ) : (
        <div className="space-y-2">
          {filtered.map(t => (
            <TransactionCard key={t.id} transaction={t} />
          ))}
        </div>
      )}

      <FAB onClick={openTransactionCreateModal} label="거래 기록" />
      <TransactionCreateModal />
    </div>
  )
}
