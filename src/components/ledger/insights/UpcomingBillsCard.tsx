import { useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { CalendarClock } from 'lucide-react'
import { Amount } from '@/components/ui/Amount'
import { useSubscriptionStore } from '@/stores/subscriptionStore'

export function UpcomingBillsCard() {
  const shouldReduceMotion = useReducedMotion()
  const navigate = useNavigate()
  const subscriptions = useSubscriptionStore((s) => s.subscriptions)

  const upcoming = useMemo(() => {
    return useSubscriptionStore.getState().getUpcomingBills(7)
  }, [subscriptions])

  const total = useMemo(() => upcoming.reduce((s, u) => s + u.amount, 0), [upcoming])
  const firstThree = upcoming.slice(0, 3)

  if (upcoming.length === 0) {
    return (
      <motion.div
        whileHover={shouldReduceMotion ? undefined : { y: -2 }}
        className="flex-shrink-0 w-[180px] rounded-2xl bg-surface-primary p-4 text-left transition-all"
        style={{ boxShadow: 'inset 0 0 0 1px var(--border-default), 0 1px 3px rgba(0,0,0,0.04)' }}
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-status-success-soft flex items-center justify-center">
            <CalendarClock className="w-3.5 h-3.5 text-status-success" />
          </div>
          <span className="text-caption text-sub font-semibold">결제 예정</span>
        </div>
        <p className="text-body3 text-heading font-bold">7일 내 없음</p>
        <p className="text-[11px] text-sub mt-1">편히 쉬세요 😊</p>
      </motion.div>
    )
  }

  return (
    <motion.button
      type="button"
      onClick={() => navigate('/subscriptions')}
      whileHover={shouldReduceMotion ? undefined : { y: -2 }}
      whileTap={shouldReduceMotion ? undefined : { scale: 0.98 }}
      className="flex-shrink-0 w-[180px] rounded-2xl bg-surface-primary p-4 text-left hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] transition-all"
      style={{ boxShadow: 'inset 0 0 0 1px var(--border-default), 0 1px 3px rgba(0,0,0,0.04)' }}
      aria-label={`7일 내 결제 예정 ${upcoming.length}건`}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-status-warning-soft flex items-center justify-center">
          <CalendarClock className="w-3.5 h-3.5 text-status-warning" />
        </div>
        <span className="text-caption text-sub font-semibold">결제 예정</span>
      </div>
      <p className="text-[11px] text-sub mb-0.5">7일 내 {upcoming.length}건</p>
      <Amount
        value={total}
        size="emphasis"
        className="text-heading font-bold block"
        unit=""
      />
      <div className="mt-2 space-y-0.5">
        {firstThree.map(sub => (
          <p key={sub.id} className="text-[10px] text-sub truncate">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle"
              style={{ backgroundColor: sub.color }}
              aria-hidden="true"
            />
            {sub.name}
          </p>
        ))}
      </div>
    </motion.button>
  )
}
