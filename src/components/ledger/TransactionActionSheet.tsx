import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Pencil, Copy, Repeat, Trash2, X } from 'lucide-react'
import { clsx } from 'clsx'
import { Amount } from '@/components/ui/Amount'
import type { Transaction, TransactionCategory, Member } from '@/lib/types'
import { formatDate } from '@/lib/dateUtils'
import { SHEET_DRAG_CLOSE, UNCATEGORIZED_LABEL } from '@/lib/ledgerConstants'

interface Props {
  open: boolean
  onClose: () => void
  transaction: Transaction
  category: TransactionCategory | undefined | null
  member: Member | null
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
  onMakeRecurring?: () => void
}

/**
 * Bottom sheet with action menu for a transaction row.
 * Shows transaction preview + 4 primary actions (edit/duplicate/recurring/delete).
 */
export function TransactionActionSheet({
  open,
  onClose,
  transaction,
  category,
  member,
  onEdit,
  onDuplicate,
  onDelete,
  onMakeRecurring,
}: Props) {
  const shouldReduceMotion = useReducedMotion()
  const isIncome = transaction.type === 'income'

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-[var(--z-overlay)] scrim"
            aria-hidden="true"
          />

          {/* Sheet */}
          <motion.div
            key="sheet"
            role="dialog"
            aria-modal="true"
            aria-label="거래 항목 관리"
            initial={shouldReduceMotion ? { opacity: 0 } : { y: '100%' }}
            animate={shouldReduceMotion ? { opacity: 1 } : { y: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            drag={shouldReduceMotion ? false : 'y'}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > SHEET_DRAG_CLOSE.OFFSET_Y || info.velocity.y > SHEET_DRAG_CLOSE.VELOCITY_Y) onClose()
            }}
            className={clsx(
              'fixed bottom-0 left-0 right-0 z-[var(--z-overlay)]',
              'bg-surface-primary rounded-t-3xl sm:rounded-3xl',
              'ring-1 ring-[var(--border-default)] el-dialog',
              'mx-auto sm:max-w-md sm:mb-4 sm:left-1/2 sm:-translate-x-1/2 sm:right-auto sm:w-[calc(100%-2rem)]',
              'overflow-hidden',
              'pb-[env(safe-area-inset-bottom,0px)]',
            )}
          >
            {/* Drag handle */}
            <div className="sm:hidden sheet-handle w-full" aria-hidden="true" />

            {/* Preview card */}
            <div className="px-5 pt-2 sm:pt-6 pb-4">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    {category && (
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: category.color }}
                      />
                    )}
                    <span className="text-body2-bold text-heading truncate">
                      {category?.name || UNCATEGORIZED_LABEL}
                    </span>
                    {member && (
                      <span
                        className="text-caption px-2 py-0.5 rounded-full font-semibold text-white"
                        style={{ backgroundColor: member.color }}
                      >
                        {member.name}
                      </span>
                    )}
                  </div>
                  <p className="text-caption text-sub">{formatDate(transaction.date)}</p>
                  {transaction.memo && (
                    <p className="text-caption text-sub mt-1 line-clamp-2">{transaction.memo}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="touch-target-inset flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sub hover:text-heading hover:bg-[var(--hover-bg)] transition-colors"
                  aria-label="닫기"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Hero amount */}
              <div
                className={clsx(
                  'rounded-2xl px-4 py-3.5 ring-1',
                  isIncome
                    ? 'bg-status-success-soft ring-[color:var(--status-success-border)]'
                    : 'bg-status-danger-soft ring-[color:var(--status-danger-border)]',
                )}
              >
                <Amount
                  as="p"
                  value={isIncome ? transaction.amount : -transaction.amount}
                  format="change"
                  size="title"
                  className={clsx(
                    'font-extrabold block tabular-nums',
                    isIncome ? 'text-value-positive' : 'text-value-negative',
                  )}
                />
              </div>
            </div>

            {/* Actions grid */}
            <div className="px-5 pb-5 border-t border-[color:var(--border-default)] pt-4">
              <div className="grid grid-cols-4 gap-2">
                <ActionButton
                  icon={Pencil}
                  label="수정"
                  color="var(--color-primary-600)"
                  onClick={() => {
                    onClose()
                    setTimeout(onEdit, 150)
                  }}
                />
                <ActionButton
                  icon={Copy}
                  label="복제"
                  color="var(--color-primary-600)"
                  onClick={() => {
                    onClose()
                    setTimeout(onDuplicate, 150)
                  }}
                />
                {onMakeRecurring && !transaction.isRecurring && (
                  <ActionButton
                    icon={Repeat}
                    label="반복 지정"
                    color="var(--color-primary-600)"
                    onClick={() => {
                      onClose()
                      setTimeout(onMakeRecurring, 150)
                    }}
                  />
                )}
                <ActionButton
                  icon={Trash2}
                  label="삭제"
                  color="var(--value-negative)"
                  variant="danger"
                  onClick={() => {
                    onClose()
                    setTimeout(onDelete, 150)
                  }}
                />
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

interface ActionButtonProps {
  icon: typeof Pencil
  label: string
  color: string
  variant?: 'primary' | 'danger'
  onClick: () => void
}

function ActionButton({ icon: Icon, label, color, variant = 'primary', onClick }: ActionButtonProps) {
  const shouldReduceMotion = useReducedMotion()
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={shouldReduceMotion ? undefined : { y: -2 }}
      whileTap={shouldReduceMotion ? undefined : { scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 320, damping: 24 }}
      className={clsx(
        'flex flex-col items-center gap-1.5 py-3 px-2 rounded-2xl ring-1 transition-all',
        variant === 'danger'
          ? 'bg-status-danger-soft ring-[color:var(--status-danger-border)] hover:ring-[color:var(--value-negative)]'
          : 'bg-surface-secondary ring-base hover:ring-[color:var(--color-primary-300)]',
      )}
    >
      <div
        className={clsx(
          'w-9 h-9 rounded-xl flex items-center justify-center elevation-1',
          variant === 'danger' ? 'bg-white/50 dark:bg-black/20' : 'bg-surface-primary',
        )}
      >
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <span
        className="text-label3-medium font-semibold"
        style={{ color: variant === 'danger' ? 'var(--value-negative)' : 'var(--text-heading)' }}
      >
        {label}
      </span>
    </motion.button>
  )
}
