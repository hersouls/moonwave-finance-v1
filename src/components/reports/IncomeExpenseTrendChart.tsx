import { useMemo } from 'react'
import { Bar } from 'react-chartjs-2'
import { Card } from '@/components/ui/Card'
import { useMultiMonthTransactions } from '@/hooks/useMultiMonthTransactions'
import { commonBarOptions } from '@/lib/chartConfig'
import { format, subMonths } from 'date-fns'

export function IncomeExpenseTrendChart() {
  const { transactions, isLoading } = useMultiMonthTransactions(6)

  const { labels, incomeData, expenseData } = useMemo(() => {
    const now = new Date()
    const months: string[] = []
    for (let i = 5; i >= 0; i--) {
      months.push(format(subMonths(now, i), 'yyyy-MM'))
    }

    const income = months.map(m =>
      transactions.filter(t => t.type === 'income' && t.date.startsWith(m)).reduce((s, t) => s + t.amount, 0)
    )
    const expense = months.map(m =>
      transactions.filter(t => t.type === 'expense' && t.date.startsWith(m)).reduce((s, t) => s + t.amount, 0)
    )

    return {
      labels: months.map(m => m.substring(5) + '월'),
      incomeData: income,
      expenseData: expense,
    }
  }, [transactions])

  if (isLoading) return null

  return (
    <Card className="!p-5">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">수입/지출 추세 (6개월)</h3>
      <div className="h-64">
        <Bar
          data={{
            labels,
            datasets: [
              {
                label: '수입',
                data: incomeData,
                backgroundColor: 'rgba(16, 185, 129, 0.7)',
                borderRadius: 4,
              },
              {
                label: '지출',
                data: expenseData,
                backgroundColor: 'rgba(239, 68, 68, 0.7)',
                borderRadius: 4,
              },
            ],
          }}
          options={{
            ...commonBarOptions,
            responsive: true,
            maintainAspectRatio: false,
          }}
        />
      </div>
    </Card>
  )
}
