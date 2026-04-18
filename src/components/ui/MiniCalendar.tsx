import { useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import { clsx } from 'clsx'
import { useCalendar } from '@/hooks/useCalendar'
import { springSnappy } from '@/lib/motionConfig'

interface MiniCalendarProps {
  /** Currently selected date (yyyy-MM-dd). Undefined = today. */
  value: string
  /** Fired when user picks a date. */
  onChange: (dateStr: string) => void
  /** Optional: hide cells outside current month (default false, shows dim) */
  hideOtherMonths?: boolean
  /** Optional: restrict dates (e.g. disable future). */
  maxDate?: string
  minDate?: string
  className?: string
}

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

/**
 * Compact calendar for wizard/picker use-cases.
 * Month header + 7×6 grid. Tap a cell to emit yyyy-MM-dd.
 */
export function MiniCalendar({
  value,
  onChange,
  hideOtherMonths = false,
  maxDate,
  minDate,
  className,
}: MiniCalendarProps) {
  const shouldReduceMotion = useReducedMotion()
  // Initialize calendar to the month of the value (or today)
  const initialMonth = useMemo(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value.slice(0, 7)
    }
    return undefined
  }, [value])

  const { days, monthLabel, goToPreviousMonth, goToNextMonth, goToToday } = useCalendar(initialMonth)

  return (
    <div
      className={clsx(
        'rounded-xl border border-base bg-surface-primary p-3',
        className,
      )}
      role="group"
      aria-label="날짜 선택 달력"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={goToPreviousMonth}
          aria-label="이전 달"
          className="touch-target-icon rounded-lg text-sub hover:text-heading hover:bg-[var(--hover-bg)] transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={goToToday}
          className="text-body3 font-semibold text-heading px-3 py-1 rounded-lg hover:bg-[var(--hover-bg)] transition-colors tabular-nums"
        >
          {monthLabel}
        </button>
        <button
          type="button"
          onClick={goToNextMonth}
          aria-label="다음 달"
          className="touch-target-icon rounded-lg text-sub hover:text-heading hover:bg-[var(--hover-bg)] transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {WEEKDAY_LABELS.map((label, i) => (
          <div
            key={label}
            className={clsx(
              'text-center text-[11px] py-1 font-medium',
              i === 0 && 'text-value-negative',
              i === 6 && 'text-[color:var(--color-primary-500)] dark:text-[color:var(--color-primary-400)]',
              i !== 0 && i !== 6 && 'text-sub',
            )}
          >
            {label}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-0.5" role="grid">
        {days.map((d) => {
          const isSelected = d.dateStr === value
          const isDisabled = Boolean((maxDate && d.dateStr > maxDate) || (minDate && d.dateStr < minDate))
          const weekday = d.date.getDay()
          const baseDim = !d.isCurrentMonth
          if (hideOtherMonths && !d.isCurrentMonth) {
            return <div key={d.dateStr} aria-hidden="true" />
          }
          return (
            <motion.button
              key={d.dateStr}
              type="button"
              role="gridcell"
              aria-selected={isSelected}
              aria-disabled={isDisabled || undefined}
              disabled={isDisabled}
              onClick={() => !isDisabled && onChange(d.dateStr)}
              whileTap={shouldReduceMotion || isDisabled ? undefined : { scale: 0.9 }}
              transition={springSnappy}
              className={clsx(
                'relative aspect-square flex items-center justify-center rounded-lg text-caption tabular-nums font-medium transition-colors',
                isSelected && 'bg-primary-500 text-white el-strong',
                !isSelected && d.isToday && 'ring-1 ring-primary-500 text-primary-700 dark:text-primary-300',
                !isSelected && !d.isToday && !baseDim && weekday === 0 && 'text-value-negative',
                !isSelected && !d.isToday && !baseDim && weekday === 6 && 'text-[color:var(--color-primary-500)] dark:text-[color:var(--color-primary-400)]',
                !isSelected && !d.isToday && !baseDim && weekday !== 0 && weekday !== 6 && 'text-heading',
                !isSelected && baseDim && 'text-disabled/60',
                !isSelected && 'hover:bg-[var(--hover-bg)]',
                isDisabled && 'opacity-40 cursor-not-allowed',
              )}
            >
              {d.day}
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
