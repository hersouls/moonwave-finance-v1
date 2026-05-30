import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { staggerContainer, staggerItem, reducedStaggerContainer, reducedStaggerItem, motionVariants } from '@/lib/motionConfig'
import { useLocation } from 'react-router-dom'
import { useTransactionStore } from '@/stores/transactionStore'
import { useMemberStore } from '@/stores/memberStore'
import { useUIStore } from '@/stores/uiStore'
import { useTransactionFilters } from '@/hooks/useTransactionFilters'
import { useDailyExpenses } from '@/hooks/useDailyExpenses'
import { useMonthlyTrend } from '@/hooks/useCategoryTrend'
import { useSyncListener } from '@/hooks/useSyncListener'
import { LedgerHero } from './LedgerHero'
import { LedgerInsightsRow } from './LedgerInsightsRow'
import { LedgerInsightsSidebar } from './LedgerInsightsSidebar'
import { MonthlyReportCard } from './MonthlyReportCard'
import { QuickRecordStrip } from './QuickRecordStrip'
import { TransactionListGrouped } from './TransactionListGrouped'
import { TransactionTableView } from './TransactionTableView'
import { TransactionFormModal } from './TransactionFormModal'
import { TransactionWizard } from './TransactionWizard'
import { TransactionFilters } from './TransactionFilters'
import { LedgerEmptyState } from './LedgerEmptyState'
import { CardStatementImportModal } from './CardStatementImportModal'
import { PageSegmentControl } from '@/components/layout/PageSegmentControl'
import { FAB } from '@/components/ui/FAB'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { ErrorEmptyState } from '@/components/ui/EmptyState'
import { useSwipe } from '@/hooks/useSwipe'
import { useBreakpoint } from '@/hooks/useBreakpoint'
import { LayoutGrid, Table2 } from 'lucide-react'
import { clsx } from 'clsx'
import { LEDGER_SEGMENTS } from '@/lib/ledgerConstants'
import { getNextMonth, getPreviousMonth } from '@/lib/dateUtils'

