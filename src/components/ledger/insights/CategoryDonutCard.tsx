import { useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { PieChart } from 'lucide-react'
import { clsx } from 'clsx'
import { describeArc } from '@/utils/svgArc'
import { formatKoreanUnit, formatPercent } from '@/utils/format'
import type { Transaction, TransactionCategory } from '@/lib/types'
import { easeOutExpo } from '@/lib/motionConfig'

interface CategoryDonutCardProps {
  transactions: Transaction[]
  categories: TransactionCategory[]
  month: string
  type: 'expense' | 'income'
  onCategorySelect?: (categoryId: string | null) => void
}

const CX = 50
const CY = 50
const R = 38
const STROKE_WIDTH = 8
const GAP_DEG = 2

interface Segment {
  categoryId: string | null
  name: string
  color: string
  value: number
  percent: number
  startAngle: number
  endAngle: number
}

export function CategoryDonutCard({
  transactions, categories, month, type, onCategorySelect,
}: CategoryDonutCardProps) {
  const shouldReduceMotion = useReducedMotion()

  const { segments, total } = useMemo(() => {
    const byCategory = new Map<string | null, number>()
    for (const t of transactions) {
      if (t.type !== type) continue
      if (!t.date.startsWith(month)) continue
      byCategory.set(t.categoryId, (byCategory.get(t.categoryId) || 0) + t.amount)
    }
    const total = [...byCategory.values()].reduce((s, v) => s + v, 0)
    if (total === 0) return { segments: [] as Segment[], total: 0 }

    const entries = [...byCategory.entries()]
      .map(([catId, value]) => {
        const cat = catId ? categories.find(c => c.id === catId) : null
        return {
          categoryId: catId,
          name: cat?.name ?? '미분류',
          color: cat?.color ?? '#71717a',
          value,
        }
      })
      .sort((a, b) => b.value - a.value)

    // Top 5 + 기타
    const top = entries.slice(0, 5)
    const rest = entries.slice(5)
    const others = rest.reduce((s, e) => s + e.value, 0)
    const items = others > 0
      ? [...top, { categoryId: null, name: '기타', color: 'var(--text-muted)', value: others }]
      : top

    // Segments 계산
    const availableAngle = 360 - GAP_DEG * items.length
    let cumulative = -90 // 12시 방향 시작
    const segments: Segment[] = items.map(item => {
      const angle = (item.value / total) * availableAngle
      const seg: Segment = {
        ...item,
        percent: (item.value / total) * 100,
        startAngle: cumulative,
        endAngle: cumulative + angle,
      }
      cumulative += angle + GAP_DEG
      return seg
    })
    return { segments, total }
  }, [transactions, categories, month, type])

  if (segments.length === 0) {
    return (
      <motion.div className="card-base flex-shrink-0 w-[220px] rounded-2xl bg-surface-primary p-4 text-left transition-all">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-surface-tertiary flex items-center justify-center">
            <PieChart className="w-3.5 h-3.5 text-sub" />
          </div>
          <span className="text-label3-medium text-sub font-semibold">카테고리 구성</span>
        </div>
        <p className="text-body3 text-disabled">거래 없음</p>
      </motion.div>
    )
  }

  const topSeg = segments[0]

  return (
    <motion.div className="card-base flex-shrink-0 w-[220px] rounded-2xl bg-surface-primary p-4 text-left transition-all">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg bg-[color:var(--color-primary-50)] dark:bg-[color:var(--color-primary-900)]/30 flex items-center justify-center">
          <PieChart className="w-3.5 h-3.5 text-[color:var(--color-primary-600)] dark:text-[color:var(--color-primary-300)]" />
        </div>
        <span className="text-caption text-sub font-semibold">카테고리 구성</span>
      </div>

      <div className="flex items-center gap-3">
        {/* Donut SVG */}
        <div className="relative flex-shrink-0">
          <svg viewBox="0 0 100 100" className="w-[84px] h-[84px]" aria-label={`카테고리 구성, 총 ${formatKoreanUnit(total)}원`}>
            {segments.map((seg, i) => (
              <motion.path
                key={`${seg.categoryId}-${i}`}
                d={describeArc(CX, CY, R, seg.startAngle, seg.endAngle)}
                fill="none"
                stroke={seg.color}
                strokeWidth={STROKE_WIDTH}
                strokeLinecap="round"
                initial={shouldReduceMotion ? undefined : { pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.8, delay: i * 0.06, ease: easeOutExpo }}
                role={onCategorySelect ? 'button' : undefined}
                aria-label={`${seg.name} ${formatPercent(seg.percent, 0)}`}
                className={onCategorySelect ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}
                onClick={onCategorySelect ? () => onCategorySelect(seg.categoryId) : undefined}
              />
            ))}
          </svg>
          {/* 중앙 top 카테고리 */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-label4 text-disabled leading-none mb-0.5">Top</span>
            <span className="text-label3 text-heading tabular-nums leading-none">
              {topSeg.percent.toFixed(0)}%
            </span>
          </div>
        </div>

        {/* Legend top 3 */}
        <div className="flex-1 min-w-0 space-y-1">
          {segments.slice(0, 3).map(seg => (
            <button
              key={seg.categoryId ?? 'x'}
              type="button"
              onClick={onCategorySelect ? () => onCategorySelect(seg.categoryId) : undefined}
              disabled={!onCategorySelect}
              className={clsx(
                'w-full flex items-center gap-1.5 text-left rounded',
                onCategorySelect && 'hover:bg-[var(--hover-bg)] px-1 py-0.5 -mx-1 -my-0.5 transition-colors',
              )}
              aria-label={`${seg.name} 필터 적용`}
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: seg.color }}
                aria-hidden="true"
              />
              <span className="text-label3-medium text-body truncate flex-1 leading-tight">{seg.name}</span>
              <span className="text-label3-medium text-sub font-semibold tabular-nums leading-tight">
                {seg.percent.toFixed(0)}%
              </span>
            </button>
          ))}
        </div>
      </div>

      {segments.length > 3 && (
        <p className="mt-2 text-label4 text-disabled text-center">
          +{segments.length - 3}개 더
        </p>
      )}
    </motion.div>
  )
}
