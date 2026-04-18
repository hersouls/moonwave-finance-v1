import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { clsx } from 'clsx'
import { Card } from '@/components/ui/Card'
import { Amount } from '@/components/ui/Amount'
import { useSubscriptionStore } from '@/stores/subscriptionStore'
import { formatKRW, formatUSD } from '@/utils/format'
import { getDaysUntilBilling } from '@/lib/dateUtils'
import { useSettingsStore } from '@/stores/settingsStore'

export function SubscriptionWidget() {
  const navigate = useNavigate()
  const subscriptions = useSubscriptionStore((s) => s.subscriptions)
  const store = useSubscriptionStore
  const active = useMemo(() => store.getState().getActive(), [subscriptions])
  const monthlyCombined = useMemo(() => store.getState().getMonthlyTotalCombinedKRW(), [subscriptions])
  const monthlyKRW = useMemo(() => store.getState().getMonthlyTotalKRW(), [subscriptions])
  const monthlyUSD = useMemo(() => store.getState().getMonthlyTotalUSD(), [subscriptions])
  const upcoming = useMemo(() => store.getState().getUpcomingBills(7), [subscriptions])
  const hideAmounts = useSettingsStore((s) => !!s.settings.hideAmounts)

  if (active.length === 0) return null

  return (
    <Card className="card-pad-lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-body3-semi text-heading">구독 현황</h3>
        <button
          onClick={() => navigate('/subscriptions')}
          className="text-caption text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-0.5"
        >
          전체보기 <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      <div className="mb-3">
        <p className={clsx('text-title2 text-heading tabular-nums', hideAmounts && 'amount-masked')}>
          월 {formatKRW(monthlyCombined)}
        </p>
        <p className={clsx('text-caption text-sub', hideAmounts && 'amount-masked')}>
          (원화 {formatKRW(monthlyKRW)}
          {monthlyUSD > 0 && ` + 달러 ${formatUSD(monthlyUSD)}`})
        </p>
      </div>

      {upcoming.length > 0 && (
        <div>
          <p className="text-caption text-sub mb-2">다음 결제 예정</p>
          <div className="space-y-2">
            {upcoming.slice(0, 3).map((sub) => {
              const daysLeft = getDaysUntilBilling(sub.billingDay, sub.cycle, sub.billingMonth, sub.startDate, sub.customCycleDays)
              return (
                <div key={sub.id} className="flex items-center gap-2 el-hover rounded-md -mx-1 px-1">
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: sub.color }}
                  />
                  <span className="text-sm text-body flex-1 truncate">
                    {sub.name}
                  </span>
                  {sub.currency === 'USD' ? (
                    <Amount value={sub.amount} format="usd" size="emphasis" className="text-heading" />
                  ) : (
                    <Amount value={sub.amount} format="krw" size="emphasis" className="text-heading" unit="" />
                  )}
                  <span className="text-caption text-disabled w-10 text-right">
                    D-{daysLeft}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </Card>
  )
}
