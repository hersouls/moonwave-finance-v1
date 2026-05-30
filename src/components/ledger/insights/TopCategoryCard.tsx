import { useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Tag as TagIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { clsx } from 'clsx'
import { Amount } from '@/components/ui/Amount'
import { useCategoryTrend } from '@/hooks/useCategoryTrend'
import { getCategoryIcon } from '@/utils/categoryIcons'
import type { Transaction, TransactionCategory } from '@/lib/types'

interface TopCategoryCardProps {
  transactions: Transaction[]
  categories: TransactionCategory[]
  month: string
  type: 'expense' | 'income'
  onClick?: (categoryId: number | null) => void
}

export function TopCategoryCard({
  transactions, categories, month, type, onClick,
}: TopCategoryCardProps) {
  const shouldReduceMotion = useReducedMotion()

  const { topCategory, topAmount } = useMemo(() => {
    const byCategory = new Map<number | null, number>()
    for (const t of transactions) {
      if (t.type !== type) continue
      if (!t.date.startsWith(month)) continue
      byCategory.set(t.categoryId, (byCategory.get(t.categoryId) || 0) + t.amount)
    }
    const entries = [...byCategory.entries()].sort((a, b) => b[1] - a[1])
    if (entries.length === 0) return { topCategory: null, topAmount: 0 }
    const [catId, amount] = entries[0]
    const cat = catId ? categories.find(c => c.id === catId) ?? null : null
    return { topCategory: cat, topAmount: amount }
  }, [transactions, categories, month, type])

  const trend = useCategoryTrend(topCategory?.id ?? null, month, transactions, type)

  const Tag = onClick ? motion.button : motion.div
  const tagProps = onClick
    ? {
        type: 'button' as const,
        onClick: () => onClick(topCategory?.id ?? null),
        whileHover: shouldReduceMotion ? undefined : { y: -2 },
        whileTap: shouldReduceMotion ? undefined : { scale: 0.98 },
      }
    : {}

  const color = topCategory?.color ?? 'var(--text-muted)'
  const Icon = getCategoryIcon(topCategory?.icon)
  const isExpense = type === 'expense'
  const trendIsBad = isExpense ? trend.direction === 'up' : trend.direction === 'down'
  const trendIsGood = isExpense ? trend.direction === 'down' : trend.direction === 'up'

  if (topAmount === 0) {
    return (
      <Tag
        {...tagProps}
        className="card-base flex-shrink-0 w-[180px] rounded-2xl bg-surface-primary p-4 text-left transition-all"
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-surface-tertiary flex items-center justify-center">
            <TagIcon className="w-3.5 h-3.5 text-sub" />
          </div>
          <span className="text-caption text-sub font-semibold">Top 카테고리</span>
        </div>
        <p className="text-body3 text-disabled">거래 없음</p>
      </Tag>
    )
  }

  return (
    <Tag
      {...tagProps}
      className="card-base flex-shrink-0 w-[180px] rounded-2xl bg-surface-primary p-4 text-left transition-all"
      aria-label={`Top 카테고리 ${topCategory?.name ?? '미분류'}, ${topAmount}원`}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}1a` }}>
          <Icon className="w-3.5 h-3.5" style={{ color }} />
        </div>
        <span className="text-caption text-sub font-semibold">Top 카테고리</span>
      </div>
      <p className="text-body3 text-heading font-bold truncate mb-1">{topCategory?.name ?? '미분류'}</p>
      <Amount
        value={topAmount}
        size="emphasis"
        className={clsx('font-bold block', isExpense ? 'text-value-negative' : 'text-value-positive')}
        unit=""
      />
      {trend.percent !== null && (
        <div
          className={clsx(
            'mt-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-caption font-bold tabular-nums leading-none',
            trendIsBad && 'bg-status-danger-soft text-status-danger',
            trendIsGood && 'bg-status-success-soft text-status-success',
            !trendIsBad && !trendIsGood && 'bg-surface-tertiary text-sub',
          )}
        >
          {trend.direction === 'up' && <TrendingUp className="w-2.5 h-2.5" />}
          {trend.direction === 'down' && <TrendingDown className="w-2.5 h-2.5" />}
          {trend.direction === 'flat' && <Minus className="w-2.5 h-2.5" />}
          {trend.percent > 0 ? '+' : ''}{trend.percent.toFixed(0)}%
        </div>
      )}
    </Tag>
  )
}
