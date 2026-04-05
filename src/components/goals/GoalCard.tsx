import { Target, Check, Trash2 } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import { Card } from '@/components/ui/Card'
import { IconButton } from '@/components/ui/Button'
import { formatKoreanUnit } from '@/utils/format'
import type { FinancialGoal } from '@/lib/types'

interface GoalCardProps {
  goal: FinancialGoal
  onEdit?: () => void
  onDelete?: () => void
}

export function GoalCard({ goal, onEdit, onDelete }: GoalCardProps) {
  const shouldReduceMotion = useReducedMotion()
  const percentage = goal.targetAmount > 0
    ? Math.min((goal.currentAmount / goal.targetAmount) * 100, 100)
    : 0
  const radius = 28
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (percentage / 100) * circumference

  const daysLeft = Math.max(0, Math.ceil((new Date(goal.targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
  const isNearComplete = percentage >= 90

  return (
    <Card variant="interactive" onClick={onEdit}>
      <div className="flex items-center gap-4">
        {/* Progress Ring */}
        <div className="relative flex-shrink-0">
          <svg width="68" height="68" viewBox="0 0 68 68">
            <circle cx="34" cy="34" r={radius} fill="none" stroke="currentColor" strokeWidth="4" className="text-zinc-100 dark:text-zinc-800" />
            <motion.circle
              cx="34" cy="34" r={radius} fill="none"
              stroke={goal.color}
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset }}
              transition={shouldReduceMotion
                ? { duration: 0 }
                : { type: 'spring', stiffness: 60, damping: 15, mass: 1 }
              }
              transform="rotate(-90 34 34)"
              style={isNearComplete ? { filter: `drop-shadow(0 0 4px ${goal.color}60)` } : undefined}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            {goal.isCompleted ? (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 0.3 }}
              >
                <Check className="w-5 h-5 text-emerald-500" />
              </motion.span>
            ) : (
              <span className="text-caption-bold text-zinc-700 dark:text-zinc-300 tabular-nums">{Math.round(percentage)}%</span>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Target className="w-3.5 h-3.5 flex-shrink-0" style={{ color: goal.color }} />
            <h4 className="text-body3-semi text-zinc-900 dark:text-zinc-100 truncate">{goal.name}</h4>
          </div>
          <p className="text-caption text-zinc-500 dark:text-zinc-400 mt-1 tabular-nums">
            {formatKoreanUnit(goal.currentAmount)} / {formatKoreanUnit(goal.targetAmount)}
          </p>
          {!goal.isCompleted && (
            <p className="text-caption text-zinc-400 dark:text-zinc-500 mt-0.5">
              D-{daysLeft}
            </p>
          )}
        </div>

        {/* Delete */}
        {onDelete && (
          <IconButton
            plain size="sm" color="danger"
            onClick={(e) => { e.stopPropagation(); onDelete() }}
          >
            <Trash2 className="w-4 h-4" />
          </IconButton>
        )}
      </div>
    </Card>
  )
}
