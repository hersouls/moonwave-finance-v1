import { useMemo } from 'react'
import { Bar } from 'react-chartjs-2'
import '@/lib/chartConfig'
import { commonBarOptions, getGridColor, getTextColor, formatChartLabel } from '@/lib/chartConfig'
import { useDailyValueStore } from '@/stores/dailyValueStore'
import { useAssetStore } from '@/stores/assetStore'
import { getMonthDates } from '@/lib/dateUtils'
import { Card } from '@/components/ui/Card'

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

    return {
      labels: dates.map(formatChartLabel),
      datasets: [
        {
          label: '일별 변동',
          data: changes,
          backgroundColor: changes.map(c => c >= 0 ? 'rgba(16, 185, 129, 0.7)' : 'rgba(239, 68, 68, 0.7)'),
          borderRadius: 3,
          borderSkipped: false,
        },
      ],
    }
  }, [values, items, selectedMonth])

  if (!chartData) return null

  return (
    <Card className="!p-5">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">일별 변동</h3>
      <div className="h-52">
        <Bar
          data={chartData}
          options={{
            ...commonBarOptions,
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
                grid: { color: getGridColor() },
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
