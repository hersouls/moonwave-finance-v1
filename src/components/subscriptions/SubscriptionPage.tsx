// ─── Subscription Page — full rewrite ───────────────────
//
// Auto-discovers subscriptions from the ledger (no separate registration).
// Visualizes them across multiple chart types and per-item drill-down.
//
// Architecture:
//   - Detection runs as a useMemo over the transactionStore data
//   - Four distinct visualizations: category donut, monthly trend line,
//     top-items bar, per-item monthly evolution
//   - Per-item detail sheet with payment timeline + cumulative cost graph

import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import {
  TrendingUp, TrendingDown, Minus, Calendar as CalendarIcon, Tag,
  Sparkles, ChevronRight, X, ArrowUpRight, Layers,
  Repeat, Wallet, Receipt, ChevronDown, ChevronUp, EyeOff, RotateCcw,
} from 'lucide-react'
import { clsx } from 'clsx'
import { useTransactionStore } from '@/stores/transactionStore'
import { useMemberStore } from '@/stores/memberStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useSyncListener } from '@/hooks/useSyncListener'
import { useCountUp } from '@/hooks/useCountUp'
import { useHiddenSubscriptions } from '@/hooks/useHiddenSubscriptions'
import { getCategoryIcon } from '@/utils/categoryIcons'
import { formatKoreanUnit } from '@/utils/format'
import { formatDate, formatMonthLabel, getCurrentMonthString } from '@/lib/dateUtils'
import { generateSparklinePath, generateSparklineAreaPath } from '@/utils/sparkline'
import { springSnappy, durations, easeOutExpo } from '@/lib/motionConfig'
import {
  detectSubscriptions,
  computeSubscriptionStats,
  buildMonthlyPayments,
  type DetectedSubscription,
  type DetectedCycle,
  type DetectionConfidence,
  type SubscriptionStats,
} from '@/services/subscriptionDetection'
import { Dialog, DialogBody } from '@/components/ui/Dialog'
import { SubscriptionTypeBreakdown } from './SubscriptionTypeBreakdown'

// ════════════════════════════════════════════════════════
// Main Page
// ════════════════════════════════════════════════════════

