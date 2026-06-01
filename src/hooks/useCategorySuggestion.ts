// ─── useCategorySuggestion ──────────────────────────────
//
// Powers the ledger wizard's real-time "AI 카테고리 자동생성" recommendation.
// Reuses the same offline 5-tier engine as the card-statement import
// (learned alias → registered subscription → history-frequency model →
// exact past match → keyword rules) plus an optional Claude API fallback for
// merchants the local heuristics can't resolve.
//
// Unlike the import path (which only sees the currently-loaded month), this
// hook loads the FULL transaction history once so suggestions draw on every
// past entry — the learned merchant→category aliases are global anyway, so
// even a brand-new month gets strong suggestions on the first keystroke.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTransactionStore } from '@/stores/transactionStore'
import { getAllTransactions, db } from '@/services/database'
import { loadAliasMap, setAlias } from '@/services/merchantAliasService'
import {
  buildMerchantStats,
  suggestCategory,
  type MerchantStats,
  type CategoryConfidence,
} from '@/services/cardStatementImport'
import { classifyMerchantsWithAI, hasApiKey } from '@/services/aiCategorizeMerchants'
import type {
  Transaction,
  TransactionType,
  TransactionCategory,
  MerchantAlias,
  Subscription,
} from '@/lib/types'

export interface EntryCategorySuggestion {
  /** Resolved top-suggested category (null when none / unresolved). */
  category: TransactionCategory | null
  confidence: CategoryConfidence
  /** Human-readable rationale surfaced in the UI. */
  reason?: string
  /** Resolved runner-up categories (history-stats path only). */
  alternatives: TransactionCategory[]
  /** True when the suggestion came from the Claude API fallback. */
  fromAI?: boolean
}

interface SuggestionContext {
  history: Transaction[]
  subscriptions: Subscription[]
  aliases: Map<string, MerchantAlias>
}

/**
 * @param enabled  Load context only when truthy (e.g. wizard `open`) so we
 *                 don't hit Dexie on every mount.
 */
export function useCategorySuggestion(enabled: boolean) {
  const categories = useTransactionStore((s) => s.categories)
  const [ctx, setCtx] = useState<SuggestionContext | null>(null)
  const [ready, setReady] = useState(false)

  const load = useCallback(async () => {
    const [history, subscriptions, aliases] = await Promise.all([
      getAllTransactions(),
      db.subscriptions.toArray(),
      loadAliasMap(),
    ])
    setCtx({ history, subscriptions, aliases })
    setReady(true)
  }, [])

  useEffect(() => {
    if (enabled && !ctx) void load()
  }, [enabled, ctx, load])

  // Per-type history-frequency models, rebuilt whenever context/categories change.
  const statsByType = useRef<Map<TransactionType, Map<string, MerchantStats>>>(new Map())
  useEffect(() => {
    statsByType.current = new Map()
  }, [ctx, categories])

  const getStats = useCallback(
    (type: TransactionType) => {
      if (!ctx) return undefined
      let s = statsByType.current.get(type)
      if (!s) {
        s = buildMerchantStats(ctx.history, categories, type)
        statsByType.current.set(type, s)
      }
      return s
    },
    [ctx, categories],
  )

  const suggest = useCallback(
    (merchant: string, type: TransactionType): EntryCategorySuggestion | null => {
      const m = merchant.trim()
      if (!m || !ctx) return null
      const stats = getStats(type)
      const s = suggestCategory(m, categories, ctx.history, ctx.subscriptions, stats, ctx.aliases, type)
      const typeCats = categories.filter((c) => c.type === type)
      const category =
        s.categoryId != null ? typeCats.find((c) => c.id === s.categoryId) ?? null : null
      const alternatives = (s.alternatives ?? [])
        .map((a) => typeCats.find((c) => c.id === a.categoryId))
        .filter((c): c is TransactionCategory => !!c)
      return { category, confidence: s.confidence, reason: s.reason, alternatives }
    },
    [ctx, categories, getStats],
  )

  /**
   * Claude API fallback for a single merchant (expense categories only —
   * the prompt is expense-oriented). Persists the result as a learned alias
   * so it resolves instantly next time, and refreshes the local alias map.
   */
  const classifyWithAI = useCallback(
    async (merchant: string): Promise<EntryCategorySuggestion | null> => {
      const m = merchant.trim()
      if (!m) return null
      const results = await classifyMerchantsWithAI({ merchants: [m], categories })
      const r = results[0]
      if (!r) return null
      const expenseCats = categories.filter((c) => c.type === 'expense')
      const category =
        r.categoryId != null ? expenseCats.find((c) => c.id === r.categoryId) ?? null : null
      if (category?.id != null) {
        await setAlias({ merchant: m, categoryId: category.id, source: 'ai-suggestion', sampleMerchant: m })
        const aliases = await loadAliasMap()
        setCtx((prev) => (prev ? { ...prev, aliases } : prev))
      }
      return { category, confidence: r.confidence, reason: r.reason, alternatives: [], fromAI: true }
    },
    [categories],
  )

  return { ready, suggest, classifyWithAI, apiKeyAvailable: hasApiKey() }
}
