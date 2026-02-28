import { PiggyBank } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { BudgetProgressBar } from './BudgetProgressBar'
import { formatKoreanUnit } from '@/utils/format'
import { useBudgetStore } from '@/stores/budgetStore'

export function BudgetOverviewCard() {
  const totalBudget = useBudgetStore((s) => s.getTotalBudget)()
  const totalUsed = useBudgetStore((s) => s.getTotalUsed)()

  if (totalBudget === 0) return null

  const remaining = totalBudget - totalUsed

  return (
    <Card className="!p-5">
      <div className="flex items-center gap-2 mb-3">
        <PiggyBank className="w-4 h-4 text-primary-600 dark:text-primary-400" />
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">이번 달 예산</h3>
      </div>
      <div className="space-y-3">
        <BudgetProgressBar used={totalUsed} budget={totalBudget} />
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">예산</p>
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
              {formatKoreanUnit(totalBudget)}
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">사용</p>
            <p className="text-sm font-semibold text-red-600 dark:text-red-400 tabular-nums">
              {formatKoreanUnit(totalUsed)}
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">남은 금액</p>
            <p className={`text-sm font-semibold tabular-nums ${remaining >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {formatKoreanUnit(remaining)}
            </p>
          </div>
        </div>
      </div>
    </Card>
  )
}
