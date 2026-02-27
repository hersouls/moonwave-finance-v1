import { useMemo, useState, useCallback } from 'react'
import type { Transaction, TransactionType, PaymentMethod } from '@/lib/types'

interface TransactionFilters {
  type: TransactionType | 'all'
  memberId: number | null
  categoryId: number | null
  searchQuery: string
  paymentMethod: PaymentMethod | null
  minAmount: number | null
  maxAmount: number | null
}

const DEFAULT_FILTERS: TransactionFilters = {
  type: 'all',
  memberId: null,
  categoryId: null,
  searchQuery: '',
  paymentMethod: null,
  minAmount: null,
  maxAmount: null,
}

export function useTransactionFilters(transactions: Transaction[]) {
  const [filters, setFilters] = useState<TransactionFilters>({ ...DEFAULT_FILTERS })

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
    if (filters.paymentMethod !== null) {
      result = result.filter(t => t.paymentMethod === filters.paymentMethod)
    }
    if (filters.minAmount !== null) {
      result = result.filter(t => t.amount >= filters.minAmount!)
    }
    if (filters.maxAmount !== null) {
      result = result.filter(t => t.amount <= filters.maxAmount!)
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

  const activeFilterCount = useMemo(() => {
    let count = 0
    if (filters.memberId !== null) count++
    if (filters.categoryId !== null) count++
    if (filters.paymentMethod !== null) count++
    if (filters.minAmount !== null) count++
    if (filters.maxAmount !== null) count++
    return count
  }, [filters])

  const resetFilters = useCallback(() => {
    setFilters({ ...DEFAULT_FILTERS })
  }, [])

  return {
    filters,
    setFilters,
    setTypeFilter: (type: TransactionType | 'all') => setFilters(f => ({ ...f, type })),
    setMemberFilter: (memberId: number | null) => setFilters(f => ({ ...f, memberId })),
    setCategoryFilter: (categoryId: number | null) => setFilters(f => ({ ...f, categoryId })),
    setSearchQuery: (searchQuery: string) => setFilters(f => ({ ...f, searchQuery })),
    setPaymentMethodFilter: (paymentMethod: PaymentMethod | null) => setFilters(f => ({ ...f, paymentMethod })),
    setMinAmount: (minAmount: number | null) => setFilters(f => ({ ...f, minAmount })),
    setMaxAmount: (maxAmount: number | null) => setFilters(f => ({ ...f, maxAmount })),
    resetFilters,
    activeFilterCount,
    filtered,
    summary,
  }
}
