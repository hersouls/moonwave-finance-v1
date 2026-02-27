import { useMemo } from 'react'
import { Line } from 'react-chartjs-2'
import '@/lib/chartConfig'
import { commonLineOptions, getGridColor, getTextColor, formatChartLabel } from '@/lib/chartConfig'
import { useDailyValueStore } from '@/stores/dailyValueStore'
import { useAssetStore } from '@/stores/assetStore'
import { getMonthDates } from '@/lib/dateUtils'
import { Card } from '@/components/ui/Card'

export function NetWorthTrendChart() {
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

    // Only show dates with some data
    const hasData = netWorths.some(v => v !== 0)
    if (!hasData) return null

    return {
      labels: dates.map(formatChartLabel),
      datasets: [
        {
          label: '순자산',
          data: netWorths,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 4,
          borderWidth: 2,
        },
      ],
    }
  }, [values, items, selectedMonth])

  if (!chartData) return null

  return (
    <Card className="!p-5">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">순자산 추이</h3>
      <div className="h-52">
        <Line
          data={chartData}
          options={{
            ...commonLineOptions,
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
    </Card>
  )
}
