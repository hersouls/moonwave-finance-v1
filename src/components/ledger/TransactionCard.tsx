import { memo, useState, useRef } from 'react'
import { clsx } from 'clsx'
import { Trash2, Pencil, RefreshCw, MoreHorizontal } from 'lucide-react'
import { motion, useMotionValue, useTransform, useReducedMotion } from 'framer-motion'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { TransactionActionSheet } from './TransactionActionSheet'
import { useTransactionStore } from '@/stores/transactionStore'
import { useMemberStore } from '@/stores/memberStore'
import { useUIStore } from '@/stores/uiStore'
import { useToastStore } from '@/stores/toastStore'
import { formatKRW } from '@/utils/format'
import { Amount } from '@/components/ui/Amount'
import { formatDate } from '@/lib/dateUtils'
import { getPaymentMethodLabel } from '@/utils/paymentMethod'
import { TRANSACTION_CARD_SWIPE, UNCATEGORIZED_LABEL } from '@/lib/ledgerConstants'
import type { Transaction } from '@/lib/types'

interface TransactionCardProps {
  transaction: Transaction
}

const SWIPE_THRESHOLD = TRANSACTION_CARD_SWIPE.THRESHOLD
const ACTION_WIDTH = TRANSACTION_CARD_SWIPE.ACTION_WIDTH

function TransactionCardInner({ transaction }: TransactionCardProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showActionSheet, setShowActionSheet] = useState(false)
  const shouldReduceMotion = useReducedMotion()
  const categories = useTransactionStore((s) => s.categories)
  const members = useMemberStore((s) => s.members)
  const deleteTransaction = useTransactionStore((s) => s.deleteTransaction)
  const addTransaction = useTransactionStore((s) => s.addTransaction)
  const openTransactionEditModal = useUIStore((s) => s.openTransactionEditModal)
  const constraintsRef = useRef<HTMLDivElement>(null)

  const category = categories.find(c => c.id === transaction.categoryId)
  const member = (transaction.memberId ? members.find(m => m.id === transaction.memberId) : null) ?? null
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

  const handleDuplicate = async () => {
    try {
      await addTransaction({
        type: transaction.type,
        amount: transaction.amount,
        categoryId: transaction.categoryId,
        memberId: transaction.memberId,
        date: new Date().toISOString().split('T')[0],
        memo: transaction.memo,
        paymentMethod: transaction.paymentMethod,
        paymentMethodDetail: transaction.paymentMethodDetail,
        paymentMethodItemId: transaction.paymentMethodItemId,
      })
      useToastStore.getState().addToast('오늘 날짜로 복제되었습니다', 'success')
    } catch {
      useToastStore.getState().addToast('복제에 실패했습니다', 'error')
    }
  }

  return (
    <>
      <div ref={constraintsRef} className="relative overflow-hidden rounded-2xl">
        {/* Swipe-reveal actions (mobile) */}
        <motion.div
          className="absolute right-0 top-0 bottom-0 flex items-stretch lg:hidden"
          style={{ opacity: actionOpacity, width: ACTION_WIDTH }}
        >
          <button
            onClick={() => { resetSwipe(); openTransactionEditModal(transaction.id!) }}
            className="flex-1 flex items-center justify-center bg-[color:var(--color-primary-600)] text-white"
            aria-label="수정"
          >
            <Pencil className="w-5 h-5" />
          </button>
          <button
            onClick={() => { resetSwipe(); setShowDeleteConfirm(true) }}
            className="flex-1 flex items-center justify-center bg-[color:var(--value-negative)] text-white"
            aria-label="삭제"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </motion.div>

        {/* Card content — draggable on mobile, tap opens action sheet */}
        <motion.div
          style={{ x }}
          drag={shouldReduceMotion ? false : 'x'}
          dragConstraints={{ left: -ACTION_WIDTH, right: 0 }}
          dragElastic={0.1}
          onDragEnd={handleDragEnd}
          className="relative"
        >
          <motion.button
            type="button"
            onClick={() => {
              if (x.get() < -10) {
                resetSwipe()
                return
              }
              setShowActionSheet(true)
            }}
            whileHover={shouldReduceMotion ? undefined : { y: -1 }}
            whileTap={shouldReduceMotion ? undefined : { scale: 0.995 }}
            transition={{ type: 'spring', stiffness: 320, damping: 24 }}
            className={clsx(
              // 단일 소스 card-base (border/bg/radius) + el-card (shadow + glow hover)
              'w-full text-left card-base el-card',
              // padding override (기본 16 → 좌우 16 · 상하 14)
              '!px-4 !py-3.5',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ring-offset)]',
            )}
            aria-label={`${category?.name || UNCATEGORIZED_LABEL} ${formatKRW(transaction.amount)} 거래 상세`}
          >
            <div className="flex items-center gap-3">
              {/* Category color indicator with icon */}
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ring-1 ring-white/40"
                style={{
                  backgroundColor: category
                    ? `color-mix(in srgb, ${category.color} 14%, transparent)`
                    : isIncome
                      ? 'var(--status-success-bg)'
                      : 'var(--status-danger-bg)',
                }}
              >
                <span
                  className="text-base font-bold"
                  style={{
                    color: category?.color || (isIncome ? 'var(--value-positive)' : 'var(--value-negative)'),
                  }}
                >
                  {isIncome ? '+' : '−'}
                </span>
              </div>

              {/* Transaction details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-body3 text-heading font-semibold truncate">
                    {category?.name || UNCATEGORIZED_LABEL}
                  </span>
                  {member && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold text-white flex-shrink-0"
                      style={{ backgroundColor: member.color }}
                    >
                      {member.name}
                    </span>
                  )}
                  {transaction.subscriptionId && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-status-info-soft text-status-info flex items-center gap-0.5 flex-shrink-0">
                      <RefreshCw className="w-2.5 h-2.5" />
                      구독
                    </span>
                  )}
                  {pmLabel && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-tertiary text-sub truncate max-w-[100px] flex-shrink-0">
                      {pmLabel}
                    </span>
                  )}
                </div>
                {transaction.memo && (
                  <p className="text-caption text-sub truncate mt-0.5">
                    {transaction.memo}
                  </p>
                )}
                <p className="text-[11px] text-disabled mt-0.5 tabular-nums">
                  {formatDate(transaction.date)}
                </p>
              </div>

              {/* Amount */}
              <div className="text-right flex-shrink-0 flex items-center gap-2">
                <Amount
                  as="p"
                  value={isIncome ? transaction.amount : -transaction.amount}
                  format="change"
                  size="emphasis"
                  className={clsx(
                    'font-bold tabular-nums',
                    isIncome ? 'text-value-positive' : 'text-value-negative',
                  )}
                />

                {/* Desktop hover "more" affordance */}
                <span className="hidden lg:flex w-7 h-7 rounded-full items-center justify-center text-disabled opacity-0 group-hover:opacity-100 transition-opacity">
                  <MoreHorizontal className="w-4 h-4" />
                </span>
              </div>
            </div>
          </motion.button>
        </motion.div>
      </div>

      {/* Action sheet — tap to open */}
      <TransactionActionSheet
        open={showActionSheet}
        onClose={() => setShowActionSheet(false)}
        transaction={transaction}
        category={category}
        member={member}
        onEdit={() => openTransactionEditModal(transaction.id!)}
        onDuplicate={handleDuplicate}
        onDelete={() => setShowDeleteConfirm(true)}
      />

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
    </>
  )
}

export const TransactionCard = memo(TransactionCardInner)
