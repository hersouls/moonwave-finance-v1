import { clsx } from 'clsx'
import { motion, useReducedMotion } from 'framer-motion'

interface BudgetProgressBarProps {
  used: number
  budget: number
  showLabel?: boolean
  size?: 'sm' | 'md'
}

export function BudgetProgressBar({ used, budget, showLabel = true, size = 'md' }: BudgetProgressBarProps) {
  const shouldReduceMotion = useReducedMotion()
  const percentage = budget > 0 ? Math.min((used / budget) * 100, 100) : 0
  const overBudget = used > budget

  const barColor = overBudget
    ? 'bg-red-500'
    : percentage > 80
      ? 'bg-amber-500'
      : 'bg-emerald-500'

  const glowColor = overBudget
    ? 'rgba(239, 68, 68, 0.3)'
    : percentage > 80
      ? 'rgba(245, 158, 11, 0.3)'
      : 'rgba(16, 185, 129, 0.3)'

  return (
    <div>
      <div className={clsx(
        'w-full rounded-full overflow-hidden bg-surface-tertiary',
        size === 'sm' ? 'h-1.5' : 'h-2.5'
      )}>
        <motion.div
          className={clsx('h-full rounded-full', barColor)}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={shouldReduceMotion
            ? { duration: 0 }
            : { type: 'spring', stiffness: 80, damping: 18, mass: 0.8 }
          }
          style={percentage > 80 ? { boxShadow: `0 0 8px ${glowColor}` } : undefined}
        />
      </div>
      {showLabel && (
        <div className="flex justify-between mt-1">
          <span className={clsx(
            'text-caption tabular-nums',
            overBudget ? 'text-status-danger font-medium' : 'text-sub'
          )}>
            {Math.round(percentage)}%
          </span>
        </div>
      )}
    </div>
  )
}
