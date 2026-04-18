import { useMemo } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { clsx } from 'clsx'
import { Amount } from '@/components/ui/Amount'
import { formatMonthLabel, getPreviousMonth, getNextMonth, getCurrentMonthString } from '@/lib/dateUtils'
import { generateSparklinePath, generateSparklineAreaPath } from '@/utils/sparkline'
import type { CategoryTrend } from '@/hooks/useCategoryTrend'
import { springSnappy, easeOutExpo, durations } from '@/lib/motionConfig'

interface LedgerHeroProps {
  type: 'expense' | 'income'
  selectedMonth: string
  onMonthChange: (month: string) => void
  /** 월간 합계 */
  totalAmount: number
  /** 수입 (항상 노출) */
  income: number
  /** 지출 (항상 노출) */
  expense: number
  /** 전월 대비 trend */
  trend: CategoryTrend
  /** 일별 값 (sparkline) */
  dailyValues: number[]
}

const SPARK_WIDTH = 560
const SPARK_HEIGHT = 60

export function LedgerHero({
  type,
  selectedMonth,
  onMonthChange,
  totalAmount,
  income,
  expense,
  trend,
  dailyValues,
}: LedgerHeroProps) {
  const shouldReduceMotion = useReducedMotion()
  const isCurrentMonth = selectedMonth === getCurrentMonthString()
  const isExpense = type === 'expense'

  // Sparkline
  const sparklinePath = useMemo(
    () => generateSparklinePath(dailyValues, { width: SPARK_WIDTH, height: SPARK_HEIGHT, smooth: true }),
    [dailyValues],
  )
  const sparklineArea = useMemo(
    () => generateSparklineAreaPath(dailyValues, { width: SPARK_WIDTH, height: SPARK_HEIGHT, smooth: true }),
    [dailyValues],
  )

  // Savings rate
  const savingsRate = useMemo(() => {
    if (income === 0) return 0
    return Math.max(0, ((income - expense) / income) * 100)
  }, [income, expense])

  // Trend colors (지출: 증가=나쁨, 감소=좋음 / 수입: 반대)
  const trendIsGood = isExpense ? trend.direction === 'down' : trend.direction === 'up'
  const trendIsBad = isExpense ? trend.direction === 'up' : trend.direction === 'down'

  const gradientId = `ledger-hero-grad-${type}`

  return (
    <section
      aria-labelledby="ledger-hero-label"
      className="relative overflow-hidden rounded-3xl bg-surface-primary shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
      style={{ boxShadow: 'inset 0 0 0 1px var(--border-default), 0 2px 12px rgba(0,0,0,0.04)' }}
    >
      {/* Month Navigator (top row) */}
      <div className="flex items-center justify-between px-4 sm:px-5 pt-4 pb-2">
        <motion.button
          type="button"
          onClick={() => onMonthChange(getPreviousMonth(selectedMonth))}
          whileTap={shouldReduceMotion ? undefined : { scale: 0.9 }}
          className="w-9 h-9 rounded-full flex items-center justify-center text-sub hover:text-heading hover:bg-[var(--hover-bg)] transition-colors"
          aria-label="이전 달"
        >
          <ChevronLeft className="w-4 h-4" />
        </motion.button>

        <div className="flex items-center gap-2">
          <h2 className="text-body3 font-bold text-heading tabular-nums">
            {formatMonthLabel(selectedMonth)}
          </h2>
          {!isCurrentMonth && (
            <motion.button
              type="button"
              onClick={() => onMonthChange(getCurrentMonthString())}
              whileTap={shouldReduceMotion ? undefined : { scale: 0.94 }}
              className="text-[11px] px-2 py-0.5 rounded-full bg-[color:var(--color-primary-50)] text-[color:var(--color-primary-700)] dark:bg-[color:var(--color-primary-900)]/30 dark:text-[color:var(--color-primary-300)] font-semibold hover:brightness-95 transition-all"
            >
              오늘
            </motion.button>
          )}
        </div>

        <motion.button
          type="button"
          onClick={() => onMonthChange(getNextMonth(selectedMonth))}
          whileTap={shouldReduceMotion ? undefined : { scale: 0.9 }}
          className="w-9 h-9 rounded-full flex items-center justify-center text-sub hover:text-heading hover:bg-[var(--hover-bg)] transition-colors"
          aria-label="다음 달"
        >
          <ChevronRight className="w-4 h-4" />
        </motion.button>
      </div>

      {/* Focal block */}
      <div className="px-4 sm:px-6 pb-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={selectedMonth}
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={{ duration: durations.base, ease: easeOutExpo }}
            aria-live="polite"
          >
            <p id="ledger-hero-label" className="text-caption text-sub font-semibold tracking-wide mb-1.5 uppercase opacity-80">
              {isExpense ? '이번 달 지출' : '이번 달 수입'}
            </p>

            {/* Hero Amount */}
            <div className="flex items-baseline gap-2 flex-wrap">
              <Amount
                as="span"
                value={totalAmount}
                size="display"
                className={clsx(
                  'font-extrabold tracking-tight tabular-nums',
                  isExpense ? 'text-value-negative' : 'text-value-positive',
                )}
                unit=""
              />
              <span
                className={clsx(
                  'font-bold tabular-nums',
                  isExpense ? 'text-value-negative/80' : 'text-value-positive/80',
                )}
                style={{ fontSize: 'clamp(18px, 4vw, 22px)' }}
              >
                원
              </span>
            </div>

            {/* Trend badge */}
            {trend.percent !== null && (
              <div className="mt-1.5">
                <motion.span
                  initial={shouldReduceMotion ? undefined : { scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={springSnappy}
                  className={clsx(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-caption font-bold tabular-nums',
                    trendIsBad && 'bg-status-danger-soft text-status-danger',
                    trendIsGood && 'bg-status-success-soft text-status-success',
                    !trendIsBad && !trendIsGood && 'bg-surface-tertiary text-sub',
                  )}
                >
                  {trend.direction === 'up' && <TrendingUp className="w-3 h-3" />}
                  {trend.direction === 'down' && <TrendingDown className="w-3 h-3" />}
                  {trend.direction === 'flat' && <Minus className="w-3 h-3" />}
                  {trend.percent > 0 ? '+' : ''}{trend.percent.toFixed(1)}% <span className="opacity-70 font-medium">전월 대비</span>
                </motion.span>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Sparkline (최근 30일) */}
      {dailyValues.length > 1 && totalAmount > 0 && (
        <div className="relative w-full h-[60px] -mt-4 pointer-events-none" aria-hidden="true">
          <svg
            viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
            preserveAspectRatio="none"
            className="w-full h-full"
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={isExpense ? 'var(--value-negative)' : 'var(--value-positive)'} stopOpacity="0.22" />
                <stop offset="100%" stopColor={isExpense ? 'var(--value-negative)' : 'var(--value-positive)'} stopOpacity="0" />
              </linearGradient>
            </defs>
            <motion.path
              d={sparklineArea}
              fill={`url(#${gradientId})`}
              initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            />
            <motion.path
              d={sparklinePath}
              fill="none"
              stroke={isExpense ? 'var(--value-negative)' : 'var(--value-positive)'}
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={shouldReduceMotion ? undefined : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1, ease: easeOutExpo, delay: 0.3 }}
            />
          </svg>
        </div>
      )}

      {/* Secondary metrics row */}
      <div className="flex items-center justify-between gap-4 px-4 sm:px-6 py-3 border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-secondary)]/50">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-sub mb-0.5">수입</p>
          <Amount
            as="p"
            value={income}
            size="emphasis"
            className="text-value-positive font-bold truncate"
            unit=""
          />
        </div>
        <div className="w-px h-8 bg-[color:var(--border-subtle)]" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-sub mb-0.5">지출</p>
          <Amount
            as="p"
            value={expense}
            size="emphasis"
            className="text-value-negative font-bold truncate"
            unit=""
          />
        </div>
        <div className="w-px h-8 bg-[color:var(--border-subtle)]" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-sub mb-0.5">저축률</p>
          <p className={clsx(
            'text-body3-semi font-bold tabular-nums',
            savingsRate >= 30 ? 'text-value-positive' : savingsRate >= 10 ? 'text-heading' : 'text-value-negative',
          )}>
            {savingsRate.toFixed(1)}%
          </p>
        </div>
      </div>
    </section>
  )
}
