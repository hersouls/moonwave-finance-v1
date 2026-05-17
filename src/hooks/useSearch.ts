import { useState, useEffect, useMemo } from 'react'
import { db } from '@/services/database'
import type { TransactionType } from '@/lib/types'

export type SearchResultType = 'transaction' | 'asset' | 'subscription' | 'category'

export interface TransactionMeta {
  txnType: TransactionType
  amount: number
  date: string
  categoryId: number | null
  categoryName?: string
  categoryColor?: string
  memberName?: string
  memberColor?: string
  paymentLabel?: string
}

export interface AssetMeta {
  kind: 'asset' | 'liability'
  categoryName?: string
  categoryColor?: string
}

export interface SubscriptionMeta {
  status: 'active' | 'paused' | 'cancelled'
  amount: number
  currency: 'KRW' | 'USD'
  color?: string
}

export interface CategoryMeta {
  kind: 'asset' | 'liability' | 'income' | 'expense'
  color?: string
}

export interface SearchResult {
  type: SearchResultType
  id: number
  title: string
  subtitle?: string
  path: string
  /** matched field — used for the primary highlight */
  matchedText?: string
  matchedField?: 'title' | 'memo' | 'description'
  /** matched range [start, end) in the matchedText (lowercased base) */
  matchRange?: [number, number]
  score: number
  meta?: TransactionMeta | AssetMeta | SubscriptionMeta | CategoryMeta
}

const RECENT_KEY = 'mw:search:recent'
const RECENT_MAX = 6

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter((s) => typeof s === 'string').slice(0, RECENT_MAX) : []
  } catch {
    return []
  }
}

function saveRecent(list: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)))
  } catch {
    /* quota — ignore */
  }
}

/** Finds first match range in text (case-insensitive). */
function findMatch(text: string | undefined, q: string): [number, number] | null {
  if (!text) return null
  const idx = text.toLowerCase().indexOf(q)
  return idx === -1 ? null : [idx, idx + q.length]
}

/** Prefix matches rank highest, then word-start, then substring. */
function matchScore(text: string | undefined, q: string): number {
  if (!text) return 0
  const lower = text.toLowerCase()
  const idx = lower.indexOf(q)
  if (idx === -1) return 0
  if (idx === 0) return 100
  if (/\s|[·,./-]/.test(lower[idx - 1] ?? '')) return 70
  return 40
}

