import { useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import { clsx } from 'clsx'
import { useCalendar } from '@/hooks/useCalendar'
import { springSnappy } from '@/lib/motionConfig'

interface MiniCalendarProps {
  /** Currently selected date (yyyy-MM-dd). */
  value: string
  /** Fired when user picks a date. */
  onChange: (dateStr: string) => void
  /** Hide cells outside current month (default false → dim). */
  hideOtherMonths?: boolean
  /** Restrict dates (yyyy-MM-dd). */
  maxDate?: string
  minDate?: string
  className?: string
}

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

/**
 * Premium popover calendar for picker use-cases.
 * Glass-card with dashed divider, rounded-full selected dot.
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
  const initialMonth = useMemo(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value.slice(0, 7)
    return undefined
  }, [value])

  const { days, monthLabel, goToPreviousMonth, goToNextMonth, goToToday } = useCalendar(initialMonth)

  return (
    <div
      className={clsx(
        'rounded-3xl bg-surface-primary ring-1 ring-base elevation-1 p-4 sm:p-5',
        className,
      )}
      role="group"
      aria-label="날짜 선택 달력"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <motion.button
          type="button"
          onClick={goToPreviousMonth}
          aria-label="이전 달"
          className="w-9 h-9 rounded-full flex items-center justify-center text-sub hover:text-heading hover:bg-[var(--hover-bg)] transition-colors"
          whileTap={shouldReduceMotion ? undefined : { scale: 0.9 }}
        >
          <ChevronLeft className="w-4 h-4" />
        </motion.button>
        <motion.button
          type="button"
          onClick={goToToday}
          className="text-body3-semi text-heading px-4 py-1.5 rounded-full hover:bg-[var(--hover-bg)] transition-colors tabular-nums"
          whileTap={shouldReduceMotion ? undefined : { scale: 0.95 }}
        >
          {monthLabel}
        </motion.button>
        <motion.button
          type="button"
          onClick={goToNextMonth}
          aria-label="다음 달"
          className="w-9 h-9 rounded-full flex items-center justify-center text-sub hover:text-heading hover:bg-[var(--hover-bg)] transition-colors"
          whileTap={shouldReduceMotion ? undefined : { scale: 0.9 }}
        >
          <ChevronRight className="w-4 h-4" />
        </motion.button>
      </div>

      {/* Dashed divider */}
      <div className="border-t border-dashed border-[color:var(--border-default)] mb-3" />

      {/* Weekday labels */}
      <div className="grid grid-cols-7 gap-0.5 mb-1.5">
        {WEEKDAY_LABELS.map((label, i) => (
          <div
            key={label}
            className={clsx(
              'text-center text-caption leading-none py-1.5 font-semibold',
              i === 0 && 'text-weekend-sun',
              i === 6 && 'text-weekend-sat',
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
              whileTap={shouldReduceMotion || isDisabled ? undefined : { scale: 0.88 }}
              transition={springSnappy}
              className={clsx(
                'relative aspect-square flex items-center justify-center rounded-full text-caption tabular-nums font-semibold transition-all',
                'min-h-11',
                isSelected && 'bg-[color:var(--color-primary-600)] text-white shadow-[0_6px_18px_color-mix(in_srgb,var(--color-primary-500)_40%,transparent)] scale-[1.02]',
                !isSelected && d.isToday && 'bg-[color:var(--color-primary-50)] text-[color:var(--color-primary-700)] dark:bg-[color:var(--color-primary-900)]/30 dark:text-[color:var(--color-primary-300)]',
                !isSelected && !d.isToday && !baseDim && weekday === 0 && 'text-weekend-sun hover:bg-[var(--hover-bg)]',
                !isSelected && !d.isToday && !baseDim && weekday === 6 && 'text-weekend-sat hover:bg-[var(--hover-bg)]',
                !isSelected && !d.isToday && !baseDim && weekday !== 0 && weekday !== 6 && 'text-heading hover:bg-[var(--hover-bg)]',
                !isSelected && baseDim && 'text-disabled/50',
                isDisabled && 'opacity-30 cursor-not-allowed',
              )}
            >
              {d.day}
              {!isSelected && d.isToday && (
                <span className="absolute bottom-1 w-1 h-1 rounded-full bg-[color:var(--color-primary-500)] dark:bg-[color:var(--color-primary-400)]" aria-hidden="true" />
              )}
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
