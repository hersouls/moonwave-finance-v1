import { memo, useState, useRef, useEffect } from 'react'
import { clsx } from 'clsx'
import { MoreVertical, Pencil, Pause, Play, XCircle, Trash2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { useSubscriptionStore } from '@/stores/subscriptionStore'
import { useUIStore } from '@/stores/uiStore'
import { formatSubscriptionAmount } from '@/utils/format'
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
    <Card className={clsx('!p-4', !isActive && 'opacity-60')}>
      <div className="flex items-center gap-3">
        {/* Color circle */}
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: subscription.color + '20' }}
        >
          <span className="text-sm font-bold" style={{ color: subscription.color }}>
            {subscription.name.charAt(0)}
          </span>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={clsx(
              'text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate',
              isCancelled && 'line-through'
            )}>
              {subscription.name}
            </span>
            {isPaused && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400">
                일시정지{pauseDays != null ? ` ${pauseDays}일째` : ''}
              </span>
            )}
            {isCancelled && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
                해지됨
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {cat && (
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {cat.label}
              </span>
            )}
            {isActive && (
              <span className="text-xs text-zinc-400 dark:text-zinc-500">
                {schedule} D-{daysUntil}
              </span>
            )}
          </div>
        </div>

        {/* Amount */}
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
            {formatSubscriptionAmount(subscription.amount, subscription.currency)}
          </p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">{cycleLabel}</p>
        </div>

        {/* Menu */}
        <div className="relative flex-shrink-0" ref={menuRef}>
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen) }}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            aria-label="메뉴"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-36 py-1 bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-700 z-50">
              <button
                onClick={() => { setMenuOpen(false); openEdit(subscription.id!) }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700/50"
              >
                <Pencil className="w-3.5 h-3.5" /> 수정
              </button>
              {isActive && (
                <button
                  onClick={() => { setMenuOpen(false); changeStatus(subscription.id!, 'paused') }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700/50"
                >
                  <Pause className="w-3.5 h-3.5" /> 일시정지
                </button>
              )}
              {isPaused && (
                <button
                  onClick={() => { setMenuOpen(false); changeStatus(subscription.id!, 'active') }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700/50"
                >
                  <Play className="w-3.5 h-3.5" /> 재개
                </button>
              )}
              {!isCancelled && (
                <button
                  onClick={() => { setMenuOpen(false); changeStatus(subscription.id!, 'cancelled') }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <XCircle className="w-3.5 h-3.5" /> 해지
                </button>
              )}
              <button
                onClick={() => { setMenuOpen(false); deleteSubscription(subscription.id!) }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
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