export function useSearch(query: string) {
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }

    let cancelled = false
    const timer = setTimeout(async () => {
      setIsSearching(true)
      const q = query.trim().toLowerCase()
      const found: SearchResult[] = []

      try {
        const [
          transactions,
          txnCats,
          assetCats,
          members,
          paymentMethods,
          items,
          subscriptions,
        ] = await Promise.all([
          db.transactions.reverse().limit(400).toArray(),
          db.transactionCategories.toArray(),
          db.assetCategories.toArray(),
          db.members.toArray(),
          db.paymentMethodItems.toArray(),
          db.assetItems.toArray(),
          db.subscriptions.toArray(),
        ])

        const txnCatMap = new Map(txnCats.map((c) => [c.id!, c]))
        const assetCatMap = new Map(assetCats.map((c) => [c.id!, c]))
        const memberMap = new Map(members.map((m) => [m.id!, m]))
        const pmMap = new Map(paymentMethods.map((p) => [p.id!, p]))

        // ── Transactions (memo + category + member name) ─────────────
        for (const txn of transactions) {
          const category = txn.categoryId ? txnCatMap.get(txn.categoryId) : undefined
          const member = txn.memberId ? memberMap.get(txn.memberId) : undefined
          const pmItem = txn.paymentMethodItemId ? pmMap.get(txn.paymentMethodItemId) : undefined

          const memoScore = matchScore(txn.memo, q) * 1.2 // memo is primary focus
          const catScore = matchScore(category?.name, q) * 0.6
          const memberScore = matchScore(member?.name, q) * 0.4
          const pmScore = matchScore(txn.paymentMethodDetail || pmItem?.name, q) * 0.3
          const score = memoScore + catScore + memberScore + pmScore

          if (score <= 0) continue

          const hasMemoMatch = memoScore > 0 && txn.memo
          const matchedField: 'title' | 'memo' = hasMemoMatch ? 'memo' : 'title'
          const matchedText = hasMemoMatch ? txn.memo! : (category?.name || '거래')
          const matchRange = findMatch(matchedText, q) ?? undefined

          found.push({
            type: 'transaction',
            id: txn.id!,
            title: txn.memo?.trim() || category?.name || '거래',
            path: txn.type === 'income' ? '/ledger/income' : '/ledger/expense',
            matchedField,
            matchedText,
            matchRange,
            score,
            meta: {
              txnType: txn.type,
              amount: txn.amount,
              date: txn.date,
              categoryId: txn.categoryId,
              categoryName: category?.name,
              categoryColor: category?.color,
              memberName: member?.name,
              memberColor: member?.color,
              paymentLabel: txn.paymentMethodDetail || pmItem?.name,
            } satisfies TransactionMeta,
          })
        }

        // ── Asset / Liability items ───────────────────────────────────
        for (const item of items) {
          const nameScore = matchScore(item.name, q) * 1.0
          const memoScore = matchScore(item.memo, q) * 0.8
          const score = nameScore + memoScore
          if (score <= 0) continue
          const category = assetCatMap.get(item.categoryId)
          const matchedField: 'title' | 'memo' = nameScore >= memoScore ? 'title' : 'memo'
          const matchedText = matchedField === 'title' ? item.name : (item.memo || item.name)
          found.push({
            type: 'asset',
            id: item.id!,
            title: item.name,
            subtitle: category?.name,
            path: item.type === 'asset' ? `/assets/${item.id}` : `/liabilities/${item.id}`,
            matchedField,
            matchedText,
            matchRange: findMatch(matchedText, q) ?? undefined,
            score,
            meta: {
              kind: item.type,
              categoryName: category?.name,
              categoryColor: category?.color,
            } satisfies AssetMeta,
          })
        }

        // ── Subscriptions ─────────────────────────────────────────────
        for (const sub of subscriptions) {
          const nameScore = matchScore(sub.name, q) * 1.0
          const descScore = matchScore(sub.description, q) * 0.7
          const memoScore = matchScore(sub.memo, q) * 0.6
          const score = nameScore + descScore + memoScore
          if (score <= 0) continue
          const best: 'title' | 'description' | 'memo' =
            nameScore >= descScore && nameScore >= memoScore
              ? 'title'
              : descScore >= memoScore
                ? 'description'
                : 'memo'
          const matchedText =
            best === 'title' ? sub.name : best === 'description' ? (sub.description || '') : (sub.memo || '')
          found.push({
            type: 'subscription',
            id: sub.id!,
            title: sub.name,
            subtitle: sub.description || undefined,
            path: '/subscriptions',
            matchedField: best,
            matchedText,
            matchRange: findMatch(matchedText, q) ?? undefined,
            score,
            meta: {
              status: sub.status,
              amount: sub.amount,
              currency: sub.currency,
              color: sub.color,
            } satisfies SubscriptionMeta,
          })
        }

        // ── Categories ────────────────────────────────────────────────
        for (const cat of assetCats) {
          const s = matchScore(cat.name, q)
          if (s <= 0) continue
          found.push({
            type: 'category',
            id: cat.id!,
            title: cat.name,
            subtitle: cat.type === 'asset' ? '자산 카테고리' : '부채 카테고리',
            path: cat.type === 'asset' ? '/assets' : '/liabilities',
            matchedField: 'title',
            matchedText: cat.name,
            matchRange: findMatch(cat.name, q) ?? undefined,
            score: s * 0.5,
            meta: { kind: cat.type, color: cat.color } satisfies CategoryMeta,
          })
        }
        for (const cat of txnCats) {
          const s = matchScore(cat.name, q)
          if (s <= 0) continue
          found.push({
            type: 'category',
            id: cat.id!,
            title: cat.name,
            subtitle: `${cat.type === 'income' ? '수입' : '지출'} 카테고리`,
            path: cat.type === 'income' ? '/ledger/income' : '/ledger/expense',
            matchedField: 'title',
            matchedText: cat.name,
            matchRange: findMatch(cat.name, q) ?? undefined,
            score: s * 0.5,
            meta: { kind: cat.type, color: cat.color } satisfies CategoryMeta,
          })
        }
      } catch {
        // ignore search errors
      }

      if (!cancelled) {
        found.sort((a, b) => b.score - a.score)
        setResults(found.slice(0, 40))
        setIsSearching(false)
      }
    }, 220)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  return { results, isSearching }
}

/** Returns grouped results preserving order within each group. */
export function groupResults(results: SearchResult[]) {
  const groups: Record<SearchResultType, SearchResult[]> = {
    transaction: [],
    asset: [],
    subscription: [],
    category: [],
  }
  for (const r of results) groups[r.type].push(r)
  return groups
}

/** Manage recent searches in localStorage. */
export function useRecentSearches() {
  const [recent, setRecent] = useState<string[]>(() => loadRecent())

  const add = (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) return
    setRecent((prev) => {
      const next = [trimmed, ...prev.filter((p) => p.toLowerCase() !== trimmed.toLowerCase())].slice(0, RECENT_MAX)
      saveRecent(next)
      return next
    })
  }

  const remove = (q: string) => {
    setRecent((prev) => {
      const next = prev.filter((p) => p !== q)
      saveRecent(next)
      return next
    })
  }

  const clear = () => {
    setRecent([])
    saveRecent([])
  }

  return { recent, add, remove, clear }
}

/** Small helper: build highlight segments for a matched text. */
export function useHighlightSegments(text: string | undefined, range: [number, number] | undefined) {
  return useMemo(() => {
    if (!text) return [] as Array<{ text: string; match: boolean }>
    if (!range) return [{ text, match: false }]
    const [s, e] = range
    const safeS = Math.max(0, Math.min(s, text.length))
    const safeE = Math.max(safeS, Math.min(e, text.length))
    return [
      { text: text.slice(0, safeS), match: false },
      { text: text.slice(safeS, safeE), match: true },
      { text: text.slice(safeE), match: false },
    ].filter((seg) => seg.text.length > 0)
  }, [text, range])
}
