import { useEffect, useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import { useCalendar } from '@/hooks/useCalendar'
import { computeDailySummaries } from '@/lib/calendarUtils'
import { CalendarGrid } from './CalendarGrid'
import { CalendarSkeleton } from './CalendarSkeleton'
import { TransactionCard } from '@/components/ledger/TransactionCard'
import { TransactionFormModal } from '@/components/ledger/TransactionFormModal'
import { IconButton } from '@/components/ui/Button'
import { FAB } from '@/components/ui/FAB'
import { EmptyState, ErrorEmptyState } from '@/components/ui/EmptyState'
import { useTransactionStore } from '@/stores/transactionStore'
import { useMemberStore } from '@/stores/memberStore'
import { useUIStore } from '@/stores/uiStore'
import { getTodayString } from '@/lib/dateUtils'
import * as db from '@/services/database'
import type { Transaction } from '@/lib/types'

export function CalendarPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [monthTransactions, setMonthTransactions] = useState<Transaction[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const loadCategories = useTransactionStore((s) => s.loadCategories)
  const loadMembers = useMemberStore((s) => s.loadMembers)
  const { days, monthLabel, monthString, goToPreviousMonth, goToNextMonth, goToToday } = useCalendar()

  // Create modal state
  const isCreateOpen = useUIStore((s) => s.isTransactionCreateModalOpen)
  const closeCreate = useUIStore((s) => s.closeTransactionCreateModal)
  const prefillDate = useUIStore((s) => s.transactionPrefillDate)
  const openCreateWithDate = useUIStore((s) => s.openTransactionCreateModalWithDate)

  // Edit modal state
  const isEditOpen = useUIStore((s) => s.isTransactionEditModalOpen)
  const editingId = useUIStore((s) => s.editingTransactionId)
  const closeEdit = useUIStore((s) => s.closeTransactionEditModal)
  const editingTransaction = editingId ? monthTransactions.find(t => t.id === editingId) : undefined

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

  useEffect(() => { loadData() }, [])

  const fetchTransactions = async () => {
    const txns = await db.getTransactionsByMonth(monthString)
    setMonthTransactions(txns)
  }

  useEffect(() => {
    fetchTransactions()
  }, [monthString])

  // Reload after modal closes
  useEffect(() => {
    if (!isCreateOpen && !isEditOpen) {
      fetchTransactions()
    }
  }, [isCreateOpen, isEditOpen])

  const summaries = useMemo(
    () => computeDailySummaries(monthTransactions),
    [monthTransactions]
  )

  const selectedDayTransactions = useMemo(() => {
    if (!selectedDate) return []
    return monthTransactions.filter(t => t.date === selectedDate).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [selectedDate, monthTransactions])

  if (isLoading) return <CalendarSkeleton />

  if (error) {
    return (
      <div className="p-4 lg:p-6">
        <ErrorEmptyState description={error} onRetry={loadData} />
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* Month Navigator */}
      <div className="flex items-center justify-between">
        <IconButton onClick={goToPreviousMonth} plain size="sm">
          <ChevronLeft className="w-5 h-5" />
        </IconButton>
        <button
          onClick={goToToday}
          className="text-base font-semibold text-zinc-900 dark:text-zinc-100 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
        >
          {monthLabel}
        </button>
        <IconButton onClick={goToNextMonth} plain size="sm">
          <ChevronRight className="w-5 h-5" />
        </IconButton>
      </div>

      {/* Calendar Grid */}
      <CalendarGrid
        days={days}
        summaries={summaries}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
      />

      {/* Selected Day Transactions */}
      {selectedDate && (
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3">
            {parseInt(selectedDate.split('-')[2])}일 거래 내역
          </h3>
          {selectedDayTransactions.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center py-6">
              기록된 거래가 없습니다.
            </p>
          ) : (
            <div className="space-y-2">
              {selectedDayTransactions.map(t => (
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

      <FAB onClick={() => openCreateWithDate(selectedDate || getTodayString())} label="거래 기록" />

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
