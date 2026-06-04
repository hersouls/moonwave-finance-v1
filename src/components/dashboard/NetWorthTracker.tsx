import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { TrendingUp, TrendingDown, Activity } from 'lucide-react'
import { clsx } from 'clsx'
import { Amount } from '@/components/ui/Amount'
import { Sparkline } from '@/components/ui/Sparkline'
import { useAssetStats, useNetWorthSeries } from '@/hooks/useAssetStats'
import { useSettingsStore } from '@/stores/settingsStore'
import { formatChange, formatChangeUnit } from '@/utils/format'
import { getPositiveColor, getNegativeColor } from '@/lib/chartConfig'
import { springSnappy } from '@/lib/motionConfig'

const PERIODS = [
  { days: 30, label: '30일' },
  { days: 90, label: '90일' },
  { days: 180, label: '180일' },
] as const

/**
 * 자산증식 추세 — the core net-worth tracker. Surfaces day-over-day net worth
 * change, the period trend (forward-fill), the growth rate (%), and the
 * wealth-accumulation slope (avg KRW/day). All forward-filled so each day's
 * value carries from the previous record.
 */
export function NetWorthTracker() {
  const [days, setDays] = useState<number>(90)
  const reduce = useReducedMotion()
  const stats = useAssetStats()
  const { change, growthRatePct, dailySlope, chart, todayIdx } = useNetWorthSeries(days, days)
  const hideAmounts = useSettingsStore((s) => !!s.settings.hideAmounts)

  const daily = stats.dailyChange
  const dailyGood = daily >= 0
  const periodGood = change >= 0
  const trend = chart.map((p) => p.value)

  const sparkColor = periodGood ? getPositiveColor() : getNegativeColor()

  return (
    <div className="card-base relative overflow-hidden rounded-2xl p-5 sm:p-6">
      <div className="relative">
        {/* Header */}
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 text-body3-semi text-sub">
            <Activity className="h-4 w-4 text-[color:var(--color-primary-500)]" /> 자산증식 추세
          </span>
          <div className="relative inline-flex rounded-lg bg-[color:var(--surface-tertiary)] p-0.5">
            {PERIODS.map((p) => {
              const active = days === p.days
              return (
                <motion.button
                  key={p.days}
                  type="button"
                  onClick={() => setDays(p.days)}
                  aria-pressed={active}
                  className={clsx('relative z-10 rounded-md px-2.5 py-1 text-label3-medium transition-colors', active ? 'text-heading' : 'text-sub hover:text-heading')}
                  whileTap={reduce ? undefined : { scale: 0.97 }}
                >
                  {active && (
                    <motion.span
                      layoutId="networth-period-pill"
                      className="absolute inset-0 -z-10 rounded-md bg-[color:var(--surface-primary)] shadow-[var(--shadow-1)]"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                  {p.label}
                </motion.button>
              )
            })}
          </div>
        </div>

        {/* Net worth + day-over-day */}
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <span className="text-body3 text-sub">순자산</span>
            <Amount value={stats.netWorth} format="korean" size="display" className={clsx('block text-heading', hideAmounts && 'amount-masked')} />
            <span className={clsx('mt-1 inline-flex items-center gap-1 text-body3 tabular-nums', dailyGood ? 'value-positive' : 'value-negative')}>
              {dailyGood ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              {formatChange(daily)} <span className="text-disabled">어제 대비</span>
            </span>
          </div>
        </div>

        {/* Trend (실선=과거, 점선=미래 예측) */}
        {trend.length >= 3 && (
          <div className="mt-3">
            <Sparkline data={trend} width={600} height={64} color={sparkColor} strokeWidth={2} className="h-16 w-full" dashFrom={todayIdx} />
            <div className="mt-1 flex justify-end gap-3 text-caption text-disabled">
              <span className="flex items-center gap-1"><span className="inline-block h-px w-3 bg-[color:var(--border-strong)]" /> 과거 {days}일</span>
              <span className="flex items-center gap-1"><span className="inline-block h-px w-3 border-t border-dashed border-[color:var(--border-strong)]" /> 예측 {days}일</span>
            </div>
          </div>
        )}

        {/* Growth rate + slope (자산증식 기울기) */}
        <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[color:var(--border-default)] pt-3">
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={springSnappy}>
            <span className="block text-caption text-sub">{days}일 증가율</span>
            <span className={clsx('text-title2 tabular-nums', periodGood ? 'value-positive' : 'value-negative')}>
              {periodGood ? '+' : ''}{growthRatePct.toFixed(1)}%
            </span>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springSnappy, delay: 0.05 }}>
            <span className="block text-caption text-sub">일평균 (기울기)</span>
            <span className={clsx('text-title2 tabular-nums', dailySlope >= 0 ? 'value-positive' : 'value-negative', hideAmounts && 'amount-masked')}>
              {formatChangeUnit(Math.round(dailySlope))}<span className="text-body3 text-disabled">/일</span>
            </span>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
