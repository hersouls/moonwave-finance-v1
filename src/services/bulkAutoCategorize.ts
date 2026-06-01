// ─── Bulk auto-categorization of uncategorized ledger entries ──
//
// Scans every uncategorized expense transaction (typically the residue of
// card-statement imports), groups them by normalized merchant, and runs the
// shared offline suggestion engine on each group. Merchants the local
// heuristics can't resolve can be sent to Claude in one batched call.
//
// Applying a group writes the chosen category to every transaction in it via
// the same `db.updateTransaction` path manual edits use — so the change is
// tracked in syncChangeLog and propagates to the user's other devices — and
// records a learned merchant→category alias so future entries resolve
// instantly without re-running the AI.

import { db, getAllTransactions, updateTransaction } from '@/services/database'
import { normalizeMerchantKey } from '@/services/subscriptionDetection'
import { loadAliasMap, setAlias } from '@/services/merchantAliasService'
import {
  buildMerchantStats,
  suggestCategory,
  type CategorySuggestion,
} from '@/services/cardStatementImport'

export interface UncategorizedGroup {
  merchantKey: string
  /** Display name — the memo of the first transaction in the group. */
  sampleMerchant: string
  txnIds: number[]
  count: number
  /** Sum of absolute amounts across the group (KRW). */
  amountTotal: number
  suggestion: CategorySuggestion
}

export interface BulkAnalysis {
  groups: UncategorizedGroup[]
  /** Total uncategorized expense transactions (including memo-less, ungroupable). */
  totalUncategorized: number
  /** Uncategorized transactions with no memo — can't be auto-classified. */
  memolessCount: number
  /** Groups the engine resolved with high/medium confidence. */
  confidentKeys: string[]
}

/** A suggestion we trust enough to pre-select for bulk apply. */
export function isConfident(s: CategorySuggestion): boolean {
  return s.categoryId != null && (s.confidence === 'high' || s.confidence === 'medium')
}

export async function analyzeUncategorized(): Promise<BulkAnalysis> {
  const [all, subscriptions, aliases, categories] = await Promise.all([
    getAllTransactions(),
    db.subscriptions.toArray(),
    loadAliasMap(),
    db.transactionCategories.toArray(),
  ])

  const uncategorized = all.filter((t) => t.type === 'expense' && t.categoryId == null)
  const stats = buildMerchantStats(all, categories, 'expense')

  const byKey = new Map<string, { sampleMerchant: string; txnIds: number[]; amountTotal: number }>()
  let memolessCount = 0
  for (const t of uncategorized) {
    if (t.id == null) continue
    const memo = t.memo?.trim()
    if (!memo) { memolessCount++; continue }
    const key = normalizeMerchantKey(memo)
    if (!key) { memolessCount++; continue }
    let g = byKey.get(key)
    if (!g) { g = { sampleMerchant: memo, txnIds: [], amountTotal: 0 }; byKey.set(key, g) }
    g.txnIds.push(t.id)
    g.amountTotal += Math.abs(t.amount)
  }

  const groups: UncategorizedGroup[] = []
  for (const [merchantKey, g] of byKey) {
    const suggestion = suggestCategory(
      g.sampleMerchant, categories, all, subscriptions, stats, aliases, 'expense',
    )
    groups.push({
      merchantKey,
      sampleMerchant: g.sampleMerchant,
      txnIds: g.txnIds,
      count: g.txnIds.length,
      amountTotal: g.amountTotal,
      suggestion,
    })
  }

  // Confident groups first (ready to apply), then by impact (count, amount).
  groups.sort((a, b) => {
    const ca = isConfident(a.suggestion) ? 1 : 0
    const cb = isConfident(b.suggestion) ? 1 : 0
    if (ca !== cb) return cb - ca
    return b.count - a.count || b.amountTotal - a.amountTotal
  })

  return {
    groups,
    totalUncategorized: uncategorized.length,
    memolessCount,
    confidentKeys: groups.filter((g) => isConfident(g.suggestion)).map((g) => g.merchantKey),
  }
}

export interface ApplyInput {
  groups: UncategorizedGroup[]
  /** merchantKeys the user chose to apply. */
  selectedKeys: Set<string>
  /** merchantKey → categoryId override when the user changed the suggestion. */
  overrides: Record<string, number>
}

export interface ApplyResult {
  /** Transactions updated. */
  applied: number
  /** Distinct merchants applied. */
  merchants: number
}

export async function applyGroups(input: ApplyInput): Promise<ApplyResult> {
  let applied = 0
  let merchants = 0
  const aliasWrites: { merchant: string; categoryId: number }[] = []

  for (const g of input.groups) {
    if (!input.selectedKeys.has(g.merchantKey)) continue
    const categoryId = input.overrides[g.merchantKey] ?? g.suggestion.categoryId
    if (categoryId == null) continue
    for (const id of g.txnIds) {
      // Same path as a manual edit → tracked in syncChangeLog, synced to cloud.
      await updateTransaction(id, { categoryId })
      applied++
    }
    merchants++
    aliasWrites.push({ merchant: g.sampleMerchant, categoryId })
  }

  // Persist learned mappings (user-reviewed → ground truth) so future entries
  // and imports resolve to the same category without the AI. Best-effort.
  for (const w of aliasWrites) {
    try {
      await setAlias({
        merchant: w.merchant,
        categoryId: w.categoryId,
        source: 'user-override',
        sampleMerchant: w.merchant,
      })
    } catch (err) {
      console.warn('[bulkAutoCategorize] setAlias failed', err)
    }
  }

  return { applied, merchants }
}
