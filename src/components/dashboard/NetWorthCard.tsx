import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { clsx } from 'clsx'
import { motion, useSpring, useTransform, useReducedMotion } from 'framer-motion'
import { useEffect } from 'react'
import { formatKoreanUnit, formatChangeUnit } from '@/utils/format'
import type { AssetStats } from '@/lib/types'

interface NetWorthCardProps {
  stats: AssetStats
}

function AnimatedAmount({ value }: { value: number }) {
  const shouldReduceMotion = useReducedMotion()
  const spring = useSpring(0, shouldReduceMotion ? { duration: 0 } : { stiffness: 60, damping: 20, mass: 1 })
  const display = useTransform(spring, (v) => formatKoreanUnit(Math.round(v)))

  useEffect(() => {
    spring.set(value)
  }, [value, spring])

  return <motion.span>{display}</motion.span>
}

function TrendIcon({ value, className }: { value: number; className?: string }) {
  const isPositive = value > 0
  const isNegative = value < 0

  const Icon = isPositive ? TrendingUp : isNegative ? TrendingDown : Minus
  const color = isPositive
    ? 'text-emerald-300'
    : isNegative
      ? 'text-red-300'
      : 'text-white/50'

  return (
    <motion.span
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 15 }}
      className={className}
    >
      <Icon className={clsx('w-4 h-4', color)} />
    </motion.span>
  )
}

export function NetWorthCard({ stats }: NetWorthCardProps) {
  const { netWorth, dailyChange, monthlyChange } = stats
  const isPositiveDaily = dailyChange > 0
  const isNegativeDaily = dailyChange < 0
  const isPositiveMonthly = monthlyChange > 0
  const isNegativeMonthly = monthlyChange < 0

  return (
    <motion.div
      className="hero-gradient noise-overlay hero-shimmer rounded-2xl p-6 relative overflow-hidden"
      style={{ boxShadow: '0 8px 32px var(--glow-primary)' }}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
    >
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-1">
          <span className="text-body3 text-white/70">순자산</span>
        </div>
        <p className="text-3xl lg:text-4xl font-bold text-white tabular-nums tracking-tight">
          <AnimatedAmount value={netWorth} />
          <span className="text-lg text-white/50 ml-1">원</span>
        </p>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
          <div className="flex items-center gap-1.5">
            <TrendIcon value={dailyChange} />
            <span className={clsx(
              'text-body3 tabular-nums',
              isPositiveDaily && 'text-emerald-300',
              isNegativeDaily && 'text-red-300',
              !isPositiveDaily && !isNegativeDaily && 'text-white/50'
            )}>
              {formatChangeUnit(dailyChange)}
            </span>
            <span className="text-caption text-white/40">오늘</span>
          </div>
          <div className="flex items-center gap-1.5">
            <TrendIcon value={monthlyChange} />
            <span className={clsx(
              'text-body3 tabular-nums',
              isPositiveMonthly && 'text-emerald-300',
              isNegativeMonthly && 'text-red-300',
              !isPositiveMonthly && !isNegativeMonthly && 'text-white/50'
            )}>
              {formatChangeUnit(monthlyChange)}
            </span>
            <span className="text-caption text-white/40">이번달</span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
