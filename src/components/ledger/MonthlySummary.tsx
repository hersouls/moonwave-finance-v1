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
      <div className="card-base el-card-elevated surface-inset-top text-center min-w-0">
        <div className="flex items-center justify-center gap-1.5 mb-1">
          <TrendingUp className="w-4 h-4 text-value-positive" />
          <span className="text-caption text-sub">수입</span>
        </div>
        <Amount
          as="p"
          value={totalIncome}
          size="emphasis"
          className="text-value-positive font-bold block truncate"
          unit=""
        />
      </div>
      <div className="card-base el-card-elevated surface-inset-top text-center min-w-0">
        <div className="flex items-center justify-center gap-1.5 mb-1">
          <TrendingDown className="w-4 h-4 text-value-negative" />
          <span className="text-caption text-sub">지출</span>
        </div>
        <Amount
          as="p"
          value={totalExpense}
          size="emphasis"
          className="text-value-negative font-bold block truncate"
          unit=""
        />
      </div>
      <div className="card-base el-card-elevated surface-inset-top text-center min-w-0">
        <div className="flex items-center justify-center gap-1.5 mb-1">
          <PiggyBank className="w-4 h-4 text-[color:var(--color-primary-500)]" />
          <span className="text-caption text-sub">잔액</span>
        </div>
        <Amount
          as="p"
          value={netSavings}
          size="emphasis"
          className={clsx(
            'font-bold block truncate',
            netSavings >= 0 ? 'text-[color:var(--color-primary-600)] dark:text-[color:var(--color-primary-300)]' : 'text-value-negative',
          )}
          unit=""
        />
      </div>
    </div>
  )
}
