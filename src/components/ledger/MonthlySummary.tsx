import { clsx } from 'clsx'
import { TrendingUp, TrendingDown, PiggyBank } from 'lucide-react'
import { formatKoreanUnit } from '@/utils/format'

interface MonthlySummaryProps {
  totalIncome: number
  totalExpense: number
  netSavings: number
}

export function MonthlySummary({ totalIncome, totalExpense, netSavings }: MonthlySummaryProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="card-base text-center">
        <div className="flex items-center justify-center gap-1.5 mb-1">
          <TrendingUp className="w-4 h-4 text-emerald-500" />
          <span className="text-caption text-sub">수입</span>
        </div>
        <p className="text-body1-bold text-status-success tabular-nums">
          {formatKoreanUnit(totalIncome)}
        </p>
      </div>
      <div className="card-base text-center">
        <div className="flex items-center justify-center gap-1.5 mb-1">
          <TrendingDown className="w-4 h-4 text-red-500" />
          <span className="text-caption text-sub">지출</span>
        </div>
        <p className="text-body1-bold text-status-danger tabular-nums">
          {formatKoreanUnit(totalExpense)}
        </p>
      </div>
      <div className="card-base text-center">
        <div className="flex items-center justify-center gap-1.5 mb-1">
          <PiggyBank className="w-4 h-4 text-blue-500" />
          <span className="text-caption text-sub">잔액</span>
        </div>
        <p className={clsx(
          'text-body1-bold tabular-nums',
          netSavings >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-status-danger'
        )}>
          {formatKoreanUnit(netSavings)}
        </p>
      </div>
    </div>
  )
}
