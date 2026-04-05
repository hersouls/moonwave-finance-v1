import { useMemo, useRef } from 'react'
import { Line } from 'react-chartjs-2'
import type { ChartData, Chart } from 'chart.js'
import '@/lib/chartConfig'
import { commonLineOptions, getGridColor, getTextColor, formatChartLabel, createLineGradientRGBA, getChartColor, premiumTooltip } from '@/lib/chartConfig'
import { useDailyValueStore } from '@/stores/dailyValueStore'
import { useAssetStore } from '@/stores/assetStore'
import { getMonthDates } from '@/lib/dateUtils'
import { Card } from '@/components/ui/Card'
import { formatKoreanUnit } from '@/utils/format'

export function NetWorthTrendChart() {
  const chartRef = useRef<Chart<'line'>>(null)
  const values = useDailyValueStore((s) => s.values)
  const items = useAssetStore((s) => s.items)
  const selectedMonth = useDailyValueStore((s) => s.selectedMonth)

  const netWorths = useMemo(() => {
    const dates = getMonthDates(selectedMonth)
    const valueMap = new Map<string, number>()
    for (const v of values) {
      valueMap.set(`${v.assetItemId}-${v.date}`, v.value)
    }

    return dates.map(date => {
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
  }, [values, items, selectedMonth])

  const dates = useMemo(() => getMonthDates(selectedMonth), [selectedMonth])
  const hasData = netWorths.some(v => v !== 0)

  const chartData = useMemo((): ChartData<'line'> => ({
    labels: dates.map(formatChartLabel),
    datasets: [
      {
        label: '순자산',
        data: netWorths,
        borderColor: getChartColor('income').line,
        backgroundColor: (ctx) => {
          const chart = ctx.chart
          const { ctx: context, chartArea } = chart
          if (!chartArea) return 'rgba(16, 185, 129, 0.1)'
          const c = getChartColor('income').fill
          return createLineGradientRGBA(context, chartArea, c[0], c[1], c[2], 0.2, 0.01)
        },
        fill: true,
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderWidth: 2,
        pointHoverBorderColor: getChartColor('income').line,
        borderWidth: 2.5,
      },
    ],
  }), [netWorths, dates])

  if (!hasData) return null

  return (
    <Card className="card-pad-lg">
      <h3 className="text-body3-semi text-zinc-900 dark:text-zinc-100 mb-4">순자산 추이</h3>
      <div className="h-52">
        <Line
          ref={chartRef}
          data={chartData}
          options={{
            ...commonLineOptions,
            plugins: {
              ...commonLineOptions.plugins,
              tooltip: {
                ...premiumTooltip,
                callbacks: {
                  label: (ctx) => ` ${formatKoreanUnit(ctx.parsed.y ?? 0)}원`,
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
                grid: { color: getGridColor(), lineWidth: 0.5 },
                ticks: {
                  ...commonLineOptions.scales.y.ticks,
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
