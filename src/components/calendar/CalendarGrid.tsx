import { useEffect, useMemo, useRef } from 'react'
import { clsx } from 'clsx'
import { CalendarDayCell } from './CalendarDayCell'
import type { CalendarDay } from '@/hooks/useCalendar'
import type { DaySummary, MonthAggregates } from '@/lib/calendarUtils'
import type { TransactionCategory } from '@/lib/types'

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

interface CalendarGridProps {
  days: CalendarDay[]
  summaries: Map<string, DaySummary>
  aggregates?: MonthAggregates | null
  categories: TransactionCategory[]
  selectedDate: string | null
  focusedDate?: string | null
  density?: 'compact' | 'detailed'
  onSelectDate: (dateStr: string) => void
  onHoverDate?: (dateStr: string | null, rect: DOMRect | null) => void
}

export function CalendarGrid({
  days,
  summaries,
  aggregates,
  categories,
  selectedDate,
  focusedDate,
  density = 'compact',
  onSelectDate,
  onHoverDate,
}: CalendarGridProps) {
  const gridRef = useRef<HTMLDivElement>(null)

  const maxExpense = aggregates?.maxExpenseDay?.amount ?? 0
  const maxIncome = aggregates?.maxIncomeDay?.amount ?? 0
  const peakExpenseDate = aggregates?.maxExpenseDay?.date
  const peakIncomeDate = aggregates?.maxIncomeDay?.date

  const firstCurrentMonthDate = useMemo(
    () => days.find((d) => d.isCurrentMonth)?.dateStr ?? days[0]?.dateStr ?? null,
    [days],
  )

  // When focused date changes, move focus to the matching cell for keyboard nav
  useEffect(() => {
    if (!focusedDate || !gridRef.current) return
    const btn = gridRef.current.querySelector<HTMLButtonElement>(
      `button[data-date="${focusedDate}"]`,
    )
    if (btn && document.activeElement !== btn && gridRef.current.contains(document.activeElement)) {
      btn.focus()
    }
  }, [focusedDate])

  return (
    <div
      className={clsx(
        'rounded-xl bg-surface-primary',
        density === 'detailed' ? 'p-2 lg:p-3' : 'p-1.5',
      )}
    >
      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAY_LABELS.map((label, i) => (
          <div
            key={label}
            className={clsx(
              'text-center py-2 text-caption font-medium',
              i === 0 ? 'text-red-500/90' : i === 6 ? 'text-blue-500/90' : 'text-sub',
            )}
          >
            {label}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div role="grid" aria-label="월간 달력" ref={gridRef} className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const effectiveFocus = focusedDate ?? selectedDate ?? firstCurrentMonthDate
          return (
            <CalendarDayCell
              key={day.dateStr}
              day={day}
              summary={summaries.get(day.dateStr)}
              isSelected={selectedDate === day.dateStr}
              isFocused={effectiveFocus === day.dateStr && day.isCurrentMonth}
              isPeakExpense={peakExpenseDate === day.dateStr}
              isPeakIncome={peakIncomeDate === day.dateStr}
              maxExpense={maxExpense}
              maxIncome={maxIncome}
              density={density}
              categories={categories}
              onClick={() => onSelectDate(day.dateStr)}
              onHover={onHoverDate}
            />
          )
        })}
      </div>
    </div>
  )
}
