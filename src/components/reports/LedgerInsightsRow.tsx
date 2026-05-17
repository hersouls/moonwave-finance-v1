import { motion, useReducedMotion } from 'framer-motion'
import {
  TrendingUp, TrendingDown, Sparkles, BadgeAlert,
  Wallet, PiggyBank, Repeat, Undo2, Flame, ChevronRight,
} from 'lucide-react'
import { clsx } from 'clsx'
import { staggerContainer, staggerItem, springSnappy } from '@/lib/motionConfig'
import type { Insight, InsightAnchor, InsightIcon, InsightLevel } from '@/hooks/useLedgerAnalysis'

interface Props {
  insights: Insight[]
  onAnchor?: (anchor: InsightAnchor) => void
}

const ICON_MAP: Record<InsightIcon, typeof TrendingUp> = {
  'trending-up': TrendingUp,
  'trending-down': TrendingDown,
  sparkles: Sparkles,
  'badge-alert': BadgeAlert,
  wallet: Wallet,
  piggy: PiggyBank,
  repeat: Repeat,
  undo: Undo2,
  flame: Flame,
}

const LEVEL_TONE: Record<InsightLevel, { ring: string; iconBg: string; iconColor: string; titleColor: string }> = {
  positive: {
    ring: 'ring-status-success/22',
    iconBg: 'bg-status-success-soft',
    iconColor: 'text-status-success',
    titleColor: 'text-heading',
  },
  warning: {
    ring: 'ring-status-danger/22',
    iconBg: 'bg-status-danger-soft',
    iconColor: 'text-status-danger',
    titleColor: 'text-heading',
  },
  neutral: {
    ring: 'ring-base',
    iconBg: 'bg-surface-tertiary',
    iconColor: 'text-sub',
    titleColor: 'text-heading',
  },
}

/**
 * Auto-generated insight chips for the current month. Surface anomalies and
 * patterns the user would otherwise have to derive from raw charts — e.g.,
 * spend vs. baseline, standout categories, new merchants, refund total,
 * subscription share, end-of-month projection. Each chip links to the
 * relevant panel below via the `onAnchor` callback.
 */
export function LedgerInsightsRow({ insights, onAnchor }: Props) {
  const shouldReduceMotion = useReducedMotion()

  if (insights.length === 0) return null

  return (
    <motion.div
      variants={shouldReduceMotion ? undefined : staggerContainer}
      initial="hidden"
      animate="show"
    >
      <div className="flex items-center gap-1.5 mb-2.5">
        <Sparkles className="w-3.5 h-3.5 text-[color:var(--color-primary-500)]" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-sub">
          이번 달 인사이트
        </span>
        <span className="text-[11px] font-normal text-disabled normal-case">
          · {insights.length}건 감지됨
        </span>
      </div>
      <div className="flex gap-2.5 overflow-x-auto scrollbar-none -mx-1 px-1 -my-1 py-1 sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:overflow-visible">
        {insights.map((it) => {
          const Icon = ICON_MAP[it.icon] ?? Sparkles
          const tone = LEVEL_TONE[it.level]
          const clickable = !!onAnchor && !!it.anchor
          return (
            <motion.button
              key={it.id}
              type="button"
              variants={shouldReduceMotion ? undefined : staggerItem}
              whileTap={shouldReduceMotion || !clickable ? undefined : { scale: 0.98 }}
              transition={springSnappy}
              onClick={() => clickable && it.anchor && onAnchor!(it.anchor)}
              disabled={!clickable}
              aria-label={`${it.title}${it.detail ? ` — ${it.detail}` : ''}`}
              className={clsx(
                'group flex-shrink-0 min-w-[240px] sm:min-w-0 text-left rounded-2xl bg-surface-primary ring-1 px-3 py-2.5 transition-all',
                tone.ring,
                clickable ? 'hover:bg-[var(--hover-bg)] hover:shadow-[0_2px_10px_rgba(0,0,0,0.05)] cursor-pointer' : 'cursor-default',
              )}
            >
              <div className="flex items-start gap-2.5">
                <div className={clsx('w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0', tone.iconBg)}>
                  <Icon className={clsx('w-4 h-4', tone.iconColor)} aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={clsx('text-caption font-bold leading-snug', tone.titleColor)}>
                    {it.title}
                  </p>
                  {it.detail && (
                    <p className="text-[10.5px] text-sub mt-0.5 leading-snug truncate">
                      {it.detail}
                    </p>
                  )}
                </div>
                {clickable && (
                  <ChevronRight className="w-3.5 h-3.5 text-disabled flex-shrink-0 mt-1 group-hover:translate-x-0.5 transition-transform" />
                )}
              </div>
            </motion.button>
          )
        })}
      </div>
    </motion.div>
  )
}
