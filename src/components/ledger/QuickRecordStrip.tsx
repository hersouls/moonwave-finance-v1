import { motion, useReducedMotion } from 'framer-motion'
import { Zap, Plus } from 'lucide-react'
import { clsx } from 'clsx'
import { useTransactionStore } from '@/stores/transactionStore'
import { useToastStore } from '@/stores/toastStore'
import { useQuickRecordCandidates } from '@/hooks/useQuickRecordCandidates'
import { getCategoryIcon } from '@/utils/categoryIcons'
import { formatKoreanUnit } from '@/utils/format'
import { getTodayString } from '@/lib/dateUtils'
import { springSnappy } from '@/lib/motionConfig'

export function QuickRecordStrip() {
  const shouldReduceMotion = useReducedMotion()
  const transactions = useTransactionStore((s) => s.transactions)
  const categories = useTransactionStore((s) => s.categories)
  const addTransaction = useTransactionStore((s) => s.addTransaction)
  const candidates = useQuickRecordCandidates(transactions, 5)

  if (candidates.length === 0) return null

  const handleQuickRecord = async (template: typeof candidates[0]) => {
    try {
      await addTransaction({
        type: template.type,
        amount: template.amount,
        categoryId: template.categoryId,
        memberId: template.memberId,
        date: getTodayString(),
        memo: template.memo,
        paymentMethod: template.paymentMethod,
        paymentMethodDetail: template.paymentMethodDetail,
        paymentMethodItemId: template.paymentMethodItemId,
      })
      useToastStore.getState().addToast(
        `${formatKoreanUnit(template.amount)}원 기록되었어요`,
        'success',
      )
    } catch {
      useToastStore.getState().addToast('저장에 실패했습니다', 'error')
    }
  }

  return (
    <section aria-label="빠른 거래 기록">
      <div className="flex items-center gap-1.5 mb-2.5">
        <Zap className="w-3.5 h-3.5 text-[color:var(--color-primary-500)]" aria-hidden="true" />
        <h3 className="text-label3 text-heading">빠른 기록</h3>
        <span className="text-label3-medium text-disabled">탭 1회로 오늘 날짜 기록</span>
      </div>

      <div className="flex gap-2.5 overflow-x-auto scrollbar-none -mx-4 px-4 -my-1 py-1 snap-x">
        {candidates.map((t, i) => {
          const cat = t.categoryId ? categories.find(c => c.id === t.categoryId) : null
          const Icon = getCategoryIcon(cat?.icon)
          const color = cat?.color || 'var(--text-muted)'
          const isExpense = t.type === 'expense'
          return (
            <motion.button
              key={i}
              type="button"
              onClick={() => handleQuickRecord(t)}
              whileHover={shouldReduceMotion ? undefined : { y: -2 }}
              whileTap={shouldReduceMotion ? undefined : { scale: 0.96 }}
              transition={springSnappy}
              className={clsx(
                'card-base flex-shrink-0 snap-start flex items-center gap-2 pl-2 pr-3 py-2 rounded-2xl bg-surface-primary text-left',
                'transition-all min-w-[140px] max-w-[200px]',
              )}
              aria-label={`${cat?.name ?? '미분류'} ${formatKoreanUnit(t.amount)}원 기록하기`}
            >
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${color}1a` }}
              >
                <Icon className="w-4 h-4" style={{ color }} />
              </div>
              <div className="flex flex-col items-start min-w-0 flex-1">
                <span className="text-label3-medium text-sub truncate w-full leading-tight">
                  {cat?.name ?? '미분류'}{t.memo ? ` · ${t.memo}` : ''}
                </span>
                <span
                  className={clsx(
                    'text-label3 tabular-nums truncate w-full leading-tight',
                    isExpense ? 'text-value-negative' : 'text-value-positive',
                  )}
                >
                  {isExpense ? '−' : '+'}{formatKoreanUnit(t.amount)}원
                </span>
              </div>
              <Plus className="w-3.5 h-3.5 text-disabled flex-shrink-0" aria-hidden="true" />
            </motion.button>
          )
        })}
      </div>
    </section>
  )
}
