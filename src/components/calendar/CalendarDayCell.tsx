import { forwardRef, memo } from 'react'
import { clsx } from 'clsx'
import { RefreshCw } from 'lucide-react'
import { formatKoreanUnit } from '@/utils/format'
import { getCalendarFallbackColors } from '@/lib/chartConfig'
import type { CalendarDay } from '@/hooks/useCalendar'
import type { DaySummary } from '@/lib/calendarUtils'
import type { TransactionCategory } from '@/lib/types'

interface CalendarDayCellProps {
  day: CalendarDay
  summary?: DaySummary
  isSelected: boolean
  isFocused?: boolean
  isPeakExpense?: boolean
  isPeakIncome?: boolean
  maxExpense?: number
  maxIncome?: number
  density?: 'compact' | 'detailed'
  categories: TransactionCategory[]
  onClick: () => void
  onHover?: (dateStr: string | null, rect: DOMRect | null) => void
}

const CalendarDayCellBase = forwardRef<HTMLButtonElement, CalendarDayCellProps>(
  function CalendarDayCell(
    {
      day,
      summary,
      isSelected,
      isFocused,
      isPeakExpense,
      isPeakIncome,
      maxExpense = 0,
      maxIncome = 0,
      density = 'compact',
      categories,
      onClick,
      onHover,
    },
    ref,
  ) {
    const isDetailed = density === 'detailed'

    const expenseRatio = maxExpense > 0 && summary ? Math.min(1, summary.expense / maxExpense) : 0
    const incomeRatio = maxIncome > 0 && summary ? Math.min(1, summary.income / maxIncome) : 0

    // Top 3 category colors for visual accent (expense-first, then income)
    const calFallback = getCalendarFallbackColors()
    const dotColors = summary
      ? [
          ...summary.expenseCategories.slice(0, 3).map((e) =>
            resolveColor(e.categoryId, categories, calFallback.expense),
          ),
          ...summary.incomeCategories.slice(0, Math.max(0, 3 - summary.expenseCategories.length)).map((e) =>
            resolveColor(e.categoryId, categories, calFallback.income),
          ),
        ].slice(0, 3)
      : []

    const handleEnter = (e: React.SyntheticEvent<HTMLButtonElement>) => {
      if (!onHover || !day.isCurrentMonth || !summary) return
      onHover(day.dateStr, e.currentTarget.getBoundingClientRect())
    }

    const handleLeave = () => {
      if (!onHover) return
      onHover(null, null)
    }

    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        onFocus={handleEnter}
        onBlur={handleLeave}
        data-date={day.dateStr}
        aria-label={buildAriaLabel(day, summary)}
        aria-current={day.isToday ? 'date' : undefined}
        aria-pressed={isSelected}
        tabIndex={isFocused ? 0 : -1}
        className={clsx(
          'group relative flex flex-col items-stretch rounded-lg text-caption transition-all',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
          isDetailed
            ? 'min-h-[84px] xl:min-h-[104px] 2xl:min-h-[120px] p-1.5 gap-1'
            : 'min-h-[56px] lg:min-h-[72px] p-1 gap-0.5',
          day.isCurrentMonth ? 'text-heading' : 'text-disabled opacity-60',
          day.isToday && 'ring-2 ring-primary-400 dark:ring-primary-600',
          isSelected && 'bg-primary-100 dark:bg-primary-900/30 ring-1 ring-primary-500',
          !isSelected && day.isCurrentMonth && 'hover:bg-[var(--hover-bg)] hover:shadow-sm',
          isPeakExpense && !isSelected && 'ring-1 ring-[var(--value-negative)]',
          isPeakIncome && !isSelected && !isPeakExpense && 'ring-1 ring-[var(--value-positive)]',
        )}
      >
        {/* Header row: day number, indicators */}
        <div className="flex items-center justify-between gap-1">
          <span
            className={clsx(
              isDetailed ? 'text-label3-medium' : 'text-caption',
              day.isToday && 'text-primary-600 dark:text-primary-400 font-bold',
              day.dayOfWeek === 0 && day.isCurrentMonth && !day.isToday && 'text-weekend-sun',
              day.dayOfWeek === 6 && day.isCurrentMonth && !day.isToday && 'text-weekend-sat',
            )}
          >
            {day.day}
          </span>
          {summary && day.isCurrentMonth && (
            <div className="flex items-center gap-1">
              {summary.hasRecurring && (
                <RefreshCw
                  className={clsx(
                    isDetailed ? 'w-3 h-3' : 'w-2.5 h-2.5',
                    'text-primary-500 dark:text-primary-400',
                  )}
                  aria-hidden
                />
              )}
              {isDetailed && summary.count > 1 && (
                <span className="text-micro tabular-nums text-sub bg-[var(--surface-tertiary)] rounded-full px-1.5 leading-none">
                  {summary.count}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Amounts */}
        {summary && day.isCurrentMonth && (
          <div
            className={clsx(
              'flex flex-col w-full',
              isDetailed ? 'gap-0.5' : 'gap-[1px]',
            )}
          >
            {summary.income > 0 && (
              <p
                className={clsx(
                  'tabular-nums truncate',
                  isDetailed ? 'text-caption text-right' : 'text-label4 text-center',
                  'leading-tight text-status-success',
                  isPeakIncome && 'font-semibold',
                )}
              >
                +{formatKoreanUnit(summary.income)}
              </p>
            )}
            {summary.expense > 0 && (
              <p
                className={clsx(
                  'tabular-nums truncate',
                  isDetailed ? 'text-caption text-right' : 'text-label4 text-center',
                  'leading-tight text-status-danger',
                  isPeakExpense && 'font-semibold',
                )}
              >
                -{formatKoreanUnit(summary.expense)}
              </p>
            )}
          </div>
        )}

        {/* Detailed extras: magnitude bars + category dots */}
        {isDetailed && summary && day.isCurrentMonth && (summary.expense > 0 || summary.income > 0) && (
          <div className="mt-auto flex flex-col gap-1">
            {(summary.expense > 0 || summary.income > 0) && (
              <div className="flex items-end gap-[3px] h-1.5" aria-hidden>
                {summary.income > 0 && (
                  <div
                    className="flex-1 rounded-sm bg-[var(--value-positive)]"
                    style={{ height: `${Math.max(15, incomeRatio * 100)}%` }}
                  />
                )}
                {summary.expense > 0 && (
                  <div
                    className="flex-1 rounded-sm bg-[var(--value-negative)]"
                    style={{ height: `${Math.max(15, expenseRatio * 100)}%` }}
                  />
                )}
              </div>
            )}
            {dotColors.length > 0 && (
              <div className="flex items-center justify-end gap-[3px]" aria-hidden>
                {dotColors.map((color, i) => (
                  <span
                    key={i}
                    className="block w-1.5 h-1.5 rounded-full ring-1 ring-[var(--surface-primary)]"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </button>
    )
  },
)

export const CalendarDayCell = memo(CalendarDayCellBase)

function resolveColor(
  categoryId: string | null,
  categories: TransactionCategory[],
  fallback: string,
): string {
  if (categoryId == null) return fallback
  return categories.find((c) => c.id === categoryId)?.color ?? fallback
}

function buildAriaLabel(day: CalendarDay, summary?: DaySummary): string {
  const parts = [`${day.day}일`]
  if (day.isToday) parts.push('오늘')
  if (summary) {
    if (summary.income > 0) parts.push(`수입 ${formatKoreanUnit(summary.income)}원`)
    if (summary.expense > 0) parts.push(`지출 ${formatKoreanUnit(summary.expense)}원`)
    parts.push(`거래 ${summary.count}건`)
  }
  return parts.join(', ')
}
