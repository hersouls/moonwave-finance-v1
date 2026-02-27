import { useState, useEffect } from 'react'
import * as db from '@/services/database'
import type { Transaction } from '@/lib/types'
import { format, subMonths } from 'date-fns'

export function useMultiMonthTransactions(monthCount: number = 6) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      const now = new Date()
      const start = format(subMonths(now, monthCount - 1), 'yyyy-MM') + '-01'
      const end = format(now, 'yyyy-MM') + '-31'
      try {
        const txns = await db.getTransactionsByDateRange(start, end)
        setTransactions(txns)
      } catch {
        setTransactions([])
      }
      setIsLoading(false)
    }
    load()
  }, [monthCount])

  return { transactions, isLoading }
}
