import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { ChevronLeft, ChevronRight, Calendar, CalendarDays, CornerDownLeft, Keyboard } from 'lucide-react'
import { useCalendar } from '@/hooks/useCalendar'
import { useCalendarKeyboard } from '@/hooks/useCalendarKeyboard'
import {
  computeDailySummaries,
  computeMonthAggregates,
} from '@/lib/calendarUtils'
import { CalendarGrid } from './CalendarGrid'
import { CalendarSkeleton } from './CalendarSkeleton'
import { MonthInsightsPanel } from './MonthInsightsPanel'
import {
  CalendarFilterBar,
  DEFAULT_CALENDAR_FILTERS,
  type CalendarFilters,
} from './CalendarFilterBar'
import { DayPreviewPopover } from './DayPreviewPopover'
import { TransactionCard } from '@/components/ledger/TransactionCard'
import { TransactionFormModal } from '@/components/ledger/TransactionFormModal'
import { TransactionWizard } from '@/components/ledger/TransactionWizard'
import { IconButton, Button } from '@/components/ui/Button'
import { FAB } from '@/components/ui/FAB'
import { EmptyState, ErrorEmptyState } from '@/components/ui/EmptyState'
import { Tooltip } from '@/components/ui/Tooltip'
import { useTransactionStore } from '@/stores/transactionStore'
import { useMemberStore } from '@/stores/memberStore'
import { useUIStore } from '@/stores/uiStore'
import { getTodayString } from '@/lib/dateUtils'
import * as db from '@/services/database'
import type { Transaction } from '@/lib/types'
import { useSyncListener } from '@/hooks/useSyncListener'
import { useSwipe } from '@/hooks/useSwipe'
import { format, eachDayOfInterval, startOfMonth, endOfMonth } from 'date-fns'

