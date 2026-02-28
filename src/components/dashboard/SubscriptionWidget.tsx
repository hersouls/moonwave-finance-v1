import { useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { useSubscriptionStore } from '@/stores/subscriptionStore'
import { formatKRW, formatUSD, formatSubscriptionAmount } from '@/utils/format'
import { getDaysUntilBilling } from '@/lib/dateUtils'

export function SubscriptionWidget() {
  const navigate = useNavigate()
  const active = useSubscriptionStore((s) => s.getActive())
  const monthlyCombined = useSubscriptionStore((s) => s.getMonthlyTotalCombinedKRW())
  const monthlyKRW = useSubscriptionStore((s) => s.getMonthlyTotalKRW())
  const monthlyUSD = useSubscriptionStore((s) => s.getMonthlyTotalUSD())
  const upcoming = useSubscriptionStore((s) => s.getUpcomingBills(7))

  if (active.length === 0) return null

  return (
    <Card className="!p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">구독 현황</h3>
        <button
          onClick={() => navigate('/subscriptions')}
          className="text-xs text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-0.5"
        >
          전체보기 <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      <div className="mb-3">
        <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
          월 {formatKRW(monthlyCombined)}
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          (원화 {formatKRW(monthlyKRW)}
          {monthlyUSD > 0 && ` + 달러 ${formatUSD(monthlyUSD)}`})
        </p>
      </div>

      {upcoming.length > 0 && (
        <div>
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">다음 결제 예정</p>
          <div className="space-y-2">
            {upcoming.slice(0, 3).map((sub) => {
              const daysLeft = getDaysUntilBilling(sub.billingDay, sub.cycle, sub.billingMonth, sub.startDate, sub.customCycleDays)
              return (
                <div key={sub.id} className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: sub.color }}
                  />
                  <span className="text-sm text-zinc-700 dark:text-zinc-300 flex-1 truncate">
                    {sub.name}
                  </span>
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 tabular-nums">
                    {formatSubscriptionAmount(sub.amount, sub.currency)}
                  </span>
                  <span className="text-xs text-zinc-400 dark:text-zinc-500 w-10 text-right">
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
