import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { useTransactionStore } from '@/stores/transactionStore'
import { formatKoreanUnit } from '@/utils/format'
import { clsx } from 'clsx'

export function LedgerSummaryCard() {
  const navigate = useNavigate()
  const transactions = useTransactionStore((s) => s.transactions)

  const summary = useMemo(() => {
    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    let income = 0
    let expense = 0

    for (const t of transactions) {
      if (!t.date.startsWith(currentMonth)) continue
      if (t.type === 'income') income += t.amount
      else if (t.type === 'expense') expense += t.amount
    }

    return { income, expense, savings: income - expense }
  }, [transactions])

  return (
    <Card className="!p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">이번 달 가계부</h3>
        <button
          onClick={() => navigate('/ledger/expense')}
          className="text-xs text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-0.5"
        >
          전체보기 <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-500" />
            <span className="text-sm text-zinc-600 dark:text-zinc-400">수입</span>
          </div>
          <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
            +{formatKoreanUnit(summary.income)}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-red-500" />
            <span className="text-sm text-zinc-600 dark:text-zinc-400">지출</span>
          </div>
          <span className="text-sm font-semibold text-red-600 dark:text-red-400 tabular-nums">
            -{formatKoreanUnit(summary.expense)}
          </span>
        </div>

        <div className="border-t border-zinc-200 dark:border-zinc-700 pt-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Minus className="w-4 h-4 text-zinc-400" />
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">잔액</span>
          </div>
          <span className={clsx(
            'text-sm font-bold tabular-nums',
            summary.savings >= 0
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-red-600 dark:text-red-400'
          )}>
            {summary.savings >= 0 ? '+' : ''}{formatKoreanUnit(summary.savings)}
          </span>
        </div>
      </div>
    </Card>
  )
}
