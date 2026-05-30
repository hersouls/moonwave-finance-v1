import { useMemo, useState, useId } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { PieChart, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { clsx } from 'clsx'
import { formatKoreanUnit } from '@/utils/format'
import { getOtherColor } from '@/lib/chartConfig'
import { getCategoryIcon } from '@/utils/categoryIcons'
import { Sparkline } from '@/components/ui/Sparkline'
import { easeOutExpo, durations, springSnappy } from '@/lib/motionConfig'
import type { CategoryAnalysis, LedgerAnalysis } from '@/hooks/useLedgerAnalysis'

interface Props {
  analysis: LedgerAnalysis
}

const TOP_N = 7

/**
 * Two-pane category deep-dive: donut on the left, ranked list on the right.
 * The donut groups any category beyond TOP_N into "기타" so it stays legible.
 * Each list row exposes the per-category 4-month sparkline (3-month baseline
 * + current) and a delta-vs-baseline badge — the user can immediately spot
 * which categories spiked vs. their personal norm.
 *
 * Hovering/tapping a category in either pane highlights the other side.
 */
export function CategoryDeepDive({ analysis }: Props) {
  const shouldReduceMotion = useReducedMotion()
  const { categories } = analysis
  const [activeKey, setActiveKey] = useState<string | null>(null)

  // Positive-spend slice for donut share (refunds excluded from share viz)
  const positives = useMemo(() => categories.filter((c) => c.current > 0), [categories])

  const { donutSlices, donutTotal } = useMemo(() => {
    const sorted = [...positives].sort((a, b) => b.current - a.current)
    const top = sorted.slice(0, TOP_N)
    const rest = sorted.slice(TOP_N)
    const restSum = rest.reduce((s, c) => s + c.current, 0)
    const slices: Array<{ key: string; name: string; color: string; value: number }> = top.map((c) => ({
      key: keyFor(c),
      name: c.name,
      color: c.color,
      value: c.current,
    }))
    if (restSum > 0) slices.push({ key: '__rest', name: `기타 ${rest.length}건`, color: getOtherColor(), value: restSum })
    const total = slices.reduce((s, c) => s + c.value, 0)
    return { donutSlices: slices, donutTotal: total }
  }, [positives])

  if (positives.length === 0) {
    return (
      <section className="rounded-3xl bg-surface-primary ring-1 ring-base px-5 py-10 text-center">
        <PieChart className="w-8 h-8 mx-auto text-disabled mb-2" />
        <p className="text-body3 text-sub">이번 달 지출 데이터가 없어요</p>
      </section>
    )
  }

  return (
    <motion.section
      id="category"
      initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: durations.base, ease: easeOutExpo }}
      className="rounded-3xl bg-surface-primary ring-1 ring-base elevation-2 overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 pt-5 pb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, color-mix(in srgb, var(--color-primary-500) 22%, transparent), color-mix(in srgb, var(--color-primary-500) 8%, transparent))',
              boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--color-primary-500) 32%, transparent)',
            }}
          >
            <PieChart className="w-4 h-4 text-[color:var(--color-primary-600)] dark:text-[color:var(--color-primary-300)]" />
          </div>
          <div>
            <h3 className="text-body3 font-extrabold text-heading tracking-tight">카테고리별 분석</h3>
            <p className="text-caption text-sub mt-0.5">
              총 {positives.length}개 · 합계 {formatKoreanUnit(donutTotal)}원
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 px-5 pb-5">
        {/* ─── Donut ─── */}
        <div className="flex justify-center items-center py-2">
          <Donut
            slices={donutSlices}
            total={donutTotal}
            activeKey={activeKey}
            onHover={setActiveKey}
          />
        </div>

        {/* ─── Ranked list ─── */}
        <ul className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1 -mr-1 scrollbar-thin">
          {categories.map((c, i) => {
            const key = keyFor(c)
            const isActive = activeKey === key
            return (
              <CategoryRow
                key={key}
                analysis={c}
                rank={i + 1}
                isActive={isActive}
                onActivate={(active) => setActiveKey(active ? key : null)}
              />
            )
          })}
        </ul>
      </div>
    </motion.section>
  )
}

