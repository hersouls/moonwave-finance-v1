// ─── Seed-data dedup migration ─────────────────────────
//
// One-time migration that removes duplicate seed records (members, asset
// categories, transaction categories) created by the pre-fix new-device login
// bug. Picks a canonical row per (name+type) group, re-points FK references
// to it, and deletes the rest. Deletions go through Dexie's normal change-
// tracking hooks so syncTombstones + syncChangeLog entries are written and
// propagated to Firestore — cleaning up across devices.
//
// Idempotent: gated by a localStorage flag and a no-op when no duplicates
// exist. Safe to run on every login; only does work the first time it finds
// duplicates.

import { db } from './database'

// Bump the version suffix to force this migration to re-run on every device
// the next time the user signs in. v2 was bumped to clean up duplicate
// members/categories left over from the pre-FK-syncId-fix sync bug.
const DEDUP_FLAG_KEY = 'fin:dedup:seed-categories:v2'

export interface DedupResult {
  txnCatsRemoved: number
  assetCatsRemoved: number
  membersRemoved: number
  fkReassignments: number
}

interface SeedLike {
  id?: number
  syncId?: string
  createdAt?: string
}

function findDuplicateGroups<T extends SeedLike>(
  records: T[],
  keyFn: (r: T) => string,
): T[][] {
  const groups = new Map<string, T[]>()
  for (const r of records) {
    if (r.id == null) continue
    const key = keyFn(r)
    if (!key) continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(r)
  }
  return [...groups.values()].filter(g => g.length > 1)
}

/**
 * Pick the canonical row to KEEP. Priority:
 *   1) Deterministic seed syncId (`default:*`) — the post-fix canonical form
 *   2) Earliest `createdAt` — original record predates duplicates
 *   3) Lowest Dexie autoincrement id — final tie-breaker
 */
function pickCanonical<T extends SeedLike>(group: T[]): T {
  return [...group].sort((a, b) => {
    const aDef = a.syncId?.startsWith('default:') ? 0 : 1
    const bDef = b.syncId?.startsWith('default:') ? 0 : 1
    if (aDef !== bDef) return aDef - bDef
    const aCreated = a.createdAt || ''
    const bCreated = b.createdAt || ''
    if (aCreated !== bCreated) return aCreated < bCreated ? -1 : 1
    return (a.id ?? 0) - (b.id ?? 0)
  })[0]
}

export async function dedupSeedCategories(options?: { force?: boolean }): Promise<DedupResult> {
  const empty: DedupResult = { txnCatsRemoved: 0, assetCatsRemoved: 0, membersRemoved: 0, fkReassignments: 0 }

  if (!options?.force && typeof localStorage !== 'undefined' && localStorage.getItem(DEDUP_FLAG_KEY)) {
    return empty
  }

  let txnCatsRemoved = 0
  let assetCatsRemoved = 0
  let membersRemoved = 0
  let fkReassignments = 0

  const [txnCats, assetCats, members] = await Promise.all([
    db.transactionCategories.toArray(),
    db.assetCategories.toArray(),
    db.members.toArray(),
  ])

  // ── transactionCategories: dedup by (name + type) ──
  const txnDupGroups = findDuplicateGroups(txnCats, c => `${c.name}|${c.type}`)
  for (const group of txnDupGroups) {
    const canonical = pickCanonical(group)
    if (canonical.id == null) continue
    for (const dup of group) {
      if (dup.id == null || dup.id === canonical.id) continue
      // Re-point FK references in dependent tables
      const t1 = await db.transactions.where('categoryId').equals(dup.id).modify({ categoryId: canonical.id })
      const t2 = await db.subscriptions.where('linkedTransactionCategoryId').equals(dup.id).modify({ linkedTransactionCategoryId: canonical.id })
      const t3 = await db.budgets.where('categoryId').equals(dup.id).modify({ categoryId: canonical.id })
      fkReassignments += (t1 || 0) + (t2 || 0) + (t3 || 0)
      // Delete — the 'deleting' hook writes syncTombstones + syncChangeLog
      await db.transactionCategories.delete(dup.id)
      txnCatsRemoved++
    }
  }

  // ── assetCategories: dedup by (name + type) ──
  const assetDupGroups = findDuplicateGroups(assetCats, c => `${c.name}|${c.type}`)
  for (const group of assetDupGroups) {
    const canonical = pickCanonical(group)
    if (canonical.id == null) continue
    for (const dup of group) {
      if (dup.id == null || dup.id === canonical.id) continue
      const t1 = await db.assetItems.where('categoryId').equals(dup.id).modify({ categoryId: canonical.id })
      fkReassignments += t1 || 0
      await db.assetCategories.delete(dup.id)
      assetCatsRemoved++
    }
  }

  // ── members: dedup by name ──
  const memberDupGroups = findDuplicateGroups(members, m => m.name)
  for (const group of memberDupGroups) {
    const canonical = pickCanonical(group)
    if (canonical.id == null) continue
    for (const dup of group) {
      if (dup.id == null || dup.id === canonical.id) continue
      const t1 = await db.assetItems.where('memberId').equals(dup.id).modify({ memberId: canonical.id })
      const t2 = await db.transactions.where('memberId').equals(dup.id).modify({ memberId: canonical.id })
      fkReassignments += (t1 || 0) + (t2 || 0)
      await db.members.delete(dup.id)
      membersRemoved++
    }
  }

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(DEDUP_FLAG_KEY, new Date().toISOString())
  }

  const result = { txnCatsRemoved, assetCatsRemoved, membersRemoved, fkReassignments }
  if (txnCatsRemoved + assetCatsRemoved + membersRemoved > 0) {
    console.info('[dedup] seed duplicates removed:', result)
  }
  return result
}
