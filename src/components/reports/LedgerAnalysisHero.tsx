import { motion, useReducedMotion } from 'framer-motion'
import { TrendingDown, TrendingUp, Minus, Wallet, PiggyBank, ArrowDownCircle } from 'lucide-react'
import { clsx } from 'clsx'
import { useCountUp } from '@/hooks/useCountUp'
import { Sparkline } from '@/components/ui/Sparkline'
import { formatKoreanUnit } from '@/utils/format'
import { springGentle, easeOutExpo, durations } from '@/lib/motionConfig'
import type { LedgerAnalysis } from '@/hooks/useLedgerAnalysis'

interface Props {
  analysis: LedgerAnalysis
}

/**
 * Three-card hero summarizing the ledger month at a glance: total expense,
 * total income, and net savings. Each card includes:
 *   • the running figure with count-up animation
 *   • two delta chips (vs previous month, vs 3-month baseline)
 *   • a 6-month sparkline trail so the user instantly sees direction
 *
 * Visuals are entirely composed from Foundation utility classes
 * (.hero-card-soft + variants, typography tokens, radius/shadow tokens) so
 * the look matches anywhere else that adopts the same primitives.
 */
export function LedgerAnalysisHero({ analysis }: Props) {
  const { current, prev, baseline, sparklines } = analysis

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
      <HeroCard
        variant="negative"
        icon={Wallet}
        label="지출"
        value={current.expense}
        prevValue={prev.expense}
        baselineValue={baseline.avgExpense}
        sparkData={sparklines.expense}
        emphasizeIncrease="bad"
      />
      <HeroCard
        variant="positive"
        icon={ArrowDownCircle}
        label="수입"
        value={current.income}
        prevValue={prev.income}
        baselineValue={baseline.avgIncome}
        sparkData={sparklines.income}
        emphasizeIncrease="good"
      />
      <HeroCard
        variant="primary"
        icon={PiggyBank}
        label="순저축"
        value={current.net}
        prevValue={prev.net}
        baselineValue={baseline.avgIncome - baseline.avgExpense}
        sparkData={sparklines.net}
        emphasizeIncrease="good"
        savingsRate={current.savingsRate}
      />
    </div>
  )
}

// ════════════════════════════════════════════════════════
// HeroCard
// ════════════════════════════════════════════════════════

type Variant = 'negative' | 'positive' | 'primary'
type Emphasis = 'good' | 'bad'

const VARIANT_CLASS: Record<Variant, string> = {
  negative: 'hero-card-soft hero-card-soft--negative',
  positive: 'hero-card-soft hero-card-soft--positive',
  primary: 'hero-card-soft hero-card-soft--primary',
}

function HeroCard({
  variant, icon: Icon, label, value, prevValue, baselineValue, sparkData,
  emphasizeIncrease, savingsRate,
}: {
  variant: Variant
  icon: typeof Wallet
  label: string
  value: number
  prevValue: number
  baselineValue: number
  sparkData: number[]
  emphasizeIncrease: Emphasis
  savingsRate?: number | null
}) {
  const shouldReduceMotion = useReducedMotion()
  const animated = useCountUp(value, 700)
  const isNegative = value < 0

  return (
    <motion.div
      initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...springGentle }}
      className={VARIANT_CLASS[variant]}
    >
      {/* Subtle noise overlay for premium texture */}
      <div className="noise-overlay absolute inset-0 opacity-40 pointer-events-none" aria-hidden="true" />

      <div className="relative">
        {/* Header row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="hero-card-soft__icon-frame">
              <Icon className="w-4 h-4" aria-hidden="true" />
            </span>
            <span className="typo-label4 tracking-wide uppercase" style={{ color: 'var(--hero-soft-accent)' }}>
              {label}
            </span>
          </div>
          {savingsRate != null && (
            <span className="hero-card-soft__chip typo-label4">
              저축률 {Math.round(savingsRate * 100)}%
            </span>
          )}
        </div>

        {/* Value */}
        <div className="mt-3">
          <motion.p
            className="typo-display2 text-heading tabular-nums tracking-tight"
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: durations.base, ease: easeOutExpo, delay: 0.06 }}
          >
            {isNegative ? '−' : ''}
            {formatKoreanUnit(Math.abs(animated))}
            <span className="typo-body3-bold text-sub ml-0.5">원</span>
          </motion.p>
        </div>

        {/* Delta chips */}
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <DeltaChip label="전월" current={value} prev={prevValue} emphasis={emphasizeIncrease} />
          <DeltaChip label="3M 평균" current={value} prev={baselineValue} emphasis={emphasizeIncrease} muted />
        </div>

        {/* Sparkline trail (6 months) */}
        {sparkData.length > 1 && (
          <div className="mt-3 -mx-1">
            <Sparkline
              data={sparkData}
              color="var(--hero-soft-accent)"
              height={28}
              className="w-full"
            />
            <p className="typo-label4 text-disabled mt-0.5 px-1 tabular-nums">최근 {sparkData.length}개월</p>
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ────────────────────────────────────────────────────────

function DeltaChip({
  label, current, prev, emphasis, muted,
}: {
  label: string
  current: number
  prev: number
  emphasis: Emphasis
  muted?: boolean
}) {
  const delta = current - prev
  const pct = prev !== 0 ? (delta / Math.abs(prev)) * 100 : current !== 0 ? (current > 0 ? 100 : -100) : 0
  const direction: 'up' | 'down' | 'flat' = Math.abs(pct) < 1 ? 'flat' : pct > 0 ? 'up' : 'down'
  // For expense: up = bad (red); for income/savings: up = good (green)
  const isGood =
    direction === 'flat'
      ? null
      : emphasis === 'good'
        ? direction === 'up'
        : direction === 'down'
  const Icon = direction === 'up' ? TrendingUp : direction === 'down' ? TrendingDown : Minus
  const tone =
    isGood == null
      ? 'text-sub bg-surface-tertiary ring-base'
      : isGood
        ? 'text-status-success bg-status-success-soft ring-status-success/20'
        : 'text-status-danger bg-status-danger-soft ring-status-danger/20'

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 px-2 h-6 rounded-full typo-label4 tabular-nums ring-1',
        tone,
        muted && 'opacity-80',
      )}
    >
      <Icon className="w-2.5 h-2.5" aria-hidden="true" />
      <span className="text-disabled font-semibold mr-0.5">{label}</span>
      {direction === 'flat'
        ? '동일'
        : `${pct > 0 ? '+' : ''}${Math.round(pct)}%`}
    </span>
  )
}
