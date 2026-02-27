import { CalendarDayCell } from './CalendarDayCell'
import type { CalendarDay } from '@/hooks/useCalendar'
import type { DaySummary } from '@/lib/calendarUtils'

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

interface CalendarGridProps {
  days: CalendarDay[]
  summaries: Map<string, DaySummary>
  selectedDate: string | null
  onSelectDate: (dateStr: string) => void
}

export function CalendarGrid({ days, summaries, selectedDate, onSelectDate }: CalendarGridProps) {
  return (
    <div>
      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAY_LABELS.map((label, i) => (
          <div
            key={label}
            className={`text-center text-xs font-medium py-2 ${
              i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-zinc-500 dark:text-zinc-400'
            }`}
          >
            {label}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => (
          <CalendarDayCell
            key={day.dateStr}
            day={day}
            summary={summaries.get(day.dateStr)}
            isSelected={selectedDate === day.dateStr}
            onClick={() => onSelectDate(day.dateStr)}
          />
        ))}
      </div>
    </div>
  )
}