function keyFor(c: CategoryAnalysis): string {
  return c.categoryId != null ? `cat-${c.categoryId}` : 'cat-none'
}

// ════════════════════════════════════════════════════════
// Donut
// ════════════════════════════════════════════════════════

function Donut({
  slices, total, activeKey, onHover,
}: {
  slices: Array<{ key: string; name: string; color: string; value: number }>
  total: number
  activeKey: string | null
  onHover: (k: string | null) => void
}) {
  const id = useId().replace(/:/g, '')
  const size = 220
  const stroke = 28
  const radius = (size - stroke) / 2 - 4
  const cx = size / 2
  const cy = size / 2
  const circ = 2 * Math.PI * radius

  // Track angular offset for each slice
  const arcs = useMemo(() => {
    let acc = 0
    const gap = 2 * Math.PI * (2 / 360) // 2° gap
    return slices.map((s) => {
      const frac = total > 0 ? s.value / total : 0
      const len = Math.max(0, frac * 2 * Math.PI - gap)
      const out = {
        ...s,
        offset: acc,
        length: len,
        frac,
      }
      acc += frac * 2 * Math.PI
      return out
    })
  }, [slices, total])

  const activeSlice = activeKey ? arcs.find((a) => a.key === activeKey) ?? null : null
  const headline = activeSlice ?? (arcs.length > 0 ? arcs[0] : null)

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="block"
      role="img"
      aria-label="카테고리 도넛 차트"
    >
      <defs>
        <filter id={`donut-shadow-${id}`} x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.10" />
        </filter>
      </defs>

      {/* Background track */}
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke="var(--surface-tertiary)"
        strokeWidth={stroke}
        opacity={0.5}
      />

      {/* Slices */}
      <g filter={`url(#donut-shadow-${id})`}>
        {arcs.map((a) => {
          const isActive = activeKey === a.key
          const isDimmed = activeKey != null && !isActive
          return (
            <circle
              key={a.key}
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke={a.color}
              strokeWidth={isActive ? stroke + 3 : stroke}
              strokeDasharray={`${(a.length / (2 * Math.PI)) * circ} ${circ}`}
              strokeDashoffset={-(a.offset / (2 * Math.PI)) * circ}
              strokeLinecap="butt"
              opacity={isDimmed ? 0.3 : 1}
              transform={`rotate(-90 ${cx} ${cy})`}
              onMouseEnter={() => onHover(a.key)}
              onMouseLeave={() => onHover(null)}
              style={{ transition: 'stroke-width 180ms ease-out, opacity 180ms ease-out', cursor: 'pointer' }}
            />
          )
        })}
      </g>

      {/* Center label */}
      {headline && (
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
            {headline.name}
          </text>
          <text
            x={cx}
            y={cy + 12}
            textAnchor="middle"
            fontSize="18"
            fontWeight="800"
            fill="var(--text-heading)"
            className="tabular-nums"
          >
            {Math.round(headline.frac * 100)}%
          </text>
          <text
            x={cx}
            y={cy + 28}
            textAnchor="middle"
            fontSize="10"
            fill="var(--text-disabled)"
            className="tabular-nums"
          >
            {formatKoreanUnit(headline.value)}원
          </text>
        </g>
      )}
    </svg>
  )
}

// ════════════════════════════════════════════════════════
// Category row
// ════════════════════════════════════════════════════════

