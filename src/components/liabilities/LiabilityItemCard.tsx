import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { useDailyValueStore } from '@/stores/dailyValueStore'
import { useAssetStore } from '@/stores/assetStore'
import { formatChange } from '@/utils/format'
import { Amount } from '@/components/ui/Amount'
import { valueAsOf } from '@/services/assetAnalytics'
import { getTodayString, getYesterdayString } from '@/lib/dateUtils'
import { clsx } from 'clsx'

interface LiabilityItemCardProps {
  itemId: number
  name: string
  categoryId: number
  /** Desktop master-detail: select into the inspector instead of navigating. */
  onSelect?: (id: number) => void
  /** Highlight when shown in the inspector. */
  selected?: boolean
}

export function LiabilityItemCard({ itemId, name, categoryId, onSelect, selected }: LiabilityItemCardProps) {
  const navigate = useNavigate()
  const categories = useAssetStore((s) => s.categories)
  // 전체 이력 사용: 이번 달 기록이 없어도 잔액이 사라지지 않도록.
  const allValues = useDailyValueStore((s) => s.allValues)

  const category = categories.find(c => c.id === categoryId)

  const itemValues = useMemo(() =>
    allValues
      .filter(v => v.assetItemId === itemId)
      .sort((a, b) => b.date.localeCompare(a.date)),
    [allValues, itemId]
  )
  // 현재 잔액 = 오늘 기준 forward-fill 값. 변동 = 어제 대비(일자별 연속성).
  const latestValue = valueAsOf(itemValues, getTodayString())
  const change = latestValue - valueAsOf(itemValues, getYesterdayString())

  return (
    <Card
      variant="interactive"
      onClick={() => (onSelect ? onSelect(itemId) : navigate(`/liabilities/${itemId}`))}
      className={clsx(selected && 'ring-2 ring-primary-500 ring-offset-2 ring-offset-[color:var(--surface-secondary)]')}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {category && (
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: category.color }}
              />
            )}
            <span className="text-body3 text-heading truncate">
              {name}
            </span>
          </div>
          <Amount
            as="p"
            value={latestValue}
            size="title"
            className="text-status-danger"
          />
          {change !== 0 && (
            <p className={clsx(
              'text-caption tabular-nums mt-0.5',
              change < 0 ? 'text-value-positive' : 'text-value-negative'
            )}>
              {formatChange(change)}
            </p>
          )}
        </div>
        <ChevronRight className="w-5 h-5 text-disabled flex-shrink-0" />
      </div>
    </Card>
  )
}
