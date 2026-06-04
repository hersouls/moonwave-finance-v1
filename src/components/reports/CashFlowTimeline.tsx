import { useMemo, useId } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { CalendarDays, TrendingUp } from 'lucide-react'
import { clsx } from 'clsx'
import { formatKoreanUnit } from '@/utils/format'
import { easeOutExpo, durations } from '@/lib/motionConfig'
import type { LedgerAnalysis } from '@/hooks/useLedgerAnalysis'

interface Props {
  analysis: LedgerAnalysis
}

/**
 * Daily cumulative cash flow visualization — shows where the user's running
 * spend stands within the month vs. the prior month at the same day-of-month
 * checkpoint. When viewing the current month, a dotted projection line
 * extends from today's data point out to the projected month-end total.
 *
 * Rendered as custom SVG so layering (fill gradient, dashed prev line,
 * dotted projection, today marker, axis labels) stays tight without a chart
 * library wrapper.
 */
export function CashFlowTimeline({ analysis }: Props) {
  const shouldReduceMotion = useReducedMotion()
  const { cashFlow, current, prev } = analysis
  const gradId = useId().replace(/:/g, '')

  const { width, height, padding, paths, todayMarker, peakLabel } = useMemo(() => {
    const W = 800
    const H = 220
    const PAD = { top: 18, right: 18, bottom: 26, left: 12 }
    const innerW = W - PAD.left - PAD.right
    const innerH = H - PAD.top - PAD.bottom

    const dayCount = cashFlow.days.length
    if (dayCount === 0) {
      return {
        width: W, height: H, padding: PAD,
        paths: { currentLine: '', currentFill: '', prevLine: '', projectionLine: '' },
        todayMarker: null,
        peakLabel: null,
      }
    }

    // Determine the y-scale: peak of either series so both fit.
    const peakCurrent = Math.max(...cashFlow.cumulative, 0)
    const peakPrev = Math.max(...cashFlow.cumulativePrev, 0)
    const peakProjection = cashFlow.todayIndex > 0 ? cashFlow.projectedTotal : 0
    const yMax = Math.max(peakCurrent, peakPrev, peakProjection, 1)

    const xAt = (i: number) => PAD.left + (i / Math.max(1, dayCount - 1)) * innerW
    const yAt = (v: number) => PAD.top + (1 - v / yMax) * innerH

    // Visible portion of current line (truncate to todayIndex if current month)
    const visibleEnd = cashFlow.todayIndex > 0 ? cashFlow.todayIndex : dayCount

    let currentLine = ''
    for (let i = 0; i < visibleEnd; i++) {
      currentLine += (i === 0 ? 'M ' : ' L ') + `${xAt(i).toFixed(2)} ${yAt(cashFlow.cumulative[i]).toFixed(2)}`
    }

    // Fill under current line
    let currentFill = currentLine
    if (currentLine) {
      const lastX = xAt(visibleEnd - 1)
      currentFill += ` L ${lastX.toFixed(2)} ${(PAD.top + innerH).toFixed(2)} L ${PAD.left.toFixed(2)} ${(PAD.top + innerH).toFixed(2)} Z`
    }

    // Previous month line — full range aligned by day index
    let prevLine = ''
    for (let i = 0; i < dayCount; i++) {
      prevLine += (i === 0 ? 'M ' : ' L ') + `${xAt(i).toFixed(2)} ${yAt(cashFlow.cumulativePrev[i]).toFixed(2)}`
    }

    // Projection line — from today to end of month (only when current month)
    let projectionLine = ''
    if (cashFlow.todayIndex > 0 && cashFlow.dailyAvgSoFar > 0) {
      const startX = xAt(visibleEnd - 1)
      const startY = yAt(cashFlow.cumulative[visibleEnd - 1])
      const endX = xAt(dayCount - 1)
      const endY = yAt(cashFlow.projectedTotal)
      projectionLine = `M ${startX.toFixed(2)} ${startY.toFixed(2)} L ${endX.toFixed(2)} ${endY.toFixed(2)}`
    }

    // Today marker
    const todayMarker = cashFlow.todayIndex > 0
      ? {
          x: xAt(cashFlow.todayIndex - 1),
          y: yAt(cashFlow.cumulative[visibleEnd - 1]),
        }
      : null

    return {
      width: W,
      height: H,
      padding: PAD,
      paths: { currentLine, currentFill, prevLine, projectionLine },
      todayMarker,
      peakLabel: {
        currentPeak: peakCurrent,
        prevPeak: peakPrev,
      },
    }
  }, [cashFlow])

  if (cashFlow.days.length === 0) return null

  const accent = 'var(--color-primary-500)'
  const isCurrent = cashFlow.todayIndex > 0
  const expectedDelta = current.expense - prev.expense

  return (
    <motion.section
      id="cashflow"
      initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: durations.base, ease: easeOutExpo }}
      className="rounded-3xl bg-surface-primary ring-1 ring-base elevation-2 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: `linear-gradient(135deg, color-mix(in srgb, ${accent} 22%, transparent), color-mix(in srgb, ${accent} 8%, transparent))`,
              boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${accent} 32%, transparent)`,
            }}
          >
            <CalendarDays className="w-4 h-4" style={{ color: accent }} />
          </div>
          <div className="min-w-0">
            <h3 className="text-title3 text-heading tracking-tight">일별 누적 지출</h3>
            <p className="text-caption text-sub mt-0.5">
              {isCurrent
                ? `오늘 ${cashFlow.todayIndex}일차 · 일평균 ${formatKoreanUnit(cashFlow.dailyAvgSoFar)}원`
                : '월 전체 누적'}
            </p>
          </div>
        </div>

        {isCurrent && cashFlow.projectedTotal > 0 && (
          <div className="text-right flex-shrink-0">
            <p className="text-label4 font-bold leading-none uppercase tracking-wider text-sub">예상 월말</p>
            <p className="text-body3-bold tabular-nums" style={{ color: accent }}>
              {formatKoreanUnit(cashFlow.projectedTotal)}원
            </p>
          </div>
        )}
      </div>

      {/* SVG chart */}
      <div className="px-3 sm:px-4 pb-2">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="일별 누적 지출 차트"
          className="w-full block"
          style={{ height: 220 }}
        >
          <defs>
            <linearGradient id={`fill-${gradId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accent} stopOpacity={0.25} />
              <stop offset="100%" stopColor={accent} stopOpacity={0} />
            </linearGradient>
          </defs>

          {/* Y baseline */}
          <line
            x1={padding.left} x2={width - padding.right}
            y1={height - padding.bottom} y2={height - padding.bottom}
            stroke="var(--border-default)" strokeWidth={1}
          />

          {/* Prev month line (dashed) */}
          {paths.prevLine && (
            <path
              d={paths.prevLine}
              fill="none"
              stroke="var(--text-disabled)"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              strokeLinecap="round"
              opacity={0.6}
            />
          )}

          {/* Current fill */}
          {paths.currentFill && (
            <path d={paths.currentFill} fill={`url(#fill-${gradId})`} />
          )}

          {/* Projection (dotted) */}
          {paths.projectionLine && (
            <path
              d={paths.projectionLine}
              fill="none"
              stroke={accent}
              strokeWidth={1.5}
              strokeDasharray="2 4"
              strokeLinecap="round"
              opacity={0.7}
            />
          )}

          {/* Current line (solid) */}
          {paths.currentLine && (
            <motion.path
              d={paths.currentLine}
              fill="none"
              stroke={accent}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={shouldReduceMotion ? undefined : { pathLength: 0 }}
              animate={shouldReduceMotion ? undefined : { pathLength: 1 }}
              transition={{ duration: 0.9, ease: easeOutExpo }}
            />
          )}

          {/* Today marker */}
          {todayMarker && (
            <>
              <line
                x1={todayMarker.x} x2={todayMarker.x}
                y1={padding.top} y2={height - padding.bottom}
                stroke={accent} strokeWidth={1} strokeDasharray="2 3" opacity={0.5}
              />
              <circle cx={todayMarker.x} cy={todayMarker.y} r={6} fill={accent} opacity={0.18} />
              <circle cx={todayMarker.x} cy={todayMarker.y} r={3.5} fill={accent} stroke="var(--surface-primary)" strokeWidth={1.5} />
            </>
          )}

          {/* X-axis labels: 1일, 중간, 말일 */}
          <text
            x={padding.left} y={height - 6}
            fontSize="10" fill="var(--text-sub)" fontWeight="600"
            className="tabular-nums"
          >
            1일
          </text>
          <text
            x={width / 2} y={height - 6}
            textAnchor="middle"
            fontSize="10" fill="var(--text-sub)" fontWeight="600"
            className="tabular-nums"
          >
            {Math.ceil(cashFlow.days.length / 2)}일
          </text>
          <text
            x={width - padding.right} y={height - 6}
            textAnchor="end"
            fontSize="10" fill="var(--text-sub)" fontWeight="600"
            className="tabular-nums"
          >
            {cashFlow.days.length}일
          </text>
        </svg>
      </div>

      {/* Footer legend + delta */}
      <div className="px-5 pb-4 pt-1 flex flex-wrap gap-x-4 gap-y-1.5 items-center justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <LegendDot label="이번 달" color={accent} />
          <LegendDot label="지난 달" color="var(--text-disabled)" dashed />
          {isCurrent && cashFlow.projectedTotal > 0 && (
            <LegendDot label="예상선" color={accent} dotted />
          )}
        </div>
        <p
          className={clsx(
            'text-label4 font-bold leading-none tabular-nums inline-flex items-center gap-1',
            expectedDelta > 0 ? 'text-status-danger' : expectedDelta < 0 ? 'text-status-success' : 'text-sub',
          )}
        >
          <TrendingUp className="w-3 h-3" />
          전월 대비 {expectedDelta > 0 ? '+' : expectedDelta < 0 ? '−' : ''}
          {formatKoreanUnit(Math.abs(expectedDelta))}원
          {peakLabel && peakLabel.prevPeak > 0 && (
            <span className="text-disabled font-semibold ml-1">
              ({Math.round((expectedDelta / peakLabel.prevPeak) * 100)}%)
            </span>
          )}
        </p>
      </div>
    </motion.section>
  )
}

function LegendDot({
  label, color, dashed, dotted,
}: { label: string; color: string; dashed?: boolean; dotted?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block w-5 h-[2px] rounded-full"
        style={{
          background: dashed || dotted
            ? `repeating-linear-gradient(90deg, ${color} 0, ${color} ${dotted ? '2px' : '4px'}, transparent ${dotted ? '2px' : '4px'}, transparent ${dotted ? '5px' : '8px'})`
            : color,
        }}
        aria-hidden="true"
      />
      <span className="text-caption text-sub font-semibold">{label}</span>
    </span>
  )
}
