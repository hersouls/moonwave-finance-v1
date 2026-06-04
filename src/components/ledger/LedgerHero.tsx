import { useMemo } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus, Sparkles } from 'lucide-react'
import { clsx } from 'clsx'
import { formatMonthLabel, getPreviousMonth, getNextMonth, getCurrentMonthString } from '@/lib/dateUtils'
import { generateSparklinePath, generateSparklineAreaPath } from '@/utils/sparkline'
import { formatKoreanUnit } from '@/utils/format'
import { useCountUp } from '@/hooks/useCountUp'
import { useSettingsStore } from '@/stores/settingsStore'
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
const SPARK_HEIGHT = 64
const ARC_SIZE = 36
const ARC_STROKE = 4
const ARC_RADIUS = (ARC_SIZE - ARC_STROKE) / 2
const ARC_CIRC = 2 * Math.PI * ARC_RADIUS

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
  const hideAmounts = useSettingsStore((s) => !!s.settings.hideAmounts)
  const isCurrentMonth = selectedMonth === getCurrentMonthString()
  const isExpense = type === 'expense'

  // Animated count-up for hero amount (respects reduced motion via hook)
  const animatedAmount = useCountUp(totalAmount, 900)

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
    return Math.max(0, Math.min(100, ((income - expense) / income) * 100))
  }, [income, expense])

  // Trend semantics (expense: down=good / income: up=good)
  const trendIsGood = isExpense ? trend.direction === 'down' : trend.direction === 'up'
  const trendIsBad = isExpense ? trend.direction === 'up' : trend.direction === 'down'

  const gradientId = `ledger-hero-grad-${type}`
  const glowFilterId = `ledger-hero-glow-${type}`

  // Aurora mesh — type-aware (지출은 핑크/레드, 수입은 그린/티얼)
  const auroraPrimary = isExpense ? 'oklch(0.68 0.20 25 / 0.18)' : 'oklch(0.72 0.18 155 / 0.18)'
  const auroraSecondary = isExpense ? 'oklch(0.78 0.16 340 / 0.14)' : 'oklch(0.74 0.14 195 / 0.14)'
  const auroraTertiary = 'oklch(0.62 0.18 250 / 0.10)'
  const valueColorVar = isExpense ? 'var(--value-negative)' : 'var(--value-positive)'

  // Savings arc color
  const arcColor = savingsRate >= 30
    ? 'var(--value-positive)'
    : savingsRate >= 10
      ? 'var(--color-primary-500)'
      : 'var(--value-negative)'
  const arcDashOffset = ARC_CIRC * (1 - savingsRate / 100)

  return (
    <section
      aria-labelledby="ledger-hero-label"
      className="relative overflow-hidden rounded-3xl bg-surface-primary"
      style={{
        boxShadow:
          'inset 0 0 0 1px var(--border-default), var(--shadow-1)',
      }}
    >
      {/* ─── Aurora gradient mesh (decorative) ───────── */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(circle at 18% 12%, ${auroraPrimary}, transparent 42%),
            radial-gradient(circle at 88% 8%, ${auroraSecondary}, transparent 38%),
            radial-gradient(circle at 50% 110%, ${auroraTertiary}, transparent 55%)
          `,
        }}
      />
      {/* Subtle inner top highlight (glass-like depth) */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)' }}
      />

      {/* ─── Month Navigator ─────────────────────────── */}
      <div className="relative flex items-center justify-between px-4 sm:px-5 pt-4 pb-1.5">
        <motion.button
          type="button"
          onClick={() => onMonthChange(getPreviousMonth(selectedMonth))}
          whileTap={shouldReduceMotion ? undefined : { scale: 0.9 }}
          className="touch-target rounded-full text-sub hover:text-heading hover:bg-[var(--hover-bg)] transition-colors"
          aria-label="이전 달"
        >
          <ChevronLeft className="w-4 h-4" />
        </motion.button>

        <div className="flex items-center gap-2">
          <h2 className="text-body3-bold text-heading tabular-nums">
            {formatMonthLabel(selectedMonth)}
          </h2>
          <AnimatePresence>
            {!isCurrentMonth && (
              <motion.button
                key="today-pill"
                type="button"
                onClick={() => onMonthChange(getCurrentMonthString())}
                initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.7 }}
                transition={springSnappy}
                whileTap={shouldReduceMotion ? undefined : { scale: 0.94 }}
                className="text-label3-medium leading-none px-2.5 py-0.5 rounded-full bg-[color:var(--color-primary-50)] text-[color:var(--color-primary-700)] dark:bg-[color:var(--color-primary-900)]/30 dark:text-[color:var(--color-primary-300)] font-semibold ring-1 ring-[color:var(--color-primary-200)] dark:ring-[color:var(--color-primary-800)] hover:brightness-95 transition-all"
              >
                오늘
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        <motion.button
          type="button"
          onClick={() => onMonthChange(getNextMonth(selectedMonth))}
          whileTap={shouldReduceMotion ? undefined : { scale: 0.9 }}
          className="touch-target rounded-full text-sub hover:text-heading hover:bg-[var(--hover-bg)] transition-colors"
          aria-label="다음 달"
        >
          <ChevronRight className="w-4 h-4" />
        </motion.button>
      </div>

      {/* ─── Focal block ─────────────────────────────── */}
      <div className="relative px-4 sm:px-6 pt-1 pb-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={selectedMonth}
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{ duration: durations.base, ease: easeOutExpo }}
            aria-live="polite"
          >
            <div className="flex items-center gap-1.5 mb-2">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: `color-mix(in srgb, ${valueColorVar} 70%, transparent)` }}
                aria-hidden="true"
              />
              <p
                id="ledger-hero-label"
                className="text-caption leading-none font-bold tracking-[0.14em] uppercase"
                style={{ color: `color-mix(in srgb, ${valueColorVar} 75%, var(--text-sub))` }}
              >
                {isCurrentMonth ? '이번 달' : formatMonthLabel(selectedMonth)} {isExpense ? '지출' : '수입'}
              </p>
            </div>

            {/* Hero Amount — animated count-up */}
            <div className="flex items-baseline gap-2 flex-wrap">
              <span
                className={clsx(
                  'text-financial-fluid font-extrabold tracking-tight tabular-nums',
                  isExpense ? 'text-value-negative' : 'text-value-positive',
                )}
                style={{
                  textShadow: `0 1px 2px color-mix(in srgb, ${valueColorVar} 18%, transparent)`,
                }}
              >
                {hideAmounts ? '••••••' : animatedAmount.toLocaleString('ko-KR')}
              </span>
              <span
                className={clsx(
                  'text-h3-fluid font-bold tabular-nums',
                  isExpense ? 'text-value-negative/80' : 'text-value-positive/80',
                )}
              >
                원
              </span>
            </div>

            {/* Trend + context row */}
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              {trend.percent !== null ? (
                <motion.span
                  initial={shouldReduceMotion ? undefined : { scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={springSnappy}
                  className={clsx(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-caption font-bold tabular-nums ring-1',
                    trendIsBad && 'bg-status-danger-soft text-status-danger ring-[color:var(--status-danger)]/15',
                    trendIsGood && 'bg-status-success-soft text-status-success ring-[color:var(--status-success)]/15',
                    !trendIsBad && !trendIsGood && 'bg-surface-tertiary text-sub ring-base',
                  )}
                >
                  {trend.direction === 'up' && <TrendingUp className="w-3 h-3" />}
                  {trend.direction === 'down' && <TrendingDown className="w-3 h-3" />}
                  {trend.direction === 'flat' && <Minus className="w-3 h-3" />}
                  {trend.percent > 0 ? '+' : ''}{trend.percent.toFixed(1)}%
                  <span className="opacity-70 font-medium">전월 대비</span>
                </motion.span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-caption font-semibold bg-surface-tertiary text-disabled">
                  <Sparkles className="w-3 h-3" />
                  새로운 달
                </span>
              )}

              {/* Daily average (in current month) */}
              {totalAmount > 0 && dailyValues.length > 0 && (
                <span className="text-caption text-sub tabular-nums font-medium">
                  일평균 <span className="text-body font-bold">{formatKoreanUnit(Math.round(totalAmount / Math.max(1, dailyValues.filter(v => v > 0).length)))}원</span>
                </span>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ─── Sparkline with glow filter ──────────────── */}
      {dailyValues.length > 1 && totalAmount > 0 && (
        <div className="relative w-full h-[64px] -mt-3 pointer-events-none" aria-hidden="true">
          <svg
            viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
            preserveAspectRatio="none"
            className="w-full h-full"
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={valueColorVar} stopOpacity="0.28" />
                <stop offset="100%" stopColor={valueColorVar} stopOpacity="0" />
              </linearGradient>
              <filter id={glowFilterId} x="-10%" y="-50%" width="120%" height="200%">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
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
              stroke={valueColorVar}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              filter={`url(#${glowFilterId})`}
              initial={shouldReduceMotion ? undefined : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.1, ease: easeOutExpo, delay: 0.3 }}
            />
          </svg>
        </div>
      )}

      {/* ─── Secondary metrics row ──────────────────── */}
      <div
        className="relative flex items-center justify-between gap-4 px-4 sm:px-6 py-3.5 border-t"
        style={{
          borderColor: 'var(--border-subtle)',
          background: 'linear-gradient(180deg, color-mix(in srgb, var(--surface-secondary) 50%, transparent) 0%, transparent 100%)',
          backdropFilter: 'blur(4px)',
        }}
      >
        <Metric label="수입" value={income} colorClass="text-value-positive" hidden={hideAmounts} />
        <Divider />
        <Metric label="지출" value={expense} colorClass="text-value-negative" hidden={hideAmounts} />
        <Divider />

        {/* Savings rate with mini arc */}
        <div className="flex-1 min-w-0">
          <p className="text-caption text-sub mb-0.5 font-medium">저축률</p>
          <div className="flex items-center gap-2">
            <svg width={ARC_SIZE} height={ARC_SIZE} viewBox={`0 0 ${ARC_SIZE} ${ARC_SIZE}`} className="flex-shrink-0 -rotate-90">
              <circle
                cx={ARC_SIZE / 2}
                cy={ARC_SIZE / 2}
                r={ARC_RADIUS}
                fill="none"
                stroke="var(--border-subtle)"
                strokeWidth={ARC_STROKE}
              />
              <motion.circle
                cx={ARC_SIZE / 2}
                cy={ARC_SIZE / 2}
                r={ARC_RADIUS}
                fill="none"
                stroke={arcColor}
                strokeWidth={ARC_STROKE}
                strokeLinecap="round"
                strokeDasharray={ARC_CIRC}
                initial={shouldReduceMotion ? { strokeDashoffset: arcDashOffset } : { strokeDashoffset: ARC_CIRC }}
                animate={{ strokeDashoffset: arcDashOffset }}
                transition={{ duration: 0.9, ease: easeOutExpo, delay: 0.4 }}
                style={{ filter: `drop-shadow(0 0 4px color-mix(in srgb, ${arcColor} 40%, transparent))` }}
              />
            </svg>
            <p
              className={clsx(
                'text-body3-bold tabular-nums',
                savingsRate >= 30 ? 'text-value-positive' : savingsRate >= 10 ? 'text-heading' : 'text-value-negative',
              )}
            >
              {savingsRate.toFixed(0)}%
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function Metric({ label, value, colorClass, hidden }: { label: string; value: number; colorClass: string; hidden: boolean }) {
  const animated = useCountUp(value, 900)
  return (
    <div className="flex-1 min-w-0">
      <p className="text-caption text-sub mb-0.5 font-medium">{label}</p>
      <p className={clsx('text-body3-bold tabular-nums truncate', colorClass)}>
        {hidden ? '••••' : formatKoreanUnit(animated)}
      </p>
    </div>
  )
}

function Divider() {
  return <div className="w-px h-8 bg-[color:var(--border-subtle)]" aria-hidden="true" />
}
