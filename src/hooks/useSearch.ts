import { useState, useEffect } from 'react'
import { db } from '@/services/database'

export interface SearchResult {
  type: 'asset' | 'transaction' | 'category' | 'subscription'
  id: number
  title: string
  subtitle?: string
  path: string
}

export function useSearch(query: string) {
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }

    const timer = setTimeout(async () => {
      setIsSearching(true)
      const q = query.toLowerCase()
      const found: SearchResult[] = []

      try {
        // Search asset items
        const items = await db.assetItems.toArray()
        for (const item of items) {
          if (item.name.toLowerCase().includes(q) || item.memo?.toLowerCase().includes(q)) {
            found.push({
              type: 'asset',
              id: item.id!,
              title: item.name,
              subtitle: item.type === 'asset' ? '자산' : '부채',
              path: item.type === 'asset' ? `/assets/${item.id}` : `/liabilities/${item.id}`,
            })
          }
        }

        // Search transactions (last 200)
        const transactions = await db.transactions.reverse().limit(200).toArray()
        for (const txn of transactions) {
          if (txn.memo?.toLowerCase().includes(q)) {
            found.push({
              type: 'transaction',
              id: txn.id!,
              title: txn.memo || '거래',
              subtitle: `${txn.type === 'income' ? '수입' : '지출'} · ${txn.date}`,
              path: txn.type === 'income' ? '/ledger/income' : '/ledger/expense',
            })
          }
        }

        // Search categories
        const assetCats = await db.assetCategories.toArray()
        for (const cat of assetCats) {
          if (cat.name.toLowerCase().includes(q)) {
            found.push({
              type: 'category',
              id: cat.id!,
              title: cat.name,
              subtitle: cat.type === 'asset' ? '자산 카테고리' : '부채 카테고리',
              path: cat.type === 'asset' ? '/assets' : '/liabilities',
            })
          }
        }

        const txnCats = await db.transactionCategories.toArray()
        for (const cat of txnCats) {
          if (cat.name.toLowerCase().includes(q)) {
            found.push({
              type: 'category',
              id: cat.id!,
              title: cat.name,
              subtitle: `${cat.type === 'income' ? '수입' : '지출'} 카테고리`,
              path: cat.type === 'income' ? '/ledger/income' : '/ledger/expense',
            })
          }
        }

        // Search subscriptions
        const subscriptions = await db.subscriptions.toArray()
        for (const sub of subscriptions) {
          if (sub.name.toLowerCase().includes(q) || sub.description?.toLowerCase().includes(q) || sub.memo?.toLowerCase().includes(q)) {
            found.push({
              type: 'subscription' as SearchResult['type'],
              id: sub.id!,
              title: sub.name,
              subtitle: `구독 · ${sub.status === 'active' ? '활성' : sub.status === 'paused' ? '일시정지' : '해지'}`,
              path: sub.currency === 'USD' ? '/subscriptions/international' : '/subscriptions/domestic',
            })
          }
        }
      } catch {
        // ignore search errors
      }

      setResults(found.slice(0, 20))
      setIsSearching(false)
    }, 300) // 300ms debounce

    return () => clearTimeout(timer)
  }, [query])

  return { results, isSearching }
}
