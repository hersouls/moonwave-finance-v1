import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { useDailyValueStore } from '@/stores/dailyValueStore'
import { useAssetStore } from '@/stores/assetStore'
import { formatKoreanUnit, formatChange } from '@/utils/format'
import { clsx } from 'clsx'

interface LiabilityItemCardProps {
  itemId: number
  name: string
  categoryId: number
}

export function LiabilityItemCard({ itemId, name, categoryId }: LiabilityItemCardProps) {
  const navigate = useNavigate()
  const categories = useAssetStore((s) => s.categories)
  const values = useDailyValueStore((s) => s.values)

  const category = categories.find(c => c.id === categoryId)

  const itemValues = values
    .filter(v => v.assetItemId === itemId)
    .sort((a, b) => b.date.localeCompare(a.date))
  const latestValue = itemValues[0]?.value || 0
  const prevValue = itemValues[1]?.value || latestValue
  const change = latestValue - prevValue

  return (
    <Card
      variant="interactive"
      onClick={() => navigate(`/liabilities/${itemId}`)}
      className="!p-4"
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
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
              {name}
            </span>
          </div>
          <p className="text-lg font-bold text-red-600 dark:text-red-400 tabular-nums">
            {formatKoreanUnit(latestValue)}
            <span className="text-xs text-zinc-400 ml-1">원</span>
          </p>
          {change !== 0 && (
            <p className={clsx(
              'text-xs tabular-nums mt-0.5',
              change < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
            )}>
              {formatChange(change)}
            </p>
          )}
        </div>
        <ChevronRight className="w-5 h-5 text-zinc-400 flex-shrink-0" />
      </div>
    </Card>
  )
}
