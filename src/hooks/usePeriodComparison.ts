import { useState, useEffect, useMemo } from 'react'
import * as db from '@/services/database'
import { useTransactionStore } from '@/stores/transactionStore'
import { getPreviousMonth, getCurrentMonthString } from '@/lib/dateUtils'
import type { Transaction } from '@/lib/types'

export interface CategoryComparison {
  categoryId: number | null
  name: string
  color: string
  current: number
  previous: number
  delta: number
  deltaPercent: number
}

export interface PeriodComparisonData {
  currentMonth: string
  previousMonth: string
  totalIncome: { current: number; previous: number; delta: number; deltaPercent: number }
  totalExpense: { current: number; previous: number; delta: number; deltaPercent: number }
  categories: CategoryComparison[]
  isLoading: boolean
}

export function usePeriodComparison(month?: string): PeriodComparisonData {
  const currentMonth = month || getCurrentMonthString()
  const previousMonth = getPreviousMonth(currentMonth)
  const categories = useTransactionStore((s) => s.categories)

  const [currentTxns, setCurrentTxns] = useState<Transaction[]>([])
  const [previousTxns, setPreviousTxns] = useState<Transaction[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setIsLoading(true)
    Promise.all([
      db.getTransactionsByMonth(currentMonth),
      db.getTransactionsByMonth(previousMonth),
    ]).then(([cur, prev]) => {
      setCurrentTxns(cur)
      setPreviousTxns(prev)
      setIsLoading(false)
    })
  }, [currentMonth, previousMonth])

  const data = useMemo(() => {
    const calcTotal = (txns: Transaction[], type: 'income' | 'expense') =>
      txns.filter(t => t.type === type).reduce((s, t) => s + t.amount, 0)

    const curIncome = calcTotal(currentTxns, 'income')
    const prevIncome = calcTotal(previousTxns, 'income')
    const curExpense = calcTotal(currentTxns, 'expense')
    const prevExpense = calcTotal(previousTxns, 'expense')

    const calcDelta = (cur: number, prev: number) => ({
      current: cur,
      previous: prev,
      delta: cur - prev,
      deltaPercent: prev > 0 ? ((cur - prev) / prev) * 100 : cur > 0 ? 100 : 0,
    })

    // Category breakdown for expenses
    const catMap = new Map<number | null, { current: number; previous: number }>()

    for (const t of currentTxns.filter(t => t.type === 'expense')) {
      const existing = catMap.get(t.categoryId) || { current: 0, previous: 0 }
      existing.current += t.amount
      catMap.set(t.categoryId, existing)
    }
    for (const t of previousTxns.filter(t => t.type === 'expense')) {
      const existing = catMap.get(t.categoryId) || { current: 0, previous: 0 }
      existing.previous += t.amount
      catMap.set(t.categoryId, existing)
    }

    const categoryComparisons: CategoryComparison[] = Array.from(catMap.entries())
      .map(([catId, vals]) => {
        const cat = catId ? categories.find(c => c.id === catId) : null
        return {
          categoryId: catId,
          name: cat?.name || '미분류',
          color: cat?.color || '#71717a',
          current: vals.current,
          previous: vals.previous,
          delta: vals.current - vals.previous,
          deltaPercent: vals.previous > 0 ? ((vals.current - vals.previous) / vals.previous) * 100 : vals.current > 0 ? 100 : 0,
        }
      })
      .sort((a, b) => b.current - a.current)

    return {
      totalIncome: calcDelta(curIncome, prevIncome),
      totalExpense: calcDelta(curExpense, prevExpense),
      categories: categoryComparisons,
    }
  }, [currentTxns, previousTxns, categories])

  return {
    currentMonth,
    previousMonth,
    ...data,
    isLoading,
  }
}
