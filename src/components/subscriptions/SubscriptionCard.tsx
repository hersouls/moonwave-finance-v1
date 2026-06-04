import { memo, useState, useRef, useEffect } from 'react'
import { clsx } from 'clsx'
import { MoreVertical, Pencil, Pause, Play, XCircle, Trash2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { useSubscriptionStore } from '@/stores/subscriptionStore'
import { useUIStore } from '@/stores/uiStore'
import { Amount } from '@/components/ui/Amount'
import { getDaysUntilBilling, formatBillingSchedule } from '@/lib/dateUtils'
import { SUBSCRIPTION_CATEGORIES } from '@/utils/constants'
import type { Subscription } from '@/lib/types'

const CYCLE_LABELS: Record<string, string> = {
  weekly: '/주',
  biweekly: '/2주',
  monthly: '/월',
  quarterly: '/분기',
  'semi-annual': '/반기',
  yearly: '/년',
  custom: '/회',
}

interface SubscriptionCardProps {
  subscription: Subscription
}

function getPauseDays(subscription: Subscription): number | null {
  if (subscription.status !== 'paused' || !subscription.pauseHistory?.length) return null
  const lastEntry = subscription.pauseHistory[subscription.pauseHistory.length - 1]
  if (lastEntry.resumedAt) return null
  const pausedDate = new Date(lastEntry.pausedAt)
  const today = new Date()
  return Math.floor((today.getTime() - pausedDate.getTime()) / (1000 * 60 * 60 * 24))
}

function SubscriptionCardInner({ subscription }: SubscriptionCardProps) {
  const deleteSubscription = useSubscriptionStore((s) => s.deleteSubscription)
  const changeStatus = useSubscriptionStore((s) => s.changeStatus)
  const openEdit = useUIStore((s) => s.openSubscriptionEditModal)

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const cat = SUBSCRIPTION_CATEGORIES.find(c => c.value === subscription.category)
  const daysUntil = getDaysUntilBilling(
    subscription.billingDay, subscription.cycle, subscription.billingMonth,
    subscription.startDate, subscription.customCycleDays
  )
  const schedule = formatBillingSchedule(
    subscription.cycle, subscription.billingDay, subscription.billingMonth,
    subscription.customCycleDays
  )
  const isActive = subscription.status === 'active'
  const isPaused = subscription.status === 'paused'
  const isCancelled = subscription.status === 'cancelled'
  const cycleLabel = CYCLE_LABELS[subscription.cycle] ?? '/월'
  const pauseDays = getPauseDays(subscription)

  return (
    <Card className={clsx(!isActive && 'opacity-60')}>
      <div className="flex items-center gap-3">
        {/* Color circle */}
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: `color-mix(in srgb, ${subscription.color} 14%, transparent)` }}
        >
          <span className="text-body3-bold" style={{ color: subscription.color }}>
            {subscription.name.charAt(0)}
          </span>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={clsx(
              'text-body2 text-heading truncate',
              isCancelled && 'line-through'
            )}>
              {subscription.name}
            </span>
            {isPaused && (
              <span className="text-label4 leading-none px-1.5 py-0.5 rounded-full bg-status-warning-soft text-status-warning">
                일시정지{pauseDays != null ? ` ${pauseDays}일째` : ''}
              </span>
            )}
            {isCancelled && (
              <span className="text-label4 leading-none px-1.5 py-0.5 rounded-full bg-status-danger-soft text-status-danger">
                해지됨
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {cat && (
              <span className="text-label3-medium text-sub">
                {cat.label}
              </span>
            )}
            {isActive && (
              <span className="text-label3-medium text-disabled tabular-nums">
                {schedule} D-{daysUntil}
              </span>
            )}
          </div>
        </div>

        {/* Amount */}
        <div className="text-right flex-shrink-0">
          {subscription.currency === 'USD' ? (
            <Amount
              as="p"
              value={subscription.amount}
              format="usd"
              size="emphasis"
              className="text-heading font-bold"
            />
          ) : (
            <Amount
              as="p"
              value={subscription.amount}
              format="krw"
              size="emphasis"
              className="text-heading font-bold"
            />
          )}
          <p className="text-caption text-disabled">{cycleLabel}</p>
        </div>

        {/* Menu */}
        <div className="relative flex-shrink-0" ref={menuRef}>
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen) }}
            className="touch-target-inset p-1.5 rounded-lg text-disabled hover:text-body hover:bg-[var(--hover-bg)] transition-colors"
            aria-label="메뉴"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {menuOpen && (
            <div className="context-menu absolute right-0 top-full mt-1 z-50">
              <button
                onClick={() => { setMenuOpen(false); openEdit(subscription.id!) }}
                className="w-full flex items-center gap-2 px-3 py-2 text-body3 text-body hover:bg-[var(--hover-bg)]"
              >
                <Pencil className="w-3.5 h-3.5" /> 수정
              </button>
              {isActive && (
                <button
                  onClick={() => { setMenuOpen(false); changeStatus(subscription.id!, 'paused') }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-body3 text-body hover:bg-[var(--hover-bg)]"
                >
                  <Pause className="w-3.5 h-3.5" /> 일시정지
                </button>
              )}
              {isPaused && (
                <button
                  onClick={() => { setMenuOpen(false); changeStatus(subscription.id!, 'active') }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-body3 text-body hover:bg-[var(--hover-bg)]"
                >
                  <Play className="w-3.5 h-3.5" /> 재개
                </button>
              )}
              {!isCancelled && (
                <button
                  onClick={() => { setMenuOpen(false); changeStatus(subscription.id!, 'cancelled') }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-body3 text-status-danger hover:bg-status-danger-soft"
                >
                  <XCircle className="w-3.5 h-3.5" /> 해지
                </button>
              )}
              <button
                onClick={() => { setMenuOpen(false); deleteSubscription(subscription.id!) }}
                className="w-full flex items-center gap-2 px-3 py-2 text-body3 text-status-danger hover:bg-status-danger-soft"
              >
                <Trash2 className="w-3.5 h-3.5" /> 삭제
              </button>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

export const SubscriptionCard = memo(SubscriptionCardInner)
