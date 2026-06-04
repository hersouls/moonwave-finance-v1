// ─── Subscription Type Breakdown ────────────────────────
//
// Visualizes the breakdown of detected subscriptions by their
// `subscriptionCategory` label (AI / 클라우드 / 통신 / 엔터테인먼트 / …)
// instead of by transaction category. Complements the existing
// transaction-category donut: this view answers "what *kinds* of
// services am I paying for monthly?" using the tag the user opted into
// on each ledger entry.
//
// Layout: a donut on the left, a ranked legend list on the right.
// Hovering either side highlights the other. Premium aesthetic via
// gradient slice fills, animated arc, ring-soft chip rows, and the
// shared SUBSCRIPTION_CATEGORIES palette.

import { useMemo, useState, useId } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Sparkles, ChevronRight } from 'lucide-react'
import { clsx } from 'clsx'
import { SUBSCRIPTION_CATEGORIES } from '@/utils/constants'
import { formatKoreanUnit } from '@/utils/format'
import { getCategoryIcon } from '@/utils/categoryIcons'
import { easeOutExpo, durations } from '@/lib/motionConfig'
import type { SubscriptionCategoryType } from '@/lib/types'
import type { DetectedSubscription } from '@/services/subscriptionDetection'

interface Props {
  detected: DetectedSubscription[]
}

interface BreakdownRow {
  value: SubscriptionCategoryType
  label: string
  icon: string
  color: string
  totalMonthly: number
  count: number
  percent: number
}

function mostFrequent<T extends string>(values: T[]): T | null {
  if (values.length === 0) return null
  const counts = new Map<T, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  let best: T = values[0]
  let bestCount = 0
  for (const [v, c] of counts) {
    if (c > bestCount) { best = v; bestCount = c }
  }
  return best
}

export function SubscriptionTypeBreakdown({ detected }: Props) {
  const shouldReduceMotion = useReducedMotion()
  const [hoveredKey, setHoveredKey] = useState<SubscriptionCategoryType | null>(null)

  const { rows, total } = useMemo<{ rows: BreakdownRow[]; total: number }>(() => {
    const map = new Map<SubscriptionCategoryType, { totalMonthly: number; count: number }>()
    for (const sub of detected) {
      const tags = sub.transactions
        .map((t) => t.subscriptionCategory)
        .filter((c): c is SubscriptionCategoryType => Boolean(c))
      const primary = mostFrequent(tags) ?? 'other'
      const entry = map.get(primary) ?? { totalMonthly: 0, count: 0 }
      entry.totalMonthly += sub.monthlyEquivalent
      entry.count += 1
      map.set(primary, entry)
    }
    // Iterate SUBSCRIPTION_CATEGORIES in their canonical display order; drop
    // empty groups so we don't visualize zero-width slices.
    const all: BreakdownRow[] = SUBSCRIPTION_CATEGORIES
      .filter((c) => map.has(c.value as SubscriptionCategoryType))
      .map((c) => {
        const agg = map.get(c.value as SubscriptionCategoryType)!
        return {
          value: c.value as SubscriptionCategoryType,
          label: c.label,
          icon: c.icon,
          color: c.color,
          totalMonthly: agg.totalMonthly,
          count: agg.count,
          percent: 0, // filled below
        }
      })
    const sum = all.reduce((s, r) => s + r.totalMonthly, 0)
    for (const r of all) r.percent = sum > 0 ? r.totalMonthly / sum : 0
    all.sort((a, b) => b.totalMonthly - a.totalMonthly)
    return { rows: all, total: sum }
  }, [detected])

  if (rows.length === 0) return null

  const featured = hoveredKey
    ? rows.find((r) => r.value === hoveredKey) ?? rows[0]
    : rows[0]

  return (
    <motion.section
      initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: durations.base, ease: easeOutExpo }}
      className="relative overflow-hidden rounded-3xl bg-surface-primary ring-1 ring-base elevation-1"
    >
      {/* Subtle aurora background */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(circle at 12% 0%, color-mix(in srgb, ${featured.color} 14%, transparent), transparent 55%),
            radial-gradient(circle at 90% 12%, color-mix(in srgb, ${featured.color} 8%, transparent), transparent 50%)
          `,
          transition: 'background 360ms ease-out',
        }}
      />

      <div className="relative px-5 pt-5 pb-3 flex items-center gap-2">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: `linear-gradient(135deg, color-mix(in srgb, ${featured.color} 22%, transparent), color-mix(in srgb, ${featured.color} 8%, transparent))`,
            boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${featured.color} 32%, transparent), inset 0 1px 0 0 rgba(255,255,255,0.45)`,
            transition: 'background 360ms ease-out, box-shadow 360ms ease-out',
          }}
        >
          <Sparkles className="w-4 h-4" style={{ color: featured.color, transition: 'color 360ms ease-out' }} />
        </div>
        <div className="min-w-0">
          <h3 className="text-title3 font-extrabold text-heading tracking-tight">구독 분류별 분포</h3>
          <p className="text-label3-medium text-sub mt-0.5 tabular-nums">
            {rows.length}개 분류 · 월 환산 합계 {formatKoreanUnit(total)}원
          </p>
        </div>
      </div>

      <div className="relative grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 px-5 pb-5">
        {/* ─── Donut ─── */}
        <div className="flex justify-center items-center py-2">
          <Donut
            rows={rows}
            hoveredKey={hoveredKey}
            onHover={setHoveredKey}
            featured={featured}
          />
        </div>

        {/* ─── Ranked legend list ─── */}
        <ul className="space-y-1.5">
          {rows.map((row, i) => (
            <BreakdownRowItem
              key={row.value}
              row={row}
              rank={i + 1}
              isActive={hoveredKey === row.value}
              onActivate={(active) => setHoveredKey(active ? row.value : null)}
            />
          ))}
        </ul>
      </div>
    </motion.section>
  )
}

