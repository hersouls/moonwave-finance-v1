import { useMemo } from 'react'
import { Line } from 'react-chartjs-2'
import { Card } from '@/components/ui/Card'
import { useMultiMonthTransactions } from '@/hooks/useMultiMonthTransactions'
import { commonLineOptions } from '@/lib/chartConfig'
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
    <Card className="!p-5">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">월별 저축률</h3>
      <div className="h-64">
        <Line
          data={{
            labels,
            datasets: [{
              label: '저축률 (%)',
              data,
              borderColor: '#8B5CF6',
              backgroundColor: 'rgba(139, 92, 246, 0.1)',
              fill: true,
              tension: 0.3,
              pointRadius: 4,
              pointBackgroundColor: '#8B5CF6',
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
