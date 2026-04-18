import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { staggerContainer, staggerItem, reducedStaggerContainer, reducedStaggerItem, motionVariants } from '@/lib/motionConfig'
import { useLocation } from 'react-router-dom'
import { useTransactionStore } from '@/stores/transactionStore'
import { useMemberStore } from '@/stores/memberStore'
import { useUIStore } from '@/stores/uiStore'
import { useBudgetStore } from '@/stores/budgetStore'
import { useTransactionFilters } from '@/hooks/useTransactionFilters'
import { useDailyExpenses } from '@/hooks/useDailyExpenses'
import { useMonthlyTrend } from '@/hooks/useCategoryTrend'
import { useSyncListener } from '@/hooks/useSyncListener'
import { LedgerHero } from './LedgerHero'
import { LedgerInsightsRow } from './LedgerInsightsRow'
import { QuickRecordStrip } from './QuickRecordStrip'
import { TransactionListGrouped } from './TransactionListGrouped'
import { TransactionFormModal } from './TransactionFormModal'
import { TransactionWizard } from './TransactionWizard'
import { TransactionFilters } from './TransactionFilters'
import { LedgerEmptyState } from './LedgerEmptyState'
import { PageSegmentControl } from '@/components/layout/PageSegmentControl'
import { FAB } from '@/components/ui/FAB'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { ErrorEmptyState } from '@/components/ui/EmptyState'
import { useSwipe } from '@/hooks/useSwipe'
import { LEDGER_SEGMENTS } from '@/lib/ledgerConstants'
import { getNextMonth, getPreviousMonth } from '@/lib/dateUtils'

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

  const shouldReduceMotion = useReducedMotion()
  const containerV = motionVariants(shouldReduceMotion, staggerContainer, reducedStaggerContainer)
  const itemV = motionVariants(shouldReduceMotion, staggerItem, reducedStaggerItem)

  // Swipe on Hero area (month navigation)
  const swipeHandlers = useSwipe({
    onSwipeLeft: () => setSelectedMonth(getNextMonth(selectedMonth)),
    onSwipeRight: () => setSelectedMonth(getPreviousMonth(selectedMonth)),
  })

  const {
    filtered, summary, filters, typeCounts,
    setTypeFilter, setSearchQuery,
    setMemberFilter, setCategoryFilter, setPaymentMethodFilter,
    setMinAmount, setMaxAmount,
    setSortBy, setDateRange,
    resetFilters, activeFilterCount,
  } = useTransactionFilters(transactions)

  // Hero sparkline data + trend
  const dailyValues = useDailyExpenses(selectedMonth, transactions, defaultType)
  const monthlyTrend = useMonthlyTrend(selectedMonth, transactions, defaultType)

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
  useSyncListener(loadData, ['transactions', 'transactionCategories', 'paymentMethodItems'])

  useEffect(() => {
    loadBudgets(selectedMonth)
  }, [selectedMonth, loadBudgets])

  if (isLoading) {
    return (
      <div className="fold:p-3 p-4 lg:p-6 space-y-4">
        <div className="h-[220px] bg-[var(--surface-tertiary)] rounded-3xl animate-pulse" />
        <div className="flex gap-3 overflow-hidden">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex-shrink-0 w-[180px] h-[160px] bg-[var(--surface-tertiary)] rounded-2xl animate-pulse" />
          ))}
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="fold:p-3 p-4 lg:p-6">
        <ErrorEmptyState description={error} onRetry={loadData} />
      </div>
    )
  }

  const focalAmount = defaultType === 'expense' ? summary.totalExpense : summary.totalIncome

  return (
    <div className="fold:p-3 p-4 lg:p-6 space-y-5">
      {/* Segment Control */}
      <PageSegmentControl segments={LEDGER_SEGMENTS} />

      {/* Hero + Swipe for month nav */}
      <div {...swipeHandlers}>
        <LedgerHero
          type={defaultType}
          selectedMonth={selectedMonth}
          onMonthChange={setSelectedMonth}
          totalAmount={focalAmount}
          income={summary.totalIncome}
          expense={summary.totalExpense}
          trend={monthlyTrend}
          dailyValues={dailyValues}
        />
      </div>

      {/* Insights Row */}
      <LedgerInsightsRow
        type={defaultType}
        month={selectedMonth}
        transactions={transactions}
        categories={categories}
        budgets={budgets}
        onCategoryFilter={setCategoryFilter}
      />

      {/* Quick Record Strip */}
      <QuickRecordStrip />

      {/* Type Filter + Advanced Filters */}
      <TransactionFilters
        activeType={filters.type}
        onTypeChange={setTypeFilter}
        typeCounts={typeCounts}
        searchQuery={filters.searchQuery}
        onSearchChange={setSearchQuery}
        members={members}
        categories={categories}
        memberFilter={filters.memberId}
        onMemberChange={setMemberFilter}
        categoryFilter={filters.categoryId}
        onCategoryChange={setCategoryFilter}
        paymentMethodFilter={filters.paymentMethod}
        onPaymentMethodChange={setPaymentMethodFilter}
        minAmount={filters.minAmount}
        maxAmount={filters.maxAmount}
        onAmountRangeChange={(min, max) => { setMinAmount(min); setMaxAmount(max) }}
        sortBy={filters.sortBy}
        onSortByChange={setSortBy}
        dateRange={filters.dateRange}
        onDateRangeChange={setDateRange}
        activeFilterCount={activeFilterCount}
        onReset={resetFilters}
      />

      {/* Transaction List — 날짜 그룹핑 */}
      {filtered.length === 0 ? (
        <LedgerEmptyState />
      ) : (
        <motion.div
          variants={containerV}
          initial="hidden"
          animate="visible"
          key={`${selectedMonth}-${defaultType}`}
        >
          <motion.div variants={itemV}>
            <TransactionListGrouped transactions={filtered} />
          </motion.div>
        </motion.div>
      )}

      <FAB onClick={openTransactionCreateModal} label="거래 기록" />

      {/* Create Wizard */}
      <TransactionWizard
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
