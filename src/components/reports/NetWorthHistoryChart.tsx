import { useMemo } from 'react'
import { Line } from 'react-chartjs-2'
import '@/lib/chartConfig'
import { commonLineOptions, getGridColor, getTextColor } from '@/lib/chartConfig'
import { Card } from '@/components/ui/Card'
import type { NetWorthSnapshot } from '@/lib/types'

interface NetWorthHistoryChartProps {
  snapshots: NetWorthSnapshot[]
}

export function NetWorthHistoryChart({ snapshots }: NetWorthHistoryChartProps) {
  const chartData = useMemo(() => {
    if (snapshots.length === 0) return null

    return {
      labels: snapshots.map(s => {
        const [, m] = s.date.split('-')
        return `${Number(m)}월`
      }),
      datasets: [
        {
          label: '순자산',
          data: snapshots.map(s => s.netWorth),
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 5,
          borderWidth: 2,
        },
        {
          label: '총 자산',
          data: snapshots.map(s => s.totalAssets),
          borderColor: '#3b82f6',
          borderDash: [5, 5],
          tension: 0.3,
          pointRadius: 2,
          borderWidth: 1.5,
        },
        {
          label: '총 부채',
          data: snapshots.map(s => s.totalLiabilities),
          borderColor: '#ef4444',
          borderDash: [5, 5],
          tension: 0.3,
          pointRadius: 2,
          borderWidth: 1.5,
        },
      ],
    }
  }, [snapshots])

  if (!chartData) return null

  return (
    <Card className="!p-5">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">순자산 추이</h3>
      <div className="h-64">
        <Line
          data={chartData}
          options={{
            ...commonLineOptions,
            plugins: {
              ...commonLineOptions.plugins,
              legend: {
                display: true,
                position: 'top' as const,
                labels: { color: getTextColor(), boxWidth: 12, padding: 16, font: { size: 11 } },
              },
            },
            scales: {
              ...commonLineOptions.scales,
              x: { ...commonLineOptions.scales.x, ticks: { ...commonLineOptions.scales.x.ticks, color: getTextColor() } },
              y: { ...commonLineOptions.scales.y, grid: { color: getGridColor() }, ticks: { ...commonLineOptions.scales.y.ticks, color: getTextColor() } },
            },
          }}
        />
      </div>
    </Card>
  )
}
