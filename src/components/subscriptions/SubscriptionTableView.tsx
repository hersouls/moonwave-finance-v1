import { useMemo, useState } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { clsx } from 'clsx'
import { getCategoryIcon } from '@/utils/categoryIcons'
import { formatKoreanUnit } from '@/utils/format'
import { formatDate } from '@/lib/dateUtils'
import type { DetectedSubscription, DetectedCycle } from '@/services/subscriptionDetection'
import type { TransactionCategory, Member } from '@/lib/types'

interface Props {
  items: DetectedSubscription[]
  categories: TransactionCategory[]
  members: Member[]
  onClick: (key: string) => void
}

type SortKey = 'name' | 'monthly' | 'next' | 'total'
type SortDir = 'asc' | 'desc'

const CYCLE_LABEL: Record<DetectedCycle, string> = {
  weekly: '주', biweekly: '격주', monthly: '월', quarterly: '분기',
  'semi-annual': '반기', yearly: '연', irregular: '비정기',
}

function ddayLabel(days: number): string {
  if (days === 0) return '오늘'
  if (days < 0) return `${-days}일 지남`
  return `D-${days}`
}

/**
 * Desktop financial-expert table for auto-detected subscriptions: sortable by
 * name / monthly-equivalent / next-billing / total. Row click opens the same
 * detail sheet. Rendered only at >=lg by the caller; mobile keeps the cards.
 */
export function SubscriptionTableView({ items, categories, members, onClick }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('monthly')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    return [...items].sort((a, b) => {
      switch (sortKey) {
        case 'name': return a.name.localeCompare(b.name, 'ko') * dir
        case 'next': return (a.daysUntilNext - b.daysUntilNext) * dir
        case 'total': return (a.totalSpent - b.totalSpent) * dir
        case 'monthly':
        default: return (a.monthlyEquivalent - b.monthlyEquivalent) * dir
      }
    })
  }, [items, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir(key === 'name' || key === 'next' ? 'asc' : 'desc') }
  }

  const SortHeader = ({ label, k, align = 'left' }: { label: string; k: SortKey; align?: 'left' | 'right' }) => (
    <th className={align === 'right' ? 'text-right' : undefined} aria-sort={sortKey === k ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => toggleSort(k)} className={clsx('inline-flex items-center gap-1 transition-colors hover:text-heading', align === 'right' && 'flex-row-reverse')}>
        {label}
        {sortKey === k ? (sortDir === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />) : <ChevronsUpDown className="h-3.5 w-3.5 text-disabled" />}
      </button>
    </th>
  )

  return (
    <div className="overflow-hidden rounded-2xl ring-1 ring-[color:var(--border-default)]">
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <SortHeader label="서비스" k="name" />
              <th>주기</th>
              <SortHeader label="월 환산" k="monthly" align="right" />
              <th className="text-right">평균 결제</th>
              <SortHeader label="다음 결제" k="next" />
              <SortHeader label="누적" k="total" align="right" />
              <th>구성원</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((sub) => {
              const category = categories.find((c) => c.id === sub.categoryId)
              const member = sub.memberId ? members.find((m) => m.id === sub.memberId) : null
              const accent = category?.color ?? sub.color
              const CategoryIcon = getCategoryIcon(category?.icon)
              const overdue = sub.daysUntilNext < 0
              return (
                <tr key={sub.key} onClick={() => onClick(sub.key)} className="cursor-pointer">
                  <td>
                    <span className="inline-flex items-center gap-2">
                      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `color-mix(in srgb, ${accent} 14%, transparent)` }}>
                        <CategoryIcon className="h-3.5 w-3.5" style={{ color: accent }} aria-hidden="true" />
                      </span>
                      <span className="font-medium text-heading">{sub.name}</span>
                    </span>
                  </td>
                  <td>
                    <span className="rounded-full bg-surface-tertiary px-2 py-0.5 text-caption font-semibold text-sub">{CYCLE_LABEL[sub.cycle]}</span>
                  </td>
                  <td className="text-right">
                    <span className="font-semibold text-heading tabular-nums">{formatKoreanUnit(sub.monthlyEquivalent)}<span className="text-disabled">원</span></span>
                  </td>
                  <td className="text-right tabular-nums text-sub">{formatKoreanUnit(sub.avgAmount)}원</td>
                  <td className="whitespace-nowrap">
                    <span className="text-sub tabular-nums">{formatDate(sub.nextEstimatedDate)}</span>
                    <span className={clsx('ml-1.5 text-caption font-semibold', overdue ? 'text-status-danger' : 'text-status-info')}>{ddayLabel(sub.daysUntilNext)}</span>
                  </td>
                  <td className="text-right tabular-nums text-sub">{formatKoreanUnit(sub.totalSpent)}원</td>
                  <td>
                    {member ? (
                      <span className="rounded-full px-2 py-0.5 text-caption font-semibold text-white" style={{ backgroundColor: member.color }}>{member.name}</span>
                    ) : <span className="text-disabled">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-base bg-surface-secondary px-3 py-2 text-caption text-sub">
        <span>{sorted.length}개 구독</span>
        <span className="tabular-nums">월 합계 {formatKoreanUnit(sorted.reduce((s, x) => s + x.monthlyEquivalent, 0))}원</span>
      </div>
    </div>
  )
}
