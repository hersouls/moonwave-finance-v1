import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { clsx } from 'clsx'
import { Card } from '@/components/ui/Card'
import { Amount } from '@/components/ui/Amount'
import { useSubscriptionData } from '@/hooks/useSubscriptionData'
import { useSettingsStore } from '@/stores/settingsStore'
import { formatKRW } from '@/utils/format'

export function SubscriptionWidget() {
  const navigate = useNavigate()
  const { detected, stats } = useSubscriptionData()
  const hideAmounts = useSettingsStore((s) => !!s.settings.hideAmounts)

  const upcoming = useMemo(
    () => detected
      .filter((s) => s.daysUntilNext >= 0 && s.daysUntilNext <= 7)
      .sort((a, b) => a.daysUntilNext - b.daysUntilNext)
      .slice(0, 3),
    [detected],
  )

  if (detected.length === 0) return null

  return (
    <Card className="card-pad-lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-body3-semi text-heading">구독 현황</h3>
        <button
          onClick={() => navigate('/subscriptions')}
          className="text-label3-medium text-accent-primary hover:underline flex items-center gap-0.5 min-h-11 px-1 -mr-1"
        >
          전체보기 <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      <div className="mb-3">
        <p className={clsx('text-title2 text-heading tabular-nums', hideAmounts && 'amount-masked')}>
          월 {formatKRW(stats.totalMonthly)}
        </p>
        <p className={clsx('text-caption text-sub', hideAmounts && 'amount-masked')}>
          {detected.length}개 구독 · 연 {formatKRW(stats.totalYearly)}
        </p>
      </div>

      {upcoming.length > 0 && (
        <div>
          <p className="text-caption text-sub mb-2">다음 결제 예정</p>
          <div className="space-y-2">
            {upcoming.map((sub) => (
              <div key={sub.key} className="flex items-center gap-2 el-hover rounded-md -mx-1 px-1">
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: sub.color }}
                />
                <span className="text-body3 text-heading flex-1 truncate">
                  {sub.name}
                </span>
                <Amount value={sub.avgAmount} format="krw" size="emphasis" className="text-heading" unit="" />
                <span className="text-caption text-disabled w-10 text-right">
                  {sub.daysUntilNext === 0 ? '오늘' : `D-${sub.daysUntilNext}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}
