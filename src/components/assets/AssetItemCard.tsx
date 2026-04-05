import { memo, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Sparkline } from '@/components/ui/Sparkline'
import { useDailyValueStore } from '@/stores/dailyValueStore'
import { useAssetStore } from '@/stores/assetStore'
import { formatKoreanUnit, formatChange } from '@/utils/format'
import { clsx } from 'clsx'

interface AssetItemCardProps {
  itemId: number
  name: string
  categoryId: number
  type: 'asset' | 'liability'
}

function AssetItemCardInner({ itemId, name, categoryId, type }: AssetItemCardProps) {
  const navigate = useNavigate()
  const categories = useAssetStore((s) => s.categories)
  const values = useDailyValueStore((s) => s.values)

  const category = categories.find(c => c.id === categoryId)

  // Get sorted values for this item (newest first)
  const itemValues = useMemo(() =>
    values
      .filter(v => v.assetItemId === itemId)
      .sort((a, b) => b.date.localeCompare(a.date)),
    [values, itemId]
  )

  const latestValue = itemValues[0]?.value || 0
  const prevValue = itemValues[1]?.value || latestValue
  const change = latestValue - prevValue

  // Sparkline data: last 14 days, chronological order
  const sparklineData = useMemo(() => {
    const recent = itemValues.slice(0, 14).reverse()
    return recent.map(v => v.value)
  }, [itemValues])

  const sparklineColor = change >= 0 ? '#10b981' : '#ef4444'
  const basePath = type === 'asset' ? '/assets' : '/liabilities'

  return (
    <Card
      variant="interactive"
      onClick={() => navigate(`${basePath}/${itemId}`)}
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
            <span className="text-body3 text-zinc-900 dark:text-zinc-100 truncate">
              {name}
            </span>
          </div>
          <p className="text-title2 text-zinc-900 dark:text-zinc-100 tabular-nums">
            {formatKoreanUnit(latestValue)}
            <span className="text-caption text-zinc-400 ml-1">원</span>
          </p>
          {change !== 0 && (
            <p className={clsx(
              'text-caption tabular-nums mt-0.5',
              change > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
            )}>
              {formatChange(change)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {sparklineData.length >= 3 && (
            <Sparkline
              data={sparklineData}
              width={64}
              height={24}
              color={sparklineColor}
              strokeWidth={1.5}
            />
          )}
          <ChevronRight className="w-5 h-5 text-zinc-400" />
        </div>
      </div>
    </Card>
  )
}

export const AssetItemCard = memo(AssetItemCardInner)
