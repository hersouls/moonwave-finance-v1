import { useMemo } from 'react'
import { Bar } from 'react-chartjs-2'
import '@/lib/chartConfig'
import { commonBarOptions, getGridColor, getTextColor } from '@/lib/chartConfig'
import { Card } from '@/components/ui/Card'
import type { MonthlyTransactionSummary } from '@/lib/types'

interface IncomeExpenseChartProps {
  summaries: MonthlyTransactionSummary[]
}

export function IncomeExpenseChart({ summaries }: IncomeExpenseChartProps) {
  const chartData = useMemo(() => {
    if (summaries.length === 0) return null

    return {
      labels: summaries.map(s => {
        const [, m] = s.month.split('-')
        return `${Number(m)}월`
      }),
      datasets: [
        {
          label: '수입',
          data: summaries.map(s => s.totalIncome),
          backgroundColor: 'rgba(16, 185, 129, 0.7)',
          borderRadius: 4,
        },
        {
          label: '지출',
          data: summaries.map(s => s.totalExpense),
          backgroundColor: 'rgba(239, 68, 68, 0.7)',
          borderRadius: 4,
        },
      ],
    }
  }, [summaries])

  if (!chartData) return null

  return (
    <Card className="!p-5">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">수입/지출 비교</h3>
      <div className="h-64">
        <Bar
          data={chartData}
          options={{
            ...commonBarOptions,
            plugins: {
              ...commonBarOptions.plugins,
              legend: {
                display: true,
                position: 'top' as const,
                labels: { color: getTextColor(), boxWidth: 12, padding: 16, font: { size: 11 } },
              },
            },
            scales: {
              ...commonBarOptions.scales,
              x: { ...commonBarOptions.scales.x, ticks: { ...commonBarOptions.scales.x.ticks, color: getTextColor() } },
              y: { ...commonBarOptions.scales.y, grid: { color: getGridColor() }, ticks: { ...commonBarOptions.scales.y.ticks, color: getTextColor() } },
            },
          }}
        />
      </div>
    </Card>
  )
}
