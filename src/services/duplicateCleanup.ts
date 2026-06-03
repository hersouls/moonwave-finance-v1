// ─── Duplicate expense cleanup ──────────────────────────
//
// Card-statement import does a first-pass duplicate filter at import time, but
// duplicates still slip through (e.g. the user overrode the filter, or the same
// statement was imported twice). This finds expense transactions that share the
// SAME memo + SAME amount within a ~1-month window and lets the user delete the
// extra copies, keeping one.
//
// Safety (this flow deletes data irreversibly across all devices):
//   - Grouping uses the FULL memo (only whitespace/case normalized), NOT the
//     branch-stripping subscription key — so "스타벅스(강남)" and "스타벅스(부산)"
//     are never merged.
//   - Auto-generated recurring children (recurSourceId set) are excluded.
//   - Only TRUE same-day duplicates (≥2 rows on the exact same date) are
//     pre-selected for deletion by default. Same-price purchases on DIFFERENT
//     days (e.g. a daily coffee, or a real monthly bill) are shown for review
//     but never pre-checked, so trusting the default can't delete real spending.

import { db, getAllTransactions, bulkDeleteTransactions, updateTransaction } from '@/services/database'
import type { Transaction } from '@/lib/types'

export type DuplicateConfidence = 'exact' | 'high' | 'medium'

export interface DuplicateGroup {
  /** Unique per cluster (bucket key + anchor id) — never shared between clusters. */
  key: string
  /** Display memo (first transaction's memo, trimmed). */
  sampleMemo: string
  amount: number
  /** Total transactions in this cluster (≥2). */
  count: number
  confidence: DuplicateConfidence
  /** Max date span (days) within the cluster. */
  spanDays: number
  /** Cluster transactions, sorted by date asc then id. */
  transactions: Transaction[]
  /** Default transaction to KEEP (the earliest). Never in autoDeleteIds. */
  recommendedKeepId: number
  /**
   * The genuinely-safe-to-delete extras: for every date that has ≥2 rows, all
   * but the earliest row on that date. Empty when the cluster has no same-day
   * duplicate (i.e. all rows are on distinct days → not auto-deletable).
   */
  autoDeleteIds: number[]
}

export interface DuplicateAnalysis {
  groups: DuplicateGroup[]
  /** Same-day duplicate extras across all groups — what the default deletes. */
  confidentDuplicates: number
  /** All extras across all groups (count - 1 each) — total surfaced for review. */
  totalDuplicates: number
  /** Distinct (memo+amount) patterns the user marked as "not a duplicate". */
  allowedPatterns: number
}

/** Same memo+amount transactions within this many days form one review cluster. */
const WINDOW_DAYS = 31

/** Strict memo key for duplicate grouping: whitespace-collapsed + lowercased. */
function dupMemoKey(memo: string): string {
  return memo.trim().replace(/\s+/g, ' ').toLowerCase()
}

function dayDiff(a: string, b: string): number {
  const ta = new Date(`${a}T00:00:00`).getTime()
  const tb = new Date(`${b}T00:00:00`).getTime()
  if (Number.isNaN(ta) || Number.isNaN(tb)) return Number.POSITIVE_INFINITY
  return Math.abs(Math.round((tb - ta) / 86_400_000))
}

function confidenceForSpan(span: number): DuplicateConfidence {
  if (span === 0) return 'exact'
  if (span <= 7) return 'high'
  return 'medium'
}

function buildGroup(key: string, cluster: Transaction[]): DuplicateGroup {
  const span = dayDiff(cluster[0].date, cluster[cluster.length - 1].date)

  // Same-day extras = for each date with ≥2 rows, every row except the earliest.
  const byDate = new Map<string, Transaction[]>()
  for (const t of cluster) {
    const arr = byDate.get(t.date)
    if (arr) arr.push(t)
    else byDate.set(t.date, [t])
  }
  const autoDeleteIds: number[] = []
  for (const rows of byDate.values()) {
    if (rows.length < 2) continue
    rows.sort((a, b) => a.id! - b.id!)
    for (let i = 1; i < rows.length; i++) autoDeleteIds.push(rows[i].id!)
  }

  return {
    key,
    sampleMemo: cluster[0].memo!.trim(),
    amount: cluster[0].amount,
    count: cluster.length,
    // A same-day duplicate is the strongest signal; otherwise grade by span.
    confidence: autoDeleteIds.length > 0 ? 'exact' : confidenceForSpan(span),
    spanDays: span,
    transactions: cluster,
    recommendedKeepId: cluster[0].id!, // earliest; never in autoDeleteIds
    autoDeleteIds,
  }
}

