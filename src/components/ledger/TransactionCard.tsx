import { memo, useState } from 'react'
import { clsx } from 'clsx'
import { Trash2, Pencil } from 'lucide-react'
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

function TransactionCardInner({ transaction }: TransactionCardProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const categories = useTransactionStore((s) => s.categories)
  const members = useMemberStore((s) => s.members)
  const deleteTransaction = useTransactionStore((s) => s.deleteTransaction)
  const openTransactionEditModal = useUIStore((s) => s.openTransactionEditModal)

  const category = categories.find(c => c.id === transaction.categoryId)
  const member = transaction.memberId ? members.find(m => m.id === transaction.memberId) : null
  const pmLabel = transaction.paymentMethodDetail || getPaymentMethodLabel(transaction.paymentMethod)

  const isIncome = transaction.type === 'income'

  return (
    <Card className="!p-4">
      <div className="flex items-center gap-3">
        {/* Category color indicator */}
        <div
          className={clsx(
            'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
            isIncome ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-red-100 dark:bg-red-900/30'
          )}
        >
          <span className={clsx(
            'text-lg',
            isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
          )}>
            {isIncome ? '+' : '-'}
          </span>
        </div>

        {/* Transaction details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
              {category?.name || '미분류'}
            </span>
            {member && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
                {member.name}
              </span>
            )}
            {pmLabel && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                {pmLabel}
              </span>
            )}
          </div>
          {transaction.memo && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
              {transaction.memo}
            </p>
          )}
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
            {formatDate(transaction.date)}
          </p>
        </div>

        {/* Amount */}
        <div className="text-right flex-shrink-0">
          <p className={clsx(
            'text-sm font-bold tabular-nums',
            isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
          )}>
            {isIncome ? '+' : '-'}{formatKRW(transaction.amount)}
          </p>
        </div>

        {/* Edit button */}
        <button
          onClick={(e) => { e.stopPropagation(); openTransactionEditModal(transaction.id!) }}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors flex-shrink-0"
          aria-label="수정"
        >
          <Pencil className="w-4 h-4" />
        </button>

        {/* Delete button */}
        <button
          onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true) }}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex-shrink-0"
          aria-label="삭제"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

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
    </Card>
  )
}

export const TransactionCard = memo(TransactionCardInner)
