import { useMemo } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { X, PiggyBank } from 'lucide-react'
import { clsx } from 'clsx'
import { Amount } from '@/components/ui/Amount'
import { describeArc } from '@/utils/svgArc'
import type { BudgetStatus } from '@/hooks/useBudgetStatus'
import type { Budget, Transaction, TransactionCategory } from '@/lib/types'
import { easeOutExpo } from '@/lib/motionConfig'

interface BudgetDetailSheetProps {
  open: boolean
  onClose: () => void
  status: BudgetStatus
  budgets: Budget[]
  transactions: Transaction[]
  categories: TransactionCategory[]
  month: string
}

const RING_STATUS_COLORS = {
  safe: 'var(--value-positive)',
  warning: 'oklch(0.75 0.18 70)',
  critical: 'oklch(0.68 0.20 45)',
  exceeded: 'var(--value-negative)',
} as const

export function BudgetDetailSheet({
  open, onClose, status, budgets, transactions, categories, month,
}: BudgetDetailSheetProps) {
  const shouldReduceMotion = useReducedMotion()
  const color = RING_STATUS_COLORS[status.status]
  const pct = Math.min(100, Math.max(0, status.percentUsed))
  const trackArc = describeArc(100, 100, 80, -135, 135)
  const progressEnd = -135 + (135 - (-135)) * (pct / 100)
  const progressArc = describeArc(100, 100, 80, -135, progressEnd)

  // 카테고리별 예산 상태
  const categoryBreakdown = useMemo(() => {
    return budgets.map(b => {
      const cat = categories.find(c => c.id === b.categoryId)
      const used = transactions
        .filter(t => t.type === 'expense' && t.categoryId === b.categoryId && t.date.startsWith(month))
        .reduce((s, t) => s + t.amount, 0)
      const percent = b.amount > 0 ? (used / b.amount) * 100 : 0
      return {
        budget: b,
        category: cat,
        used,
        percent: Math.min(100, percent),
        rawPercent: percent,
      }
    }).sort((a, b) => b.rawPercent - a.rawPercent)
  }, [budgets, categories, transactions, month])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-[var(--z-overlay)] bg-black/40 dark:bg-black/60 backdrop-blur-[12px] saturate-[1.4]"
            aria-hidden="true"
          />
          <motion.div
            key="sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="budget-sheet-title"
            initial={shouldReduceMotion ? { opacity: 0 } : { y: '100%' }}
            animate={shouldReduceMotion ? { opacity: 1 } : { y: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            drag={shouldReduceMotion ? false : 'y'}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) onClose()
            }}
            className="fixed bottom-0 left-0 right-0 z-[var(--z-overlay)] bg-surface-primary rounded-t-3xl sm:rounded-3xl ring-1 ring-[var(--border-default)] overflow-hidden pb-[env(safe-area-inset-bottom,0px)] max-h-[85vh] flex flex-col sm:max-w-md sm:mx-auto sm:mb-4 sm:left-1/2 sm:-translate-x-1/2 sm:right-auto sm:w-[calc(100%-2rem)]"
          >
            {/* Handle */}
            <div className="sm:hidden sheet-handle w-full" aria-hidden="true" />

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-2 sm:pt-5 pb-3">
              <h2 id="budget-sheet-title" className="inline-flex items-center gap-2 text-title2 font-bold text-heading">
                <PiggyBank className="w-5 h-5 text-[color:var(--color-primary-600)]" />
                이번 달 예산
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full flex items-center justify-center text-sub hover:text-heading hover:bg-[var(--hover-bg)] transition-colors"
                aria-label="닫기"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content scroll */}
            <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-5">
              {/* Large Ring */}
              <div className="flex flex-col items-center py-4">
                <svg viewBox="0 0 200 200" className="w-[200px] h-[200px]" aria-hidden="true">
                  <path d={trackArc} fill="none" stroke="var(--surface-tertiary)" strokeWidth={14} strokeLinecap="round" />
                  <motion.path
                    d={progressArc}
                    fill="none"
                    stroke={color}
                    strokeWidth={14}
                    strokeLinecap="round"
                    initial={shouldReduceMotion ? undefined : { pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 1.1, ease: easeOutExpo }}
                  />
                  <text
                    x="100" y="95"
                    textAnchor="middle"
                    className="fill-[color:var(--text-primary)] text-2xl font-extrabold"
                    style={{ fontSize: 32 }}
                  >
                    {pct.toFixed(0)}%
                  </text>
                  <text
                    x="100" y="118"
                    textAnchor="middle"
                    className="fill-[color:var(--text-tertiary)] text-caption"
                    style={{ fontSize: 11 }}
                  >
                    {status.daysRemaining}일 남음
                  </text>
                </svg>
              </div>

              {/* 요약 */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-surface-secondary px-3 py-2.5 text-center">
                  <p className="text-[11px] text-sub">총 예산</p>
                  <Amount value={status.totalBudget} size="body" className="font-bold text-heading block" unit="" />
                </div>
                <div className="rounded-xl bg-surface-secondary px-3 py-2.5 text-center">
                  <p className="text-[11px] text-sub">사용</p>
                  <Amount value={status.totalUsed} size="body" className="font-bold text-value-negative block" unit="" />
                </div>
                <div className="rounded-xl bg-surface-secondary px-3 py-2.5 text-center">
                  <p className="text-[11px] text-sub">남음</p>
                  <Amount
                    value={Math.max(0, status.remaining)}
                    size="body"
                    className={clsx('font-bold block', status.remaining < 0 ? 'text-value-negative' : 'text-heading')}
                    unit=""
                  />
                </div>
              </div>

              {/* Projected overage */}
              {status.projectedOverage !== null && (
                <div className="rounded-xl bg-status-warning-soft px-4 py-3 text-caption text-status-warning font-semibold">
                  ⚠️ 현재 속도로 지속 시 예상 초과: <Amount value={status.projectedOverage} size="caption" className="font-bold text-status-warning" unit="" />
                </div>
              )}

              {/* 카테고리별 예산 */}
              {categoryBreakdown.length > 0 && (
                <div>
                  <h3 className="text-body3-semi text-heading mb-2">카테고리별 예산</h3>
                  <div className="space-y-2">
                    {categoryBreakdown.map(item => (
                      <div key={item.budget.id} className="rounded-xl bg-surface-secondary px-3 py-2.5">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: item.category?.color ?? '#71717a' }} aria-hidden="true" />
                            <span className="text-body3 text-heading font-semibold truncate">
                              {item.category?.name ?? '미분류'}
                            </span>
                          </div>
                          <span className="text-caption text-sub tabular-nums flex-shrink-0">
                            {item.rawPercent.toFixed(0)}%
                          </span>
                        </div>
                        <div className="h-1.5 bg-surface-tertiary rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${item.percent}%`,
                              backgroundColor: item.rawPercent >= 100 ? 'var(--value-negative)' : item.category?.color ?? 'var(--color-primary-500)',
                            }}
                          />
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[11px] tabular-nums">
                          <span className="text-sub">
                            <Amount value={item.used} size="caption" unit="" /> / <Amount value={item.budget.amount} size="caption" unit="" />
                          </span>
                          {item.rawPercent > 100 && (
                            <span className="text-value-negative font-semibold">
                              <Amount value={item.used - item.budget.amount} format="korean" unit="" size="caption" /> 초과
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
