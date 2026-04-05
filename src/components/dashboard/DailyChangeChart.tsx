import { useMemo } from 'react'
import { Bar } from 'react-chartjs-2'
import '@/lib/chartConfig'
import { commonBarOptions, getGridColor, getTextColor, formatChartLabel, premiumTooltip, premiumAnimation } from '@/lib/chartConfig'
import { useDailyValueStore } from '@/stores/dailyValueStore'
import { useAssetStore } from '@/stores/assetStore'
import { getMonthDates } from '@/lib/dateUtils'
import { Card } from '@/components/ui/Card'
import { formatKoreanUnit } from '@/utils/format'

function isDark() {
  return document.documentElement.classList.contains('dark')
}

export function DailyChangeChart() {
  const values = useDailyValueStore((s) => s.values)
  const items = useAssetStore((s) => s.items)
  const selectedMonth = useDailyValueStore((s) => s.selectedMonth)

  const chartData = useMemo(() => {
    const dates = getMonthDates(selectedMonth)
    const valueMap = new Map<string, number>()
    for (const v of values) {
      valueMap.set(`${v.assetItemId}-${v.date}`, v.value)
    }

    const netWorths = dates.map(date => {
      let assets = 0
      let liabilities = 0
      for (const item of items) {
        if (!item.isActive) continue
        const val = valueMap.get(`${item.id}-${date}`) || 0
        if (item.type === 'asset') assets += val
        else liabilities += val
      }
      return assets - liabilities
    })

    const changes = netWorths.map((nw, i) => i === 0 ? 0 : nw - netWorths[i - 1])
    const hasData = changes.some(v => v !== 0)
    if (!hasData) return null

    const dark = isDark()
    const positiveColor = dark ? 'rgba(52, 211, 153, 0.75)' : 'rgba(16, 185, 129, 0.75)'
    const negativeColor = dark ? 'rgba(248, 113, 113, 0.75)' : 'rgba(239, 68, 68, 0.75)'

    // Compute average for reference line
    const nonZeroChanges = changes.filter(c => c !== 0)
    const avg = nonZeroChanges.length > 0 ? nonZeroChanges.reduce((a, b) => a + b, 0) / nonZeroChanges.length : 0

    return {
      data: {
        labels: dates.map(formatChartLabel),
        datasets: [
          {
            label: '일별 변동',
            data: changes,
            backgroundColor: changes.map(c => c >= 0 ? positiveColor : negativeColor),
            hoverBackgroundColor: changes.map(c => c >= 0 ? (dark ? '#34d399' : '#10b981') : (dark ? '#f87171' : '#ef4444')),
            borderRadius: 4,
            borderSkipped: false as const,
          },
        ],
      },
      avg,
    }
  }, [values, items, selectedMonth])

  if (!chartData) return null

  return (
    <Card className="card-pad-lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-body3-semi text-zinc-900 dark:text-zinc-100">일별 변동</h3>
        {chartData.avg !== 0 && (
          <span className="text-caption text-zinc-400 dark:text-zinc-500 tabular-nums">
            평균 {formatKoreanUnit(Math.round(chartData.avg))}원
          </span>
        )}
      </div>
      <div className="h-52">
        <Bar
          data={chartData.data}
          options={{
            ...commonBarOptions,
            animation: premiumAnimation,
            plugins: {
              ...commonBarOptions.plugins,
              tooltip: {
                ...premiumTooltip,
                callbacks: {
                  label: (ctx) => {
                    const val = ctx.parsed.y ?? 0
                    const prefix = val >= 0 ? '+' : ''
                    return ` ${prefix}${formatKoreanUnit(val)}원`
                  },
                },
              },
            },
            scales: {
              ...commonBarOptions.scales,
              x: {
                ...commonBarOptions.scales.x,
                ticks: {
                  ...commonBarOptions.scales.x.ticks,
                  color: getTextColor(),
                  maxTicksLimit: 10,
                },
              },
              y: {
                ...commonBarOptions.scales.y,
                grid: { color: getGridColor(), lineWidth: 0.5 },
                ticks: {
                  ...commonBarOptions.scales.y.ticks,
                  color: getTextColor(),
                },
              },
            },
          }}
        />
      </div>
    </Card>
  )
}