export function SubscriptionPage() {
  const transactions = useTransactionStore((s) => s.transactions)
  const categories = useTransactionStore((s) => s.categories)
  const loadAll = useTransactionStore((s) => s.loadAll)
  const isLoading = useTransactionStore((s) => s.isLoading)
  const members = useMemberStore((s) => s.members)
  const loadMembers = useMemberStore((s) => s.loadMembers)

  const [activeCycleFilter, setActiveCycleFilter] = useState<DetectedCycle | 'all'>('all')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [selectedMonth, setSelectedMonth] = useState<string>('all')
  const [showHidden, setShowHidden] = useState(false)
  const hiddenSubs = useHiddenSubscriptions()

  useEffect(() => { loadAll(); loadMembers() }, [loadAll, loadMembers])
  useSyncListener(() => { loadAll(); loadMembers() }, ['transactions', 'transactionCategories', 'members'])

  // ── Detection runs against the entire transaction ledger ──
  const detectedAll = useMemo(
    () => detectSubscriptions(transactions, categories),
    [transactions, categories],
  )

  // Split into visible vs user-hidden ("종료" 마킹)
  const detected = useMemo(
    () => detectedAll.filter(s => !hiddenSubs.isHidden(s.key)),
    [detectedAll, hiddenSubs],
  )
  const hiddenList = useMemo(
    () => detectedAll.filter(s => hiddenSubs.isHidden(s.key)),
    [detectedAll, hiddenSubs],
  )

  const stats = useMemo(
    () => computeSubscriptionStats(detected, categories),
    [detected, categories],
  )

  const filtered = useMemo(() => {
    if (activeCycleFilter === 'all') return detected
    return detected.filter(s => s.cycle === activeCycleFilter)
  }, [detected, activeCycleFilter])

  // Months for which the user has any expense transactions, newest first.
  // Capped at 12 so the chip row doesn't grow unbounded; "전체" plus this
  // covers most planning needs.
  const availableMonths = useMemo(() => {
    const set = new Set<string>()
    for (const t of transactions) {
      if (t.type !== 'expense') continue
      set.add(t.date.slice(0, 7))
    }
    return Array.from(set).sort().reverse().slice(0, 12)
  }, [transactions])

  // After the cycle filter, restrict to subscriptions that actually billed
  // in the selected month. 'all' is a no-op pass-through.
  const monthFiltered = useMemo(() => {
    if (selectedMonth === 'all') return filtered
    return filtered.filter(s => s.transactions.some(t => t.date.startsWith(selectedMonth)))
  }, [filtered, selectedMonth])

  // When a month is selected, summarize the bills that landed in that
  // specific month (not the all-time stats which the hero already shows).
  const monthSummary = useMemo(() => {
    if (selectedMonth === 'all') return null
    let totalAmount = 0
    let paymentCount = 0
    for (const sub of monthFiltered) {
      for (const t of sub.transactions) {
        if (t.date.startsWith(selectedMonth)) {
          totalAmount += t.amount
          paymentCount += 1
        }
      }
    }
    return { subscriptionCount: monthFiltered.length, paymentCount, totalAmount }
  }, [monthFiltered, selectedMonth])

  const active = monthFiltered

  const selectedSub = selectedKey ? detectedAll.find(s => s.key === selectedKey) ?? null : null

  if (isLoading) return <PageSkeleton />

  if (detectedAll.length === 0) {
    return <EmptyState />
  }

  return (
    <div className="fold:p-3 p-4 lg:p-6 space-y-5">
      {/* ─── Hero ─── */}
      <SubscriptionHero stats={stats} detectedCount={detected.length} />

      {/* ─── Month filter chips ─── */}
      {availableMonths.length > 0 && (
        <MonthFilterChips
          value={selectedMonth}
          onChange={setSelectedMonth}
          months={availableMonths}
        />
      )}

      {/* ─── Cycle filter chips ─── */}
      <CycleFilterChips
        value={activeCycleFilter}
        onChange={setActiveCycleFilter}
        detected={detected}
      />

      {/* ─── Subscription type breakdown (full-width hero chart) ─── */}
      <SubscriptionTypeBreakdown detected={detected} />

      {/* ─── Charts grid (the "다양한 그래프") ─── */}
      <ChartsGrid stats={stats} detected={detected} categories={categories} />

      {/* ─── Subscription items list ─── */}
      <div>
        <SectionTitle
          icon={Layers}
          title="구독 항목"
          subtitle={
            monthSummary
              ? `${formatMonthLabel(selectedMonth)} ${monthSummary.subscriptionCount}건 · 합계 ${formatKoreanUnit(monthSummary.totalAmount)}원`
              : `${active.length}개 활성 · 평균 월 ${formatKoreanUnit(stats.totalMonthly / Math.max(1, active.length))}원`
          }
        />
        <div className="space-y-2 mt-3">
          {active.map(sub => (
            <SubscriptionItemCard
              key={sub.key}
              sub={sub}
              categories={categories}
              members={members}
              onClick={() => setSelectedKey(sub.key)}
            />
          ))}
        </div>

        {/* Hidden ("종료" 마킹) collapsible */}
        {hiddenList.length > 0 && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowHidden(v => !v)}
              className="flex items-center gap-1.5 text-caption text-sub hover:text-heading transition-colors py-1.5 font-semibold"
            >
              {showHidden ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              <EyeOff className="w-3.5 h-3.5" />
              종료 ({hiddenList.length})
            </button>
            <AnimatePresence>
              {showHidden && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: durations.base, ease: easeOutExpo }}
                  className="overflow-hidden"
                >
                  <div className="space-y-2 pt-2">
                    {hiddenList.map(sub => (
                      <HiddenSubscriptionCard
                        key={sub.key}
                        sub={sub}
                        onRestore={() => hiddenSubs.unhide(sub.key)}
                        onClick={() => setSelectedKey(sub.key)}
                      />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* ─── Detail Sheet ─── */}
      <SubscriptionDetailSheet
        sub={selectedSub}
        categories={categories}
        members={members}
        isHidden={selectedSub ? hiddenSubs.isHidden(selectedSub.key) : false}
        onHide={() => selectedSub && hiddenSubs.hide(selectedSub.key)}
        onUnhide={() => selectedSub && hiddenSubs.unhide(selectedSub.key)}
        onClose={() => setSelectedKey(null)}
      />
    </div>
  )
}

// ════════════════════════════════════════════════════════
// Hero
// ════════════════════════════════════════════════════════

function SubscriptionHero({
  stats, detectedCount,
}: {
  stats: SubscriptionStats
  detectedCount: number
}) {
  const animatedMonthly = useCountUp(stats.totalMonthly, 900)
  const hideAmounts = useSettingsStore((s) => !!s.settings.hideAmounts)

  // Previous month total for delta
  const last = stats.monthlyTrend[stats.monthlyTrend.length - 1]
  const prev = stats.monthlyTrend[stats.monthlyTrend.length - 2]
  const delta = last && prev ? last.total - prev.total : 0
  const deltaPct = prev && prev.total > 0 ? (delta / prev.total) * 100 : 0
  const deltaIsBad = delta > 0
  const deltaIsGood = delta < 0

  return (
    <section
      className="relative overflow-hidden rounded-3xl bg-surface-primary"
      style={{
        boxShadow:
          'inset 0 0 0 1px var(--border-default), inset 0 1px 0 0 rgba(255,255,255,0.5), 0 4px 20px rgba(0,0,0,0.05)',
      }}
    >
      {/* Aurora */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(circle at 15% 10%, oklch(0.65 0.18 280 / 0.18), transparent 50%),
            radial-gradient(circle at 90% 20%, oklch(0.72 0.16 195 / 0.14), transparent 45%),
            radial-gradient(circle at 50% 110%, oklch(0.68 0.18 25 / 0.10), transparent 55%)
          `,
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.55) 50%, transparent)' }}
      />

      <div className="relative px-4 sm:px-6 py-5">
        <div className="flex items-center gap-1.5 mb-2">
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary-500) 70%, transparent)' }}
          />
          <p className="text-[10px] sm:text-[11px] font-bold tracking-[0.14em] uppercase text-[color:var(--color-primary-600)] dark:text-[color:var(--color-primary-300)]">
            이번 달 구독료 (예상)
          </p>
        </div>

        <div className="flex items-baseline gap-2 flex-wrap">
          <span
            className="text-financial-fluid font-extrabold tracking-tight tabular-nums text-heading"
            style={{ textShadow: '0 1px 2px color-mix(in srgb, var(--color-primary-500) 16%, transparent)' }}
          >
            {hideAmounts ? '••••••' : animatedMonthly.toLocaleString('ko-KR')}
          </span>
          <span className="text-body3-semi font-bold text-sub" style={{ fontSize: 'clamp(18px,4vw,22px)' }}>원</span>
        </div>

        {/* Delta + summary chips */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {prev && (
            <span
              className={clsx(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-caption font-bold tabular-nums ring-1',
                deltaIsBad && 'bg-status-danger-soft text-status-danger ring-[color:var(--status-danger)]/15',
                deltaIsGood && 'bg-status-success-soft text-status-success ring-[color:var(--status-success)]/15',
                !deltaIsBad && !deltaIsGood && 'bg-surface-tertiary text-sub ring-base',
              )}
            >
              {delta > 0 ? <TrendingUp className="w-3 h-3" /> : delta < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
              {delta > 0 ? '+' : ''}{deltaPct.toFixed(1)}%
              <span className="opacity-70 font-medium">전월 대비</span>
            </span>
          )}
          <ChipMetric label="활성" value={`${stats.active}개`} color="var(--color-primary-500)" />
          <ChipMetric label="감지된 구독" value={`${detectedCount}개`} />
          <ChipMetric label="연간 예상" value={`${formatKoreanUnit(stats.totalYearly)}원`} color="var(--value-negative)" />
        </div>
      </div>
    </section>
  )
}

function ChipMetric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <span className="inline-flex items-baseline gap-1 px-2 py-0.5 rounded-full text-[11px] bg-surface-tertiary ring-1 ring-base tabular-nums">
      <span className="text-disabled font-medium">{label}</span>
      <span className="font-bold" style={{ color: color || 'var(--text-heading)' }}>{value}</span>
    </span>
  )
}

// ════════════════════════════════════════════════════════
// Cycle filter chips
// ════════════════════════════════════════════════════════

const CYCLE_LABELS: Record<DetectedCycle | 'all', string> = {
  all: '전체',
  weekly: '주간',
  biweekly: '격주',
  monthly: '월간',
  quarterly: '분기',
  'semi-annual': '반기',
  yearly: '연간',
  irregular: '비정기',
}

/**
 * Horizontally-scrolling month chips for narrowing the subscription list to
 * bills that landed in one specific month. "전체" preserves the all-time view.
 * "이번 달" is highlighted as a familiar quick-pick when present.
 */
function MonthFilterChips({
  value, onChange, months,
}: {
  value: string
  onChange: (v: string) => void
  months: string[]
}) {
  const shouldReduceMotion = useReducedMotion()
  const currentMonth = getCurrentMonthString()
  const options: { id: string; label: string }[] = [
    { id: 'all', label: '전체' },
    ...months.map((m) => ({
      id: m,
      label: m === currentMonth ? '이번 달' : formatMonthLabel(m),
    })),
  ]

  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-1 px-1 -my-1 py-1">
      {options.map((opt) => {
        const isActive = value === opt.id
        return (
          <motion.button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            whileTap={shouldReduceMotion ? undefined : { scale: 0.95 }}
            transition={springSnappy}
            aria-pressed={isActive}
            className={clsx(
              'flex-shrink-0 inline-flex items-center gap-1 px-3 h-8 rounded-full text-[11px] font-bold transition-all tabular-nums',
              isActive
                ? 'bg-[color:var(--color-primary-500)] text-white shadow-[0_4px_14px_color-mix(in_oklch,var(--color-primary-500)_30%,transparent)]'
                : 'bg-surface-primary text-sub ring-1 ring-base hover:bg-[var(--hover-bg)]',
            )}
          >
            {opt.label}
          </motion.button>
        )
      })}
    </div>
  )
}

function CycleFilterChips({
  value, onChange, detected,
}: {
  value: DetectedCycle | 'all'
  onChange: (v: DetectedCycle | 'all') => void
  detected: DetectedSubscription[]
}) {
  const shouldReduceMotion = useReducedMotion()
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: detected.length }
    for (const s of detected) c[s.cycle] = (c[s.cycle] ?? 0) + 1
    return c
  }, [detected])
  const cycles: (DetectedCycle | 'all')[] = ['all', 'monthly', 'yearly', 'quarterly', 'weekly', 'biweekly', 'semi-annual', 'irregular']

  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-1 px-1 -my-1 py-1">
      {cycles.map(c => {
        const count = counts[c] ?? 0
        if (c !== 'all' && count === 0) return null
        const isActive = value === c
        return (
          <motion.button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            whileTap={shouldReduceMotion ? undefined : { scale: 0.95 }}
            transition={springSnappy}
            className={clsx(
              'flex-shrink-0 inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-[11px] font-bold transition-all',
              isActive
                ? 'bg-[color:var(--color-primary-500)] text-white shadow-[0_4px_14px_color-mix(in_oklch,var(--color-primary-500)_30%,transparent)]'
                : 'bg-surface-primary text-sub ring-1 ring-base hover:bg-[var(--hover-bg)]',
            )}
          >
            {CYCLE_LABELS[c]}
            <span
              className={clsx(
                'min-w-[18px] px-1 h-[16px] rounded-full text-[9px] font-bold tabular-nums flex items-center justify-center',
                isActive ? 'bg-white/22 text-white' : 'bg-surface-tertiary text-sub',
              )}
            >
              {count}
            </span>
          </motion.button>
        )
      })}
    </div>
  )
}

// ════════════════════════════════════════════════════════
// Charts grid
// ════════════════════════════════════════════════════════

function ChartsGrid({
  stats, detected, categories,
}: {
  stats: SubscriptionStats
  detected: DetectedSubscription[]
  categories: ReturnType<typeof useTransactionStore.getState>['categories']
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ChartCard title="카테고리별 분포" icon={Tag}>
        <CategoryDonut data={stats.byCategory} totalMonthly={stats.totalMonthly} />
      </ChartCard>
      <ChartCard title="월별 추이 (최근 12개월)" icon={TrendingUp}>
        <MonthlyTrendLine data={stats.monthlyTrend.slice(-12)} />
      </ChartCard>
      <ChartCard title="비싼 구독 TOP 5" icon={ArrowUpRight}>
        <TopItemsBar items={stats.topItems} totalMonthly={stats.totalMonthly} />
      </ChartCard>
      <ChartCard title="다가오는 결제" icon={CalendarIcon}>
        <UpcomingPayments detected={detected} categories={categories} />
      </ChartCard>
    </div>
  )
}

function ChartCard({
  title, icon: Icon, children,
}: {
  title: string
  icon: typeof Tag
  children: React.ReactNode
}) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl bg-surface-primary p-4"
      style={{
        boxShadow: 'inset 0 0 0 1px var(--border-default), inset 0 1px 0 0 rgba(255,255,255,0.4), 0 2px 8px rgba(0,0,0,0.04)',
      }}
    >
      <div className="flex items-center gap-1.5 mb-3">
        <Icon className="w-3.5 h-3.5 text-[color:var(--color-primary-500)]" />
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-sub">{title}</h3>
      </div>
      {children}
    </div>
  )
}

// ─── Chart 1: Category Donut ───────────────────────────

function CategoryDonut({
  data, totalMonthly,
}: {
  data: SubscriptionStats['byCategory']
  totalMonthly: number
}) {
  const size = 160
  const stroke = 22
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  if (data.length === 0 || totalMonthly === 0) {
    return <div className="h-[160px] flex items-center justify-center text-caption text-disabled">데이터 없음</div>
  }

  let offset = 0
  const segments = data.map(seg => {
    const pct = seg.percent
    const dashArray = (pct / 100) * circumference
    const result = {
      ...seg,
      dashArray,
      offset: -offset,
    }
    offset += dashArray
    return result
  })

  const hovered = hoveredIndex != null ? data[hoveredIndex] : null

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <div
        className="relative flex-shrink-0"
        style={{ width: size, height: size }}
        onMouseLeave={() => setHoveredIndex(null)}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--border-subtle)"
            strokeWidth={stroke}
          />
          {segments.map((seg, i) => {
            const isHovered = hoveredIndex === i
            const isOther = hoveredIndex != null && hoveredIndex !== i
            return (
              <motion.circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={seg.color}
                strokeWidth={isHovered ? stroke + 4 : stroke}
                strokeDasharray={`${seg.dashArray} ${circumference - seg.dashArray}`}
                strokeDashoffset={seg.offset}
                initial={{ opacity: 0 }}
                animate={{ opacity: isOther ? 0.32 : 1 }}
                transition={{ duration: 0.25, delay: hoveredIndex == null ? i * 0.05 : 0 }}
                style={{
                  filter: `drop-shadow(0 0 ${isHovered ? 10 : 6}px color-mix(in srgb, ${seg.color} ${isHovered ? 60 : 30}%, transparent))`,
                  cursor: 'pointer',
                }}
                onMouseEnter={() => setHoveredIndex(i)}
              />
            )
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          {hovered ? (
            <motion.div
              key={hovered.name}
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.18, ease: easeOutExpo }}
              className="text-center"
            >
              <p
                className="text-[10px] font-bold uppercase tracking-wider truncate max-w-[110px]"
                style={{ color: hovered.color }}
              >
                {hovered.name}
              </p>
              <p className="text-body3 font-extrabold tabular-nums text-heading">
                {formatKoreanUnit(hovered.totalMonthly)}
              </p>
              <p className="text-[10px] text-sub tabular-nums font-semibold">
                {hovered.percent.toFixed(1)}% · {hovered.count}개
              </p>
            </motion.div>
          ) : (
            <>
              <p className="text-[9px] text-disabled font-semibold uppercase tracking-wider">월</p>
              <p className="text-body3 font-extrabold tabular-nums text-heading">{formatKoreanUnit(totalMonthly)}</p>
              <p className="text-[9px] text-sub">원</p>
            </>
          )}
        </div>
      </div>
      <div className="flex-1 min-w-[140px] space-y-1.5">
        {data.slice(0, 6).map((c, i) => {
          const isHovered = hoveredIndex === i
          return (
            <div
              key={String(c.categoryId)}
              className={clsx(
                'flex items-center gap-2 text-[11px] cursor-pointer rounded-lg px-1 py-0.5 -mx-1 transition-all',
                isHovered ? 'bg-surface-tertiary' : 'hover:bg-[var(--hover-bg)]',
              )}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <span
                className="w-2.5 h-2.5 rounded-sm flex-shrink-0 transition-all"
                style={{
                  backgroundColor: c.color,
                  boxShadow: isHovered ? `0 0 6px ${c.color}` : 'none',
                }}
              />
              <span className={clsx('truncate flex-1', isHovered ? 'text-heading font-semibold' : 'text-body')}>
                {c.name}
              </span>
              <span className="tabular-nums font-semibold text-sub flex-shrink-0">{c.percent.toFixed(0)}%</span>
            </div>
          )
        })}
        {data.length > 6 && (
          <p className="text-[10px] text-disabled pl-4">+{data.length - 6}개</p>
        )}
      </div>
    </div>
  )
}

// ─── Chart 2: Monthly Trend Line ───────────────────────

function MonthlyTrendLine({ data }: { data: SubscriptionStats['monthlyTrend'] }) {
  const shouldReduceMotion = useReducedMotion()
  if (data.length === 0) return <div className="h-[140px] flex items-center justify-center text-caption text-disabled">데이터 없음</div>

  const w = 320
  const h = 140
  const padding = { top: 14, right: 8, bottom: 22, left: 8 }
  const values = data.map(d => d.total)
  const max = Math.max(...values, 1)
  const linePath = generateSparklinePath(values, { width: w - padding.left - padding.right, height: h - padding.top - padding.bottom, smooth: true })
  const areaPath = generateSparklineAreaPath(values, { width: w - padding.left - padding.right, height: h - padding.top - padding.bottom, smooth: true })

  return (
    <div className="relative w-full overflow-hidden">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-[140px]">
        <defs>
          <linearGradient id="sub-trend-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary-500)" stopOpacity="0.30" />
            <stop offset="100%" stopColor="var(--color-primary-500)" stopOpacity="0" />
          </linearGradient>
          <filter id="sub-trend-glow" x="-10%" y="-50%" width="120%" height="200%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* Reference lines */}
        {[0.25, 0.5, 0.75].map(f => (
          <line
            key={f}
            x1={padding.left}
            x2={w - padding.right}
            y1={padding.top + (h - padding.top - padding.bottom) * f}
            y2={padding.top + (h - padding.top - padding.bottom) * f}
            stroke="var(--border-subtle)"
            strokeWidth={0.5}
            strokeDasharray="2 4"
          />
        ))}
        <g transform={`translate(${padding.left} ${padding.top})`}>
          <motion.path
            d={areaPath}
            fill="url(#sub-trend-grad)"
            initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          />
          <motion.path
            d={linePath}
            fill="none"
            stroke="var(--color-primary-500)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#sub-trend-glow)"
            initial={shouldReduceMotion ? undefined : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1, ease: 'easeOut', delay: 0.3 }}
          />
          {/* Points */}
          {values.map((v, i) => {
            const cx = (i / Math.max(1, values.length - 1)) * (w - padding.left - padding.right)
            const cy = (h - padding.top - padding.bottom) * (1 - v / max)
            return (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={i === values.length - 1 ? 3.5 : 2}
                fill="var(--color-primary-500)"
                stroke="var(--surface-primary)"
                strokeWidth={1}
              />
            )
          })}
        </g>
        {/* X-axis labels (first/middle/last) */}
        {data.length > 0 && (
          <g>
            <text x={padding.left} y={h - 4} fontSize="9" fill="var(--text-muted)" className="font-medium">
              {monthShort(data[0].month)}
            </text>
            {data.length >= 3 && (
              <text x={w / 2} y={h - 4} fontSize="9" fill="var(--text-muted)" textAnchor="middle" className="font-medium">
                {monthShort(data[Math.floor(data.length / 2)].month)}
              </text>
            )}
            <text x={w - padding.right} y={h - 4} fontSize="9" fill="var(--text-muted)" textAnchor="end" className="font-medium">
              {monthShort(data[data.length - 1].month)}
            </text>
          </g>
        )}
      </svg>
      <div className="absolute top-0 right-0 text-right">
        <p className="text-[9px] text-disabled font-semibold uppercase tracking-wider">최고</p>
        <p className="text-[11px] font-bold tabular-nums text-heading">{formatKoreanUnit(max)}원</p>
      </div>
    </div>
  )
}

function monthShort(yyyyMm: string): string {
  const [, m] = yyyyMm.split('-')
  return `${parseInt(m, 10)}월`
}

// ─── Chart 3: Top items horizontal bars ───────────────

function TopItemsBar({
  items, totalMonthly,
}: {
  items: DetectedSubscription[]
  totalMonthly: number
}) {
  const shouldReduceMotion = useReducedMotion()
  if (items.length === 0) return <div className="h-[140px] flex items-center justify-center text-caption text-disabled">데이터 없음</div>
  const max = Math.max(...items.map(i => i.monthlyEquivalent), 1)

  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const pct = (item.monthlyEquivalent / max) * 100
        const share = totalMonthly > 0 ? (item.monthlyEquivalent / totalMonthly) * 100 : 0
        return (
          <div key={item.key} className="space-y-0.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] text-body font-semibold truncate flex-1">
                {item.name}
              </span>
              <span className="text-[11px] tabular-nums font-bold text-heading flex-shrink-0">
                {formatKoreanUnit(item.monthlyEquivalent)}원
              </span>
            </div>
            <div className="relative h-2 rounded-full bg-surface-tertiary overflow-hidden">
              <motion.div
                className="absolute left-0 top-0 bottom-0 rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${item.color}, color-mix(in srgb, ${item.color} 75%, black))`,
                  boxShadow: `0 0 6px color-mix(in srgb, ${item.color} 50%, transparent)`,
                }}
                initial={shouldReduceMotion ? { width: `${pct}%` } : { width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.7, ease: easeOutExpo, delay: i * 0.05 }}
              />
            </div>
            <p className="text-[9px] text-disabled tabular-nums">전체의 {share.toFixed(1)}%</p>
          </div>
        )
      })}
    </div>
  )
}

