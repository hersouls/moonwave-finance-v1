import { clsx } from 'clsx'

interface BudgetProgressBarProps {
  used: number
  budget: number
  showLabel?: boolean
  size?: 'sm' | 'md'
}

export function BudgetProgressBar({ used, budget, showLabel = true, size = 'md' }: BudgetProgressBarProps) {
  const percentage = budget > 0 ? Math.min((used / budget) * 100, 100) : 0
  const overBudget = used > budget

  const barColor = overBudget
    ? 'bg-red-500'
    : percentage > 80
      ? 'bg-amber-500'
      : 'bg-emerald-500'

  return (
    <div>
      <div className={clsx(
        'w-full rounded-full overflow-hidden bg-zinc-100 dark:bg-zinc-800',
        size === 'sm' ? 'h-1.5' : 'h-2.5'
      )}>
        <div
          className={clsx('h-full rounded-full transition-all duration-300', barColor)}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showLabel && (
        <div className="flex justify-between mt-1">
          <span className={clsx(
            'text-xs tabular-nums',
            overBudget ? 'text-red-500 font-medium' : 'text-zinc-500 dark:text-zinc-400'
          )}>
            {Math.round(percentage)}%
          </span>
        </div>
      )}
    </div>
  )
}
