import { memo, useState, useRef } from 'react'
import { clsx } from 'clsx'
import { Trash2, Pencil, RefreshCw } from 'lucide-react'
import { motion, useMotionValue, useTransform, useReducedMotion } from 'framer-motion'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useTransactionStore } from '@/stores/transactionStore'
import { useMemberStore } from '@/stores/memberStore'
import { useUIStore } from '@/stores/uiStore'
import { formatKRW } from '@/utils/format'
import { formatDate } from '@/lib/dateUtils'
import { getPaymentMethodLabel } from '@/utils/paymentMethod'
import type { Transaction } from '@/lib/types'

interface TransactionCardProps {
  transaction: Transaction
}

const SWIPE_THRESHOLD = 80
const ACTION_WIDTH = 120

function TransactionCardInner({ transaction }: TransactionCardProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const shouldReduceMotion = useReducedMotion()
  const categories = useTransactionStore((s) => s.categories)
  const members = useMemberStore((s) => s.members)
  const deleteTransaction = useTransactionStore((s) => s.deleteTransaction)
  const openTransactionEditModal = useUIStore((s) => s.openTransactionEditModal)
  const constraintsRef = useRef<HTMLDivElement>(null)

  const category = categories.find(c => c.id === transaction.categoryId)
  const member = transaction.memberId ? members.find(m => m.id === transaction.memberId) : null
  const pmLabel = transaction.paymentMethodDetail || getPaymentMethodLabel(transaction.paymentMethod)
  const isIncome = transaction.type === 'income'

  const x = useMotionValue(0)
  const actionOpacity = useTransform(x, [-ACTION_WIDTH, -40, 0], [1, 0.5, 0])

  const handleDragEnd = () => {
    const currentX = x.get()
    if (currentX < -SWIPE_THRESHOLD) {
      x.set(-ACTION_WIDTH)
    } else {
      x.set(0)
    }
  }

  const resetSwipe = () => x.set(0)

  return (
    <div ref={constraintsRef} className="relative overflow-hidden rounded-xl">
      {/* Swipe-reveal actions (mobile) */}
      <motion.div
        className="absolute right-0 top-0 bottom-0 flex items-stretch lg:hidden"
        style={{ opacity: actionOpacity, width: ACTION_WIDTH }}
      >
        <button
          onClick={() => { resetSwipe(); openTransactionEditModal(transaction.id!) }}
          className="flex-1 flex items-center justify-center bg-primary-500 text-white"
          aria-label="수정"
        >
          <Pencil className="w-5 h-5" />
        </button>
        <button
          onClick={() => { resetSwipe(); setShowDeleteConfirm(true) }}
          className="flex-1 flex items-center justify-center bg-red-500 text-white"
          aria-label="삭제"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </motion.div>

      {/* Card content — draggable on mobile */}
      <motion.div
        style={{ x }}
        drag={shouldReduceMotion ? false : 'x'}
        dragConstraints={{ left: -ACTION_WIDTH, right: 0 }}
        dragElastic={0.1}
        onDragEnd={handleDragEnd}
        className="relative"
      >
        <Card>
          <div className="flex items-center gap-3">
            {/* Category color indicator */}
            <div
              className={clsx(
                'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                isIncome ? 'bg-status-success' : 'bg-status-danger'
              )}
            >
              <span className={clsx(
                'text-lg',
                isIncome ? 'text-status-success' : 'text-status-danger'
              )}>
                {isIncome ? '+' : '-'}
              </span>
            </div>

            {/* Transaction details */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-body3 text-heading truncate">
                  {category?.name || '미분류'}
                </span>
                {member && (
                  <span className="badge badge-sm badge-default">
                    {member.name}
                  </span>
                )}
                {transaction.subscriptionId && (
                  <span className="text-caption px-1.5 py-0.5 rounded-full bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 flex items-center gap-0.5">
                    <RefreshCw className="w-3 h-3" />
                    구독
                  </span>
                )}
                {pmLabel && (
                  <span className="text-caption px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                    {pmLabel}
                  </span>
                )}
              </div>
              {transaction.memo && (
                <p className="text-caption text-sub truncate mt-0.5">
                  {transaction.memo}
                </p>
              )}
              <p className="text-caption text-disabled mt-0.5">
                {formatDate(transaction.date)}
              </p>
            </div>

            {/* Amount */}
            <div className="text-right flex-shrink-0">
              <p className={clsx(
                'text-sm font-bold tabular-nums',
                isIncome ? 'text-status-success' : 'text-status-danger'
              )}>
                {isIncome ? '+' : '-'}{formatKRW(transaction.amount)}
              </p>
            </div>

            {/* Desktop-only edit/delete buttons */}
            <button
              onClick={(e) => { e.stopPropagation(); openTransactionEditModal(transaction.id!) }}
              className="hidden lg:flex p-1.5 rounded-lg text-disabled hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors flex-shrink-0"
              aria-label="수정"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true) }}
              className="hidden lg:flex p-1.5 rounded-lg text-disabled hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex-shrink-0"
              aria-label="삭제"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </Card>
      </motion.div>

      <ConfirmDialog
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={() => {
          deleteTransaction(transaction.id!)
          setShowDeleteConfirm(false)
        }}
        title="거래 삭제"
        description={`이 거래(${formatKRW(transaction.amount)})를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`}
        confirmText="삭제"
        variant="danger"
      />
    </div>
  )
}

export const TransactionCard = memo(TransactionCardInner)
