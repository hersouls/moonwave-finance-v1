import { useState, useMemo } from 'react'
import { Line } from 'react-chartjs-2'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import '@/lib/chartConfig'
import { commonLineOptions, getGridColor, getTextColor, formatChartLabel } from '@/lib/chartConfig'
import { useAssetStore } from '@/stores/assetStore'
import { useDailyValueStore } from '@/stores/dailyValueStore'
import { calculateDailyNetWorth } from '@/services/assetAnalytics'
import { getCurrentMonthString, getPreviousMonth, getNextMonth, formatMonthLabel } from '@/lib/dateUtils'
import { Amount } from '@/components/ui/Amount'
import { Card } from '@/components/ui/Card'

export function DailyNetWorthChart() {
  const [displayMonth, setDisplayMonth] = useState(getCurrentMonthString())

  const items = useAssetStore((s) => s.items)
  const allValues = useDailyValueStore((s) => s.allValues)

  const activeItems = useMemo(() => items.filter(i => i.isActive), [items])

  const snapshots = useMemo(() => {
    if (activeItems.length === 0 || allValues.length === 0) return []
    return calculateDailyNetWorth(displayMonth, activeItems, allValues)
  }, [displayMonth, activeItems, allValues])

  const hasData = snapshots.some(s => s.totalAssets !== 0 || s.totalLiabilities !== 0)

  const chartData = useMemo(() => {
    if (!hasData) return null

    return {
      labels: snapshots.map(s => formatChartLabel(s.date)),
      datasets: [
        {
          label: '순자산',
          data: snapshots.map(s => s.netWorth),
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 4,
          borderWidth: 2,
        },
        {
          label: '총 자산',
          data: snapshots.map(s => s.totalAssets),
          borderColor: '#3b82f6',
          borderDash: [5, 5],
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 3,
          borderWidth: 1.5,
        },
        {
          label: '총 부채',
          data: snapshots.map(s => s.totalLiabilities),
          borderColor: '#ef4444',
          borderDash: [5, 5],
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 3,
          borderWidth: 1.5,
        },
      ],
    }
  }, [snapshots, hasData])

  const isCurrentMonth = displayMonth === getCurrentMonthString()

  return (
    <Card className="card-pad-lg">
      {/* Header with month navigation */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-body3-semi text-heading">일별 순자산 추이</h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setDisplayMonth(getPreviousMonth(displayMonth))}
            className="p-1.5 rounded-lg hover:bg-[var(--hover-bg)] transition-colors"
            aria-label="이전 월"
          >
            <ChevronLeft className="w-4 h-4 text-sub" />
          </button>
          <span className="text-body3 text-sub min-w-[90px] text-center tabular-nums">
            {formatMonthLabel(displayMonth)}
          </span>
          <button
            type="button"
            onClick={() => setDisplayMonth(getNextMonth(displayMonth))}
            disabled={isCurrentMonth}
            className="p-1.5 rounded-lg hover:bg-[var(--hover-bg)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="다음 월"
          >
            <ChevronRight className="w-4 h-4 text-sub" />
          </button>
        </div>
      </div>

      {/* Summary row */}
      {hasData && snapshots.length > 0 && (
        <div className="flex gap-4 mb-4 text-caption">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="text-sub">순자산</span>
            <Amount value={snapshots[snapshots.length - 1].netWorth} size="caption" className="text-heading font-medium" unit="" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            <span className="text-sub">자산</span>
            <Amount value={snapshots[snapshots.length - 1].totalAssets} size="caption" className="text-heading font-medium" unit="" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <span className="text-sub">부채</span>
            <Amount value={snapshots[snapshots.length - 1].totalLiabilities} size="caption" className="text-heading font-medium" unit="" />
          </div>
        </div>
      )}

      {/* Chart */}
      {chartData ? (
        <div className="h-64">
          <Line
            data={chartData}
            options={{
              ...commonLineOptions,
              plugins: {
                ...commonLineOptions.plugins,
                legend: { display: false },
                tooltip: {
                  ...commonLineOptions.plugins.tooltip,
                  displayColors: true,
                  callbacks: {
                    label: (ctx) => {
                      const label = ctx.dataset.label || ''
                      const value = ctx.parsed.y ?? 0
                      return ` ${label}: ${value.toLocaleString('ko-KR')}원`
                    },
                  },
                },
              },
              scales: {
                ...commonLineOptions.scales,
                x: {
                  ...commonLineOptions.scales.x,
                  ticks: {
                    ...commonLineOptions.scales.x.ticks,
                    color: getTextColor(),
                    maxTicksLimit: 10,
                  },
                },
                y: {
                  ...commonLineOptions.scales.y,
                  grid: { color: getGridColor() },
                  ticks: {
                    ...commonLineOptions.scales.y.ticks,
                    color: getTextColor(),
                  },
                },
              },
            }}
          />
        </div>
      ) : (
        <div className="h-64 flex items-center justify-center">
          <p className="text-body3 text-disabled">
            {formatMonthLabel(displayMonth)}에 기록된 데이터가 없습니다.
          </p>
        </div>
      )}
    </Card>
  )
}
