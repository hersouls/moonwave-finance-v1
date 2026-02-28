import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTransactionStore } from '@/stores/transactionStore'
import { useMemberStore } from '@/stores/memberStore'
import { useUIStore } from '@/stores/uiStore'
import { useBudgetStore } from '@/stores/budgetStore'
import { useTransactionFilters } from '@/hooks/useTransactionFilters'
import { TransactionCard } from './TransactionCard'
import { TransactionFormModal } from './TransactionFormModal'
import { TransactionFilters } from './TransactionFilters'
import { MonthlySummary } from './MonthlySummary'
import { CategoryBreakdown } from './CategoryBreakdown'
import { LedgerEmptyState } from './LedgerEmptyState'
import { BudgetOverviewCard } from '@/components/budget/BudgetOverviewCard'
import { PageSegmentControl } from '@/components/layout/PageSegmentControl'
import { FAB } from '@/components/ui/FAB'
import { IconButton } from '@/components/ui/Button'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { formatMonthLabel, getPreviousMonth, getNextMonth } from '@/lib/dateUtils'
import { ErrorEmptyState } from '@/components/ui/EmptyState'

const LEDGER_SEGMENTS = [
  { id: 'expense', label: '지출', path: '/ledger/expense' },
  { id: 'income', label: '수입', path: '/ledger/income' },
  { id: 'calendar', label: '캘린더', path: '/ledger/calendar' },
]

export function LedgerPage() {
  const location = useLocation()
  const defaultType = location.pathname === '/ledger/income' ? 'income' : 'expense'
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadAll = useTransactionStore((s) => s.loadAll)
  const loadMembers = useMemberStore((s) => s.loadMembers)
  const transactions = useTransactionStore((s) => s.transactions)
  const categories = useTransactionStore((s) => s.categories)
  const selectedMonth = useTransactionStore((s) => s.selectedMonth)
  const setSelectedMonth = useTransactionStore((s) => s.setSelectedMonth)
  const members = useMemberStore((s) => s.members)
  const openTransactionCreateModal = useUIStore((s) => s.openTransactionCreateModal)

  // Create modal state
  const isCreateOpen = useUIStore((s) => s.isTransactionCreateModalOpen)
  const closeCreate = useUIStore((s) => s.closeTransactionCreateModal)
  const prefillDate = useUIStore((s) => s.transactionPrefillDate)

  // Edit modal state
  const isEditOpen = useUIStore((s) => s.isTransactionEditModalOpen)
  const editingId = useUIStore((s) => s.editingTransactionId)
  const closeEdit = useUIStore((s) => s.closeTransactionEditModal)

  const editingTransaction = editingId ? transactions.find(t => t.id === editingId) : undefined

  // Budget
  const loadBudgets = useBudgetStore((s) => s.loadBudgets)
  const budgets = useBudgetStore((s) => s.budgets)

  const {
    filtered, summary, filters,
    setTypeFilter, setSearchQuery,
    setMemberFilter, setPaymentMethodFilter,
    setMinAmount, setMaxAmount,
    resetFilters, activeFilterCount,
  } = useTransactionFilters(transactions)

  // Sync type filter with route
  useEffect(() => {
    setTypeFilter(defaultType)
  }, [defaultType])

  const loadData = async () => {
    setError(null)
    setIsLoading(true)
    try {
      await Promise.all([loadAll(), loadMembers()])
    } catch {
      setError('데이터를 불러오는데 실패했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  useEffect(() => {
    loadBudgets(selectedMonth)
  }, [selectedMonth])

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

  if (error) {
    return (
      <div className="p-4 lg:p-6">
        <ErrorEmptyState description={error} onRetry={loadData} />
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* Segment Control */}
      <PageSegmentControl segments={LEDGER_SEGMENTS} />

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

      {/* Budget Overview (expense view only) */}
      {defaultType === 'expense' && budgets.length > 0 && <BudgetOverviewCard />}

      {/* Type Filter + Advanced Filters */}
      <TransactionFilters
        activeType={filters.type}
        onTypeChange={setTypeFilter}
        searchQuery={filters.searchQuery}
        onSearchChange={setSearchQuery}
        members={members}
        categories={categories}
        memberFilter={filters.memberId}
        onMemberChange={setMemberFilter}
        paymentMethodFilter={filters.paymentMethod}
        onPaymentMethodChange={setPaymentMethodFilter}
        minAmount={filters.minAmount}
        maxAmount={filters.maxAmount}
        onAmountRangeChange={(min, max) => { setMinAmount(min); setMaxAmount(max) }}
        activeFilterCount={activeFilterCount}
        onReset={resetFilters}
      />

      {/* Category Breakdown */}
      {transactions.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <CategoryBreakdown transactions={transactions} type="expense" budgets={budgets} />
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

      {/* Create Modal */}
      <TransactionFormModal
        mode="create"
        open={isCreateOpen}
        onClose={closeCreate}
        initialDate={prefillDate}
      />

      {/* Edit Modal */}
      <TransactionFormModal
        mode="edit"
        open={isEditOpen}
        onClose={closeEdit}
        initialData={editingTransaction}
      />
    </div>
  )
}
