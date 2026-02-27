import { clsx } from 'clsx'
import { formatKoreanUnit } from '@/utils/format'
import type { CalendarDay } from '@/hooks/useCalendar'
import type { DaySummary } from '@/lib/calendarUtils'

interface CalendarDayCellProps {
  day: CalendarDay
  summary?: DaySummary
  isSelected: boolean
  onClick: () => void
}

export function CalendarDayCell({ day, summary, isSelected, onClick }: CalendarDayCellProps) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'relative flex flex-col items-center p-1 rounded-lg text-sm transition-colors min-h-[3.5rem] lg:min-h-[4.5rem]',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
        day.isCurrentMonth
          ? 'text-zinc-900 dark:text-zinc-100'
          : 'text-zinc-300 dark:text-zinc-600',
        day.isToday && 'ring-2 ring-primary-400 dark:ring-primary-600',
        isSelected && 'bg-primary-100 dark:bg-primary-900/30',
        !isSelected && day.isCurrentMonth && 'hover:bg-zinc-100 dark:hover:bg-zinc-800',
      )}
    >
      <span className={clsx(
        'text-xs font-medium',
        day.isToday && 'text-primary-600 dark:text-primary-400 font-bold',
      )}>
        {day.day}
      </span>

      {summary && day.isCurrentMonth && (
        <div className="mt-0.5 space-y-0.5 w-full px-0.5">
          {summary.income > 0 && (
            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 tabular-nums truncate text-center leading-tight">
              +{formatKoreanUnit(summary.income)}
            </p>
          )}
          {summary.expense > 0 && (
            <p className="text-[10px] text-red-600 dark:text-red-400 tabular-nums truncate text-center leading-tight">
              -{formatKoreanUnit(summary.expense)}
            </p>
          )}
        </div>
      )}
    </button>
  )
}
