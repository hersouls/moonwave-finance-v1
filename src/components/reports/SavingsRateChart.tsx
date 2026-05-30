import { useMemo } from 'react'
import { Line } from 'react-chartjs-2'
import { Card } from '@/components/ui/Card'
import { useMultiMonthTransactions } from '@/hooks/useMultiMonthTransactions'
import { commonLineOptions, getChartColor, createLineGradientRGBA } from '@/lib/chartConfig'
import { format, subMonths } from 'date-fns'

export function SavingsRateChart() {
  const { transactions, isLoading } = useMultiMonthTransactions(6)

  const { labels, data } = useMemo(() => {
    const now = new Date()
    const months: string[] = []
    for (let i = 5; i >= 0; i--) {
      months.push(format(subMonths(now, i), 'yyyy-MM'))
    }

    const rates = months.map(m => {
      const income = transactions.filter(t => t.type === 'income' && t.date.startsWith(m)).reduce((s, t) => s + t.amount, 0)
      const expense = transactions.filter(t => t.type === 'expense' && t.date.startsWith(m)).reduce((s, t) => s + t.amount, 0)
      return income > 0 ? Math.round(((income - expense) / income) * 100) : 0
    })

    return {
      labels: months.map(m => m.substring(5) + '월'),
      data: rates,
    }
  }, [transactions])

  if (isLoading) return null

  return (
    <Card className="card-pad-lg">
      <h3 className="text-body3-semi text-heading mb-4">월별 저축률</h3>
      <div className="h-64">
        <Line
          data={{
            labels,
            datasets: [{
              label: '저축률 (%)',
              data,
              borderColor: getChartColor('savings').line,
              backgroundColor: (ctx) => {
                const chart = ctx.chart
                const { ctx: context, chartArea } = chart
                const c = getChartColor('savings').fill
                if (!chartArea) return `rgba(${c.join(',')}, 0.1)`
                return createLineGradientRGBA(context, chartArea, c[0], c[1], c[2], 0.2, 0.01)
              },
              fill: true,
              tension: 0.3,
              pointRadius: 4,
              pointBackgroundColor: getChartColor('savings').line,
            }],
          }}
          options={{
            ...commonLineOptions,
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              ...commonLineOptions.scales,
              y: {
                ...commonLineOptions.scales?.y,
                ticks: {
                  ...commonLineOptions.scales?.y?.ticks,
                  callback: (value) => `${value}%`,
                },
              },
            },
          }}
        />
      </div>
    </Card>
  )
}