export function CalendarPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [monthTransactions, setMonthTransactions] = useState<Transaction[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [focusedDate, setFocusedDate] = useState<string | null>(null)
  const [filters, setFilters] = useState<CalendarFilters>(DEFAULT_CALENDAR_FILTERS)
  const [hoverPreview, setHoverPreview] = useState<{ dateStr: string; rect: DOMRect } | null>(null)
  const [isDesktop, setIsDesktop] = useState(false)
  const hoverDebounceRef = useRef<number | null>(null)

  const loadCategories = useTransactionStore((s) => s.loadCategories)
  const loadMembers = useMemberStore((s) => s.loadMembers)
  const categories = useTransactionStore((s) => s.categories)
  const members = useMemberStore((s) => s.members)

  const {
    days,
    monthLabel,
    monthString,
    currentDate,
    goToPreviousMonth,
    goToNextMonth,
    goToToday,
  } = useCalendar()

  // Detect desktop (xl+) for panel / popover / detailed cells
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mql = window.matchMedia('(min-width: 1280px)')
    const sync = () => setIsDesktop(mql.matches)
    sync()
    mql.addEventListener('change', sync)
    return () => mql.removeEventListener('change', sync)
  }, [])

  const swipeHandlers = useSwipe({
    onSwipeLeft: goToNextMonth,
    onSwipeRight: goToPreviousMonth,
  })

  // Create modal state
  const isCreateOpen = useUIStore((s) => s.isTransactionCreateModalOpen)
  const closeCreate = useUIStore((s) => s.closeTransactionCreateModal)
  const prefillDate = useUIStore((s) => s.transactionPrefillDate)
  const openCreateWithDate = useUIStore((s) => s.openTransactionCreateModalWithDate)

  // Edit modal state
  const isEditOpen = useUIStore((s) => s.isTransactionEditModalOpen)
  const editingId = useUIStore((s) => s.editingTransactionId)
  const closeEdit = useUIStore((s) => s.closeTransactionEditModal)
  const editingTransaction = editingId ? monthTransactions.find((t) => t.id === editingId) : undefined

  const loadData = async () => {
    setError(null)
    setIsLoading(true)
    try {
      await Promise.all([loadCategories(), loadMembers()])
    } catch {
      setError('데이터를 불러오는데 실패했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const fetchTransactions = async () => {
    const txns = await db.getTransactionsByMonth(monthString)
    setMonthTransactions(txns)
  }

  useSyncListener(
    () => {
      loadData()
      fetchTransactions()
    },
    ['transactions', 'transactionCategories'],
  )

  useEffect(() => {
    fetchTransactions()
  }, [monthString])

  // Reload after modal closes
  useEffect(() => {
    if (!isCreateOpen && !isEditOpen) {
      fetchTransactions()
    }
  }, [isCreateOpen, isEditOpen])

  // Apply filters to month transactions
  const filteredTransactions = useMemo(() => {
    return monthTransactions.filter((t) => {
      if (filters.type !== 'all' && t.type !== filters.type) return false
      if (filters.memberIds.length > 0 && (t.memberId == null || !filters.memberIds.includes(t.memberId)))
        return false
      if (filters.categoryIds.length > 0 && (t.categoryId == null || !filters.categoryIds.includes(t.categoryId)))
        return false
      if (filters.recurringOnly && !(t.isRecurring || t.subscriptionId || t.recurSourceId))
        return false
      return true
    })
  }, [monthTransactions, filters])

  const summaries = useMemo(() => computeDailySummaries(filteredTransactions), [filteredTransactions])

  const monthDates = useMemo(() => {
    const start = startOfMonth(currentDate)
    const end = endOfMonth(start)
    return eachDayOfInterval({ start, end }).map((d) => format(d, 'yyyy-MM-dd'))
  }, [currentDate])

  const aggregates = useMemo(
    () => computeMonthAggregates(filteredTransactions, monthDates, summaries),
    [filteredTransactions, monthDates, summaries],
  )

  const selectedDayTransactions = useMemo(() => {
    if (!selectedDate) return []
    return filteredTransactions
      .filter((t) => t.date === selectedDate)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [selectedDate, filteredTransactions])

  // Keyboard navigation: cross-month focus auto-navigates month
  const handleKeyboardNavigate = useCallback(
    (dateStr: string) => {
      setFocusedDate(dateStr)
      const targetMonth = dateStr.slice(0, 7)
      if (targetMonth !== monthString) {
        const [ty, tm] = targetMonth.split('-').map(Number)
        const [cy, cm] = monthString.split('-').map(Number)
        const targetIdx = ty * 12 + (tm - 1)
        const currentIdx = cy * 12 + (cm - 1)
        if (targetIdx > currentIdx) goToNextMonth()
        else goToPreviousMonth()
      }
    },
    [monthString, goToNextMonth, goToPreviousMonth],
  )

  useCalendarKeyboard({
    enabled: isDesktop && !isCreateOpen && !isEditOpen,
    focusedDate: focusedDate ?? selectedDate,
    onNavigate: handleKeyboardNavigate,
    onToday: () => {
      goToToday()
      setFocusedDate(getTodayString())
    },
    onPrevMonth: goToPreviousMonth,
    onNextMonth: goToNextMonth,
    onSelect: () => {
      if (focusedDate) setSelectedDate(focusedDate)
    },
    onEscape: () => {
      setSelectedDate(null)
      setHoverPreview(null)
    },
  })

  const handleSelectDate = useCallback((dateStr: string) => {
    setSelectedDate((prev) => (prev === dateStr ? null : dateStr))
    setFocusedDate(dateStr)
  }, [])

  const handleHoverDate = useCallback(
    (dateStr: string | null, rect: DOMRect | null) => {
      if (!isDesktop) return
      if (hoverDebounceRef.current !== null) {
        window.clearTimeout(hoverDebounceRef.current)
        hoverDebounceRef.current = null
      }
      if (!dateStr || !rect) {
        hoverDebounceRef.current = window.setTimeout(() => setHoverPreview(null), 80)
        return
      }
      hoverDebounceRef.current = window.setTimeout(() => {
        setHoverPreview({ dateStr, rect })
      }, 180)
    },
    [isDesktop],
  )

  // Cleanup hover debounce on unmount
  useEffect(() => {
    return () => {
      if (hoverDebounceRef.current !== null) window.clearTimeout(hoverDebounceRef.current)
    }
  }, [])

  // Close hover when modal opens / month changes
  useEffect(() => {
    if (isCreateOpen || isEditOpen) setHoverPreview(null)
  }, [isCreateOpen, isEditOpen])
  useEffect(() => {
    setHoverPreview(null)
  }, [monthString])

  const hoverSummary = hoverPreview ? summaries.get(hoverPreview.dateStr) : undefined

  if (isLoading) return <CalendarSkeleton />

  if (error) {
    return (
      <div className="p-4 lg:p-6">
        <ErrorEmptyState description={error} onRetry={loadData} />
      </div>
    )
  }

  // Desktop dual-pane layout
  return (
    <div className="p-4 lg:p-6">
      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_360px] xl:gap-6 2xl:grid-cols-[minmax(0,1fr)_400px]">
        {/* Main column */}
        <div className="space-y-4 min-w-0">
          <div className="space-y-4" {...swipeHandlers}>
            {/* Month Navigator */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <IconButton onClick={goToPreviousMonth} plain size="sm" aria-label="이전 달">
                  <ChevronLeft className="w-5 h-5" />
                </IconButton>
                <button
                  onClick={goToToday}
                  className="px-2 py-1 text-base lg:text-lg font-semibold text-heading hover:text-primary-600 dark:hover:text-primary-400 transition-colors rounded-md"
                  title="오늘로 이동 (T)"
                >
                  {monthLabel}
                </button>
                <IconButton onClick={goToNextMonth} plain size="sm" aria-label="다음 달">
                  <ChevronRight className="w-5 h-5" />
                </IconButton>
              </div>

              <div className="hidden md:flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<CalendarDays className="w-3.5 h-3.5" />}
                  onClick={() => {
                    goToToday()
                    setFocusedDate(getTodayString())
                    setSelectedDate(getTodayString())
                  }}
                >
                  오늘
                </Button>
                <Tooltip
                  placement="bottom"
                  content={
                    <div className="space-y-1 text-left">
                      <p className="font-semibold mb-1">단축키</p>
                      <KeyRow k="← → ↑ ↓" d="날짜 이동" />
                      <KeyRow k="PgUp / PgDn" d="월 이동" />
                      <KeyRow k="T" d="오늘" />
                      <KeyRow k="Enter" d="선택" />
                      <KeyRow k="Esc" d="닫기" />
                    </div>
                  }
                >
                  <button
                    type="button"
                    className="inline-flex items-center justify-center w-9 h-9 rounded-full text-sub hover:text-heading hover:bg-[var(--hover-bg)] transition-colors"
                    aria-label="키보드 단축키"
                  >
                    <Keyboard className="w-4 h-4" />
                  </button>
                </Tooltip>
              </div>
            </div>

            {/* Filter bar */}
            <CalendarFilterBar
              filters={filters}
              members={members}
              categories={categories}
              onChange={setFilters}
            />

            {/* Calendar Grid */}
            <CalendarGrid
              days={days}
              summaries={summaries}
              aggregates={aggregates}
              categories={categories}
              selectedDate={selectedDate}
              focusedDate={focusedDate}
              density={isDesktop ? 'detailed' : 'compact'}
              onSelectDate={handleSelectDate}
              onHoverDate={handleHoverDate}
            />
          </div>

          {/* Selected Day Transactions */}
          {selectedDate && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-body3-semi text-heading">
                  {parseInt(selectedDate.split('-')[2])}일 거래 내역
                  {selectedDayTransactions.length > 0 && (
                    <span className="ml-2 text-caption text-sub tabular-nums">
                      {selectedDayTransactions.length}건
                    </span>
                  )}
                </h3>
                <button
                  type="button"
                  onClick={() => setSelectedDate(null)}
                  className="text-caption text-sub hover:text-heading transition-colors inline-flex items-center gap-1"
                  aria-label="선택 해제"
                >
                  <CornerDownLeft className="w-3 h-3" />
                  Esc
                </button>
              </div>
              {selectedDayTransactions.length === 0 ? (
                <p className="text-sm text-sub text-center py-6">기록된 거래가 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {selectedDayTransactions.map((t) => (
                    <TransactionCard key={t.id} transaction={t} />
                  ))}
                </div>
              )}
            </div>
          )}

          {!selectedDate && monthTransactions.length === 0 && (
            <EmptyState
              icon={<Calendar className="w-full h-full" />}
              title="이번 달 거래가 없습니다"
              description="가계부에서 거래를 기록하면 캘린더에 표시됩니다."
              size="sm"
            />
          )}

          {!selectedDate &&
            monthTransactions.length > 0 &&
            filteredTransactions.length === 0 && (
              <EmptyState
                icon={<Calendar className="w-full h-full" />}
                title="필터 결과가 없습니다"
                description="필터를 초기화하거나 조건을 변경해 보세요."
                size="sm"
              />
            )}
        </div>

        {/* Right rail (PC only) */}
        <div className="hidden xl:block">
          <div className="sticky top-4 space-y-3 max-h-[calc(100vh-2rem)] overflow-y-auto pb-6 -mr-1 pr-1">
            <MonthInsightsPanel
              aggregates={aggregates}
              categories={categories}
              monthLabel={monthLabel}
              selectedDate={selectedDate}
              onSelectDate={handleSelectDate}
            />
          </div>
        </div>
      </div>

      <FAB onClick={() => openCreateWithDate(selectedDate || getTodayString())} label="거래 기록" />

      {/* Hover preview (PC only) */}
      {hoverPreview && hoverSummary && (
        <DayPreviewPopover
          dateStr={hoverPreview.dateStr}
          anchorRect={hoverPreview.rect}
          summary={hoverSummary}
          transactions={filteredTransactions}
          categories={categories}
        />
      )}

      {/* Create Wizard */}
      <TransactionWizard open={isCreateOpen} onClose={closeCreate} initialDate={prefillDate} />

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

function KeyRow({ k, d }: { k: string; d: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <kbd className="inline-flex items-center rounded px-1.5 py-0.5 bg-white/10 ring-1 ring-white/20 font-mono text-[10px]">
        {k}
      </kbd>
      <span>{d}</span>
    </div>
  )
}
