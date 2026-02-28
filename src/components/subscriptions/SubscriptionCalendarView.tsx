import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useCalendar, type CalendarDay } from '@/hooks/useCalendar'
import { useSubscriptionStore } from '@/stores/subscriptionStore'
import { IconButton } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { formatSubscriptionAmount } from '@/utils/format'
import { formatBillingSchedule } from '@/lib/dateUtils'
import { generateBillingDates } from '@/services/subscriptionEngine'
import { startOfMonth, endOfMonth } from 'date-fns'
import { clsx } from 'clsx'
import type { Subscription } from '@/lib/types'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const MAX_DOTS = 4

function getBillingMap(subscriptions: Subscription[], monthString: string): Map<string, Subscription[]> {
  const [y, m] = monthString.split('-').map(Number)
  const monthStart = startOfMonth(new Date(y, m - 1))
  const monthEnd = endOfMonth(monthStart)
  const map = new Map<string, Subscription[]>()

  for (const sub of subscriptions) {
    if (sub.status !== 'active') continue
    const dates = generateBillingDates(sub, monthEnd)
    for (const dateStr of dates) {
      if (dateStr >= monthString + '-01' && dateStr <= monthString + '-31') {
        const existing = map.get(dateStr) || []
        existing.push(sub)
        map.set(dateStr, existing)
      }
    }
  }

  return map
}

export function SubscriptionCalendarView() {
  const subscriptions = useSubscriptionStore((s) => s.subscriptions)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const { days, monthLabel, monthString, goToPreviousMonth, goToNextMonth, goToToday } = useCalendar()

  const billingMap = useMemo(
    () => getBillingMap(subscriptions, monthString),
    [subscriptions, monthString]
  )

  const selectedSubs = selectedDate ? (billingMap.get(selectedDate) ?? []) : []

  // Count total billing events this month
  const monthlyBillingCount = useMemo(() => {
    let count = 0
    billingMap.forEach((subs) => { count += subs.length })
    return count
  }, [billingMap])

  return (
    <div className="space-y-4">
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

      {/* Monthly Summary */}
      <div className="flex gap-3">
        <Card className="!p-3 flex-1">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">결제 예정</p>
          <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{monthlyBillingCount}건</p>
        </Card>
        <Card className="!p-3 flex-1">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">결제일 수</p>
          <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{billingMap.size}일</p>
        </Card>
      </div>

      {/* Calendar Grid */}
      <div className="bg-white dark:bg-zinc-800/50 rounded-xl p-3">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 mb-2">
          {WEEKDAYS.map((d, i) => (
            <div
              key={d}
              className={clsx(
                'text-center text-xs font-medium py-1',
                i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-zinc-400 dark:text-zinc-500'
              )}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Calendar days */}
        <div className="grid grid-cols-7 gap-px">
          {days.map((day) => (
            <BillingDayCell
              key={day.dateStr}
              day={day}
              subscriptions={billingMap.get(day.dateStr) ?? []}
              isSelected={selectedDate === day.dateStr}
              onSelect={() => setSelectedDate(day.dateStr === selectedDate ? null : day.dateStr)}
            />
          ))}
        </div>
      </div>

      {/* Selected Day Detail */}
      {selectedDate && (
        <Card className="!p-4">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3">
            {parseInt(selectedDate.split('-')[1])}월 {parseInt(selectedDate.split('-')[2])}일 결제 예정
          </h3>
          {selectedSubs.length === 0 ? (
            <p className="text-sm text-zinc-400 dark:text-zinc-500">결제 예정 구독이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {selectedSubs.map((sub) => (
                <div key={sub.id} className="flex items-center gap-3 py-2">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: sub.color + '20' }}
                  >
                    <span className="text-xs font-bold" style={{ color: sub.color }}>
                      {sub.name.charAt(0)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{sub.name}</p>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500">
                      {formatBillingSchedule(sub.cycle, sub.billingDay, sub.billingMonth, sub.customCycleDays)}
                    </p>
                  </div>
                  <p className="text-sm font-bold tabular-nums text-zinc-900 dark:text-zinc-100 flex-shrink-0">
                    {formatSubscriptionAmount(sub.amount, sub.currency)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

interface BillingDayCellProps {
  day: CalendarDay
  subscriptions: Subscription[]
  isSelected: boolean
  onSelect: () => void
}

function BillingDayCell({ day, subscriptions, isSelected, onSelect }: BillingDayCellProps) {
  if (!day.isCurrentMonth) {
    return <div className="h-16 sm:h-20" />
  }

  const hasBilling = subscriptions.length > 0
  const dotCount = Math.min(subscriptions.length, MAX_DOTS)
  const extraCount = subscriptions.length - MAX_DOTS

  return (
    <button
      onClick={onSelect}
      className={clsx(
        'h-16 sm:h-20 p-1 rounded-lg text-left transition-colors flex flex-col',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
        isSelected
          ? 'bg-primary-100 dark:bg-primary-900/30 ring-1 ring-primary-500'
          : hasBilling
            ? 'hover:bg-zinc-100 dark:hover:bg-zinc-700/50 bg-zinc-50 dark:bg-zinc-800/30'
            : 'hover:bg-zinc-100 dark:hover:bg-zinc-700/50',
        day.isToday && !isSelected && 'bg-zinc-100 dark:bg-zinc-800'
      )}
    >
      <span className={clsx(
        'text-xs font-medium',
        day.isToday
          ? 'text-primary-600 dark:text-primary-400 font-bold'
          : 'text-zinc-600 dark:text-zinc-400'
      )}>
        {day.day}
      </span>
      {hasBilling && (
        <div className="flex items-center gap-0.5 mt-auto flex-wrap">
          {subscriptions.slice(0, dotCount).map((sub, i) => (
            <div
              key={`${sub.id}-${i}`}
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: sub.color }}
            />
          ))}
          {extraCount > 0 && (
            <span className="text-[8px] text-zinc-400 dark:text-zinc-500 leading-none">
              +{extraCount}
            </span>
          )}
        </div>
      )}
    </button>
  )
}
