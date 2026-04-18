import { useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Repeat } from 'lucide-react'
import { Amount } from '@/components/ui/Amount'
import { useSubscriptionStore } from '@/stores/subscriptionStore'

export function SubscriptionCard() {
  const shouldReduceMotion = useReducedMotion()
  const navigate = useNavigate()
  const subscriptions = useSubscriptionStore((s) => s.subscriptions)

  const { activeCount, monthlyCombined } = useMemo(() => {
    const store = useSubscriptionStore.getState()
    const active = store.getActive()
    const monthlyCombined = store.getMonthlyTotalCombinedKRW()
    return { activeCount: active.length, monthlyCombined }
  }, [subscriptions])

  if (activeCount === 0) {
    return (
      <motion.button
        type="button"
        onClick={() => navigate('/subscriptions')}
        whileHover={shouldReduceMotion ? undefined : { y: -2 }}
        whileTap={shouldReduceMotion ? undefined : { scale: 0.98 }}
        className="flex-shrink-0 w-[180px] rounded-2xl bg-surface-primary p-4 text-left hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] transition-all"
        style={{ boxShadow: 'inset 0 0 0 1px var(--border-default), 0 1px 3px rgba(0,0,0,0.04)' }}
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-[color:var(--status-info-bg)] flex items-center justify-center">
            <Repeat className="w-3.5 h-3.5 text-status-info" />
          </div>
          <span className="text-caption text-sub font-semibold">구독</span>
        </div>
        <p className="text-body3 text-disabled">없음</p>
        <p className="text-[11px] text-sub mt-1">구독 추가하기 →</p>
      </motion.button>
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
      aria-label={`구독 ${activeCount}개, 월 ${monthlyCombined}원`}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-[color:var(--status-info-bg)] flex items-center justify-center">
          <Repeat className="w-3.5 h-3.5 text-status-info" />
        </div>
        <span className="text-caption text-sub font-semibold">구독 {activeCount}개</span>
      </div>
      <p className="text-[11px] text-sub mb-0.5">월 합계</p>
      <Amount
        value={monthlyCombined}
        size="emphasis"
        className="text-heading font-bold block"
        unit=""
      />
      <p className="text-[10px] text-disabled mt-2">자세히 보기 →</p>
    </motion.button>
  )
}
