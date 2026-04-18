import { useMemo, useRef } from 'react'
import { Line } from 'react-chartjs-2'
import type { ChartData, Chart } from 'chart.js'
import '@/lib/chartConfig'
import { commonLineOptions, getGridColor, getTextColor, formatChartLabel, createLineGradientRGBA, getChartColor, premiumTooltip } from '@/lib/chartConfig'
import { useDailyValueStore } from '@/stores/dailyValueStore'
import { useAssetStore } from '@/stores/assetStore'
import { getMonthDates } from '@/lib/dateUtils'
import { Card } from '@/components/ui/Card'
import { ChartA11ySummary } from '@/components/ui/ChartA11ySummary'
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
        borderColor: getChartColor('netWorth').line,
        backgroundColor: (ctx) => {
          const chart = ctx.chart
          const { ctx: context, chartArea } = chart
          if (!chartArea) return 'rgba(59, 130, 246, 0.1)'
          const c = getChartColor('netWorth').fill
          return createLineGradientRGBA(context, chartArea, c[0], c[1], c[2], 0.2, 0.01)
        },
        fill: true,
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderWidth: 2,
        pointHoverBorderColor: getChartColor('netWorth').line,
        borderWidth: 2.5,
      },
    ],
  }), [netWorths, dates])

  if (!hasData) return null

  const firstNonZero = netWorths.find((v) => v !== 0) ?? 0
  const lastValue = netWorths[netWorths.length - 1] ?? 0
  const change = lastValue - firstNonZero

  return (
    <Card className="card-pad-lg">
      <h3 className="text-body3-semi text-heading mb-4">순자산 추이</h3>
      <ChartA11ySummary
        title="순자산 추이"
        description={`${selectedMonth} 기간 동안의 일별 순자산 변화. 현재 ${formatKoreanUnit(lastValue)}원, 기간 내 변동 ${change >= 0 ? '+' : ''}${formatKoreanUnit(change)}원.`}
        rows={dates.map((d, i) => ({
          label: d,
          value: `${formatKoreanUnit(netWorths[i])}원`,
        }))}
      />
      <div className="h-52" aria-hidden="true">
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
