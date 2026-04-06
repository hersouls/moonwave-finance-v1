import { useMemo } from 'react'
import { Doughnut } from 'react-chartjs-2'
import '@/lib/chartConfig'
import { premiumTooltip, premiumAnimation } from '@/lib/chartConfig'
import { useCategoryBreakdown } from '@/hooks/useAssetStats'
import { formatKoreanUnit, formatPercent } from '@/utils/format'
import { Card } from '@/components/ui/Card'
import { useAssetStats } from '@/hooks/useAssetStats'
import { useCountUp } from '@/hooks/useCountUp'

export function AssetAllocationChart() {
  const breakdown = useCategoryBreakdown('asset')
  const stats = useAssetStats()
  const animatedTotal = useCountUp(stats.totalAssets)

  const chartData = useMemo(() => {
    if (breakdown.length === 0) return null

    return {
      labels: breakdown.map(b => b.categoryName),
      datasets: [
        {
          data: breakdown.map(b => b.total),
          backgroundColor: breakdown.map(b => b.categoryColor),
          borderWidth: 2,
          borderColor: 'transparent',
          hoverOffset: 8,
          hoverBorderWidth: 0,
        },
      ],
    }
  }, [breakdown])

  if (!chartData) return null

  return (
    <Card className="card-pad-lg">
      <h3 className="text-body3-semi text-heading mb-4">자산 구성</h3>
      <div className="flex items-center gap-6">
        <div className="relative w-36 h-36 flex-shrink-0">
          <Doughnut
            data={chartData}
            options={{
              responsive: true,
              maintainAspectRatio: true,
              cutout: '68%',
              animation: premiumAnimation,
              plugins: {
                legend: { display: false },
                tooltip: {
                  ...premiumTooltip,
                  callbacks: {
                    label: (ctx) => {
                      const val = ctx.parsed
                      const total = breakdown.reduce((s, b) => s + b.total, 0)
                      const pct = total > 0 ? (val / total) * 100 : 0
                      return ` ${formatKoreanUnit(val)}원 (${formatPercent(pct, 0)})`
                    },
                  },
                },
              },
            }}
          />
          {/* Center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-caption text-disabled">총 자산</span>
            <span className="text-sm font-bold text-heading tabular-nums">
              {formatKoreanUnit(animatedTotal)}
            </span>
          </div>
        </div>
        <div className="flex-1 space-y-2.5 min-w-0">
          {breakdown.slice(0, 5).map((b) => (
            <div key={b.categoryId} className="flex items-center gap-2.5">
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: b.categoryColor, boxShadow: `0 0 6px ${b.categoryColor}40` }}
              />
              <span className="text-caption text-sub truncate flex-1">{b.categoryName}</span>
              <span className="text-caption font-semibold text-heading tabular-nums">
                {formatPercent(b.percentage, 0)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}
