import { useMemo } from 'react'
import { clsx } from 'clsx'
import { TrendingUp, TrendingDown, Crown, RefreshCw, CalendarDays, Wallet } from 'lucide-react'
import { Sparkline } from '@/components/ui/Sparkline'
import { formatKoreanUnit, formatKRW, formatPercent } from '@/utils/format'
import { getCategoryColor, getCategoryName, type MonthAggregates } from '@/lib/calendarUtils'
import { getCalendarFallbackColors, getPositiveColor, getNegativeColor } from '@/lib/chartConfig'
import type { TransactionCategory } from '@/lib/types'

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

interface MonthInsightsPanelProps {
  aggregates: MonthAggregates | null
  categories: TransactionCategory[]
  monthLabel: string
  selectedDate?: string | null
  onSelectDate?: (dateStr: string) => void
}

export function MonthInsightsPanel({
  aggregates,
  categories,
  monthLabel,
  selectedDate,
  onSelectDate,
}: MonthInsightsPanelProps) {
  const sparklineSeries = useMemo(() => {
    if (!aggregates) return []
    return aggregates.dailyNetSeries.map((d) => d.net)
  }, [aggregates])

  if (!aggregates) {
    return (
      <aside className="space-y-3">
        <div className="card-base el-card card-pad-sm">
          <p className="text-caption text-sub">인사이트를 계산할 데이터가 없습니다.</p>
        </div>
      </aside>
    )
  }

  const calFallback = getCalendarFallbackColors()
  const savingsRate = aggregates.income > 0 ? ((aggregates.income - aggregates.expense) / aggregates.income) * 100 : 0
  const recurringShare = aggregates.expense > 0 ? (aggregates.recurringExpense / aggregates.expense) * 100 : 0
  const topExpense = aggregates.topExpenseCategories.slice(0, 5)
  const expenseMax = topExpense[0]?.amount ?? 0
  const maxWeekday = Math.max(...aggregates.weekdayExpense, 1)
  const topSpendingDays = [...aggregates.dailyNetSeries]
    .filter((d) => d.expense > 0)
    .sort((a, b) => b.expense - a.expense)
    .slice(0, 3)

  return (
    <aside className="space-y-3 text-sm">
      {/* KPI card */}
      <div className="card-base el-card relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.04] pointer-events-none" aria-hidden>
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-primary-500 blur-3xl" />
        </div>
        <div className="relative">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-caption text-sub">{monthLabel} 요약</p>
              <p className="text-heading font-semibold text-body2-semi mt-0.5">
                순 <span className={aggregates.net >= 0 ? 'text-status-success' : 'text-status-danger'}>
                  {aggregates.net >= 0 ? '+' : ''}{formatKoreanUnit(aggregates.net)}
                </span>
              </p>
            </div>
            <div className="shrink-0">
              <Sparkline
                data={sparklineSeries}
                width={96}
                height={32}
                color={aggregates.net >= 0 ? getPositiveColor() : getNegativeColor()}
                showFill
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-3">
            <MiniStat
              icon={<TrendingUp className="w-3.5 h-3.5" />}
              label="수입"
              value={formatKoreanUnit(aggregates.income)}
              tone="success"
            />
            <MiniStat
              icon={<TrendingDown className="w-3.5 h-3.5" />}
              label="지출"
              value={formatKoreanUnit(aggregates.expense)}
              tone="danger"
            />
            <MiniStat
              icon={<Wallet className="w-3.5 h-3.5" />}
              label="저축률"
              value={formatPercent(savingsRate, 0)}
              tone={savingsRate >= 0 ? 'success' : 'danger'}
            />
            <MiniStat
              icon={<CalendarDays className="w-3.5 h-3.5" />}
              label="활동일"
              value={`${aggregates.activeDays}일`}
              tone="neutral"
            />
          </div>

          <div className="mt-3 pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between text-caption text-sub">
            <span>일평균 지출</span>
            <span className="tabular-nums font-medium text-heading">
              {formatKoreanUnit(aggregates.avgDailyExpense)}원
            </span>
          </div>
        </div>
      </div>

      {/* Top spending categories */}
      {topExpense.length > 0 && (
        <div className="card-base el-card">
          <div className="flex items-center gap-1.5 mb-2">
            <Crown className="w-4 h-4 text-status-warning" />
            <h4 className="text-body3-semi text-heading">지출 상위 카테고리</h4>
          </div>
          <div className="space-y-2">
            {topExpense.map((entry, i) => {
              const color = getCategoryColor(entry.categoryId, categories, calFallback.expense)
              const name = getCategoryName(entry.categoryId, categories)
              const share = aggregates.expense > 0 ? (entry.amount / aggregates.expense) * 100 : 0
              const widthPct = expenseMax > 0 ? (entry.amount / expenseMax) * 100 : 0
              return (
                <div key={`${entry.categoryId ?? 'none'}-${i}`} className="space-y-1">
                  <div className="flex items-center justify-between text-caption">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-heading truncate">{name}</span>
                      <span className="text-sub text-label4 tabular-nums shrink-0">
                        {formatPercent(share, 0)}
                      </span>
                    </div>
                    <span className="tabular-nums text-heading font-medium shrink-0 ml-2">
                      {formatKoreanUnit(entry.amount)}
                    </span>
                  </div>
                  <div className="h-1.5 bg-[var(--surface-tertiary)] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-[width] duration-500"
                      style={{ width: `${widthPct}%`, backgroundColor: color }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Top spending days */}
      {topSpendingDays.length > 0 && (
        <div className="card-base el-card">
          <div className="flex items-center gap-1.5 mb-2">
            <TrendingDown className="w-4 h-4 text-status-danger" />
            <h4 className="text-body3-semi text-heading">지출 많은 날</h4>
          </div>
          <div className="space-y-1.5">
            {topSpendingDays.map((d) => {
              const dow = new Date(d.date).getDay()
              const isSelected = selectedDate === d.date
              return (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => onSelectDate?.(d.date)}
                  className={clsx(
                    'w-full flex items-center justify-between px-2 py-1.5 rounded-md text-sm transition-colors',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
                    isSelected
                      ? 'bg-primary-100 dark:bg-primary-900/30'
                      : 'hover:bg-[var(--hover-bg)]',
                  )}
                >
                  <span className="flex items-center gap-2 text-heading">
                    <span className="tabular-nums font-medium">
                      {parseInt(d.date.split('-')[2])}일
                    </span>
                    <span
                      className={clsx(
                        'text-caption',
                        dow === 0 ? 'text-weekend-sun' : dow === 6 ? 'text-weekend-sat' : 'text-sub',
                      )}
                    >
                      ({WEEKDAY_LABELS[dow]})
                    </span>
                  </span>
                  <span className="tabular-nums font-medium text-status-danger">
                    -{formatKoreanUnit(d.expense)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Weekday pattern */}
      {aggregates.expense > 0 && (
        <div className="card-base el-card">
          <div className="flex items-center gap-1.5 mb-2">
            <CalendarDays className="w-4 h-4 text-primary-500" />
            <h4 className="text-body3-semi text-heading">요일별 지출 패턴</h4>
          </div>
          <div className="grid grid-cols-7 gap-1 items-end h-20">
            {aggregates.weekdayExpense.map((amount, i) => {
              const heightPct = (amount / maxWeekday) * 100
              return (
                <div key={i} className="flex flex-col items-center gap-1 h-full">
                  <div className="flex-1 w-full flex items-end">
                    <div
                      className={clsx(
                        'w-full rounded-t-md transition-all',
                        i === 0 ? 'bg-weekend-sun' : i === 6 ? 'bg-weekend-sat' : 'bg-primary-500/70',
                        amount === 0 && 'bg-[var(--surface-tertiary)] min-h-[4px]',
                      )}
                      style={{ height: amount > 0 ? `${Math.max(8, heightPct)}%` : undefined }}
                      title={`${WEEKDAY_LABELS[i]}요일 ${formatKoreanUnit(amount)}원`}
                    />
                  </div>
                  <span
                    className={clsx(
                      'text-label4',
                      i === 0 ? 'text-weekend-sun' : i === 6 ? 'text-weekend-sat' : 'text-sub',
                    )}
                  >
                    {WEEKDAY_LABELS[i]}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Recurring summary */}
      {aggregates.recurringExpense > 0 && (
        <div className="card-base el-card">
          <div className="flex items-center gap-1.5 mb-1">
            <RefreshCw className="w-4 h-4 text-primary-500" />
            <h4 className="text-body3-semi text-heading">고정 지출</h4>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-caption text-sub">반복·구독 합계</span>
            <span className="tabular-nums font-semibold text-heading">
              {formatKRW(aggregates.recurringExpense)}
            </span>
          </div>
          <div className="mt-2 h-1.5 bg-[var(--surface-tertiary)] rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-500 rounded-full"
              style={{ width: `${recurringShare}%` }}
            />
          </div>
          <p className="mt-1 text-label4 text-sub text-right tabular-nums">
            전체 지출의 {formatPercent(recurringShare, 0)}
          </p>
        </div>
      )}
    </aside>
  )
}

interface MiniStatProps {
  icon: React.ReactNode
  label: string
  value: string
  tone: 'success' | 'danger' | 'neutral'
}

function MiniStat({ icon, label, value, tone }: MiniStatProps) {
  const toneClass =
    tone === 'success'
      ? 'text-status-success'
      : tone === 'danger'
        ? 'text-status-danger'
        : 'text-heading'
  return (
    <div className="rounded-lg bg-[var(--surface-tertiary)]/60 px-2.5 py-2">
      <div className="flex items-center gap-1 text-caption text-sub">
        <span className={toneClass}>{icon}</span>
        <span>{label}</span>
      </div>
      <p className={clsx('tabular-nums font-semibold text-sm mt-0.5', toneClass)}>{value}</p>
    </div>
  )
}
