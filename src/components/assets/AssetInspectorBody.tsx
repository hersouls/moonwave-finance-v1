import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pencil, Trash2, ArrowUpRight, Wallet } from 'lucide-react'
import { clsx } from 'clsx'
import { Amount } from '@/components/ui/Amount'
import { Sparkline } from '@/components/ui/Sparkline'
import { useAssetStore } from '@/stores/assetStore'
import { useMemberStore } from '@/stores/memberStore'
import { useDailyValueStore } from '@/stores/dailyValueStore'
import { getPositiveColor, getNegativeColor } from '@/lib/chartConfig'
import { valueAsOf } from '@/services/assetAnalytics'
import { formatChange } from '@/utils/format'
import { formatDate, getTodayString, getYesterdayString } from '@/lib/dateUtils'

interface Props {
  itemId: number
  type: 'asset' | 'liability'
  onEdit: () => void
  onDelete: () => void
  onRecordValue: () => void
}

/**
 * Compact asset/liability detail rendered inside the desktop InspectorPanel
 * (master-detail). Keeps the list in context; "전체 보기" deep-links to the
 * full AssetDetailPage for advanced analysis.
 */
export function AssetInspectorBody({ itemId, type, onEdit, onDelete, onRecordValue }: Props) {
  const navigate = useNavigate()
  const items = useAssetStore((s) => s.items)
  const categories = useAssetStore((s) => s.categories)
  const members = useMemberStore((s) => s.members)
  const allValues = useDailyValueStore((s) => s.allValues)

  const item = items.find((i) => i.id === itemId)
  const category = categories.find((c) => c.id === item?.categoryId)
  const member = members.find((m) => m.id === item?.memberId)

  const values = useMemo(
    () => allValues.filter((v) => v.assetItemId === itemId).sort((a, b) => b.date.localeCompare(a.date)),
    [allValues, itemId],
  )

  // 현재 값 = 오늘 forward-fill. 변동 = 어제 대비(일자별 연속성).
  const latest = valueAsOf(values, getTodayString())
  const change = latest - valueAsOf(values, getYesterdayString())
  // 자산: 증가=긍정. 부채: 감소=긍정(빚이 줄어드는 것).
  const changeIsGood = type === 'liability' ? change < 0 : change > 0
  const sparkIsGood = type === 'liability' ? change <= 0 : change >= 0
  const sparkData = useMemo(() => values.slice(0, 30).reverse().map((v) => v.value), [values])
  const sparkColor = sparkIsGood ? getPositiveColor() : getNegativeColor()
  const basePath = type === 'asset' ? '/assets' : '/liabilities'

  if (!item) {
    return <p className="py-8 text-center text-body3 text-sub">항목을 찾을 수 없습니다.</p>
  }

  return (
    <div className="space-y-5">
      {/* Identity */}
      <div className="flex items-center gap-2">
        {category && (
          <span className="h-3 w-3 flex-shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
        )}
        <span className="text-body3 text-sub">{category?.name || '미분류'}</span>
        {member && (
          <span className="ml-auto rounded-full px-2 py-0.5 text-caption font-semibold text-white" style={{ backgroundColor: member.color }}>
            {member.name}
          </span>
        )}
      </div>

      {/* Headline value */}
      <div>
        <Amount as="p" value={latest} size="display" className="text-heading" />
        {change !== 0 && (
          <p className={clsx('mt-1 text-body3 tabular-nums', changeIsGood ? 'text-value-positive' : 'text-value-negative')}>
            {formatChange(change)} <span className="text-sub">전일 대비</span>
          </p>
        )}
      </div>

      {/* Trend */}
      {sparkData.length >= 3 && (
        <div className="rounded-xl bg-surface-secondary p-3">
          <p className="mb-2 text-caption text-sub">최근 {sparkData.length}일 추이</p>
          <Sparkline data={sparkData} width={320} height={56} color={sparkColor} strokeWidth={2} className="h-14 w-full" />
        </div>
      )}

      {/* Recent values */}
      {values.length > 0 && (
        <div>
          <p className="mb-2 text-label3 font-semibold text-disabled">최근 기록</p>
          <ul className="divide-y divide-[color:var(--border-subtle)]">
            {values.slice(0, 6).map((v) => (
              <li key={v.id ?? v.date} className="flex items-center justify-between py-2">
                <span className="text-body3 text-sub">{formatDate(v.date)}</span>
                <Amount value={v.value} size="emphasis" className="text-heading" />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div className="space-y-2 pt-1">
        <button
          type="button"
          onClick={onRecordValue}
          className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-primary-500 px-3 text-body3 font-semibold text-white transition-colors hover:bg-primary-600"
        >
          <Wallet className="h-4 w-4" /> 오늘 값 기록
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-surface-secondary px-3 text-body3 font-medium text-heading transition-colors hover:bg-[var(--hover-bg)]"
          >
            <Pencil className="h-4 w-4" /> 수정
          </button>
          <button
            type="button"
            onClick={() => navigate(`${basePath}/${itemId}`)}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-surface-secondary px-3 text-body3 font-medium text-heading transition-colors hover:bg-[var(--hover-bg)]"
          >
            전체 보기 <ArrowUpRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label="삭제"
            className="inline-flex min-h-11 w-11 items-center justify-center rounded-lg bg-status-danger-soft text-status-danger transition-colors hover:bg-[color:var(--status-danger-border)]"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