export function LedgerPage() {
  const location = useLocation()
  const defaultType = location.pathname === '/ledger/income' ? 'income' : 'expense'
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [isCardImportOpen, setIsCardImportOpen] = useState(false)
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards')
  const { isDesktop } = useBreakpoint()

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
    setSubscriptionCategoryFilter,
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

  if (isLoading) {
    return (
      <div className="fold:p-3 p-4 lg:p-6 space-y-4">
        <div className="h-56 bg-[var(--surface-tertiary)] rounded-3xl animate-pulse" />
        <div className="flex gap-3 overflow-hidden">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex-shrink-0 w-44 h-40 bg-[var(--surface-tertiary)] rounded-2xl animate-pulse" />
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
    <div className="fold:p-3 p-4 lg:p-6">
      {/* Segment Control */}
      <div className="mb-5">
        <PageSegmentControl segments={LEDGER_SEGMENTS} />
      </div>

      {/* Responsive layout: mobile/tablet 1-col, desktop 3-col (main + sidebar 320px) */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6 xl:gap-8">
        {/* ── Main column ─────────────────────────── */}
        <div className="space-y-5 min-w-0">
          {/* Monthly Report (월말 자동 노출) */}
          <MonthlyReportCard
            month={selectedMonth}
            transactions={transactions}
            categories={categories}
          />

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

          {/* Insights Row — mobile/tablet only (lg 에서는 sidebar 로 이동) */}
          <div className="lg:hidden">
            <LedgerInsightsRow
              type={defaultType}
              month={selectedMonth}
              transactions={transactions}
              categories={categories}
              onCategoryFilter={setCategoryFilter}
            />
          </div>

          {/* Quick Record Strip */}
          <QuickRecordStrip />

          {/* Card statement import — expense view only */}
          {defaultType === 'expense' && (
            <CardStatementImportTrigger onOpen={() => setIsCardImportOpen(true)} />
          )}

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
            subscriptionCategoryFilter={filters.subscriptionCategory}
            onSubscriptionCategoryChange={setSubscriptionCategoryFilter}
            activeFilterCount={activeFilterCount}
            onReset={resetFilters}
          />

          {/* Transaction List — 날짜 그룹핑 + 가상화 (200건+) / 데스크톱 표 뷰 */}
          {filtered.length === 0 ? (
            <LedgerEmptyState />
          ) : (
            <div className="space-y-3">
              {isDesktop && (
                <div className="flex justify-end">
                  <div className="inline-flex rounded-lg bg-surface-tertiary p-0.5" role="group" aria-label="보기 방식">
                    <button
                      type="button"
                      onClick={() => setViewMode('cards')}
                      aria-pressed={viewMode === 'cards'}
                      className={clsx('inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-label3 font-medium transition-colors', viewMode === 'cards' ? 'bg-surface-primary text-heading elevation-1' : 'text-sub hover:text-heading')}
                    >
                      <LayoutGrid className="h-4 w-4" /> 카드
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('table')}
                      aria-pressed={viewMode === 'table'}
                      className={clsx('inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-label3 font-medium transition-colors', viewMode === 'table' ? 'bg-surface-primary text-heading elevation-1' : 'text-sub hover:text-heading')}
                    >
                      <Table2 className="h-4 w-4" /> 표
                    </button>
                  </div>
                </div>
              )}
              {isDesktop && viewMode === 'table' ? (
                <TransactionTableView transactions={filtered} />
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
            </div>
          )}
        </div>

        {/* ── Desktop sidebar (lg+) ─────────────────── */}
        <div className="hidden lg:block sticky top-4 self-start">
          <LedgerInsightsSidebar
            type={defaultType}
            month={selectedMonth}
            transactions={transactions}
            categories={categories}
            onCategoryFilter={setCategoryFilter}
          />
        </div>
      </div>

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

      {/* Card Statement Import */}
      <CardStatementImportModal
        open={isCardImportOpen}
        onClose={() => setIsCardImportOpen(false)}
      />
    </div>
  )
}

// ─── Premium entry-point trigger card ─────────────────
function CardStatementImportTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.995 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      className="relative w-full overflow-hidden rounded-2xl text-left p-4 ring-1 ring-base transition-all el-hover-lift"
      style={{
        background: 'linear-gradient(135deg, color-mix(in srgb, var(--color-primary-500) 6%, var(--surface-primary)) 0%, var(--surface-primary) 100%)',
      }}
      aria-label="카드 명세서 가져오기"
    >
      {/* Aurora accent */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--color-primary-500) 14%, transparent), transparent 60%)',
        }}
      />
      <div className="relative flex items-center gap-3">
        <div
          className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-700))',
            boxShadow: '0 4px 14px color-mix(in srgb, var(--color-primary-500) 38%, transparent), inset 0 1px 0 0 rgba(255,255,255,0.3)',
          }}
        >
          <CardStatementIcon className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-body3 font-bold text-heading flex items-center gap-1.5">
            카드 명세서 가져오기
            <span className="text-micro-bold leading-none uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[color:var(--color-primary-100)] text-[color:var(--color-primary-700)] dark:bg-[color:var(--color-primary-900)]/40 dark:text-[color:var(--color-primary-300)]">
              NEW
            </span>
          </p>
          <p className="text-caption text-sub mt-0.5">
            신한카드 명세서를 붙여넣어 한 번에 등록 · 자동 카테고리 분류
          </p>
        </div>
        <ChevronRightIcon className="w-4 h-4 text-disabled flex-shrink-0" />
      </div>
    </motion.button>
  )
}

function CardStatementIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
      <line x1="6" y1="14" x2="10" y2="14" />
      <line x1="14" y1="14" x2="18" y2="14" />
    </svg>
  )
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}
