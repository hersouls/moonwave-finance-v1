import { useMemo, useRef } from 'react'
import { Line, Doughnut } from 'react-chartjs-2'
import type { Chart, ChartData } from 'chart.js'
import '@/lib/chartConfig'
import {
  premiumTooltip, premiumAnimation,
  getGridColor, getTextColor,
  createLineGradientRGBA,
  getPositiveColor,
  getChartSeries,
} from '@/lib/chartConfig'
import { formatKoreanUnit, formatPercent, formatKRW, formatChange } from '@/utils/format'
import type { InvestmentTrade, Dividend, AccountInterest } from '@/lib/types'
import type { MonthlySeasonality } from '@/hooks/useInvestmentInsights'
import { ChartA11ySummary } from '@/components/ui/ChartA11ySummary'

// ─── Cumulative Profit Line Chart ────────────────
export function CumulativeProfitChart({
  trades, dividends, interests,
}: {
  trades: InvestmentTrade[]
  dividends: Dividend[]
  interests: AccountInterest[]
}) {
  const chartRef = useRef<Chart<'line'>>(null)

  const { labels, tradeLine, divLine, interestLine, totalLine } = useMemo(() => {
    // Collect all dates
    const monthSet = new Set<string>()
    trades.forEach(t => monthSet.add(t.sellDate.slice(0, 7)))
    dividends.forEach(d => monthSet.add(d.paymentDate.slice(0, 7)))
    interests.forEach(r => monthSet.add(r.depositDate.slice(0, 7)))
    const months = Array.from(monthSet).sort()

    let cumTrade = 0, cumDiv = 0, cumInt = 0
    const tradeLine: number[] = []
    const divLine: number[] = []
    const interestLine: number[] = []
    const totalLine: number[] = []

    for (const m of months) {
      cumTrade += trades.filter(t => t.sellDate.startsWith(m)).reduce((s, t) => s + t.totalProfit, 0)
      cumDiv += dividends.filter(d => d.paymentDate.startsWith(m)).reduce((s, d) => s + d.dividendAmount - d.tax, 0)
      cumInt += interests.filter(r => r.depositDate.startsWith(m)).reduce((s, r) => s + r.interestAmount - r.tax, 0)
      tradeLine.push(cumTrade)
      divLine.push(cumDiv)
      interestLine.push(cumInt)
      totalLine.push(cumTrade + cumDiv + cumInt)
    }

    const labels = months.map(m => { const [y, mo] = m.split('-'); return `${y.slice(2)}.${mo}` })
    return { labels, tradeLine, divLine, interestLine, totalLine }
  }, [trades, dividends, interests])

  const chartData = useMemo((): ChartData<'line'> => ({
    labels,
    datasets: [
      {
        label: '합계',
        data: totalLine,
        borderColor: getChartSeries(1),
        backgroundColor: (ctx) => {
          const chart = ctx.chart
          if (!chart.chartArea) return 'rgba(59,130,246,0.1)'
          return createLineGradientRGBA(chart.ctx, chart.chartArea, 59, 130, 246, 0.18, 0.01)
        },
        fill: true,
        tension: 0.35,
        borderWidth: 2.5,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderWidth: 2,
        pointHoverBorderColor: getChartSeries(1),
      },
      {
        label: '판매수익',
        data: tradeLine,
        borderColor: getPositiveColor(),
        borderWidth: 1.5,
        borderDash: [4, 3],
        tension: 0.35,
        pointRadius: 0,
        fill: false,
      },
      {
        label: '배당금',
        data: divLine,
        borderColor: getChartSeries(3),
        borderWidth: 1.5,
        borderDash: [4, 3],
        tension: 0.35,
        pointRadius: 0,
        fill: false,
      },
      {
        label: '이자',
        data: interestLine,
        borderColor: getChartSeries(6),
        borderWidth: 1.5,
        borderDash: [4, 3],
        tension: 0.35,
        pointRadius: 0,
        fill: false,
      },
    ],
  }), [labels, totalLine, tradeLine, divLine, interestLine])

  if (labels.length < 2) return null

  return (
    <div className="rounded-2xl bg-surface-primary p-4 ring-1 ring-base">
      <h3 className="text-body3-semi text-heading mb-4">누적 수익 추이</h3>
      <ChartA11ySummary
        title="누적 수익 추이"
        description="월별 누적 투자수익(판매·배당·이자 합계) 추이"
        caption={`최종 누적 합계 ${formatKRW(totalLine[totalLine.length - 1] ?? 0)}`}
        rows={labels.map((l, i) => ({ label: l, value: formatKRW(totalLine[i] ?? 0) }))}
      />
      <div className="h-44 sm:h-48 lg:h-52" aria-hidden="true">
        <Line
          ref={chartRef}
          data={chartData}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            animation: premiumAnimation,
            interaction: { mode: 'index', intersect: false },
            scales: {
              x: {
                grid: { display: false },
                ticks: { color: getTextColor(), font: { size: 11, family: "'Pretendard', sans-serif" } },
                border: { display: false },
              },
              y: {
                grid: { color: getGridColor() },
                ticks: {
                  color: getTextColor(),
                  font: { size: 11, family: "'Pretendard', sans-serif" },
                  callback: (v) => `${formatKoreanUnit(Number(v))}`,
                },
                border: { display: false },
              },
            },
            plugins: {
              legend: {
                display: true,
                position: 'bottom',
                labels: {
                  color: getTextColor(),
                  font: { size: 11, family: "'Pretendard', sans-serif", weight: 'bold' },
                  usePointStyle: true,
                  pointStyle: 'circle',
                  padding: 12,
                },
              },
              tooltip: {
                ...premiumTooltip,
                callbacks: {
                  label: (ctx) => ` ${ctx.dataset.label}: ${formatKRW(ctx.parsed.y ?? 0)}`,
                },
              },
            },
          }}
        />
      </div>
    </div>
  )
}

