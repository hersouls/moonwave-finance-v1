import { useMemo, useState, useEffect } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Sparkles, TrendingUp, TrendingDown, Trophy, X } from 'lucide-react'
import { clsx } from 'clsx'
import { Amount } from '@/components/ui/Amount'
import { useMonthlyTrend } from '@/hooks/useCategoryTrend'
import { getCategoryIcon } from '@/utils/categoryIcons'
import { formatMonthLabel, getTodayString } from '@/lib/dateUtils'
import { springSnappy, easeOutExpo, durations } from '@/lib/motionConfig'
import type { Transaction, TransactionCategory } from '@/lib/types'

interface MonthlyReportCardProps {
  month: string
  transactions: Transaction[]
  categories: TransactionCategory[]
  /** 강제로 노출 (테스트 or 과거 월 확인용) */
  forceShow?: boolean
}

const DISMISS_STORAGE_KEY = 'ledger-monthly-report-dismissed'

/**
 * 월의 총 일수 중 며칠이 지났는지 (현재 월 한정)
 * 아닌 월은 lastDay 반환 → 항상 노출
 */
function daysRemainingInMonth(month: string): number {
  const today = getTodayString()
  const [y, m] = month.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  if (!today.startsWith(month)) return 0 // 과거 월: 이미 끝남
  const todayDay = Number(today.slice(8, 10))
  return lastDay - todayDay
}

