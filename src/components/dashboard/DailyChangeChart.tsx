import { useMemo } from 'react'
import { Bar } from 'react-chartjs-2'
import '@/lib/chartConfig'
import {
  commonBarOptions,
  getGridColor,
  getTextColor,
  formatChartLabel,
  premiumTooltip,
  premiumAnimation,
  getPositiveColor,
  getNegativeColor,
} from '@/lib/chartConfig'
import { useDailyValueStore } from '@/stores/dailyValueStore'
import { useAssetStore } from '@/stores/assetStore'
import { getMonthDates } from '@/lib/dateUtils'
import { Card } from '@/components/ui/Card'
import { ChartA11ySummary } from '@/components/ui/ChartA11ySummary'
import { formatKoreanUnit } from '@/utils/format'

/** Apply a faint alpha for non-hover state by converting oklch/hex to rgba with 0.75 */
function withAlpha(color: string, alpha = 0.75): string {
  // oklch() supports / alpha natively
  if (color.startsWith('oklch')) {
    // replace trailing `)` with ` / alpha)`; keep any existing alpha if present
    return color.includes('/') ? color : color.replace(/\)$/, ` / ${alpha})`)
  }
  // fallback: color-mix with transparent
  return `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`
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

    const positiveBase = getPositiveColor()
    const negativeBase = getNegativeColor()
    const positiveColor = withAlpha(positiveBase, 0.75)
    const negativeColor = withAlpha(negativeBase, 0.75)

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
            hoverBackgroundColor: changes.map(c => c >= 0 ? positiveBase : negativeBase),
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
        <h3 className="text-body3-semi text-heading">일별 변동</h3>
        {chartData.avg !== 0 && (
          <span className="text-caption text-disabled tabular-nums">
            평균 {formatKoreanUnit(Math.round(chartData.avg))}원
          </span>
        )}
      </div>
      <ChartA11ySummary
        title="일별 순자산 변동"
        description={`${selectedMonth} 일별 변동폭. 평균 ${formatKoreanUnit(Math.round(chartData.avg))}원.`}
        rows={chartData.data.labels.map((label: string, i: number) => {
          const v = (chartData.data.datasets[0].data as number[])[i]
          return {
            label,
            value: `${v >= 0 ? '+' : ''}${formatKoreanUnit(v)}원`,
          }
        })}
      />
      <div className="h-52" aria-hidden="true">
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
