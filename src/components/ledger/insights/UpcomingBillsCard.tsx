import { useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { CalendarClock } from 'lucide-react'
import { Amount } from '@/components/ui/Amount'
import { useSubscriptionData } from '@/hooks/useSubscriptionData'

export function UpcomingBillsCard() {
  const shouldReduceMotion = useReducedMotion()
  const navigate = useNavigate()
  const { detected } = useSubscriptionData()

  const upcoming = useMemo(
    () => detected
      .filter((s) => s.daysUntilNext >= 0 && s.daysUntilNext <= 7)
      .sort((a, b) => a.daysUntilNext - b.daysUntilNext),
    [detected],
  )

  const total = useMemo(() => upcoming.reduce((sum, u) => sum + u.avgAmount, 0), [upcoming])
  const firstThree = upcoming.slice(0, 3)

  if (upcoming.length === 0) {
    return (
      <motion.div
        whileHover={shouldReduceMotion ? undefined : { y: -2 }}
        className="card-base flex-shrink-0 w-[180px] rounded-2xl bg-surface-primary p-4 text-left transition-all"
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-status-success-soft flex items-center justify-center">
            <CalendarClock className="w-3.5 h-3.5 text-status-success" />
          </div>
          <span className="text-label3-medium text-sub font-semibold">결제 예정</span>
        </div>
        <p className="text-body3-bold text-heading">7일 내 없음</p>
        <p className="text-label3-medium text-sub mt-1">편히 쉬세요 😊</p>
      </motion.div>
    )
  }

  return (
    <motion.button
      type="button"
      onClick={() => navigate('/subscriptions')}
      whileHover={shouldReduceMotion ? undefined : { y: -2 }}
      whileTap={shouldReduceMotion ? undefined : { scale: 0.98 }}
      className="card-base flex-shrink-0 w-[180px] rounded-2xl bg-surface-primary p-4 text-left transition-all"
      aria-label={`7일 내 결제 예정 ${upcoming.length}건`}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-status-warning-soft flex items-center justify-center">
          <CalendarClock className="w-3.5 h-3.5 text-status-warning" />
        </div>
        <span className="text-caption text-sub font-semibold">결제 예정</span>
      </div>
      <p className="text-caption text-sub mb-0.5">7일 내 {upcoming.length}건</p>
      <Amount
        value={total}
        size="emphasis"
        className="text-heading font-bold block"
        unit=""
      />
      <div className="mt-2 space-y-0.5">
        {firstThree.map((sub) => (
          <p key={sub.key} className="text-label3-medium text-sub truncate">
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
