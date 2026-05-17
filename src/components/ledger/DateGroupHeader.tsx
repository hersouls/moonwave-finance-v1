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
  const net = totalIncome - totalExpense
  return (
    <header
      role="heading"
      aria-level={3}
      className={clsx(
        sticky && 'sticky top-0 z-[5]',
        'flex items-center justify-between gap-3 py-2.5 px-4 -mx-4',
        'border-b border-[color:var(--border-subtle)]',
        // Gradient backdrop with stronger blur for hi-end feel
        'bg-gradient-to-b from-[color:var(--surface-secondary)]/95 to-[color:var(--surface-secondary)]/70',
        'backdrop-blur-md backdrop-saturate-150',
        className,
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        {/* Net direction indicator dot */}
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{
            backgroundColor:
              net > 0 ? 'var(--value-positive)'
              : net < 0 ? 'var(--value-negative)'
              : 'var(--text-muted)',
            boxShadow: net !== 0
              ? `0 0 6px color-mix(in srgb, ${net > 0 ? 'var(--value-positive)' : 'var(--value-negative)'} 60%, transparent)`
              : undefined,
          }}
          aria-hidden="true"
        />
        <h3 className="text-caption font-bold text-heading tabular-nums truncate">
          {label}
        </h3>
        <span className="text-[10px] text-disabled tabular-nums font-semibold flex-shrink-0">
          {count}건
        </span>
      </div>

      <div className="flex items-center gap-2 text-[11px] tabular-nums flex-shrink-0">
        {totalExpense > 0 && (
          <span className="inline-flex items-baseline gap-1 px-2 py-0.5 rounded-full bg-status-danger-soft/60">
            <span className="text-status-danger/70 text-[10px] font-semibold">−</span>
            <Amount value={totalExpense} size="caption" className="text-status-danger font-bold" unit="" />
          </span>
        )}
        {totalIncome > 0 && (
          <span className="inline-flex items-baseline gap-1 px-2 py-0.5 rounded-full bg-status-success-soft/60">
            <span className="text-status-success/70 text-[10px] font-semibold">+</span>
            <Amount value={totalIncome} size="caption" className="text-status-success font-bold" unit="" />
          </span>
        )}
      </div>
    </header>
  )
}
