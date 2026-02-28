import { Card } from '@/components/ui/Card'
import { useSubscriptionStore } from '@/stores/subscriptionStore'
import { formatKRW, formatUSD, formatKoreanUnit } from '@/utils/format'
import type { SubscriptionCurrency } from '@/lib/types'

interface SubscriptionSummaryProps {
  currencyFilter?: SubscriptionCurrency
}

export function SubscriptionSummary({ currencyFilter }: SubscriptionSummaryProps) {
  const monthlyKRW = useSubscriptionStore((s) => s.getMonthlyTotalKRW())
  const monthlyUSD = useSubscriptionStore((s) => s.getMonthlyTotalUSD())
  const monthlyCombined = useSubscriptionStore((s) => s.getMonthlyTotalCombinedKRW())
  const yearlyCombined = useSubscriptionStore((s) => s.getYearlyTotalCombinedKRW())

  if (currencyFilter === 'KRW') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card className="!p-4">
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">월간 구독료</p>
          <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
            {formatKRW(monthlyKRW)}
          </p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">/월</p>
        </Card>
        <Card className="!p-4">
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">연간 환산</p>
          <p className="text-lg font-bold text-primary-600 dark:text-primary-400 tabular-nums">
            {formatKRW(monthlyKRW * 12)}
          </p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">/년</p>
        </Card>
      </div>
    )
  }

  if (currencyFilter === 'USD') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card className="!p-4">
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">월간 구독료</p>
          <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
            {formatUSD(monthlyUSD)}
          </p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">/월</p>
        </Card>
        <Card className="!p-4">
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">연간 환산</p>
          <p className="text-lg font-bold text-primary-600 dark:text-primary-400 tabular-nums">
            {formatUSD(monthlyUSD * 12)}
          </p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">/년</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <Card className="!p-4">
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">원화 구독</p>
        <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
          {formatKRW(monthlyKRW)}
        </p>
        <p className="text-xs text-zinc-400 dark:text-zinc-500">/월</p>
      </Card>

      <Card className="!p-4">
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">달러 구독</p>
        <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
          {formatUSD(monthlyUSD)}
        </p>
        <p className="text-xs text-zinc-400 dark:text-zinc-500">/월</p>
      </Card>

      <Card className="!p-4">
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">합계 (환산)</p>
        <p className="text-lg font-bold text-primary-600 dark:text-primary-400 tabular-nums">
          {formatKRW(monthlyCombined)}
        </p>
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          연 {formatKoreanUnit(yearlyCombined)}
        </p>
      </Card>
    </div>
  )
}
