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
      <Card className="card-pad-lg">
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
    <Card className="card-pad-lg">
      <h3 className="text-body3-semi text-heading mb-4">
        전월 대비 비교
      </h3>
      <p className="text-caption text-sub mb-4">
        {formatMonthLabel(previousMonth)} vs {formatMonthLabel(currentMonth)}
      </p>

      {/* Summary row */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="p-3 bg-surface-secondary rounded-lg">
          <p className="text-caption text-sub mb-1">총 지출</p>
          <p className="text-sm font-bold text-heading tabular-nums">
            {formatKoreanUnit(totalExpense.current)}
          </p>
          <DeltaBadge delta={totalExpense.delta} percent={totalExpense.deltaPercent} isExpense />
        </div>
        <div className="p-3 bg-surface-secondary rounded-lg">
          <p className="text-caption text-sub mb-1">총 수입</p>
          <p className="text-sm font-bold text-heading tabular-nums">
            {formatKoreanUnit(totalIncome.current)}
          </p>
          <DeltaBadge delta={totalIncome.delta} percent={totalIncome.deltaPercent} />
        </div>
      </div>

      {/* Category breakdown */}
      {categories.length > 0 && (
        <div className="space-y-2.5">
          <p className="text-caption text-sub">카테고리별 지출 변화</p>
          {categories.map((cat) => (
            <div key={cat.categoryId ?? 'uncategorized'} className="flex items-center gap-2.5">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
              <span className="text-caption text-body flex-1 truncate">{cat.name}</span>
              <span className="text-caption text-sub tabular-nums">
                {formatKoreanUnit(cat.current)}
              </span>
              <span className="text-[10px] text-disabled tabular-nums w-14 text-right">
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
      <span className="inline-flex items-center gap-0.5 text-[10px] text-disabled">
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
      isGood ? 'text-status-success' : 'text-status-danger'
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