// ─── Chart 4: Upcoming payments ───────────────────────

function UpcomingPayments({
  detected, categories,
}: {
  detected: DetectedSubscription[]
  categories: ReturnType<typeof useTransactionStore.getState>['categories']
}) {
  const upcoming = useMemo(
    () => detected
      .filter(s => s.isActive)
      .filter(s => s.daysUntilNext >= -3 && s.daysUntilNext <= 14)
      .sort((a, b) => a.daysUntilNext - b.daysUntilNext)
      .slice(0, 5),
    [detected],
  )
  if (upcoming.length === 0) {
    return <div className="h-[140px] flex flex-col items-center justify-center text-center text-caption text-disabled gap-1">
      <Sparkles className="w-4 h-4 opacity-50" />
      향후 2주 내 예정 없음
    </div>
  }

  return (
    <div className="space-y-2">
      {upcoming.map(sub => {
        const cat = sub.categoryId != null ? categories.find(c => c.id === sub.categoryId) : null
        const Icon = getCategoryIcon(cat?.icon)
        const isToday = sub.daysUntilNext === 0
        const isPast = sub.daysUntilNext < 0
        const isThisWeek = sub.daysUntilNext >= 0 && sub.daysUntilNext <= 7
        return (
          <div key={sub.key} className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{
                background: `color-mix(in srgb, ${sub.color} 14%, transparent)`,
                boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${sub.color} 22%, transparent)`,
              }}
            >
              <Icon className="w-3.5 h-3.5" style={{ color: sub.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-caption text-body font-semibold truncate">{sub.name}</p>
              <p
                className={clsx(
                  'text-[10px] tabular-nums font-bold',
                  isPast ? 'text-status-danger' : isToday ? 'text-status-warning' : isThisWeek ? 'text-heading' : 'text-sub',
                )}
              >
                {isPast ? `${Math.abs(sub.daysUntilNext)}일 지연` : isToday ? '오늘' : `D-${sub.daysUntilNext}`}
                <span className="opacity-60 font-medium ml-1">{formatDate(sub.nextEstimatedDate)}</span>
              </p>
            </div>
            <p className="text-[11px] tabular-nums font-bold text-value-negative flex-shrink-0">
              −{formatKoreanUnit(sub.avgAmount)}
            </p>
          </div>
        )
      })}
    </div>
  )
}

// ════════════════════════════════════════════════════════
// Subscription Item Card
// ════════════════════════════════════════════════════════

function SubscriptionItemCard({
  sub, categories, members, onClick,
}: {
  sub: DetectedSubscription
  categories: ReturnType<typeof useTransactionStore.getState>['categories']
  members: ReturnType<typeof useMemberStore.getState>['members']
  onClick: () => void
}) {
  const shouldReduceMotion = useReducedMotion()
  const cat = sub.categoryId != null ? categories.find(c => c.id === sub.categoryId) : null
  const Icon = getCategoryIcon(cat?.icon)
  const member = sub.memberId != null ? members.find(m => m.id === sub.memberId) : null

  // Mini sparkline from monthly payments (last 6 months)
  const series = useMemo(() => buildMonthlyPayments(sub, 6).map(p => p.amount), [sub])
  const hasNonZero = series.some(v => v > 0)

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={shouldReduceMotion ? undefined : { y: -1 }}
      whileTap={shouldReduceMotion ? undefined : { scale: 0.995 }}
      transition={{ type: 'spring', stiffness: 320, damping: 24 }}
      className="group relative w-full text-left rounded-2xl bg-surface-primary p-3.5 ring-1 ring-base hover:shadow-[0_4px_14px_rgba(0,0,0,0.06)] transition-all overflow-hidden el-hover"
    >
      {/* Left color spine */}
      <span
        aria-hidden="true"
        className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full transition-all group-hover:top-2 group-hover:bottom-2"
        style={{
          background: `linear-gradient(180deg, ${sub.color}, color-mix(in srgb, ${sub.color} 60%, transparent))`,
          boxShadow: `0 0 10px color-mix(in srgb, ${sub.color} 40%, transparent)`,
        }}
      />

      <div className="flex items-center gap-3 pl-1.5">
        {/* Icon */}
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: `linear-gradient(135deg, color-mix(in srgb, ${sub.color} 18%, transparent), color-mix(in srgb, ${sub.color} 8%, transparent))`,
            boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${sub.color} 22%, transparent), inset 0 1px 0 0 rgba(255,255,255,0.4)`,
          }}
        >
          <Icon className="w-5 h-5" style={{ color: sub.color }} />
        </div>

        {/* Body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-body3 text-heading font-bold truncate">{sub.name}</span>
            <CycleBadge cycle={sub.cycle} />
            <ConfidenceBadge confidence={sub.confidence} />
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-sub tabular-nums">
            <span className="inline-flex items-center gap-0.5">
              <Receipt className="w-2.5 h-2.5" />
              {sub.count}회 · 누적 {formatKoreanUnit(sub.totalSpent)}원
            </span>
            {cat && (
              <span className="inline-flex items-center gap-0.5">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cat.color }} />
                {cat.name}
              </span>
            )}
            {member && (
              <span className="inline-flex items-center gap-0.5" style={{ color: member.color }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: member.color }} />
                {member.name}
              </span>
            )}
          </div>
        </div>

        {/* Mini sparkline */}
        {hasNonZero && (
          <div className="hidden sm:block flex-shrink-0 w-[60px] h-[28px] opacity-80 pointer-events-none" aria-hidden="true">
            <svg viewBox="0 0 60 28" preserveAspectRatio="none" className="w-full h-full">
              <path
                d={generateSparklinePath(series, { width: 60, height: 28, smooth: true })}
                fill="none"
                stroke={sub.color}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        )}

        {/* Amount + next */}
        <div className="text-right flex-shrink-0 ml-1">
          <p className="text-body3 font-bold tabular-nums" style={{ color: 'var(--value-negative)' }}>
            −{formatKoreanUnit(sub.avgAmount)}원
          </p>
          <p className="text-[10px] text-disabled tabular-nums mt-0.5">
            월 {formatKoreanUnit(sub.monthlyEquivalent)}원
          </p>
        </div>

        <ChevronRight className="hidden lg:block w-4 h-4 text-disabled flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </motion.button>
  )
}

function CycleBadge({ cycle }: { cycle: DetectedCycle }) {
  const labelMap: Record<DetectedCycle, { label: string; color: string }> = {
    monthly: { label: '월', color: 'var(--color-primary-500)' },
    yearly: { label: '연', color: 'var(--value-positive)' },
    quarterly: { label: '분기', color: 'oklch(0.72 0.14 195)' },
    'semi-annual': { label: '반기', color: 'oklch(0.72 0.14 220)' },
    weekly: { label: '주', color: 'oklch(0.65 0.18 300)' },
    biweekly: { label: '격주', color: 'oklch(0.65 0.18 280)' },
    irregular: { label: '비정기', color: 'var(--text-muted)' },
  }
  const info = labelMap[cycle]
  return (
    <span
      className="text-[9px] font-bold uppercase tracking-wider px-1.5 h-[14px] rounded-full inline-flex items-center"
      style={{
        backgroundColor: `color-mix(in srgb, ${info.color} 14%, transparent)`,
        color: info.color,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${info.color} 22%, transparent)`,
      }}
    >
      <Repeat className="w-2 h-2 mr-0.5" />
      {info.label}
    </span>
  )
}

function ConfidenceBadge({ confidence }: { confidence: DetectionConfidence }) {
  if (confidence === 'high') return null
  const map = {
    medium: { label: '추정', color: 'var(--text-sub)' },
    low: { label: '낮음', color: 'var(--text-muted)' },
  }
  const info = map[confidence]
  return (
    <span
      className="text-[9px] font-semibold uppercase tracking-wider"
      style={{ color: info.color }}
    >
      {info.label}
    </span>
  )
}

// ════════════════════════════════════════════════════════
// Detail Sheet
// ════════════════════════════════════════════════════════

function SubscriptionDetailSheet({
  sub, categories, members, isHidden, onHide, onUnhide, onClose,
}: {
  sub: DetectedSubscription | null
  categories: ReturnType<typeof useTransactionStore.getState>['categories']
  members: ReturnType<typeof useMemberStore.getState>['members']
  isHidden: boolean
  onHide: () => void
  onUnhide: () => void
  onClose: () => void
}) {
  if (!sub) return null

  return (
    <Dialog open={!!sub} onClose={onClose} size="2xl" noPadding>
      <DetailSheetContent
        sub={sub}
        categories={categories}
        members={members}
        isHidden={isHidden}
        onHide={onHide}
        onUnhide={onUnhide}
        onClose={onClose}
      />
    </Dialog>
  )
}

function DetailSheetContent({
  sub, categories, members, isHidden, onHide, onUnhide, onClose,
}: {
  sub: DetectedSubscription
  categories: ReturnType<typeof useTransactionStore.getState>['categories']
  members: ReturnType<typeof useMemberStore.getState>['members']
  isHidden: boolean
  onHide: () => void
  onUnhide: () => void
  onClose: () => void
}) {
  const cat = sub.categoryId != null ? categories.find(c => c.id === sub.categoryId) : null
  const Icon = getCategoryIcon(cat?.icon)
  const member = sub.memberId != null ? members.find(m => m.id === sub.memberId) : null
  const monthlyPayments = useMemo(() => buildMonthlyPayments(sub, 12), [sub])
  const animatedTotal = useCountUp(sub.totalSpent, 900)
  const animatedMonthly = useCountUp(sub.monthlyEquivalent, 900)

  // Cumulative cost series
  const cumulative = useMemo(() => {
    let acc = 0
    return sub.transactions.map(t => {
      acc += t.amount
      return { date: t.date, cumulative: acc, amount: t.amount }
    })
  }, [sub])

  // Months elapsed since first payment
  const firstMs = new Date(sub.firstDate + 'T00:00:00').getTime()
  const monthsElapsed = Math.max(1, Math.round((Date.now() - firstMs) / (30 * 86_400_000)))

  return (
    <>
      {/* Aurora header */}
      <div className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `
              radial-gradient(circle at 15% 0%, color-mix(in srgb, ${sub.color} 24%, transparent), transparent 50%),
              radial-gradient(circle at 90% 20%, oklch(0.72 0.16 195 / 0.12), transparent 45%)
            `,
          }}
        />
        <div className="relative px-5 sm:px-7 pt-5 pb-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{
                  background: `linear-gradient(135deg, ${sub.color}, color-mix(in srgb, ${sub.color} 70%, black))`,
                  boxShadow: `0 6px 20px color-mix(in srgb, ${sub.color} 38%, transparent), inset 0 1px 0 0 rgba(255,255,255,0.3)`,
                }}
              >
                <Icon className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0">
                <h2 className="text-title2 font-extrabold text-heading tracking-tight truncate">
                  {sub.name}
                </h2>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <CycleBadge cycle={sub.cycle} />
                  {cat && (
                    <span
                      className="text-[10px] px-1.5 h-[14px] rounded-full inline-flex items-center"
                      style={{
                        backgroundColor: `color-mix(in srgb, ${cat.color} 14%, transparent)`,
                        color: cat.color,
                      }}
                    >
                      {cat.name}
                    </span>
                  )}
                  {member && (
                    <span
                      className="text-[10px] px-1.5 h-[14px] rounded-full inline-flex items-center text-white font-bold"
                      style={{ backgroundColor: member.color }}
                    >
                      {member.name}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full flex items-center justify-center text-sub hover:text-heading hover:bg-[var(--hover-bg)] flex-shrink-0"
              aria-label="닫기"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <StatTile label="월 환산" value={`${animatedMonthly.toLocaleString('ko-KR')}원`} icon={Wallet} color={sub.color} />
            <StatTile label="누적 결제" value={`${animatedTotal.toLocaleString('ko-KR')}원`} icon={Receipt} />
            <StatTile label="결제 횟수" value={`${sub.count}회`} icon={Repeat} />
            <StatTile label="평균 간격" value={`${sub.avgIntervalDays}일`} icon={CalendarIcon} />
          </div>
        </div>
      </div>

      <DialogBody className="!mt-0 px-5 sm:px-7 pb-6 max-h-[60vh] overflow-y-auto">
        <div className="space-y-5 pt-2">
          {/* Cumulative cost */}
          <div>
            <SectionTitle icon={ArrowUpRight} title="누적 비용" subtitle={`${sub.firstDate} 이후 · 약 ${monthsElapsed}개월`} />
            <CumulativeCostChart cumulative={cumulative} accent={sub.color} />
          </div>

          {/* Monthly evolution */}
          <div>
            <SectionTitle icon={TrendingUp} title="월별 결제 추이" subtitle="최근 12개월" />
            <MonthlyEvolutionBars data={monthlyPayments} accent={sub.color} avgAmount={sub.avgAmount} />
          </div>

          {/* Payment timeline */}
          <div>
            <SectionTitle icon={CalendarIcon} title="결제 이력" subtitle={`총 ${sub.transactions.length}건`} />
            <PaymentTimeline transactions={sub.transactions} accent={sub.color} />
          </div>

          {/* Next payment estimate */}
          {!isHidden && <NextPaymentCallout sub={sub} />}

          {/* Hide/Restore action */}
          <div className="pt-2">
            {isHidden ? (
              <motion.button
                type="button"
                onClick={() => { onUnhide(); onClose() }}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.98 }}
                className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-2xl bg-[color:var(--color-primary-50)] dark:bg-[color:var(--color-primary-900)]/20 ring-1 ring-[color:var(--color-primary-300)] dark:ring-[color:var(--color-primary-700)] text-[color:var(--color-primary-700)] dark:text-[color:var(--color-primary-300)] text-caption font-bold transition-all"
              >
                <RotateCcw className="w-4 h-4" />
                구독 다시 활성화
              </motion.button>
            ) : (
              <motion.button
                type="button"
                onClick={() => { onHide(); onClose() }}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.98 }}
                className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-2xl bg-surface-tertiary ring-1 ring-base text-sub hover:text-heading hover:bg-[var(--hover-bg)] text-caption font-bold transition-all"
              >
                <EyeOff className="w-4 h-4" />
                더 이상 사용하지 않음 (종료)
              </motion.button>
            )}
            <p className="text-[10px] text-disabled text-center mt-1.5">
              종료된 구독은 통계에서 제외됩니다 · 거래 기록은 보존됩니다
            </p>
          </div>
        </div>
      </DialogBody>
    </>
  )
}

// ─── Hidden subscription card (compact, with restore) ──

function HiddenSubscriptionCard({
  sub, onRestore, onClick,
}: {
  sub: DetectedSubscription
  onRestore: () => void
  onClick: () => void
}) {
  const Icon = getCategoryIcon(undefined)
  return (
    <motion.div
      className="group flex items-center gap-3 px-3.5 py-2.5 rounded-2xl bg-surface-tertiary ring-1 ring-base opacity-70 hover:opacity-100 transition-all"
    >
      <button type="button" onClick={onClick} className="flex items-center gap-3 flex-1 min-w-0 text-left">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: `color-mix(in srgb, ${sub.color} 10%, transparent)`,
            boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${sub.color} 18%, transparent)`,
          }}
        >
          <Icon className="w-4 h-4" style={{ color: sub.color, opacity: 0.7 }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-caption font-bold text-sub truncate line-through">{sub.name}</p>
          <p className="text-[10px] text-disabled tabular-nums">
            {sub.count}회 · 누적 {formatKoreanUnit(sub.totalSpent)}원
          </p>
        </div>
      </button>
      <button
        type="button"
        onClick={onRestore}
        className="inline-flex items-center gap-1 px-2.5 h-7 rounded-full text-[10px] font-bold bg-surface-primary text-[color:var(--color-primary-600)] dark:text-[color:var(--color-primary-300)] ring-1 ring-[color:var(--color-primary-200)] dark:ring-[color:var(--color-primary-800)] hover:brightness-95 transition-all flex-shrink-0"
        aria-label="구독 복원"
      >
        <RotateCcw className="w-3 h-3" />
        복원
      </button>
    </motion.div>
  )
}

function StatTile({ label, value, icon: Icon, color }: { label: string; value: string; icon: typeof Wallet; color?: string }) {
  return (
    <div
      className="rounded-2xl p-2.5 bg-surface-primary ring-1 ring-base"
    >
      <div className="flex items-center gap-1 text-[10px] text-sub mb-0.5">
        <Icon className="w-3 h-3" style={{ color }} />
        <span className="font-semibold">{label}</span>
      </div>
      <p className="text-caption font-extrabold tabular-nums text-heading truncate">
        {value}
      </p>
    </div>
  )
}

function CumulativeCostChart({
  cumulative, accent,
}: {
  cumulative: Array<{ date: string; cumulative: number; amount: number }>
  accent: string
}) {
  const shouldReduceMotion = useReducedMotion()
  if (cumulative.length < 2) return <div className="h-[120px] flex items-center justify-center text-caption text-disabled">데이터 부족</div>
  const w = 320
  const h = 120
  const max = cumulative[cumulative.length - 1].cumulative
  const points = cumulative.map((c, i) => {
    const x = (i / (cumulative.length - 1)) * w
    const y = h - (c.cumulative / max) * h * 0.9
    return { x, y, ...c }
  })
  const pathD = points.reduce((acc, p, i) => acc + (i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`), '')
  const areaD = `${pathD} L${w},${h} L0,${h} Z`

  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-[120px]">
        <defs>
          <linearGradient id="cumul-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.35" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
        </defs>
        <motion.path
          d={areaD}
          fill="url(#cumul-grad)"
          initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        />
        <motion.path
          d={pathD}
          fill="none"
          stroke={accent}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={shouldReduceMotion ? undefined : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute top-0 right-0 text-right">
        <p className="text-[9px] text-disabled uppercase font-semibold tracking-wider">현재까지</p>
        <p className="text-body3 font-extrabold tabular-nums" style={{ color: accent }}>
          {formatKoreanUnit(max)}원
        </p>
      </div>
    </div>
  )
}

function MonthlyEvolutionBars({
  data, accent, avgAmount,
}: {
  data: Array<{ month: string; amount: number }>
  accent: string
  avgAmount: number
}) {
  const shouldReduceMotion = useReducedMotion()
  const max = Math.max(...data.map(d => d.amount), avgAmount, 1)

  return (
    <div className="relative h-[140px] flex items-end gap-1 px-1">
      {/* Average line */}
      <div
        aria-hidden="true"
        className="absolute left-0 right-0 border-t border-dashed pointer-events-none"
        style={{
          bottom: `${(avgAmount / max) * 100}%`,
          borderColor: 'color-mix(in srgb, var(--text-sub) 30%, transparent)',
        }}
      >
        <span className="absolute right-0 -top-3 text-[9px] text-disabled font-semibold tabular-nums">
          평균 {formatKoreanUnit(avgAmount)}원
        </span>
      </div>
      {data.map((d, i) => {
        const isPaid = d.amount > 0
        const height = isPaid ? Math.max((d.amount / max) * 100, 4) : 4
        return (
          <div key={d.month} className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <motion.div
              className={clsx('w-full rounded-t-lg', !isPaid && 'opacity-30')}
              style={{
                height: `${height}%`,
                background: isPaid
                  ? `linear-gradient(180deg, ${accent}, color-mix(in srgb, ${accent} 60%, transparent))`
                  : 'var(--surface-tertiary)',
                boxShadow: isPaid ? `0 0 8px color-mix(in srgb, ${accent} 35%, transparent)` : undefined,
              }}
              initial={shouldReduceMotion ? undefined : { height: 0 }}
              animate={{ height: `${height}%` }}
              transition={{ duration: 0.5, ease: easeOutExpo, delay: i * 0.02 }}
            />
            <span className="text-[8px] text-disabled tabular-nums font-semibold">
              {monthShort(d.month)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function PaymentTimeline({
  transactions, accent,
}: {
  transactions: import('@/lib/types').Transaction[]
  accent: string
}) {
  // Show last 10 in reverse chrono
  const recent = [...transactions].reverse().slice(0, 10)
  return (
    <div className="space-y-1.5">
      {recent.map((t, i) => (
        <motion.div
          key={t.id ?? i}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: i * 0.03 }}
          className="flex items-center gap-3 px-3 py-2 rounded-xl bg-surface-tertiary ring-1 ring-base"
        >
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: accent, boxShadow: `0 0 6px ${accent}` }}
          />
          <span className="text-caption text-body tabular-nums flex-1 truncate">
            {formatDate(t.date)}
          </span>
          <span className="text-caption font-bold tabular-nums text-value-negative">
            −{t.amount.toLocaleString('ko-KR')}원
          </span>
        </motion.div>
      ))}
      {transactions.length > 10 && (
        <p className="text-[10px] text-disabled text-center pt-1">
          이전 {transactions.length - 10}건 …
        </p>
      )}
    </div>
  )
}

function NextPaymentCallout({ sub }: { sub: DetectedSubscription }) {
  if (!sub.isActive) return null
  const isPast = sub.daysUntilNext < 0
  return (
    <div
      className="rounded-2xl p-3 ring-1"
      style={{
        background: isPast ? 'var(--status-danger-soft)' : `color-mix(in srgb, ${sub.color} 8%, var(--surface-primary))`,
        borderColor: 'var(--border-default)',
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${sub.color} 22%, transparent)`,
      }}
    >
      <div className="flex items-center gap-2.5">
        <CalendarIcon className="w-4 h-4 flex-shrink-0" style={{ color: sub.color }} />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-sub font-semibold uppercase tracking-wider">다음 결제 (예상)</p>
          <p className="text-body3 font-bold text-heading tabular-nums">
            {formatDate(sub.nextEstimatedDate)}
            <span
              className={clsx(
                'ml-2 text-caption font-bold',
                isPast ? 'text-status-danger' : sub.daysUntilNext <= 7 ? 'text-status-warning' : 'text-sub',
              )}
            >
              {isPast ? `${Math.abs(sub.daysUntilNext)}일 지연` : `D-${sub.daysUntilNext}`}
            </span>
          </p>
        </div>
        <p className="text-body3 font-bold tabular-nums text-value-negative">
          −{formatKoreanUnit(sub.avgAmount)}원
        </p>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════
// Shared atoms
// ════════════════════════════════════════════════════════

function SectionTitle({
  icon: Icon, title, subtitle,
}: {
  icon: typeof Tag
  title: string
  subtitle?: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 mb-2">
      <div className="flex items-center gap-1.5 min-w-0">
        <Icon className="w-3.5 h-3.5 text-[color:var(--color-primary-500)]" />
        <h3 className="text-caption font-bold text-heading truncate">{title}</h3>
      </div>
      {subtitle && (
        <p className="text-[10px] text-disabled tabular-nums truncate">{subtitle}</p>
      )}
    </div>
  )
}

function PageSkeleton() {
  return (
    <div className="fold:p-3 p-4 lg:p-6 space-y-4">
      <div className="h-[140px] bg-[var(--surface-tertiary)] rounded-3xl animate-pulse" />
      <div className="flex gap-2">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-8 flex-shrink-0 w-16 bg-[var(--surface-tertiary)] rounded-full animate-pulse" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-[200px] bg-[var(--surface-tertiary)] rounded-2xl animate-pulse" />)}
      </div>
      {[1, 2, 3].map(i => <div key={i} className="h-[80px] bg-[var(--surface-tertiary)] rounded-2xl animate-pulse" />)}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="fold:p-3 p-4 lg:p-6">
      <div
        className="relative overflow-hidden rounded-3xl bg-surface-primary py-16 px-6 text-center"
        style={{
          boxShadow: 'inset 0 0 0 1px var(--border-default), 0 2px 12px rgba(0,0,0,0.04)',
        }}
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(circle at 50% 30%, color-mix(in srgb, var(--color-primary-500) 12%, transparent), transparent 60%)',
          }}
        />
        <div className="relative">
          <div
            className="w-20 h-20 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-700))',
              boxShadow: '0 8px 24px color-mix(in srgb, var(--color-primary-500) 40%, transparent)',
            }}
          >
            <Repeat className="w-9 h-9 text-white" />
          </div>
          <h3 className="text-title2 font-bold text-heading mb-2 tracking-tight">
            등록된 구독이 없습니다
          </h3>
          <p className="text-body3 text-sub max-w-[340px] mx-auto leading-relaxed">
            거래내역 작성 시 하단의 <span className="font-bold text-heading">구독 분류</span> 라벨을 선택한 거래만 여기에 표시됩니다.
            <br />
            지출관리에서 해당 거래를 열어 구독 분류를 지정해 보세요.
          </p>
        </div>
      </div>
    </div>
  )
}
