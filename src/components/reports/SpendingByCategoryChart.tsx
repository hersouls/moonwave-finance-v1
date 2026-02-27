import { useMemo } from 'react'
import { Doughnut } from 'react-chartjs-2'
import '@/lib/chartConfig'
import { Card } from '@/components/ui/Card'
import { formatKoreanUnit, formatPercent } from '@/utils/format'
import type { CategoryBreakdown } from '@/lib/types'

interface SpendingByCategoryChartProps {
  breakdown: CategoryBreakdown[]
  title?: string
}

export function SpendingByCategoryChart({ breakdown, title = '지출 카테고리' }: SpendingByCategoryChartProps) {
  const chartData = useMemo(() => {
    if (breakdown.length === 0) return null
    return {
      labels: breakdown.map(b => b.categoryName),
      datasets: [{
        data: breakdown.map(b => b.total),
        backgroundColor: breakdown.map(b => b.categoryColor),
        borderWidth: 0,
        hoverOffset: 6,
      }],
    }
  }, [breakdown])

  if (!chartData) return null

  return (
    <Card className="!p-5">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">{title}</h3>
      <div className="flex items-center gap-6">
        <div className="w-36 h-36 flex-shrink-0">
          <Doughnut
            data={chartData}
            options={{
              responsive: true,
              maintainAspectRatio: true,
              cutout: '65%',
              plugins: {
                legend: { display: false },
                tooltip: {
                  callbacks: {
                    label: (ctx) => {
                      const val = ctx.parsed
                      const total = breakdown.reduce((s, b) => s + b.total, 0)
                      const pct = total > 0 ? (val / total) * 100 : 0
                      return `${formatKoreanUnit(val)}원 (${formatPercent(pct, 0)})`
                    },
                  },
                },
              },
            }}
          />
        </div>
        <div className="flex-1 space-y-2 min-w-0">
          {breakdown.slice(0, 6).map(b => (
            <div key={b.categoryId} className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: b.categoryColor }} />
              <span className="text-xs text-zinc-600 dark:text-zinc-400 truncate flex-1">{b.categoryName}</span>
              <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100 tabular-nums">
                {formatPercent(b.percentage, 0)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}
