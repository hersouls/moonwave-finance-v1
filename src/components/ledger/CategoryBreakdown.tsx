import { useMemo } from 'react'
import { useTransactionStore } from '@/stores/transactionStore'
import { formatKoreanUnit, formatPercent } from '@/utils/format'
import { Amount } from '@/components/ui/Amount'
import { UNCATEGORIZED_COLOR, UNCATEGORIZED_LABEL } from '@/lib/ledgerConstants'
import type { Transaction, Budget } from '@/lib/types'

interface CategoryBreakdownProps {
  transactions: Transaction[]
  type: 'income' | 'expense'
  budgets?: Budget[]
}

export function CategoryBreakdown({ transactions, type, budgets }: CategoryBreakdownProps) {
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
        const budget = catId && budgets ? budgets.find(b => b.categoryId === catId) : null
        return {
          categoryId: catId,
          name: cat?.name || UNCATEGORIZED_LABEL,
          color: cat?.color || UNCATEGORIZED_COLOR,
          total,
          percentage: grandTotal > 0 ? (total / grandTotal) * 100 : 0,
          budget: budget?.amount ?? null,
        }
      })
      .sort((a, b) => b.total - a.total)
  }, [transactions, type, categories, budgets])

  if (breakdown.length === 0) return null

  return (
    <div className="card-base">
      <h4 className="text-body3-semi text-heading mb-3">
        {type === 'income' ? '수입' : '지출'} 카테고리
      </h4>
      <div className="space-y-2.5">
        {breakdown.map((b) => (
          <div key={b.categoryId ?? 'uncategorized'}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <div className="badge-category-dot" style={{ backgroundColor: b.color }} />
                <span className="text-sm text-body">{b.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <Amount value={b.total} size="emphasis" className="text-heading" unit="" />
                <span className="text-caption text-disabled w-10 text-right tabular-nums">
                  {formatPercent(b.percentage, 0)}
                </span>
              </div>
            </div>
            <div className="h-1.5 bg-surface-tertiary rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${b.percentage}%`, backgroundColor: b.color }}
              />
            </div>
            {b.budget !== null && (
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-disabled">
                  예산 {formatKoreanUnit(b.budget)}
                </span>
                <span className={`text-[10px] font-medium tabular-nums ${
                  b.total > b.budget
                    ? 'text-status-danger'
                    : 'text-status-success'
                }`}>
                  {b.total > b.budget
                    ? `${formatKoreanUnit(b.total - b.budget)} 초과`
                    : `${formatKoreanUnit(b.budget - b.total)} 남음`
                  }
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
