import { useState } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Activity } from 'lucide-react'
import { clsx } from 'clsx'
import { Amount } from '@/components/ui/Amount'
import { Sparkline } from '@/components/ui/Sparkline'
import { useAssetStats, useNetWorthSeries } from '@/hooks/useAssetStats'
import { useSettingsStore } from '@/stores/settingsStore'
import { formatChange, formatChangeUnit } from '@/utils/format'
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
  const stats = useAssetStats()
  const { change, growthRatePct, dailySlope, chart, todayIdx } = useNetWorthSeries(days, days)
  const hideAmounts = useSettingsStore((s) => !!s.settings.hideAmounts)

  const daily = stats.dailyChange
  const dailyGood = daily >= 0
  const periodGood = change >= 0
  const trend = chart.map((p) => p.value)

  return (
    <div className="hero-gradient noise-overlay hero-shimmer el-glow-primary relative overflow-hidden rounded-2xl p-5 sm:p-6">
      <div className="relative z-10">
        {/* Header */}
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 text-body3 font-semibold text-white/80">
            <Activity className="h-4 w-4" /> 자산증식 추세
          </span>
          <div className="inline-flex rounded-lg bg-white/15 p-0.5 backdrop-blur-sm">
            {PERIODS.map((p) => (
              <button
                key={p.days}
                type="button"
                onClick={() => setDays(p.days)}
                aria-pressed={days === p.days}
                className={clsx('rounded-md px-2.5 py-1 text-label4 font-semibold transition-colors', days === p.days ? 'bg-white/90 text-[color:var(--color-primary-700)]' : 'text-white/70 hover:text-white')}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Net worth + day-over-day */}
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <span className="text-body3 text-white/70">순자산</span>
            <Amount value={stats.netWorth} format="korean" size="display" className={clsx('block text-white', hideAmounts && 'amount-masked')} />
            <span className={clsx('mt-1 inline-flex items-center gap-1 text-body3 tabular-nums', dailyGood ? 'text-value-positive-on-dark' : 'text-value-negative-on-dark')}>
              {dailyGood ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              {formatChange(daily)} <span className="text-white/50">어제 대비</span>
            </span>
          </div>
        </div>

        {/* Trend (실선=과거, 점선=미래 예측) */}
        {trend.length >= 3 && (
          <div className="mt-3">
            <Sparkline data={trend} width={600} height={64} color="rgba(255,255,255,0.92)" strokeWidth={2} className="h-16 w-full" dashFrom={todayIdx} />
            <div className="mt-1 flex justify-end gap-3 text-micro text-white/50">
              <span className="flex items-center gap-1"><span className="inline-block h-px w-3 bg-white/80" /> 과거 {days}일</span>
              <span className="flex items-center gap-1"><span className="inline-block h-px w-3 border-t border-dashed border-white/70" /> 예측 {days}일</span>
            </div>
          </div>
        )}

        {/* Growth rate + slope (자산증식 기울기) */}
        <div className="mt-3 grid grid-cols-2 gap-3 border-t border-white/15 pt-3">
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={springSnappy}>
            <span className="block text-caption text-white/60">{days}일 증가율</span>
            <span className={clsx('text-title2 font-bold tabular-nums', periodGood ? 'text-value-positive-on-dark' : 'text-value-negative-on-dark')}>
              {periodGood ? '+' : ''}{growthRatePct.toFixed(1)}%
            </span>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springSnappy, delay: 0.05 }}>
            <span className="block text-caption text-white/60">일평균 (기울기)</span>
            <span className={clsx('text-title2 font-bold tabular-nums', dailySlope >= 0 ? 'text-value-positive-on-dark' : 'text-value-negative-on-dark', hideAmounts && 'amount-masked')}>
              {formatChangeUnit(Math.round(dailySlope))}<span className="text-body3 text-white/50">/일</span>
            </span>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