function readDismissed(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(DISMISS_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function writeDismissed(month: string) {
  try {
    const current = readDismissed()
    current[month] = true
    localStorage.setItem(DISMISS_STORAGE_KEY, JSON.stringify(current))
  } catch { /* ignore */ }
}

export function MonthlyReportCard({
  month, transactions, categories, forceShow = false,
}: MonthlyReportCardProps) {
  const shouldReduceMotion = useReducedMotion()
  const [dismissed, setDismissed] = useState(false)

  // 노출 조건 체크
  useEffect(() => {
    if (forceShow) return
    const stored = readDismissed()
    if (stored[month]) setDismissed(true)
  }, [month, forceShow])

  const { totalExpense, totalIncome, netSavings, topCategory, txCount } = useMemo(() => {
    const monthTx = transactions.filter(t => t.date.startsWith(month))
    const totalExpense = monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    const totalIncome = monthTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const netSavings = totalIncome - totalExpense

    // Top 카테고리
    const byCat = new Map<string | null, number>()
    for (const t of monthTx) {
      if (t.type !== 'expense') continue
      byCat.set(t.categoryId, (byCat.get(t.categoryId) || 0) + t.amount)
    }
    const topEntry = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0]
    const topCategory = topEntry
      ? {
          category: topEntry[0] ? categories.find(c => c.id === topEntry[0]) ?? null : null,
          amount: topEntry[1],
        }
      : null

    return { totalExpense, totalIncome, netSavings, topCategory, txCount: monthTx.length }
  }, [month, transactions, categories])

  const expenseTrend = useMonthlyTrend(month, transactions, 'expense')

  const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome) * 100 : 0

  // 노출 조건 — 월 3일 미만 남음 + 거래 5건 이상 + dismiss 안 됨
  const daysRemaining = daysRemainingInMonth(month)
  const shouldShow = forceShow || (daysRemaining <= 3 && txCount >= 5 && !dismissed)
  if (!shouldShow) return null

  const isPastMonth = daysRemaining === 0

  const handleDismiss = () => {
    writeDismissed(month)
    setDismissed(true)
  }

  // 베스트 성취
  const achievements: { icon: typeof Trophy; label: string; color: string }[] = []
  if (savingsRate >= 50) {
    achievements.push({ icon: Trophy, label: `저축률 ${savingsRate.toFixed(0)}% 달성`, color: 'var(--value-positive)' })
  } else if (savingsRate >= 30) {
    achievements.push({ icon: TrendingUp, label: `저축률 ${savingsRate.toFixed(0)}%`, color: 'var(--color-primary-600)' })
  }
  if (expenseTrend.direction === 'down' && expenseTrend.percent !== null) {
    achievements.push({
      icon: TrendingDown,
      label: `지출 ${Math.abs(expenseTrend.percent).toFixed(0)}% 감소`,
      color: 'var(--value-positive)',
    })
  }
  if (expenseTrend.direction === 'up' && expenseTrend.percent !== null && expenseTrend.percent > 20) {
    achievements.push({
      icon: TrendingUp,
      label: `지출 ${expenseTrend.percent.toFixed(0)}% 증가`,
      color: 'var(--value-negative)',
    })
  }

  const Icon = topCategory?.category?.icon ? getCategoryIcon(topCategory.category.icon) : null
  const topCategoryColor = topCategory?.category?.color ?? 'var(--text-muted)'

  return (
    <AnimatePresence>
      <motion.section
        key="monthly-report"
        initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
        transition={{ duration: durations.base, ease: easeOutExpo }}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[color:var(--color-primary-50)] via-surface-primary to-[color:var(--color-primary-50)] dark:from-[color:var(--color-primary-900)]/30 dark:via-surface-primary dark:to-[color:var(--color-primary-900)]/20"
        style={{
          boxShadow: 'inset 0 0 0 1px var(--border-default), 0 8px 28px -8px color-mix(in srgb, var(--color-primary-500) 20%, transparent)',
        }}
        aria-label="월간 리포트"
      >
        {/* Shimmer noise overlay */}
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none opacity-[0.03]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
            backgroundSize: '128px 128px',
          }}
        />

        {/* Dismiss button */}
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute top-3 right-3 z-10 w-7 h-7 rounded-full flex items-center justify-center text-sub hover:text-heading hover:bg-[var(--hover-bg)] transition-colors"
          aria-label="리포트 닫기"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        <div className="relative p-5 sm:p-6">
          {/* Header */}
          <div className="flex items-center gap-2 mb-3">
            <motion.div
              initial={shouldReduceMotion ? undefined : { rotate: 0, scale: 0.8 }}
              animate={{ rotate: [0, -10, 10, 0], scale: 1 }}
              transition={{ duration: 1.2, ease: easeOutExpo, delay: 0.1 }}
              className="w-8 h-8 rounded-xl bg-[color:var(--color-primary-500)] flex items-center justify-center"
              style={{
                boxShadow: '0 4px 14px color-mix(in srgb, var(--color-primary-500) 35%, transparent)',
              }}
            >
              <Sparkles className="w-4 h-4 text-white" />
            </motion.div>
            <div>
              <p className="text-caption text-sub font-semibold leading-none">
                {isPastMonth ? '지난 달 리포트' : `${daysRemaining}일 남음`}
              </p>
              <h3 className="text-body2-bold text-heading leading-tight">
                {formatMonthLabel(month)} 요약
              </h3>
            </div>
          </div>

          {/* 주요 메트릭 3-card */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="min-w-0 rounded-2xl bg-surface-primary/70 dark:bg-surface-primary/50 px-3 py-2.5 text-center backdrop-blur-sm">
              <p className="text-caption text-sub mb-0.5">지출</p>
              <Amount value={totalExpense} size="body" className="font-bold text-value-negative block truncate" unit="" />
            </div>
            <div className="min-w-0 rounded-2xl bg-surface-primary/70 dark:bg-surface-primary/50 px-3 py-2.5 text-center backdrop-blur-sm">
              <p className="text-caption text-sub mb-0.5">수입</p>
              <Amount value={totalIncome} size="body" className="font-bold text-value-positive block truncate" unit="" />
            </div>
            <div className="min-w-0 rounded-2xl bg-surface-primary/70 dark:bg-surface-primary/50 px-3 py-2.5 text-center backdrop-blur-sm">
              <p className="text-caption text-sub mb-0.5">순저축</p>
              <Amount
                value={netSavings}
                size="body"
                className={clsx(
                  'font-bold block truncate',
                  netSavings >= 0 ? 'text-value-positive' : 'text-value-negative',
                )}
                unit=""
              />
            </div>
          </div>

          {/* Top 카테고리 하이라이트 */}
          {topCategory && Icon && (
            <div className="flex items-center gap-2.5 mb-3 rounded-2xl bg-surface-primary/70 dark:bg-surface-primary/50 px-3 py-2.5 backdrop-blur-sm">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${topCategoryColor}20` }}
              >
                <Icon className="w-4 h-4" style={{ color: topCategoryColor }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-caption text-sub leading-tight">가장 많이 쓴 분야</p>
                <p className="text-body3-bold text-heading truncate leading-tight">
                  {topCategory.category?.name ?? '미분류'}
                </p>
              </div>
              <Amount value={topCategory.amount} size="caption" className="font-bold text-heading flex-shrink-0" unit="" />
            </div>
          )}

          {/* 성취 배지 */}
          {achievements.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {achievements.map((a, i) => {
                const AIcon = a.icon
                return (
                  <motion.span
                    key={i}
                    initial={shouldReduceMotion ? undefined : { scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ ...springSnappy, delay: 0.2 + i * 0.1 }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-caption font-bold"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${a.color} 14%, transparent)`,
                      color: a.color,
                    }}
                  >
                    <AIcon className="w-3 h-3" />
                    {a.label}
                  </motion.span>
                )
              })}
            </div>
          )}
        </div>
      </motion.section>
    </AnimatePresence>
  )
}