// ─── Asset Type Doughnut Chart ───────────────────
export function AssetTypeDonutChart({ trades }: { trades: InvestmentTrade[] }) {
  const { chartData, breakdown } = useMemo(() => {
    const map = new Map<string, { profit: number; buy: number }>()
    for (const t of trades) {
      const e = map.get(t.assetType) ?? { profit: 0, buy: 0 }
      e.profit += t.totalProfit
      e.buy += t.totalBuyAmount
      map.set(t.assetType, e)
    }
    const breakdown = Array.from(map.entries())
      .map(([type, d]) => ({ type, profit: d.profit, buy: d.buy, share: 0 }))
      .sort((a, b) => b.buy - a.buy)
    const totalBuy = breakdown.reduce((s, b) => s + b.buy, 0)
    breakdown.forEach(b => b.share = totalBuy > 0 ? (b.buy / totalBuy) * 100 : 0)

    const colors = breakdown.map((_, i) => getChartSeries((i % 8 + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8))

    return {
      chartData: {
        labels: breakdown.map(b => b.type),
        datasets: [{
          data: breakdown.map(b => b.buy),
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: 'transparent',
          hoverOffset: 8,
        }],
      },
      breakdown: breakdown.map((b, i) => ({ ...b, color: colors[i] })),
    }
  }, [trades])

  if (breakdown.length === 0) return null

  const totalBuy = breakdown.reduce((s, b) => s + b.buy, 0)

  return (
    <div className="rounded-2xl bg-surface-primary p-4 ring-1 ring-base">
      <h3 className="text-body3-semi text-heading mb-4">자산유형별 구성</h3>
      <ChartA11ySummary
        title="자산유형별 구성"
        description="자산유형별 투자금(매수금액) 비중"
        rows={breakdown.map(b => ({ label: b.type, value: formatKRW(b.buy), extra: formatPercent(b.share, 0) }))}
      />
      <div className="flex items-center gap-6" aria-hidden="true">
        <div className="relative w-32 h-32 flex-shrink-0">
          <Doughnut
            data={chartData}
            options={{
              responsive: true,
              maintainAspectRatio: true,
              cutout: '68%',
              animation: premiumAnimation,
              plugins: {
                legend: { display: false },
                tooltip: {
                  ...premiumTooltip,
                  callbacks: {
                    label: (ctx) => {
                      const pct = totalBuy > 0 ? (ctx.parsed / totalBuy) * 100 : 0
                      return ` ${formatKoreanUnit(ctx.parsed)}원 (${formatPercent(pct, 0)})`
                    },
                  },
                },
              },
            }}
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-micro text-disabled">투자금</span>
            <span className="text-label3 text-heading tabular-nums">{formatKoreanUnit(totalBuy)}</span>
          </div>
        </div>
        <div className="flex-1 space-y-2 min-w-0">
          {breakdown.slice(0, 6).map(b => (
            <div key={b.type} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: b.color, boxShadow: `0 0 6px ${b.color}40` }} />
              <span className="text-label3-medium text-sub truncate flex-1">{b.type}</span>
              <span className="text-micro-bold text-heading tabular-nums">{formatPercent(b.share, 0)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Season Heatmap ──────────────────────────────
export function SeasonHeatmap({ seasonality }: { seasonality: MonthlySeasonality[] }) {
  if (seasonality.length < 2) return null

  const allMonths = Array.from({ length: 12 }, (_, i) => i + 1)
  const dataMap = new Map(seasonality.map(s => [s.month, s]))
  const maxProfit = Math.max(...seasonality.map(s => Math.abs(s.avgProfit)), 1)

  return (
    <div className="rounded-2xl bg-surface-primary p-4 ring-1 ring-base">
      <h3 className="text-body3-semi text-heading mb-3">월별 시즌 패턴</h3>
      <ChartA11ySummary
        title="월별 시즌 패턴"
        description="매도 월별 평균 수익과 승률"
        rows={seasonality.map(s => ({ label: `${s.month}월`, value: formatChange(Math.round(s.avgProfit)), extra: `승률 ${s.winRate.toFixed(0)}%` }))}
      />
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-1 sm:gap-1.5" aria-hidden="true">
        {allMonths.map(m => {
          const d = dataMap.get(m)
          const intensity = d ? Math.min(Math.abs(d.avgProfit) / maxProfit, 1) : 0
          const isPositive = d ? d.avgProfit >= 0 : true

          return (
            <div
              key={m}
              className="relative flex flex-col items-center justify-center rounded-lg py-2.5 transition-all"
              style={{
                backgroundColor: d
                  ? isPositive
                    ? `color-mix(in srgb, var(--value-positive) ${Math.round(intensity * 30 + 5)}%, transparent)`
                    : `color-mix(in srgb, var(--value-negative) ${Math.round(intensity * 30 + 5)}%, transparent)`
                  : 'var(--surface-tertiary)',
                boxShadow: d && intensity > 0.5
                  ? isPositive
                    ? `inset 0 0 0 1px color-mix(in srgb, var(--value-positive) 30%, transparent)`
                    : `inset 0 0 0 1px color-mix(in srgb, var(--value-negative) 30%, transparent)`
                  : 'none',
              }}
            >
              <span className="text-micro-bold text-heading">{m}월</span>
              {d ? (
                <>
                  <span className="text-micro-bold tabular-nums mt-0.5" style={{ color: isPositive ? 'var(--value-positive)' : 'var(--value-negative)' }}>
                    {isPositive ? '+' : ''}{formatKoreanUnit(Math.round(d.avgProfit))}
                  </span>
                  <span className="text-micro text-disabled tabular-nums">승률 {d.winRate.toFixed(0)}%</span>
                </>
              ) : (
                <span className="text-micro text-disabled mt-0.5">—</span>
              )}
            </div>
          )
        })}
      </div>
      <div className="flex items-center justify-center gap-4 mt-3">
        <span className="flex items-center gap-1 text-micro text-sub">
          <span className="w-3 h-2 rounded-sm" style={{ backgroundColor: 'color-mix(in srgb, var(--value-positive) 25%, transparent)' }} />수익
        </span>
        <span className="flex items-center gap-1 text-micro text-sub">
          <span className="w-3 h-2 rounded-sm" style={{ backgroundColor: 'color-mix(in srgb, var(--value-negative) 25%, transparent)' }} />손실
        </span>
        <span className="flex items-center gap-1 text-micro text-sub">
          <span className="w-3 h-2 rounded-sm bg-surface-tertiary" />데이터 없음
        </span>
      </div>
    </div>
  )
}

// ─── Period Comparison Card ──────────────────────
export function PeriodComparison({
  trades, dividends, interests,
}: {
  trades: InvestmentTrade[]
  dividends: Dividend[]
  interests: AccountInterest[]
}) {
  const { thisMonth, lastMonth, thisYear, lastYear } = useMemo(() => {
    const now = new Date()
    const thisM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastM = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`
    const thisY = String(now.getFullYear())
    const lastY = String(now.getFullYear() - 1)

    const sumMonth = (m: string) => {
      const t = trades.filter(x => x.sellDate.startsWith(m)).reduce((s, x) => s + x.totalProfit, 0)
      const d = dividends.filter(x => x.paymentDate.startsWith(m)).reduce((s, x) => s + x.dividendAmount - x.tax, 0)
      const i = interests.filter(x => x.depositDate.startsWith(m)).reduce((s, x) => s + x.interestAmount - x.tax, 0)
      return t + d + i
    }
    const sumYear = (y: string) => {
      const t = trades.filter(x => x.sellDate.startsWith(y)).reduce((s, x) => s + x.totalProfit, 0)
      const d = dividends.filter(x => x.paymentDate.startsWith(y)).reduce((s, x) => s + x.dividendAmount - x.tax, 0)
      const i = interests.filter(x => x.depositDate.startsWith(y)).reduce((s, x) => s + x.interestAmount - x.tax, 0)
      return t + d + i
    }

    return {
      thisMonth: { label: thisM.split('-').map((v, i) => i === 0 ? v.slice(2) : v).join('.'), value: sumMonth(thisM) },
      lastMonth: { label: lastM.split('-').map((v, i) => i === 0 ? v.slice(2) : v).join('.'), value: sumMonth(lastM) },
      thisYear: { label: `${thisY}년`, value: sumYear(thisY) },
      lastYear: { label: `${lastY}년`, value: sumYear(lastY) },
    }
  }, [trades, dividends, interests])

  const monthDelta = thisMonth.value - lastMonth.value
  const monthPct = lastMonth.value !== 0 ? (monthDelta / Math.abs(lastMonth.value)) * 100 : 0
  const yearDelta = thisYear.value - lastYear.value
  const yearPct = lastYear.value !== 0 ? (yearDelta / Math.abs(lastYear.value)) * 100 : 0

  return (
    <div className="rounded-2xl bg-surface-primary p-4 ring-1 ring-base">
      <h3 className="text-body3-semi text-heading mb-3">기간 비교</h3>
      <ChartA11ySummary
        title="기간 비교"
        description="이번 달·지난 달·올해·작년 투자수익 비교"
        rows={[
          { label: `${thisMonth.label} (이번 달)`, value: formatChange(thisMonth.value) },
          { label: `${lastMonth.label} (지난 달)`, value: formatChange(lastMonth.value) },
          { label: thisYear.label, value: formatChange(thisYear.value) },
          { label: lastYear.label, value: formatChange(lastYear.value) },
        ]}
      />
      <div className="space-y-3">
        {/* Monthly */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-micro-bold uppercase tracking-wider text-disabled">월간</span>
            {monthDelta !== 0 && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-label4 tabular-nums ring-1"
                style={{
                  backgroundColor: monthDelta >= 0 ? 'var(--status-success-bg)' : 'var(--status-danger-bg)',
                  color: monthDelta >= 0 ? 'var(--status-success-text)' : 'var(--status-danger-text)',
                  boxShadow: monthDelta >= 0 ? 'inset 0 0 0 1px color-mix(in srgb, var(--status-success-text) 15%, transparent)' : 'inset 0 0 0 1px color-mix(in srgb, var(--status-danger-text) 15%, transparent)',
                }}>
                {monthDelta >= 0 ? '+' : ''}{monthPct.toFixed(0)}%
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-surface-tertiary rounded-xl px-3 py-2">
              <p className="text-micro text-disabled">{thisMonth.label} (이번 달)</p>
              <p className="text-body3-bold tabular-nums" style={{ color: thisMonth.value >= 0 ? 'var(--value-positive)' : 'var(--value-negative)' }}>
                {thisMonth.value >= 0 ? '+' : ''}{formatKoreanUnit(thisMonth.value)}원
              </p>
            </div>
            <div className="bg-surface-tertiary rounded-xl px-3 py-2">
              <p className="text-micro text-disabled">{lastMonth.label} (지난 달)</p>
              <p className="text-body3-bold tabular-nums" style={{ color: lastMonth.value >= 0 ? 'var(--value-positive)' : 'var(--value-negative)' }}>
                {lastMonth.value >= 0 ? '+' : ''}{formatKoreanUnit(lastMonth.value)}원
              </p>
            </div>
          </div>
        </div>
        {/* Yearly */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-micro-bold uppercase tracking-wider text-disabled">연간</span>
            {yearDelta !== 0 && lastYear.value !== 0 && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-label4 tabular-nums ring-1"
                style={{
                  backgroundColor: yearDelta >= 0 ? 'var(--status-success-bg)' : 'var(--status-danger-bg)',
                  color: yearDelta >= 0 ? 'var(--status-success-text)' : 'var(--status-danger-text)',
                  boxShadow: yearDelta >= 0 ? 'inset 0 0 0 1px color-mix(in srgb, var(--status-success-text) 15%, transparent)' : 'inset 0 0 0 1px color-mix(in srgb, var(--status-danger-text) 15%, transparent)',
                }}>
                {yearDelta >= 0 ? '+' : ''}{yearPct.toFixed(0)}%
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-surface-tertiary rounded-xl px-3 py-2">
              <p className="text-micro text-disabled">{thisYear.label}</p>
              <p className="text-body3-bold tabular-nums" style={{ color: thisYear.value >= 0 ? 'var(--value-positive)' : 'var(--value-negative)' }}>
                {thisYear.value >= 0 ? '+' : ''}{formatKoreanUnit(thisYear.value)}원
              </p>
            </div>
            <div className="bg-surface-tertiary rounded-xl px-3 py-2">
              <p className="text-micro text-disabled">{lastYear.label}</p>
              <p className="text-body3-bold tabular-nums" style={{ color: lastYear.value >= 0 ? 'var(--value-positive)' : 'var(--value-negative)' }}>
                {lastYear.value >= 0 ? '+' : ''}{formatKoreanUnit(lastYear.value)}원
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
