import { useMemo, useState } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown, RefreshCw, Undo2 } from 'lucide-react'
import { clsx } from 'clsx'
import { Amount } from '@/components/ui/Amount'
import { useTransactionStore } from '@/stores/transactionStore'
import { useMemberStore } from '@/stores/memberStore'
import { useUIStore } from '@/stores/uiStore'
import { formatDate } from '@/lib/dateUtils'
import { getPaymentMethodLabel } from '@/utils/paymentMethod'
import { getCategoryIcon } from '@/utils/categoryIcons'
import { UNCATEGORIZED_LABEL } from '@/lib/ledgerConstants'
import type { Transaction } from '@/lib/types'

interface Props {
  transactions: Transaction[]
}

type SortKey = 'date' | 'category' | 'amount'
type SortDir = 'asc' | 'desc'

/**
 * Desktop financial-expert table view for transactions: sortable columns
 * (date / category / amount), sticky header, tabular numbers. A row click
 * opens the edit modal. Rendered only at >=lg by the caller; mobile keeps the
 * swipeable card list.
 */
export function TransactionTableView({ transactions }: Props) {
  const categories = useTransactionStore((s) => s.categories)
  const members = useMemberStore((s) => s.members)
  const openEdit = useUIStore((s) => s.openTransactionEditModal)
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const catName = (id: number | null) => categories.find((c) => c.id === id)?.name || UNCATEGORIZED_LABEL

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    return [...transactions].sort((a, b) => {
      if (sortKey === 'amount') return (Math.abs(a.amount) - Math.abs(b.amount)) * dir
      if (sortKey === 'category') return catName(a.categoryId).localeCompare(catName(b.categoryId), 'ko') * dir
      // date — tie-break by id so equal dates stay stable
      const d = a.date.localeCompare(b.date)
      return (d !== 0 ? d : (a.id ?? 0) - (b.id ?? 0)) * dir
    })
  }, [transactions, sortKey, sortDir]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir(key === 'category' ? 'asc' : 'desc')
    }
  }

  const SortHeader = ({ label, k, align = 'left' }: { label: string; k: SortKey; align?: 'left' | 'right' }) => (
    <th className={align === 'right' ? 'text-right' : undefined} aria-sort={sortKey === k ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className={clsx('inline-flex items-center gap-1 transition-colors hover:text-heading', align === 'right' && 'flex-row-reverse')}
      >
        {label}
        {sortKey === k ? (
          sortDir === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronsUpDown className="h-3.5 w-3.5 text-disabled" />
        )}
      </button>
    </th>
  )

  return (
    <div className="overflow-hidden rounded-2xl ring-1 ring-[color:var(--border-default)]">
      <div className="max-h-[70vh] overflow-auto">
        <table className="data-table">
          <thead>
            <tr>
              <SortHeader label="날짜" k="date" />
              <SortHeader label="분류" k="category" />
              <th>메모</th>
              <th>구성원</th>
              <th>결제수단</th>
              <SortHeader label="금액" k="amount" align="right" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => {
              const category = categories.find((c) => c.id === t.categoryId)
              const member = t.memberId ? members.find((m) => m.id === t.memberId) : null
              const pmLabel = t.paymentMethodDetail || getPaymentMethodLabel(t.paymentMethod)
              const isIncome = t.type === 'income'
              const isRefund = !isIncome && t.amount < 0
              const isInflow = isIncome || isRefund
              const isSub = t.subscriptionId != null || !!t.subscriptionCategory
              const absAmount = Math.abs(t.amount)
              const accent = category?.color ?? (isInflow ? 'var(--value-positive)' : 'var(--value-negative)')
              const CategoryIcon = getCategoryIcon(category?.icon)
              return (
                <tr key={t.id} onClick={() => t.id != null && openEdit(t.id)} className="cursor-pointer">
                  <td className="whitespace-nowrap tabular-nums text-sub">{formatDate(t.date)}</td>
                  <td>
                    <span className="inline-flex items-center gap-2">
                      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `color-mix(in srgb, ${accent} 14%, transparent)` }}>
                        <CategoryIcon className="h-3.5 w-3.5" style={{ color: accent }} aria-hidden="true" />
                      </span>
                      <span className="font-medium text-heading">{category?.name || UNCATEGORIZED_LABEL}</span>
                      {isSub && <RefreshCw className="h-3 w-3 text-status-info" aria-label="구독" />}
                      {isRefund && <Undo2 className="h-3 w-3 text-status-success" aria-label="환급" />}
                    </span>
                  </td>
                  <td className="max-w-[220px]">
                    <span className="block truncate text-sub">{t.memo || '—'}</span>
                  </td>
                  <td>
                    {member ? (
                      <span className="rounded-full px-2 py-0.5 text-caption font-semibold text-white" style={{ backgroundColor: member.color }}>
                        {member.name}
                      </span>
                    ) : (
                      <span className="text-disabled">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap text-sub">{pmLabel || '—'}</td>
                  <td className="text-right">
                    <Amount
                      value={isInflow ? absAmount : -absAmount}
                      format="change"
                      size="emphasis"
                      className={clsx('font-bold tabular-nums', isInflow ? 'text-value-positive' : 'text-value-negative')}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-base bg-surface-secondary px-3 py-2 text-caption text-sub">
        <span>{sorted.length}건</span>
        <span className="tabular-nums">정렬: {sortKey === 'date' ? '날짜' : sortKey === 'category' ? '분류' : '금액'} {sortDir === 'asc' ? '↑' : '↓'}</span>
      </div>
    </div>
  )
}
