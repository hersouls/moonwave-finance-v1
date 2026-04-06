import { useMemo } from 'react'
import { Card } from '@/components/ui/Card'
import { useSubscriptionStore } from '@/stores/subscriptionStore'
import { formatKRW, formatUSD, formatKoreanUnit } from '@/utils/format'
import type { SubscriptionCurrency } from '@/lib/types'

interface SubscriptionSummaryProps {
  currencyFilter?: SubscriptionCurrency
}

export function SubscriptionSummary({ currencyFilter }: SubscriptionSummaryProps) {
  const subscriptions = useSubscriptionStore((s) => s.subscriptions)
  const store = useSubscriptionStore
  const monthlyKRW = useMemo(() => store.getState().getMonthlyTotalKRW(), [subscriptions])
  const monthlyUSD = useMemo(() => store.getState().getMonthlyTotalUSD(), [subscriptions])
  const monthlyCombined = useMemo(() => store.getState().getMonthlyTotalCombinedKRW(), [subscriptions])
  const yearlyCombined = useMemo(() => store.getState().getYearlyTotalCombinedKRW(), [subscriptions])

  if (currencyFilter === 'KRW') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card>
          <p className="text-caption text-sub mb-1">월간 구독료</p>
          <p className="text-title2 text-heading tabular-nums">
            {formatKRW(monthlyKRW)}
          </p>
          <p className="text-caption text-disabled">/월</p>
        </Card>
        <Card>
          <p className="text-caption text-sub mb-1">연간 환산</p>
          <p className="text-title2 text-primary-600 dark:text-primary-400 tabular-nums">
            {formatKRW(monthlyKRW * 12)}
          </p>
          <p className="text-caption text-disabled">/년</p>
        </Card>
      </div>
    )
  }

  if (currencyFilter === 'USD') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card>
          <p className="text-caption text-sub mb-1">월간 구독료</p>
          <p className="text-title2 text-heading tabular-nums">
            {formatUSD(monthlyUSD)}
          </p>
          <p className="text-caption text-disabled">/월</p>
        </Card>
        <Card>
          <p className="text-caption text-sub mb-1">연간 환산</p>
          <p className="text-title2 text-primary-600 dark:text-primary-400 tabular-nums">
            {formatUSD(monthlyUSD * 12)}
          </p>
          <p className="text-caption text-disabled">/년</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <Card>
        <p className="text-caption text-sub mb-1">원화 구독</p>
        <p className="text-title2 text-heading tabular-nums">
          {formatKRW(monthlyKRW)}
        </p>
        <p className="text-caption text-disabled">/월</p>
      </Card>

      <Card>
        <p className="text-caption text-sub mb-1">달러 구독</p>
        <p className="text-title2 text-heading tabular-nums">
          {formatUSD(monthlyUSD)}
        </p>
        <p className="text-caption text-disabled">/월</p>
      </Card>

      <Card>
        <p className="text-caption text-sub mb-1">합계 (환산)</p>
        <p className="text-title2 text-primary-600 dark:text-primary-400 tabular-nums">
          {formatKRW(monthlyCombined)}
        </p>
        <p className="text-caption text-disabled">
          연 {formatKoreanUnit(yearlyCombined)}
        </p>
      </Card>
    </div>
  )
}
