import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { usePeriodComparison } from '@/hooks/usePeriodComparison'
import { formatKoreanUnit, formatPercent } from '@/utils/format'
import { formatMonthLabel } from '@/lib/dateUtils'
import { clsx } from 'clsx'

export function PeriodComparisonCard() {
  const { currentMonth, previousMonth, totalExpense, totalIncome, categories, isLoading } = usePeriodComparison()

  if (isLoading) {
    return (
      <Card className="!p-5">
        <div className="h-40 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </Card>
    )
  }

  if (categories.length === 0 && totalExpense.current === 0 && totalExpense.previous === 0) {
    return null
  }

  return (
    <Card className="!p-5">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
        전월 대비 비교
      </h3>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
        {formatMonthLabel(previousMonth)} vs {formatMonthLabel(currentMonth)}
      </p>

      {/* Summary row */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">총 지출</p>
          <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
            {formatKoreanUnit(totalExpense.current)}
          </p>
          <DeltaBadge delta={totalExpense.delta} percent={totalExpense.deltaPercent} isExpense />
        </div>
        <div className="p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">총 수입</p>
          <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
            {formatKoreanUnit(totalIncome.current)}
          </p>
          <DeltaBadge delta={totalIncome.delta} percent={totalIncome.deltaPercent} />
        </div>
      </div>

      {/* Category breakdown */}
      {categories.length > 0 && (
        <div className="space-y-2.5">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">카테고리별 지출 변화</p>
          {categories.map((cat) => (
            <div key={cat.categoryId ?? 'uncategorized'} className="flex items-center gap-2.5">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
              <span className="text-xs text-zinc-700 dark:text-zinc-300 flex-1 truncate">{cat.name}</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                {formatKoreanUnit(cat.current)}
              </span>
              <span className="text-[10px] text-zinc-400 tabular-nums w-14 text-right">
                (전월 {formatKoreanUnit(cat.previous)})
              </span>
              <DeltaBadge delta={cat.delta} percent={cat.deltaPercent} isExpense compact />
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function DeltaBadge({ delta, percent, isExpense = false, compact = false }: {
  delta: number
  percent: number
  isExpense?: boolean
  compact?: boolean
}) {
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-zinc-400">
        <Minus className="w-2.5 h-2.5" />
        {!compact && '변동 없음'}
      </span>
    )
  }

  // For expenses, increase is bad (red), decrease is good (green)
  // For income, increase is good (green), decrease is bad (red)
  const isPositive = delta > 0
  const isGood = isExpense ? !isPositive : isPositive

  return (
    <span className={clsx(
      'inline-flex items-center gap-0.5 text-[10px] font-medium tabular-nums',
      isGood ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
    )}>
      {isPositive
        ? <ArrowUpRight className="w-2.5 h-2.5" />
        : <ArrowDownRight className="w-2.5 h-2.5" />
      }
      {compact
        ? `${Math.abs(Math.round(percent))}%`
        : `${formatKoreanUnit(Math.abs(delta))} (${formatPercent(Math.abs(percent), 0)})`
      }
    </span>
  )
}
