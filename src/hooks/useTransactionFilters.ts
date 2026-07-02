import { useMemo, useState, useCallback } from 'react'
import type { Transaction, TransactionType, PaymentMethod, SubscriptionCategoryType } from '@/lib/types'

export type TransactionSortBy = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc'
export type TransactionDateRange = 'all' | '7d' | '30d' | '90d'
// 'none' = subscriptionCategory가 비어있는(일반) 거래만 조회
export type SubscriptionCategoryFilter = SubscriptionCategoryType | 'none' | null

interface TransactionFilters {
  type: TransactionType | 'all'
  memberId: string | null
  categoryId: string | null
  searchQuery: string
  paymentMethod: PaymentMethod | null
  minAmount: number | null
  maxAmount: number | null
  sortBy: TransactionSortBy
  dateRange: TransactionDateRange
  subscriptionCategory: SubscriptionCategoryFilter
}

const DEFAULT_FILTERS: TransactionFilters = {
  type: 'all',
  memberId: null,
  categoryId: null,
  searchQuery: '',
  paymentMethod: null,
  minAmount: null,
  maxAmount: null,
  sortBy: 'date-desc',
  dateRange: 'all',
  subscriptionCategory: null,
}

function daysAgoISO(days: number): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - days)
  return d.toISOString().split('T')[0]
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
    if (filters.dateRange !== 'all') {
      const days = filters.dateRange === '7d' ? 7 : filters.dateRange === '30d' ? 30 : 90
      const cutoff = daysAgoISO(days)
      result = result.filter(t => t.date >= cutoff)
    }
    if (filters.subscriptionCategory !== null) {
      if (filters.subscriptionCategory === 'none') {
        result = result.filter(t => !t.subscriptionCategory)
      } else {
        result = result.filter(t => t.subscriptionCategory === filters.subscriptionCategory)
      }
    }

    switch (filters.sortBy) {
      case 'date-asc':
        return result.sort((a, b) => a.date.localeCompare(b.date))
      case 'amount-desc':
        return result.sort((a, b) => b.amount - a.amount || b.date.localeCompare(a.date))
      case 'amount-asc':
        return result.sort((a, b) => a.amount - b.amount || b.date.localeCompare(a.date))
      case 'date-desc':
      default:
        return result.sort((a, b) => b.date.localeCompare(a.date))
    }
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

  const typeCounts = useMemo(() => {
    let income = 0
    let expense = 0
    for (const t of transactions) {
      if (t.type === 'income') income++
      else expense++
    }
    return { all: transactions.length, income, expense }
  }, [transactions])

  const activeFilterCount = useMemo(() => {
    let count = 0
    if (filters.memberId !== null) count++
    if (filters.categoryId !== null) count++
    if (filters.paymentMethod !== null) count++
    if (filters.minAmount !== null) count++
    if (filters.maxAmount !== null) count++
    if (filters.dateRange !== 'all') count++
    if (filters.searchQuery) count++
    if (filters.subscriptionCategory !== null) count++
    return count
  }, [filters])

  const resetFilters = useCallback(() => {
    setFilters(f => ({ ...DEFAULT_FILTERS, type: f.type }))
  }, [])

  return {
    filters,
    setFilters,
    setTypeFilter: (type: TransactionType | 'all') => setFilters(f => ({ ...f, type })),
    setMemberFilter: (memberId: string | null) => setFilters(f => ({ ...f, memberId })),
    setCategoryFilter: (categoryId: string | null) => setFilters(f => ({ ...f, categoryId })),
    setSearchQuery: (searchQuery: string) => setFilters(f => ({ ...f, searchQuery })),
    setPaymentMethodFilter: (paymentMethod: PaymentMethod | null) => setFilters(f => ({ ...f, paymentMethod })),
    setMinAmount: (minAmount: number | null) => setFilters(f => ({ ...f, minAmount })),
    setMaxAmount: (maxAmount: number | null) => setFilters(f => ({ ...f, maxAmount })),
    setSortBy: (sortBy: TransactionSortBy) => setFilters(f => ({ ...f, sortBy })),
    setDateRange: (dateRange: TransactionDateRange) => setFilters(f => ({ ...f, dateRange })),
    setSubscriptionCategoryFilter: (subscriptionCategory: SubscriptionCategoryFilter) =>
      setFilters(f => ({ ...f, subscriptionCategory })),
    resetFilters,
    activeFilterCount,
    typeCounts,
    filtered,
    summary,
  }
}