// ════════════════════════════════════════════════════════
// Donut
// ════════════════════════════════════════════════════════

function Donut({
  rows, hoveredKey, onHover, featured,
}: {
  rows: BreakdownRow[]
  hoveredKey: SubscriptionCategoryType | null
  onHover: (k: SubscriptionCategoryType | null) => void
  featured: BreakdownRow
}) {
  const id = useId().replace(/:/g, '')
  const size = 220
  const stroke = 28
  const radius = (size - stroke) / 2 - 4
  const cx = size / 2
  const cy = size / 2
  const circ = 2 * Math.PI * radius

  const arcs = useMemo(() => {
    let acc = 0
    const gap = 2 * Math.PI * (2 / 360) // 2° gap between slices
    return rows.map((r) => {
      const len = Math.max(0, r.percent * 2 * Math.PI - gap)
      const arc = { ...r, offset: acc, length: len }
      acc += r.percent * 2 * Math.PI
      return arc
    })
  }, [rows])

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="block"
      role="img"
      aria-label="구독 분류 도넛 차트"
    >
      <defs>
        <filter id={`type-donut-shadow-${id}`} x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.12" />
        </filter>
      </defs>

      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke="var(--surface-tertiary)"
        strokeWidth={stroke}
        opacity={0.5}
      />

      <g filter={`url(#type-donut-shadow-${id})`}>
        {arcs.map((a) => {
          const isActive = hoveredKey === a.value
          const isDimmed = hoveredKey != null && !isActive
          return (
            <circle
              key={a.value}
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke={a.color}
              strokeWidth={isActive ? stroke + 3 : stroke}
              strokeDasharray={`${(a.length / (2 * Math.PI)) * circ} ${circ}`}
              strokeDashoffset={-(a.offset / (2 * Math.PI)) * circ}
              strokeLinecap="butt"
              opacity={isDimmed ? 0.28 : 1}
              transform={`rotate(-90 ${cx} ${cy})`}
              onMouseEnter={() => onHover(a.value)}
              onMouseLeave={() => onHover(null)}
              style={{
                transition: 'stroke-width 180ms ease-out, opacity 180ms ease-out',
                cursor: 'pointer',
              }}
            />
          )
        })}
      </g>

      {/* Center label */}
      <g>
        <text
          x={cx}
          y={cy - 8}
          textAnchor="middle"
          fontSize="11"
          fontWeight="700"
          fill="var(--text-sub)"
          style={{ letterSpacing: '0.04em' }}
        >
          {featured.label}
        </text>
        <text
          x={cx}
          y={cy + 12}
          textAnchor="middle"
          fontSize="20"
          fontWeight="800"
          fill="var(--text-heading)"
          className="tabular-nums"
        >
          {Math.round(featured.percent * 100)}%
        </text>
        <text
          x={cx}
          y={cy + 28}
          textAnchor="middle"
          fontSize="10"
          fill="var(--text-disabled)"
          className="tabular-nums"
        >
          {formatKoreanUnit(featured.totalMonthly)}원/월
        </text>
      </g>
    </svg>
  )
}

// ════════════════════════════════════════════════════════
// Legend list row
// ════════════════════════════════════════════════════════

function BreakdownRowItem({
  row, rank, isActive, onActivate,
}: {
  row: BreakdownRow
  rank: number
  isActive: boolean
  onActivate: (active: boolean) => void
}) {
  const Icon = getCategoryIcon(row.icon)
  return (
    <li>
      <button
        type="button"
        onMouseEnter={() => onActivate(true)}
        onMouseLeave={() => onActivate(false)}
        onFocus={() => onActivate(true)}
        onBlur={() => onActivate(false)}
        className={clsx(
          'group w-full flex items-center gap-3 rounded-2xl px-3 py-2.5 ring-1 transition-all text-left',
          isActive
            ? 'bg-surface-tertiary ring-[color:var(--border-strong)] elevation-2'
            : 'bg-surface-primary ring-base hover:bg-[var(--hover-bg)]',
        )}
      >
        {/* Rank + iconified avatar */}
        <div className="relative flex-shrink-0">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{
              background: `linear-gradient(135deg, color-mix(in srgb, ${row.color} 22%, transparent), color-mix(in srgb, ${row.color} 8%, transparent))`,
              boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${row.color} 30%, transparent), inset 0 1px 0 0 rgba(255,255,255,0.45)`,
            }}
          >
            <Icon className="w-4 h-4" style={{ color: row.color }} aria-hidden="true" />
          </div>
          <span className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full bg-surface-primary ring-1 ring-base flex items-center justify-center text-label4 leading-none font-extrabold text-sub tabular-nums">
            {rank}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-body3-bold text-heading truncate">{row.label}</p>
            <p className="text-body3 font-extrabold text-heading tabular-nums flex-shrink-0">
              {formatKoreanUnit(row.totalMonthly)}
              <span className="text-label4 leading-none font-bold text-disabled ml-0.5">원</span>
            </p>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-1.5 rounded-full bg-surface-tertiary overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ background: row.color }}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, row.percent * 100)}%` }}
                transition={{ duration: 0.7, ease: easeOutExpo }}
              />
            </div>
            <span className="text-label4 leading-none text-sub font-semibold tabular-nums w-9 text-right">
              {(row.percent * 100).toFixed(0)}%
            </span>
            <span className="text-label4 leading-none text-disabled font-semibold tabular-nums w-12 text-right">
              {row.count}개
            </span>
          </div>
        </div>

        <ChevronRight className="w-3.5 h-3.5 text-disabled group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
      </button>
    </li>
  )
}
