import { motion, useReducedMotion } from 'framer-motion'
import { TransactionCard } from './TransactionCard'
import { DateGroupHeader } from './DateGroupHeader'
import { useTransactionGroups } from '@/hooks/useTransactionGroups'
import type { Transaction } from '@/lib/types'
import { durations, easeOutExpo } from '@/lib/motionConfig'

interface TransactionListGroupedProps {
  transactions: Transaction[]
  /** sticky header 사용 여부 (기본 true). false 시 평면 list */
  sticky?: boolean
}

export function TransactionListGrouped({ transactions, sticky = true }: TransactionListGroupedProps) {
  const groups = useTransactionGroups(transactions)
  const shouldReduceMotion = useReducedMotion()

  return (
    <div className="space-y-5">
      {groups.map((group, gi) => (
        <motion.section
          key={group.date}
          initial={shouldReduceMotion ? undefined : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: durations.base,
            ease: easeOutExpo,
            delay: Math.min(gi * 0.04, 0.2),
          }}
          aria-label={`${group.label} 거래`}
        >
          <DateGroupHeader group={group} sticky={sticky} />
          <div className="space-y-2 pt-2">
            {group.transactions.map(t => (
              <TransactionCard key={t.id} transaction={t} />
            ))}
          </div>
        </motion.section>
      ))}
    </div>
  )
}