function CategoryRow({
  analysis, rank, isActive, onActivate,
}: {
  analysis: CategoryAnalysis
  rank: number
  isActive: boolean
  onActivate: (active: boolean) => void
}) {
  const Icon = getCategoryIcon(analysis.icon)
  const delta = analysis.delta
  const pct = analysis.deltaPercent
  const direction: 'up' | 'down' | 'flat' = pct == null || Math.abs(pct) < 1 ? 'flat' : pct > 0 ? 'up' : 'down'
  const DeltaIcon = direction === 'up' ? TrendingUp : direction === 'down' ? TrendingDown : Minus
  const isRefundSlice = analysis.current < 0

  return (
    <li>
      <button
        type="button"
        onMouseEnter={() => onActivate(true)}
        onMouseLeave={() => onActivate(false)}
        onFocus={() => onActivate(true)}
        onBlur={() => onActivate(false)}
        className={clsx(
          'w-full flex items-center gap-3 rounded-2xl px-3 py-2.5 ring-1 transition-all text-left',
          isActive
            ? 'bg-surface-tertiary ring-[color:var(--border-strong)] elevation-1'
            : 'bg-surface-primary ring-base hover:bg-[var(--hover-bg)]',
        )}
      >
        {/* Rank + color dot + icon */}
        <div className="relative flex-shrink-0">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{
              background: `linear-gradient(135deg, color-mix(in srgb, ${analysis.color} 18%, transparent), color-mix(in srgb, ${analysis.color} 6%, transparent))`,
              boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${analysis.color} 28%, transparent)`,
            }}
          >
            <Icon className="w-4 h-4" style={{ color: analysis.color }} />
          </div>
          <span
            className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full bg-surface-primary ring-1 ring-base flex items-center justify-center text-label4 font-extrabold leading-none text-sub tabular-nums"
          >
            {rank}
          </span>
        </div>

        {/* Name + share */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-caption font-bold text-heading truncate">{analysis.name}</p>
            <p
              className={clsx(
                'text-body3 font-extrabold tabular-nums flex-shrink-0',
                isRefundSlice ? 'text-status-success' : 'text-heading',
              )}
            >
              {isRefundSlice ? '+' : ''}
              {formatKoreanUnit(Math.abs(analysis.current))}
              <span className="text-label4 font-bold leading-none text-disabled ml-0.5">원</span>
            </p>
          </div>

          <div className="flex items-center gap-2 mt-1">
            {/* Bar share */}
            <div className="flex-1 h-1.5 rounded-full bg-surface-tertiary overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ background: analysis.color }}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, analysis.percentOfTotal * 100)}%` }}
                transition={{ duration: 0.7, ease: easeOutExpo }}
              />
            </div>
            <span className="text-label4 text-sub font-semibold leading-none tabular-nums w-9 text-right">
              {(analysis.percentOfTotal * 100).toFixed(0)}%
            </span>
          </div>

          {/* Sparkline + delta */}
          <div className="flex items-center gap-2 mt-1.5">
            <div className="flex-1">
              <Sparkline
                data={analysis.series.map((v) => Math.max(0, v))}
                color={analysis.color}
                height={16}
                strokeWidth={1.25}
                showFill={false}
                className="w-full"
              />
            </div>
            {pct != null ? (
              <motion.span
                whileTap={{ scale: 0.97 }}
                transition={springSnappy}
                className={clsx(
                  'inline-flex items-center gap-0.5 px-1.5 h-5 rounded-full text-label4 font-bold leading-none tabular-nums ring-1 flex-shrink-0',
                  direction === 'flat'
                    ? 'text-sub bg-surface-tertiary ring-base'
                    : direction === 'up'
                      ? 'text-status-danger bg-status-danger-soft ring-status-danger/20'
                      : 'text-status-success bg-status-success-soft ring-status-success/20',
                )}
                title={`평균 ${formatKoreanUnit(analysis.avgBaseline)}원 대비`}
              >
                <DeltaIcon className="w-2.5 h-2.5" aria-hidden="true" />
                {direction === 'flat' ? '평균' : `${pct > 0 ? '+' : ''}${Math.round(pct)}%`}
              </motion.span>
            ) : (
              <span className="text-label4 text-disabled font-semibold leading-none">신규</span>
            )}
          </div>
          {delta !== 0 && pct != null && (
            <p className="text-label4 text-disabled leading-none mt-0.5 tabular-nums">
              평균 {formatKoreanUnit(analysis.avgBaseline)}원 · {delta > 0 ? '+' : '−'}{formatKoreanUnit(Math.abs(delta))}원
            </p>
          )}
        </div>
      </button>
    </li>
  )
}
