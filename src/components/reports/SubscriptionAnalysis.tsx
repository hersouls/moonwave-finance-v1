import { useMemo } from 'react'
import { Doughnut, Bar } from 'react-chartjs-2'
import { Card } from '@/components/ui/Card'
import { useSubscriptionStore } from '@/stores/subscriptionStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { formatSubscriptionAmount, formatKoreanUnit } from '@/utils/format'
import { commonBarOptions } from '@/lib/chartConfig'
import { SUBSCRIPTION_CATEGORIES } from '@/utils/constants'

const CATEGORY_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
]

function getMonthlyAmount(sub: { cycle: string; amount: number; customCycleDays?: number }): number {
  switch (sub.cycle) {
    case 'weekly': return sub.amount * (52 / 12)
    case 'biweekly': return sub.amount * (26 / 12)
    case 'monthly': return sub.amount
    case 'quarterly': return sub.amount / 3
    case 'semi-annual': return sub.amount / 6
    case 'yearly': return sub.amount / 12
    case 'custom': return sub.customCycleDays ? sub.amount * (365 / sub.customCycleDays / 12) : sub.amount
    default: return sub.amount
  }
}

export function SubscriptionAnalysis() {
  const active = useSubscriptionStore((s) => s.getActive())
  const monthlyKRW = useSubscriptionStore((s) => s.getMonthlyTotalKRW())
  const monthlyUSD = useSubscriptionStore((s) => s.getMonthlyTotalUSD())
  const monthlyCombined = useSubscriptionStore((s) => s.getMonthlyTotalCombinedKRW())
  const yearlyCombined = useSubscriptionStore((s) => s.getYearlyTotalCombinedKRW())
  const exchangeRate = useSettingsStore((s) => s.settings.exchangeRate?.usdToKrw ?? 1350)

  // Category breakdown for doughnut chart
  const categoryData = useMemo(() => {
    const map = new Map<string, number>()

    for (const sub of active) {
      const monthly = getMonthlyAmount(sub)
      const amountKRW = sub.currency === 'USD' ? monthly * exchangeRate : monthly
      const current = map.get(sub.category) || 0
      map.set(sub.category, current + amountKRW)
    }

    const entries = [...map.entries()].sort((a, b) => b[1] - a[1])
    const catLabels = SUBSCRIPTION_CATEGORIES

    return {
      labels: entries.map(([cat]) => catLabels.find((c) => c.value === cat)?.label ?? cat),
      data: entries.map(([, amount]) => amount),
      colors: entries.map((_, i) => CATEGORY_COLORS[i % CATEGORY_COLORS.length]),
    }
  }, [active, exchangeRate])

  // Currency split for bar chart
  const currencySplit = useMemo(() => ({
    labels: ['원화 (KRW)', '달러 (USD)'],
    data: [monthlyKRW, monthlyUSD * exchangeRate],
    raw: [monthlyKRW, monthlyUSD],
  }), [monthlyKRW, monthlyUSD, exchangeRate])

  if (active.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-400 dark:text-zinc-500 text-sm">
        활성 구독이 없습니다.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="!p-4 text-center">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">활성 구독</span>
          <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mt-1">
            {active.length}개
          </p>
        </Card>
        <Card className="!p-4 text-center">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">월간 총액</span>
          <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tabular-nums mt-1">
            {formatKoreanUnit(monthlyCombined)}
          </p>
        </Card>
        <Card className="!p-4 text-center">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">연간 총액</span>
          <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tabular-nums mt-1">
            {formatKoreanUnit(yearlyCombined)}
          </p>
        </Card>
        <Card className="!p-4 text-center">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">평균 구독료</span>
          <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tabular-nums mt-1">
            {formatKoreanUnit(Math.round(monthlyCombined / active.length))}
          </p>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Category Distribution */}
        <Card className="!p-5">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">카테고리별 구독</h3>
          {categoryData.data.length > 0 ? (
            <div className="h-64 flex items-center justify-center">
              <Doughnut
                data={{
                  labels: categoryData.labels,
                  datasets: [{
                    data: categoryData.data,
                    backgroundColor: categoryData.colors,
                    borderWidth: 0,
                  }],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      position: 'bottom' as const,
                      labels: { padding: 16, font: { size: 11 } },
                    },
                  },
                  cutout: '60%',
                }}
              />
            </div>
          ) : (
            <p className="text-sm text-zinc-400 text-center py-8">데이터 없음</p>
          )}
        </Card>

        {/* Currency Split */}
        <Card className="!p-5">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">통화별 월간 구독료</h3>
          <div className="h-64">
            <Bar
              data={{
                labels: currencySplit.labels,
                datasets: [{
                  label: '월간 구독료 (원화 환산)',
                  data: currencySplit.data,
                  backgroundColor: ['rgba(59, 130, 246, 0.7)', 'rgba(16, 185, 129, 0.7)'],
                  borderRadius: 6,
                }],
              }}
              options={{
                ...commonBarOptions,
                responsive: true,
                maintainAspectRatio: false,
              }}
            />
          </div>
        </Card>
      </div>

      {/* Subscription List */}
      <Card className="!p-5">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">구독 목록</h3>
        <div className="space-y-2">
          {active
            .sort((a, b) => {
              const aMonthly = getMonthlyAmount(a)
              const bMonthly = getMonthlyAmount(b)
              const aKRW = a.currency === 'USD' ? aMonthly * exchangeRate : aMonthly
              const bKRW = b.currency === 'USD' ? bMonthly * exchangeRate : bMonthly
              return bKRW - aKRW
            })
            .map((sub) => {
              const monthly = getMonthlyAmount(sub)
              const monthlyKRW = sub.currency === 'USD' ? monthly * exchangeRate : monthly
              const pct = monthlyCombined > 0 ? (monthlyKRW / monthlyCombined) * 100 : 0

              return (
                <div key={sub.id} className="flex items-center gap-3 py-2">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: sub.color }}
                  />
                  <span className="text-sm text-zinc-700 dark:text-zinc-300 flex-1 truncate">
                    {sub.name}
                  </span>
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 tabular-nums">
                    {formatSubscriptionAmount(monthly, sub.currency)}/월
                  </span>
                  <span className="text-xs text-zinc-400 dark:text-zinc-500 w-12 text-right tabular-nums">
                    {pct.toFixed(0)}%
                  </span>
                </div>
              )
            })}
        </div>
      </Card>
    </div>
  )
}
