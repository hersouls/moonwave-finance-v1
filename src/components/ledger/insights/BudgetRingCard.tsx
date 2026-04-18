import { motion, useReducedMotion } from 'framer-motion'
import { PiggyBank } from 'lucide-react'
import { clsx } from 'clsx'
import { describeArc } from '@/utils/svgArc'
import { Amount } from '@/components/ui/Amount'
import type { BudgetStatus } from '@/hooks/useBudgetStatus'
import { easeOutExpo } from '@/lib/motionConfig'

interface BudgetRingCardProps {
  status: BudgetStatus
  onClick?: () => void
  className?: string
}

const RING_STATUS_COLORS = {
  safe: 'var(--value-positive)',
  warning: 'oklch(0.75 0.18 70)',      // amber
  critical: 'oklch(0.68 0.20 45)',     // orange
  exceeded: 'var(--value-negative)',
} as const

const STATUS_LABEL = {
  safe: '안정',
  warning: '주의',
  critical: '경고',
  exceeded: '초과',
}

const CX = 50
const CY = 50
const R = 40
const ARC_START = -135 // 시작 각도
const ARC_END = 135    // 끝 각도 (270° arc)

export function BudgetRingCard({ status, onClick, className }: BudgetRingCardProps) {
  const shouldReduceMotion = useReducedMotion()
  const {
    totalBudget, remaining, percentUsed, daysRemaining, status: level,
  } = status

  const color = RING_STATUS_COLORS[level]
  // 0-100% → arc 각도 매핑
  const clampedPercent = Math.min(100, Math.max(0, percentUsed))
  const arcProgress = clampedPercent / 100
  const trackArc = describeArc(CX, CY, R, ARC_START, ARC_END)
  const progressEndAngle = ARC_START + (ARC_END - ARC_START) * arcProgress
  const progressArc = describeArc(CX, CY, R, ARC_START, progressEndAngle)

  const Tag = onClick ? motion.button : motion.div
  const tagProps = onClick
    ? {
        type: 'button' as const,
        onClick,
        whileHover: shouldReduceMotion ? undefined : { y: -2 },
        whileTap: shouldReduceMotion ? undefined : { scale: 0.98 },
      }
    : {}

  if (totalBudget === 0) {
    return (
      <Tag
        {...tagProps}
        className={clsx(
          'flex-shrink-0 w-[180px] rounded-2xl bg-surface-primary p-4 text-left',
          'hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] transition-all',
          className,
        )}
        style={{
          boxShadow: 'inset 0 0 0 1px var(--border-default), 0 1px 3px rgba(0,0,0,0.04)',
        }}
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-[color:var(--color-primary-50)] dark:bg-[color:var(--color-primary-900)]/30 flex items-center justify-center">
            <PiggyBank className="w-3.5 h-3.5 text-[color:var(--color-primary-600)] dark:text-[color:var(--color-primary-300)]" />
          </div>
          <span className="text-caption text-sub font-semibold">예산</span>
        </div>
        <p className="text-body3 text-heading font-bold mb-1">설정되지 않음</p>
        <p className="text-[11px] text-sub">설정에서 월 예산을 지정해보세요</p>
      </Tag>
    )
  }

  return (
    <Tag
      {...tagProps}
      className={clsx(
        'flex-shrink-0 w-[180px] rounded-2xl bg-surface-primary p-4 text-left',
        'hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] transition-all',
        className,
      )}
      style={{
        boxShadow: 'inset 0 0 0 1px var(--border-default), 0 1px 3px rgba(0,0,0,0.04)',
      }}
      aria-label={`예산 ${percentUsed.toFixed(0)}% 소진, 남은 ${daysRemaining}일`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[color:var(--color-primary-50)] dark:bg-[color:var(--color-primary-900)]/30 flex items-center justify-center">
            <PiggyBank className="w-3.5 h-3.5 text-[color:var(--color-primary-600)] dark:text-[color:var(--color-primary-300)]" />
          </div>
          <span className="text-caption text-sub font-semibold">예산</span>
        </div>
        <span
          className="text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums"
          style={{ backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`, color }}
        >
          {STATUS_LABEL[level]}
        </span>
      </div>

      {/* SVG Ring */}
      <div className="relative flex items-center justify-center my-1">
        <svg viewBox="0 0 100 100" className="w-[100px] h-[72px]" aria-hidden="true">
          {/* Track */}
          <path
            d={trackArc}
            fill="none"
            stroke="var(--surface-tertiary)"
            strokeWidth={8}
            strokeLinecap="round"
          />
          {/* Progress */}
          <motion.path
            d={progressArc}
            fill="none"
            stroke={color}
            strokeWidth={8}
            strokeLinecap="round"
            initial={shouldReduceMotion ? undefined : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.1, ease: easeOutExpo, delay: 0.1 }}
          />
        </svg>
        {/* 중앙 % */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pb-1">
          <span className="text-title2 font-extrabold text-heading tabular-nums leading-none">
            {percentUsed.toFixed(0)}%
          </span>
        </div>
      </div>

      {/* 남은 금액 + 일수 */}
      <div className="mt-2">
        <div className="flex items-baseline justify-between gap-1">
          <span className="text-[11px] text-sub">남은 금액</span>
          <Amount
            value={Math.max(0, remaining)}
            size="caption"
            className={clsx(
              'font-bold tabular-nums',
              remaining < 0 ? 'text-value-negative' : 'text-heading',
            )}
            unit=""
          />
        </div>
        <p className="text-[10px] text-disabled mt-0.5 tabular-nums">{daysRemaining}일 남음</p>
      </div>
    </Tag>
  )
}
