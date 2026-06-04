import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { useTransactionStore } from '@/stores/transactionStore'
import { useCountUp } from '@/hooks/useCountUp'
import { Amount } from '@/components/ui/Amount'
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

  const animatedIncome = useCountUp(summary.income)
  const animatedExpense = useCountUp(summary.expense)
  const animatedSavings = useCountUp(summary.savings)

  return (
    <Card className="card-pad-lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-body3-semi text-heading">이번 달 가계부</h3>
        <button
          onClick={() => navigate('/ledger/expense')}
          className="text-label3-medium text-accent-primary hover:underline flex items-center gap-0.5 min-h-11 px-1 -mr-1"
        >
          전체보기 <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-status-success" />
            <span className="text-body3 text-sub">수입</span>
          </div>
          <Amount
            value={animatedIncome}
            format="change"
            size="emphasis"
            className="text-status-success"
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-status-danger" />
            <span className="text-body3 text-sub">지출</span>
          </div>
          <Amount
            value={-animatedExpense}
            format="change"
            size="emphasis"
            className="text-status-danger"
          />
        </div>

        <div className="border-t border-base pt-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Minus className="w-4 h-4 text-disabled" />
            <span className="text-body3 text-body">잔액</span>
          </div>
          <Amount
            value={animatedSavings}
            format="change"
            size="emphasis"
            className={clsx(
              'font-bold',
              animatedSavings >= 0 ? 'text-status-success' : 'text-status-danger',
            )}
          />
        </div>
      </div>
    </Card>
  )
}
