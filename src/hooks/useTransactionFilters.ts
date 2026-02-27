import { useMemo, useState } from 'react'
import type { Transaction, TransactionType } from '@/lib/types'

interface TransactionFilters {
  type: TransactionType | 'all'
  memberId: number | null
  categoryId: number | null
  searchQuery: string
}

export function useTransactionFilters(transactions: Transaction[]) {
  const [filters, setFilters] = useState<TransactionFilters>({
    type: 'all',
    memberId: null,
    categoryId: null,
    searchQuery: '',
  })

  const filtered = useMemo(() => {
    let result = [...transactions]

    if (filters.type !== 'all') {
      result = result.filter(t => t.type === filters.type)
    }
    if (filters.memberId !== null) {
      result = result.filter(t => t.memberId === filters.memberId)
    }
    if (filters.categoryId !== null) {
      result = result.filter(t => t.categoryId === filters.categoryId)
    }
    if (filters.searchQuery) {
      const q = filters.searchQuery.toLowerCase()
      result = result.filter(t => t.memo?.toLowerCase().includes(q))
    }

    return result.sort((a, b) => b.date.localeCompare(a.date))
  }, [transactions, filters])

  const summary = useMemo(() => {
    let totalIncome = 0
    let totalExpense = 0
    for (const t of transactions) {
      if (t.type === 'income') totalIncome += t.amount
      else totalExpense += t.amount
    }
    return {
      totalIncome,
      totalExpense,
      netSavings: totalIncome - totalExpense,
    }
  }, [transactions])

  return {
    filters,
    setFilters,
    setTypeFilter: (type: TransactionType | 'all') => setFilters(f => ({ ...f, type })),
    setMemberFilter: (memberId: number | null) => setFilters(f => ({ ...f, memberId })),
    setCategoryFilter: (categoryId: number | null) => setFilters(f => ({ ...f, categoryId })),
    setSearchQuery: (searchQuery: string) => setFilters(f => ({ ...f, searchQuery })),
    filtered,
    summary,
  }
}
