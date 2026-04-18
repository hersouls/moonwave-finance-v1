import { clsx } from 'clsx'
import { Amount } from '@/components/ui/Amount'
import type { TransactionGroup } from '@/hooks/useTransactionGroups'

interface DateGroupHeaderProps {
  group: TransactionGroup
  sticky?: boolean
  className?: string
}

export function DateGroupHeader({ group, sticky = true, className }: DateGroupHeaderProps) {
  const { label, count, totalExpense, totalIncome } = group
  return (
    <header
      role="heading"
      aria-level={3}
      className={clsx(
        sticky && 'sticky top-0 z-[5]',
        'flex items-center justify-between gap-3 py-2 px-4 -mx-4',
        'bg-[color:var(--surface-secondary)]/85 backdrop-blur-sm',
        'border-b border-[color:var(--border-subtle)]',
        className,
      )}
    >
      <h3 className="text-caption font-bold text-heading tabular-nums">
        {label}
      </h3>
      <div className="flex items-center gap-2 text-[11px] tabular-nums flex-shrink-0">
        <span className="text-disabled">{count}건</span>
        {totalExpense > 0 && (
          <>
            <span className="w-px h-3 bg-[color:var(--border-default)]" aria-hidden="true" />
            <span className="inline-flex items-baseline gap-0.5">
              <span className="text-sub">지출</span>
              <Amount value={totalExpense} size="caption" className="text-value-negative font-bold" unit="" />
            </span>
          </>
        )}
        {totalIncome > 0 && (
          <>
            <span className="w-px h-3 bg-[color:var(--border-default)]" aria-hidden="true" />
            <span className="inline-flex items-baseline gap-0.5">
              <span className="text-sub">수입</span>
              <Amount value={totalIncome} size="caption" className="text-value-positive font-bold" unit="" />
            </span>
          </>
        )}
      </div>
    </header>
  )
}
