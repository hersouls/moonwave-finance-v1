import { useMemo, useState } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { clsx } from 'clsx'
import { Amount } from '@/components/ui/Amount'
import { Sparkline } from '@/components/ui/Sparkline'
import { useAssetStore } from '@/stores/assetStore'
import { useMemberStore } from '@/stores/memberStore'
import { useDailyValueStore } from '@/stores/dailyValueStore'
import { getPositiveColor, getNegativeColor } from '@/lib/chartConfig'
import { valueAsOf, recentForwardFill } from '@/services/assetAnalytics'
import { getTodayString, getYesterdayString } from '@/lib/dateUtils'
import { formatChange } from '@/utils/format'

interface AssetRow {
  id: string
  name: string
  categoryId: string
  memberId?: string | null
}

interface Props {
  items: AssetRow[]
  type: 'asset' | 'liability'
  selectedId: string | null
  onSelect: (id: string) => void
}

type SortKey = 'name' | 'value' | 'change'
type SortDir = 'asc' | 'desc'

interface Metric {
  value: number
  change: number
  spark: number[]
}

/**
 * Desktop financial-expert table view: sortable columns, sticky header,
 * tabular numbers. A row click opens the master-detail InspectorPanel
 * (same `onSelect` as the card grid). Rendered only at >=lg by the caller.
 */
export function AssetTableView({ items, type, selectedId, onSelect }: Props) {
  const categories = useAssetStore((s) => s.categories)
  const members = useMemberStore((s) => s.members)
  const allValues = useDailyValueStore((s) => s.allValues)
  const [sortKey, setSortKey] = useState<SortKey>('value')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const metrics = useMemo(() => {
    const today = getTodayString()
    const yesterday = getYesterdayString()
    const map = new Map<string, Metric>()
    for (const item of items) {
      const vals = allValues
        .filter((v) => v.assetItemId === item.id)
        .sort((a, b) => b.date.localeCompare(a.date))
      // 현재 값 = 오늘 forward-fill, 변동 = 어제 대비 (일자별 연속성)
      const value = valueAsOf(vals, today)
      map.set(item.id, {
        value,
        change: value - valueAsOf(vals, yesterday),
        spark: recentForwardFill(vals, 14, today),
      })
    }
    return map
  }, [items, allValues])

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    return [...items].sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name, 'ko') * dir
      const ma = metrics.get(a.id)
      const mb = metrics.get(b.id)
      return (((ma?.[sortKey] ?? 0) as number) - ((mb?.[sortKey] ?? 0) as number)) * dir
    })
  }, [items, metrics, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir(key === 'name' ? 'asc' : 'desc')
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
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <SortHeader label="이름" k="name" />
              <th>분류</th>
              <th>구성원</th>
              <SortHeader label="현재 가치" k="value" align="right" />
              <SortHeader label="전일 대비" k="change" align="right" />
              <th className="text-right">추이</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((item) => {
              const id = item.id
              const m = metrics.get(id)
              const category = categories.find((c) => c.id === item.categoryId)
              const member = members.find((mem) => mem.id === item.memberId)
              const change = m?.change ?? 0
              const good = type === 'liability' ? change < 0 : change > 0
              const sparkGood = type === 'liability' ? change <= 0 : change >= 0
              return (
                <tr
                  key={id}
                  onClick={() => onSelect(id)}
                  className={clsx('cursor-pointer', selectedId === id && 'bg-accent-primary')}
                  aria-selected={selectedId === id}
                >
                  <td>
                    <span className="font-medium text-heading">{item.name}</span>
                  </td>
                  <td>
                    <span className="inline-flex items-center gap-1.5 text-sub">
                      {category && <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: category.color }} />}
                      {category?.name || '미분류'}
                    </span>
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
                  <td className="text-right">
                    <Amount value={m?.value ?? 0} size="emphasis" className="text-heading" />
                  </td>
                  <td className="text-right">
                    {change !== 0 ? (
                      <span className={clsx('tabular-nums', good ? 'text-value-positive' : 'text-value-negative')}>
                        {formatChange(change)}
                      </span>
                    ) : (
                      <span className="text-disabled">—</span>
                    )}
                  </td>
                  <td>
                    <div className="flex justify-end">
                      {m && m.spark.length >= 3 && m.spark.some((v, i) => i > 0 && v !== m.spark[0]) && (
                        <Sparkline data={m.spark} width={72} height={24} color={sparkGood ? getPositiveColor() : getNegativeColor()} strokeWidth={1.5} />
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
