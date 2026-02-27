import { useMemo } from 'react'
import { useTransactionStore } from '@/stores/transactionStore'
import { formatKoreanUnit, formatPercent } from '@/utils/format'
import type { Transaction } from '@/lib/types'

interface CategoryBreakdownProps {
  transactions: Transaction[]
  type: 'income' | 'expense'
}

export function CategoryBreakdown({ transactions, type }: CategoryBreakdownProps) {
  const categories = useTransactionStore((s) => s.categories)

  const breakdown = useMemo(() => {
    const typeTransactions = transactions.filter(t => t.type === type)
    const totals = new Map<number | null, number>()

    for (const t of typeTransactions) {
      const key = t.categoryId
      totals.set(key, (totals.get(key) || 0) + t.amount)
    }

    const grandTotal = Array.from(totals.values()).reduce((s, v) => s + v, 0)

    return Array.from(totals.entries())
      .map(([catId, total]) => {
        const cat = catId ? categories.find(c => c.id === catId) : null
        return {
          categoryId: catId,
          name: cat?.name || '미분류',
          color: cat?.color || '#71717a',
          total,
          percentage: grandTotal > 0 ? (total / grandTotal) * 100 : 0,
        }
      })
      .sort((a, b) => b.total - a.total)
  }, [transactions, type, categories])

  if (breakdown.length === 0) return null

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
      <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3">
        {type === 'income' ? '수입' : '지출'} 카테고리
      </h4>
      <div className="space-y-2.5">
        {breakdown.map((b) => (
          <div key={b.categoryId ?? 'uncategorized'}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: b.color }} />
                <span className="text-sm text-zinc-700 dark:text-zinc-300">{b.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 tabular-nums">
                  {formatKoreanUnit(b.total)}
                </span>
                <span className="text-xs text-zinc-400 w-10 text-right tabular-nums">
                  {formatPercent(b.percentage, 0)}
                </span>
              </div>
            </div>
            <div className="h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${b.percentage}%`, backgroundColor: b.color }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
