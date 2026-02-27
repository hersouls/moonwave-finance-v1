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
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 text-center">
        <div className="flex items-center justify-center gap-1.5 mb-1">
          <TrendingUp className="w-4 h-4 text-emerald-500" />
          <span className="text-xs text-zinc-500 dark:text-zinc-400">수입</span>
        </div>
        <p className="text-base font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
          {formatKoreanUnit(totalIncome)}
        </p>
      </div>
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 text-center">
        <div className="flex items-center justify-center gap-1.5 mb-1">
          <TrendingDown className="w-4 h-4 text-red-500" />
          <span className="text-xs text-zinc-500 dark:text-zinc-400">지출</span>
        </div>
        <p className="text-base font-bold text-red-600 dark:text-red-400 tabular-nums">
          {formatKoreanUnit(totalExpense)}
        </p>
      </div>
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 text-center">
        <div className="flex items-center justify-center gap-1.5 mb-1">
          <PiggyBank className="w-4 h-4 text-blue-500" />
          <span className="text-xs text-zinc-500 dark:text-zinc-400">잔액</span>
        </div>
        <p className={clsx(
          'text-base font-bold tabular-nums',
          netSavings >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'
        )}>
          {formatKoreanUnit(netSavings)}
        </p>
      </div>
    </div>
  )
}
