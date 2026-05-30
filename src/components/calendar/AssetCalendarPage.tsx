import { useEffect, useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown } from 'lucide-react'
import { useCalendar, type CalendarDay } from '@/hooks/useCalendar'
import { useAssetStore } from '@/stores/assetStore'
import { useDailyValueStore } from '@/stores/dailyValueStore'
import { computeDailyNetWorth, type DailyNetWorth } from '@/lib/assetCalendarUtils'
import { IconButton } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { PageSegmentControl } from '@/components/layout/PageSegmentControl'
import { formatKRW, formatKoreanUnit } from '@/utils/format'
import { eachDayOfInterval, startOfMonth, endOfMonth, format } from 'date-fns'
import { clsx } from 'clsx'
import { useSyncListener } from '@/hooks/useSyncListener'
import { useSwipe } from '@/hooks/useSwipe'

const ASSET_SEGMENTS = [
  { id: 'capital', label: '자본', path: '/assets' },
  { id: 'liability', label: '부채', path: '/liabilities' },
  { id: 'calendar', label: '캘린더', path: '/assets/calendar' },
]

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

export function AssetCalendarPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const loadAll = useAssetStore((s) => s.loadAll)
  const items = useAssetStore((s) => s.items)
  const loadValues = useDailyValueStore((s) => s.loadValues)
  const dailyValues = useDailyValueStore((s) => s.values)

  const { days, monthLabel, monthString, goToPreviousMonth, goToNextMonth, goToToday } = useCalendar()
  const swipeHandlers = useSwipe({
    onSwipeLeft: goToNextMonth,
    onSwipeRight: goToPreviousMonth,
  })

  const loadData = async () => {
    await Promise.all([loadAll(), loadValues()])
    setIsLoading(false)
  }

  useEffect(() => {
    setIsLoading(true)
    loadData()
  }, [])
  useSyncListener(loadData, ['assetCategories', 'assetItems', 'dailyValues'])

  // Get all dates in the current month
  const monthDates = useMemo(() => {
    const [y, m] = monthString.split('-').map(Number)
    const start = startOfMonth(new Date(y, m - 1))
    const end = endOfMonth(start)
    return eachDayOfInterval({ start, end }).map((d) => format(d, 'yyyy-MM-dd'))
  }, [monthString])

  const netWorthMap = useMemo(
    () => computeDailyNetWorth(items, dailyValues, monthDates),
    [items, dailyValues, monthDates]
  )

  const selectedData = selectedDate ? netWorthMap.get(selectedDate) : null

  // Get month summary
  const monthSummary = useMemo(() => {
    const lastDay = monthDates[monthDates.length - 1]
    const firstDay = monthDates[0]
    const lastData = netWorthMap.get(lastDay)
    const firstData = netWorthMap.get(firstDay)
    if (!lastData || !firstData) return null
    return {
      netWorth: lastData.netWorth,
      totalAssets: lastData.totalAssets,
      totalLiabilities: lastData.totalLiabilities,
      monthChange: lastData.netWorth - firstData.netWorth,
    }
  }, [netWorthMap, monthDates])

  if (isLoading) {
    return (
      <div className="p-4 lg:p-6 space-y-4 animate-pulse">
        <div className="h-10 bg-[var(--surface-tertiary)] rounded-lg" />
        <div className="h-24 bg-[var(--surface-tertiary)] rounded-xl" />
        <div className="h-64 bg-[var(--surface-tertiary)] rounded-xl" />
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* Segment Control */}
      <PageSegmentControl segments={ASSET_SEGMENTS} />

      {/* Swipe zone: month nav + grid only (excludes detail card to keep inner interactions clean) */}
      <div className="space-y-4" {...swipeHandlers}>
        {/* Month Navigator */}
        <div className="flex items-center justify-between">
          <IconButton onClick={goToPreviousMonth} plain size="sm">
            <ChevronLeft className="w-5 h-5" />
          </IconButton>
          <button
            onClick={goToToday}
            className="text-base font-semibold text-heading hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
          >
            {monthLabel}
          </button>
          <IconButton onClick={goToNextMonth} plain size="sm">
            <ChevronRight className="w-5 h-5" />
          </IconButton>
        </div>

        {/* Monthly Summary */}
        {monthSummary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="card-pad-sm">
              <p className="text-caption text-sub">순자산</p>
              <p className="text-sm font-bold text-heading tabular-nums">
                {formatKoreanUnit(monthSummary.netWorth)}
              </p>
            </Card>
            <Card className="card-pad-sm">
              <p className="text-caption text-sub">총 자산</p>
              <p className="text-sm font-bold text-status-success tabular-nums">
                {formatKoreanUnit(monthSummary.totalAssets)}
              </p>
            </Card>
            <Card className="card-pad-sm">
              <p className="text-caption text-sub">총 부채</p>
              <p className="text-sm font-bold text-status-danger tabular-nums">
                {formatKoreanUnit(monthSummary.totalLiabilities)}
              </p>
            </Card>
            <Card className="card-pad-sm">
              <p className="text-caption text-sub">월간 변동</p>
              <p className={clsx(
                'text-sm font-bold tabular-nums',
                monthSummary.monthChange >= 0
                  ? 'text-status-success'
                  : 'text-status-danger'
              )}>
                {monthSummary.monthChange >= 0 ? '+' : ''}{formatKoreanUnit(monthSummary.monthChange)}
              </p>
            </Card>
          </div>
        )}

        {/* Calendar Grid */}
        <div className="bg-surface-primary rounded-xl p-3">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 mb-2">
            {WEEKDAYS.map((d, i) => (
              <div
                key={d}
                className={clsx(
                  'text-center text-caption py-1',
                  i === 0 ? 'text-weekend-sun' : i === 6 ? 'text-weekend-sat' : 'text-disabled'
                )}
              >
                {d}
              </div>
            ))}
          </div>

          {/* Calendar days */}
          <div className="grid grid-cols-7 gap-px">
            {days.map((day) => (
              <AssetDayCell
                key={day.dateStr}
                day={day}
                data={netWorthMap.get(day.dateStr)}
                isSelected={selectedDate === day.dateStr}
                onSelect={() => setSelectedDate(day.dateStr === selectedDate ? null : day.dateStr)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Selected Day Detail */}
      {selectedDate && selectedData && (
        <Card>
          <h3 className="text-body3-semi text-heading mb-3">
            {parseInt(selectedDate.split('-')[2])}일 자산 현황
          </h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-sub">총 자산</span>
              <span className="font-medium text-status-success tabular-nums">
                {formatKRW(selectedData.totalAssets)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-sub">총 부채</span>
              <span className="font-medium text-status-danger tabular-nums">
                {formatKRW(selectedData.totalLiabilities)}
              </span>
            </div>
            <div className="border-t border-base pt-2 flex justify-between text-sm">
              <span className="text-heading font-medium">순자산</span>
              <span className="font-bold text-heading tabular-nums">
                {formatKRW(selectedData.netWorth)}
              </span>
            </div>
            {selectedData.change !== 0 && (
              <div className="flex items-center justify-end gap-1 text-caption">
                {selectedData.change > 0 ? (
                  <TrendingUp className="w-3.5 h-3.5 value-positive" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5 value-negative" />
                )}
                <span className={selectedData.change > 0 ? 'value-positive' : 'value-negative'}>
                  전일 대비 {selectedData.change > 0 ? '+' : ''}{formatKRW(selectedData.change)}
                </span>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}

interface AssetDayCellProps {
  day: CalendarDay
  data?: DailyNetWorth
  isSelected: boolean
  onSelect: () => void
}

function AssetDayCell({ day, data, isSelected, onSelect }: AssetDayCellProps) {
  if (!day.isCurrentMonth) {
    return <div className="h-16 sm:h-20" />
  }

  return (
    <button
      onClick={onSelect}
      className={clsx(
        'h-16 sm:h-20 p-1 rounded-lg text-left transition-colors flex flex-col',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
        isSelected
          ? 'bg-primary-100 dark:bg-primary-900/30 ring-1 ring-primary-500'
          : 'hover:bg-[var(--hover-bg)]',
        day.isToday && !isSelected && 'bg-surface-tertiary'
      )}
    >
      <span className={clsx(
        'text-caption',
        day.isToday
          ? 'text-primary-600 dark:text-primary-400 font-bold'
          : 'text-sub'
      )}>
        {day.day}
      </span>
      {data && data.netWorth !== 0 && (
        <span className={clsx(
          'text-label4 leading-none tabular-nums mt-auto truncate w-full',
          data.netWorth >= 0 ? 'text-status-success' : 'text-status-danger'
        )}>
          {formatKoreanUnit(data.netWorth)}
        </span>
      )}
      {data && data.change !== 0 && (
        <span className={clsx(
          'text-micro leading-none tabular-nums truncate w-full',
          data.change > 0 ? 'value-positive' : 'value-negative'
        )}>
          {data.change > 0 ? '▲' : '▼'}{formatKoreanUnit(Math.abs(data.change))}
        </span>
      )}
    </button>
  )
}
