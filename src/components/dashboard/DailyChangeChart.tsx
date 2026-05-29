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
import { getMonthDates, getPreviousMonth } from '@/lib/dateUtils'
import { calculateDailyNetWorth, groupValuesByItem, valueAsOf } from '@/services/assetAnalytics'
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
  // 전체 이력 + Forward-Fill 기반으로 일별 순자산을 산출한 뒤 전일 대비 변동을 계산한다.
  const allValues = useDailyValueStore((s) => s.allValues)
  const items = useAssetStore((s) => s.items)
  const selectedMonth = useDailyValueStore((s) => s.selectedMonth)

  const chartData = useMemo(() => {
    const dates = getMonthDates(selectedMonth)
    const activeItems = items.filter(i => i.isActive)
    const netWorths = calculateDailyNetWorth(selectedMonth, activeItems, allValues).map(s => s.netWorth)

    // 1일의 변동폭은 전월 마지막 날 순자산(이월값)을 기준으로 계산한다.
    const prevMonth = getPreviousMonth(selectedMonth)
    const prevMonthDates = getMonthDates(prevMonth)
    const prevMonthLastDate = prevMonthDates[prevMonthDates.length - 1]
    const byItem = groupValuesByItem(allValues)
    let carryInNetWorth = 0
    for (const item of activeItems) {
      if (item.id == null) continue
      const v = valueAsOf(byItem.get(item.id), prevMonthLastDate)
      carryInNetWorth += item.type === 'asset' ? v : -v
    }

    const changes = netWorths.map((nw, i) => i === 0 ? nw - carryInNetWorth : nw - netWorths[i - 1])
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
  }, [allValues, items, selectedMonth])

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