export async function analyzeDuplicates(): Promise<DuplicateAnalysis> {
  const all = await getAllTransactions()
  const expenses = all.filter(
    (t) =>
      t.type === 'expense' &&
      t.id != null &&
      t.recurSourceId == null && // never offer auto-generated recurring rows
      !!t.memo &&
      t.memo.trim().length > 0,
  )

  // Patterns the user marked "not a duplicate": any transaction carrying the
  // dedupeIgnore flag makes its whole (memo+amount) pattern allowed — so it,
  // and every future same-pattern row, is excluded from detection.
  const allowedKeys = new Set<string>()
  for (const t of expenses) {
    if (t.dedupeIgnore) allowedKeys.add(`${dupMemoKey(t.memo!)}|${t.amount}`)
  }

  // Bucket by strict memo + exact amount (skipping allowed patterns).
  const byKey = new Map<string, Transaction[]>()
  for (const t of expenses) {
    const mk = dupMemoKey(t.memo!)
    if (!mk) continue
    const key = `${mk}|${t.amount}`
    if (allowedKeys.has(key)) continue // user-allowed pattern → never flag
    const arr = byKey.get(key)
    if (arr) arr.push(t)
    else byKey.set(key, [t])
  }

  const groups: DuplicateGroup[] = []
  for (const [bucketKey, txns] of byKey) {
    if (txns.length < 2) continue
    txns.sort((a, b) => a.date.localeCompare(b.date) || a.id! - b.id!)

    // Anchored sliding window: a cluster spans at most WINDOW_DAYS from its
    // first (anchor) row, so a long evenly-spaced series doesn't chain into one
    // giant cluster. Each cluster gets a UNIQUE key (bucket + anchor id) so its
    // keeper/expanded/selection state never collides with a sibling cluster.
    let cluster: Transaction[] = []
    let anchorDate = ''
    const flush = () => {
      if (cluster.length >= 2) groups.push(buildGroup(`${bucketKey}|${cluster[0].id}`, cluster))
      cluster = []
    }
    for (const t of txns) {
      if (cluster.length === 0) {
        anchorDate = t.date
        cluster.push(t)
      } else if (dayDiff(anchorDate, t.date) <= WINDOW_DAYS) {
        cluster.push(t)
      } else {
        flush()
        anchorDate = t.date
        cluster.push(t)
      }
    }
    flush()
  }

  // exact (same-day dup) first, then most copies, then largest amount.
  const order: Record<DuplicateConfidence, number> = { exact: 0, high: 1, medium: 2 }
  groups.sort(
    (a, b) =>
      order[a.confidence] - order[b.confidence] ||
      b.count - a.count ||
      b.amount - a.amount,
  )

  const confidentDuplicates = groups.reduce((s, g) => s + g.autoDeleteIds.length, 0)
  const totalDuplicates = groups.reduce((s, g) => s + (g.count - 1), 0)
  return { groups, confidentDuplicates, totalDuplicates, allowedPatterns: allowedKeys.size }
}

/** Count of deletable duplicate transactions — drives the ledger entry point. */
export async function countDuplicateExpenses(): Promise<number> {
  return (await analyzeDuplicates()).totalDuplicates
}

/**
 * Deletes the given transaction ids. Only the LOCAL delete is awaited (fast,
 * no network) so the UI never blocks. The deleting hooks write syncTombstones +
 * change-log entries, which the debounced auto-sync uploads (docs + tombstones)
 * in the background. We also fire an immediate cloud-doc delete for faster
 * cross-device convergence — but fire-and-forget, so a slow/offline network can
 * never stall the modal. (Mirrors store.deleteTransaction's non-awaited cloud
 * delete.) Returns the number deleted.
 */
export async function deleteDuplicates(ids: number[]): Promise<number> {
  if (ids.length === 0) return 0

  // Capture syncIds before the local delete for the background cloud cleanup.
  const rows = (await db.transactions.bulkGet(ids)).filter((r): r is Transaction => !!r)
  const syncIds = rows.map((r) => r.syncId).filter((s): s is string => !!s)

  await bulkDeleteTransactions(ids) // local delete → syncTombstones + change log

  // Cloud removal is fire-and-forget — never await the network here.
  void (async () => {
    try {
      const { useAuthStore } = await import('@/stores/authStore')
      const user = useAuthStore.getState().user
      if (user && syncIds.length > 0) {
        const { deleteMultipleFromCloud } = await import('@/services/firestoreSync')
        await deleteMultipleFromCloud(user.uid, 'transactions', syncIds)
      }
    } catch (err) {
      console.warn('[duplicateCleanup] background cloud delete failed', err)
    }
  })()

  return ids.length
}

/**
 * Marks a group's transactions as "not a duplicate" (dedupeIgnore=true). Because
 * detection treats any flagged transaction's (memo+amount) as an allowed
 * pattern, this permanently excludes that pattern — including future same-pattern
 * rows — from the duplicate list. Only local writes are awaited; the flag syncs
 * to other devices via the normal transaction sync. Returns ids updated.
 */
export async function allowDuplicateGroup(ids: number[]): Promise<number> {
  if (ids.length === 0) return 0
  for (const id of ids) {
    await updateTransaction(id, { dedupeIgnore: true })
  }
  return ids.length
}

/** Clears every "not a duplicate" allowance so all patterns are detected again. */
export async function clearAllDuplicateAllowances(): Promise<number> {
  const flagged = await db.transactions.filter((t) => t.dedupeIgnore === true).toArray()
  for (const t of flagged) {
    if (t.id != null) await updateTransaction(t.id, { dedupeIgnore: false })
  }
  return flagged.length
}
