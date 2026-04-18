import { clsx } from 'clsx'
import { TrendingUp, TrendingDown, PiggyBank } from 'lucide-react'
import { Amount } from '@/components/ui/Amount'

interface MonthlySummaryProps {
  totalIncome: number
  totalExpense: number
  netSavings: number
}

export function MonthlySummary({ totalIncome, totalExpense, netSavings }: MonthlySummaryProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="card-base el-card-elevated surface-inset-top text-center">
        <div className="flex items-center justify-center gap-1.5 mb-1">
          <TrendingUp className="w-4 h-4 text-emerald-500" />
          <span className="text-caption text-sub">수입</span>
        </div>
        <Amount
          as="p"
          value={totalIncome}
          size="emphasis"
          className="text-status-success font-bold block"
          unit=""
        />
      </div>
      <div className="card-base el-card-elevated surface-inset-top text-center">
        <div className="flex items-center justify-center gap-1.5 mb-1">
          <TrendingDown className="w-4 h-4 text-red-500" />
          <span className="text-caption text-sub">지출</span>
        </div>
        <Amount
          as="p"
          value={totalExpense}
          size="emphasis"
          className="text-status-danger font-bold block"
          unit=""
        />
      </div>
      <div className="card-base el-card-elevated surface-inset-top text-center">
        <div className="flex items-center justify-center gap-1.5 mb-1">
          <PiggyBank className="w-4 h-4 text-blue-500" />
          <span className="text-caption text-sub">잔액</span>
        </div>
        <Amount
          as="p"
          value={netSavings}
          size="emphasis"
          className={clsx(
            'font-bold block',
            netSavings >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-status-danger',
          )}
          unit=""
        />
      </div>
    </div>
  )
}
