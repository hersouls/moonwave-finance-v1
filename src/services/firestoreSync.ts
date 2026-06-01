import {
  collection,
  doc,
  getDocs,
  writeBatch,
  deleteDoc,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { firestore } from '@/lib/firebase'
import { db, setSyncWritingFlag } from '@/services/database'
import { useAuthStore } from '@/stores/authStore'
import { getDeviceId } from '@/lib/deviceId'
import type {
  Member,
  AssetCategory,
  AssetItem,
  DailyValue,
  TransactionCategory,
  Transaction,
  Budget,
  FinancialGoal,
  PaymentMethodItem,
  Subscription,
  Loan,
  MerchantAlias,
  SyncChangeLogEntry,
} from '@/lib/types'

export type SyncableTable = 'members' | 'assetCategories' | 'assetItems' | 'dailyValues' | 'transactionCategories' | 'transactions' | 'budgets' | 'goals' | 'paymentMethodItems' | 'subscriptions' | 'loans' | 'investmentTrades' | 'dividends' | 'accountInterests' | 'merchantAliases'

const BATCH_LIMIT = 499
const ALL_TABLES: SyncableTable[] = ['members', 'assetCategories', 'assetItems', 'dailyValues', 'transactionCategories', 'transactions', 'budgets', 'goals', 'paymentMethodItems', 'subscriptions', 'loans', 'investmentTrades', 'dividends', 'accountInterests', 'merchantAliases']

// ─── Cloud payload helpers ────────────────────────────────────────
//
// Each cloud document carries the local record fields PLUS:
//   - `__deviceId`: stable per-install ID of the writer (LWW tiebreaker)
//   - `__schemaV`: payload version (2 = post-FK-syncId migration)
//   - `<field>_syncId`: syncId companion for every FK in TABLE_FK_DEFS.
//      New clients resolve FKs through this; the legacy numeric `<field>Id`
//      is preserved for old-client back-compat. See INTERNAL_CLOUD_FIELDS
//      for what gets stripped before writing to Dexie on the receive side.

const CLOUD_SCHEMA_VERSION = 2

/** Names of fields that exist only in the cloud payload — never persisted to Dexie. */
const INTERNAL_CLOUD_FIELDS = new Set(['__deviceId', '__schemaV'])

/** Builds the outbound cloud payload: drop undefined, stamp deviceId + schema version. */
function toCloudPayload<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue
    out[key] = value
  }
  out.__deviceId = getDeviceId()
  out.__schemaV = CLOUD_SCHEMA_VERSION
  return out
}

/**
 * For every FK field of `tableName`, look up the parent's syncId locally and
 * attach it as a `<field>_syncId` companion. Used on upload so peer devices
 * can resolve FKs by syncId (definitive) instead of by cloud auto-increment id
 * (which flips between devices on every write).
 */
async function addFkSyncIds(tableName: SyncableTable, record: Record<string, unknown>): Promise<void> {
  const defs = TABLE_FK_DEFS[tableName]
  if (!defs) return
  for (const { field, refTable } of defs) {
    const fk = record[field]
    if (typeof fk === 'number') {
      const parent = await (getLocalTable(refTable) as typeof db.members)
        .get(fk) as { syncId?: string } | undefined
      record[`${field}_syncId`] = parent?.syncId ?? null
    } else if (fk === null || fk === undefined) {
      record[`${field}_syncId`] = null
    }
  }
}

/**
 * Strip cloud-only fields and FK syncId companions before writing to Dexie.
 * Companions are consumed by resolveFksOnRecord before this is called, so by
 * the time we hit Dexie they should already be removed — this is a safety net.
 */
function stripInternalCloudFields(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (INTERNAL_CLOUD_FIELDS.has(key)) continue
    if (key.endsWith('_syncId') && key !== 'syncId') continue
    out[key] = value
  }
  return out
}

function getUserCollectionPath(uid: string, tableName: string): string {
  return `users/${uid}/${tableName}`
}

/**
 * Make a syncId safe to use as a Firestore document id. Doc ids may not contain
 * '/', but default-seed syncIds embed the record name (e.g.
 * 'default:txnCat:expense:마트/편의점'), so a '/' in the name makes doc() throw
 * ("must have an even number of segments") — which previously broke a fresh
 * device's first fullUpload entirely.
 *
 * Encoding is injective ('~' is escaped before '/'), so distinct syncIds keep
 * distinct ids. Only the document ADDRESS is encoded — the stored `syncId` field
 * is untouched, so all in-app matching (which is by the syncId field) is
 * unaffected, and ids without '/' or '~' are byte-identical to before, so
 * existing cloud documents are neither moved nor re-uploaded.
 */
export function encodeDocId(syncId: string): string {
  return syncId.replace(/~/g, '~7e').replace(/\//g, '~2f')
}

function getUserDocPath(uid: string, tableName: string, syncId: string): string {
  return `users/${uid}/${tableName}/${encodeDocId(syncId)}`
}

// Split records into Firestore batch-safe chunks and upload.
//
// Writes use full-document replace (no merge:true) so that fields cleared
// locally — which are stripped to `undefined` by toCloudPayload — are
// actually removed from the cloud doc. With merge:true, cleared fields
// would survive in the cloud and resurrect on the next peer download.
async function uploadTable<T extends { syncId?: string }>(
  uid: string,
  tableName: SyncableTable,
  records: T[]
): Promise<void> {
  const validRecords = records.filter(r => r.syncId)
  for (let i = 0; i < validRecords.length; i += BATCH_LIMIT) {
    const chunk = validRecords.slice(i, i + BATCH_LIMIT)
    const batch = writeBatch(firestore)
    for (const record of chunk) {
      const ref = doc(firestore, getUserDocPath(uid, tableName, record.syncId!))
      const enriched = { ...record } as Record<string, unknown>
      await addFkSyncIds(tableName, enriched)
      batch.set(ref, toCloudPayload(enriched))
    }
    await batch.commit()
  }
}

async function downloadTable<T>(
  uid: string,
  tableName: SyncableTable
): Promise<T[]> {
  const colRef = collection(firestore, getUserCollectionPath(uid, tableName))
  const snapshot = await getDocs(colRef)
  return snapshot.docs.map(d => d.data() as T)
}

function ensureSyncId<T extends { syncId?: string }>(record: T): T {
  if (!record.syncId) {
    return { ...record, syncId: crypto.randomUUID() }
  }
  return record
}

// Delete Firestore documents that no longer exist in local IndexedDB
async function reconcileOrphans(uid: string, localSyncIds: Record<SyncableTable, Set<string>>): Promise<void> {
  const tables = Object.keys(localSyncIds) as SyncableTable[]
  for (const tableName of tables) {
    const cloudDocs = await getDocs(collection(firestore, getUserCollectionPath(uid, tableName)))
    const orphanSyncIds: string[] = []
    for (const docSnap of cloudDocs.docs) {
      const syncId = docSnap.data().syncId as string | undefined
      if (syncId && !localSyncIds[tableName].has(syncId)) {
        orphanSyncIds.push(syncId)
      }
    }
    if (orphanSyncIds.length > 0) {
      console.log(`[sync] removing ${orphanSyncIds.length} orphan(s) from ${tableName}`)
      for (let i = 0; i < orphanSyncIds.length; i += BATCH_LIMIT) {
        const chunk = orphanSyncIds.slice(i, i + BATCH_LIMIT)
        const batch = writeBatch(firestore)
        for (const syncId of chunk) {
          batch.delete(doc(firestore, getUserDocPath(uid, tableName, syncId)))
        }
        await batch.commit()
      }
    }
  }
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries: number = 3): Promise<T> {
  let lastError: unknown
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000))
      }
    }
  }
  throw lastError
}

// Ensure syncIds exist locally and persist them back to IndexedDB
async function ensureAndPersistSyncIds() {
  const tables = [
    { table: db.members, name: 'members' },
    { table: db.assetCategories, name: 'assetCategories' },
    { table: db.assetItems, name: 'assetItems' },
    { table: db.dailyValues, name: 'dailyValues' },
    { table: db.transactionCategories, name: 'transactionCategories' },
    { table: db.transactions, name: 'transactions' },
    { table: db.budgets, name: 'budgets' },
    { table: db.goals, name: 'goals' },
    { table: db.paymentMethodItems, name: 'paymentMethodItems' },
    { table: db.subscriptions, name: 'subscriptions' },
    { table: db.loans, name: 'loans' },
  ] as const

  for (const { table } of tables) {
    const records = await table.toArray()
    for (const record of records) {
      if (!record.syncId && record.id != null) {
        await (table as typeof db.members).update(record.id as number, { syncId: crypto.randomUUID() })
      }
    }
  }
}

// ─── Full Upload (preserved for manual sync) ─────────────
export async function fullUpload(uid: string, options?: { reconcile?: boolean }): Promise<void> {
  useAuthStore.getState().setSyncStatus('syncing')
  try {
    await ensureAndPersistSyncIds()

    const [members, assetCategories, assetItems, dailyValues, transactionCategories, transactions, budgets, goals, paymentMethodItems, subscriptions, loans, investmentTrades, dividends, accountInterests, merchantAliases] = await Promise.all([
      db.members.toArray(),
      db.assetCategories.toArray(),
      db.assetItems.toArray(),
      db.dailyValues.toArray(),
      db.transactionCategories.toArray(),
      db.transactions.toArray(),
      db.budgets.toArray(),
      db.goals.toArray(),
      db.paymentMethodItems.toArray(),
      db.subscriptions.toArray(),
      db.loans.toArray(),
      db.investmentTrades.toArray(),
      db.dividends.toArray(),
      db.accountInterests.toArray(),
      db.merchantAliases.toArray(),
    ])

    await withRetry(() => Promise.all([
      uploadTable(uid, 'members', members.map(ensureSyncId)),
      uploadTable(uid, 'assetCategories', assetCategories.map(ensureSyncId)),
      uploadTable(uid, 'assetItems', assetItems.map(ensureSyncId)),
      uploadTable(uid, 'dailyValues', dailyValues.map(ensureSyncId)),
      uploadTable(uid, 'transactionCategories', transactionCategories.map(ensureSyncId)),
      uploadTable(uid, 'transactions', transactions.map(ensureSyncId)),
      uploadTable(uid, 'budgets', budgets.map(ensureSyncId)),
      uploadTable(uid, 'goals', goals.map(ensureSyncId)),
      uploadTable(uid, 'paymentMethodItems', paymentMethodItems.map(ensureSyncId)),
      uploadTable(uid, 'subscriptions', subscriptions.map(ensureSyncId)),
      uploadTable(uid, 'loans', loans.map(ensureSyncId)),
      uploadTable(uid, 'investmentTrades', investmentTrades.map(ensureSyncId)),
      uploadTable(uid, 'dividends', dividends.map(ensureSyncId)),
      uploadTable(uid, 'accountInterests', accountInterests.map(ensureSyncId)),
      uploadTable(uid, 'merchantAliases', merchantAliases.map(ensureSyncId)),
    ]))

    // Reconcile: delete Firestore documents that no longer exist locally
    const localSyncIds: Record<SyncableTable, Set<string>> = {
      members: new Set(members.map(r => r.syncId).filter(Boolean) as string[]),
      assetCategories: new Set(assetCategories.map(r => r.syncId).filter(Boolean) as string[]),
      assetItems: new Set(assetItems.map(r => r.syncId).filter(Boolean) as string[]),
      dailyValues: new Set(dailyValues.map(r => r.syncId).filter(Boolean) as string[]),
      transactionCategories: new Set(transactionCategories.map(r => r.syncId).filter(Boolean) as string[]),
      transactions: new Set(transactions.map(r => r.syncId).filter(Boolean) as string[]),
      budgets: new Set(budgets.map(r => r.syncId).filter(Boolean) as string[]),
      goals: new Set(goals.map(r => r.syncId).filter(Boolean) as string[]),
      paymentMethodItems: new Set(paymentMethodItems.map(r => r.syncId).filter(Boolean) as string[]),
      subscriptions: new Set(subscriptions.map(r => r.syncId).filter(Boolean) as string[]),
      loans: new Set(loans.map(r => r.syncId).filter(Boolean) as string[]),
      investmentTrades: new Set(investmentTrades.map(r => r.syncId).filter(Boolean) as string[]),
      dividends: new Set(dividends.map(r => r.syncId).filter(Boolean) as string[]),
      accountInterests: new Set(accountInterests.map(r => r.syncId).filter(Boolean) as string[]),
      merchantAliases: new Set(merchantAliases.map(r => r.syncId).filter(Boolean) as string[]),
    }

    if (options?.reconcile) {
      try {
        await reconcileOrphans(uid, localSyncIds)
      } catch (err) {
        console.error('[sync] orphan reconciliation failed:', err)
      }
    }

    useAuthStore.getState().setSyncStatus('synced')
    useAuthStore.getState().setLastSyncTime(new Date().toISOString())
  } catch (err) {
    console.error('Full upload failed:', err)
    useAuthStore.getState().setSyncStatus('error')
  }
}

// ─── Full Download (preserved for manual sync) ───────────
export async function fullDownload(uid: string): Promise<void> {
  useAuthStore.getState().setSyncStatus('syncing')
  try {
    const [members, assetCategories, assetItems, dailyValues, transactionCategories, transactions, budgets, goals, paymentMethodItems, subscriptions, loans, merchantAliases] = await withRetry(() => Promise.all([
      downloadTable<Record<string, unknown>>(uid, 'members'),
      downloadTable<Record<string, unknown>>(uid, 'assetCategories'),
      downloadTable<Record<string, unknown>>(uid, 'assetItems'),
      downloadTable<Record<string, unknown>>(uid, 'dailyValues'),
      downloadTable<Record<string, unknown>>(uid, 'transactionCategories'),
      downloadTable<Record<string, unknown>>(uid, 'transactions'),
      downloadTable<Record<string, unknown>>(uid, 'budgets'),
      downloadTable<Record<string, unknown>>(uid, 'goals'),
      downloadTable<Record<string, unknown>>(uid, 'paymentMethodItems'),
      downloadTable<Record<string, unknown>>(uid, 'subscriptions'),
      downloadTable<Record<string, unknown>>(uid, 'loans'),
      downloadTable<Record<string, unknown>>(uid, 'merchantAliases'),
    ]))

    // Strip cloud-only fields (__deviceId, __schemaV, *_syncId companions)
    // in place so the Dexie schema isn't polluted by transport metadata.
    for (const arr of [members, assetCategories, assetItems, dailyValues, transactionCategories, transactions, budgets, goals, paymentMethodItems, subscriptions, loans, merchantAliases]) {
      for (const r of arr) {
        for (const k of Object.keys(r)) {
          if (INTERNAL_CLOUD_FIELDS.has(k) || (k.endsWith('_syncId') && k !== 'syncId')) {
            delete (r as Record<string, unknown>)[k]
          }
        }
      }
    }

    syncWritingCount++
    setSyncWritingFlag(true)
    try {
      await db.transaction('rw', [db.members, db.assetCategories, db.assetItems, db.dailyValues, db.transactionCategories, db.transactions, db.budgets, db.goals, db.paymentMethodItems, db.subscriptions, db.loans, db.merchantAliases], async () => {
        // Clear all tables
        await db.members.clear()
        await db.assetCategories.clear()
        await db.assetItems.clear()
        await db.dailyValues.clear()
        await db.transactionCategories.clear()
        await db.transactions.clear()
        await db.budgets.clear()
        await db.goals.clear()
        await db.paymentMethodItems.clear()
        await db.subscriptions.clear()
        await db.loans.clear()
        await db.merchantAliases.clear()

        // ── Layer 0: Insert independent tables, build ID mappings ──
        const memberIdMap = new Map<number, number>()
        for (const rec of members) {
          const cloudId = rec.id as number | undefined
          delete rec.id
          const newId = await db.members.add(rec as unknown as Member) as number
          if (cloudId != null) memberIdMap.set(cloudId, newId)
        }

        const assetCatIdMap = new Map<number, number>()
        for (const rec of assetCategories) {
          const cloudId = rec.id as number | undefined
          delete rec.id
          const newId = await db.assetCategories.add(rec as unknown as AssetCategory) as number
          if (cloudId != null) assetCatIdMap.set(cloudId, newId)
        }

        const txnCatIdMap = new Map<number, number>()
        for (const rec of transactionCategories) {
          const cloudId = rec.id as number | undefined
          delete rec.id
          const newId = await db.transactionCategories.add(rec as unknown as TransactionCategory) as number
          if (cloudId != null) txnCatIdMap.set(cloudId, newId)
        }

        for (const rec of goals) {
          delete rec.id
          await db.goals.add(rec as unknown as FinancialGoal)
        }

        // ── Layer 1: Remap FKs and insert ──
        const assetItemIdMap = new Map<number, number>()
        for (const rec of assetItems) {
          const cloudId = rec.id as number | undefined
          delete rec.id
          remapFkField(rec, 'memberId', memberIdMap)
          remapFkField(rec, 'categoryId', assetCatIdMap)
          const newId = await db.assetItems.add(rec as unknown as AssetItem) as number
          if (cloudId != null) assetItemIdMap.set(cloudId, newId)
        }

        for (const rec of budgets) {
          delete rec.id
          remapFkField(rec, 'categoryId', txnCatIdMap)
          await db.budgets.add(rec as unknown as Budget)
        }

        // ── Layer 2: Second-level dependents ──
        for (const rec of dailyValues) {
          delete rec.id
          remapFkField(rec, 'assetItemId', assetItemIdMap)
          await db.dailyValues.add(rec as unknown as DailyValue)
        }

        const payMethodIdMap = new Map<number, number>()
        for (const rec of paymentMethodItems) {
          const cloudId = rec.id as number | undefined
          delete rec.id
          remapFkField(rec, 'linkedAssetItemId', assetItemIdMap)
          const newId = await db.paymentMethodItems.add(rec as unknown as PaymentMethodItem) as number
          if (cloudId != null) payMethodIdMap.set(cloudId, newId)
        }

        // ── Layer 3: Subscriptions ──
        const subscriptionIdMap = new Map<number, number>()
        for (const rec of subscriptions) {
          const cloudId = rec.id as number | undefined
          delete rec.id
          remapFkField(rec, 'paymentMethodItemId', payMethodIdMap)
          remapFkField(rec, 'linkedTransactionCategoryId', txnCatIdMap)
          const newId = await db.subscriptions.add(rec as unknown as Subscription) as number
          if (cloudId != null) subscriptionIdMap.set(cloudId, newId)
        }

        // ── Layer 4: Transactions ──
        for (const rec of transactions) {
          delete rec.id
          remapFkField(rec, 'memberId', memberIdMap)
          remapFkField(rec, 'categoryId', txnCatIdMap)
          remapFkField(rec, 'paymentMethodItemId', payMethodIdMap)
          remapFkField(rec, 'subscriptionId', subscriptionIdMap)
          await db.transactions.add(rec as unknown as Transaction)
        }

        // ── Loans (depends on assetItems) ──
        for (const rec of loans) {
          delete rec.id
          remapFkField(rec, 'linkedAssetItemId', assetItemIdMap)
          await db.loans.add(rec as unknown as Loan)
        }

        // ── Merchant aliases (depends on transactionCategories, subscriptions) ──
        // Cloud may hold >1 doc per merchantKey (same merchant learned on two
        // devices before they converged). Dexie's &merchantKey unique index would
        // throw on the 2nd insert and abort this rw-transaction, so collapse to one
        // row per key first (newest updatedAt wins).
        const aliasByKey = new Map<string, Record<string, unknown>>()
        const keylessAliases: Record<string, unknown>[] = []
        for (const rec of merchantAliases) {
          const key = rec.merchantKey as string | undefined
          if (!key) { keylessAliases.push(rec); continue }
          const prev = aliasByKey.get(key)
          if (!prev || ((rec.updatedAt as string) || '') > ((prev.updatedAt as string) || '')) {
            aliasByKey.set(key, rec)
          }
        }
        for (const rec of [...aliasByKey.values(), ...keylessAliases]) {
          delete rec.id
          remapFkField(rec, 'categoryId', txnCatIdMap)
          remapFkField(rec, 'subscriptionId', subscriptionIdMap)
          await db.merchantAliases.add(rec as unknown as MerchantAlias)
        }
      })
    } finally {
      syncWritingCount = Math.max(0, syncWritingCount - 1)
      setSyncWritingFlag(false)
    }

    useAuthStore.getState().setSyncStatus('synced')
    useAuthStore.getState().setLastSyncTime(new Date().toISOString())
  } catch (err) {
    console.error('Full download failed:', err)
    useAuthStore.getState().setSyncStatus('error')
  }
}

// ─── Incremental Upload ──────────────────────────────────
// Only uploads records that changed since last sync (via syncChangeLog)

function deduplicateChanges(changes: SyncChangeLogEntry[]): SyncChangeLogEntry[] {
  const map = new Map<string, SyncChangeLogEntry>()
  changes.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  for (const change of changes) {
    const key = `${change.tableName}:${change.syncId}`
    map.set(key, change)
  }
  return Array.from(map.values())
}

async function uploadTombstone(
  uid: string,
  tableName: string,
  syncId: string,
  deletedAt: string
): Promise<void> {
  const tombstoneId = encodeDocId(`${tableName}_${syncId}`)
  const ref = doc(firestore, `users/${uid}/syncTombstones/${tombstoneId}`)
  const batch = writeBatch(firestore)
  batch.set(ref, toCloudPayload({ tableName, syncId, deletedAt }))
  await batch.commit()
}

export async function incrementalUpload(uid: string): Promise<void> {
  useAuthStore.getState().setSyncStatus('syncing')
  try {
    await ensureAndPersistSyncIds()

    const pendingChanges = await db.syncChangeLog
      .where('processed').equals(0)
      .toArray()

    if (pendingChanges.length === 0) {
      useAuthStore.getState().setSyncStatus('synced')
      return
    }

    const deduped = deduplicateChanges(pendingChanges)
    console.log(`[sync] incremental upload: ${deduped.length} change(s) (from ${pendingChanges.length} log entries)`)

    const successKeys = new Set<string>()

    for (const change of deduped) {
      try {
        if (change.operation === 'delete') {
          await deleteFromCloud(uid, change.tableName as SyncableTable, change.syncId)
          await uploadTombstone(uid, change.tableName, change.syncId, change.timestamp)
        } else {
          const localTable = getLocalTable(change.tableName as SyncableTable)
          const record = await (localTable as typeof db.members)
            .where('syncId').equals(change.syncId).first()
          if (record) {
            await uploadSingleRecord(uid, change.tableName as SyncableTable, record)
          }
        }
        successKeys.add(`${change.tableName}:${change.syncId}`)
      } catch (err) {
        console.error(`[sync] incremental upload ${change.tableName}/${change.syncId} failed:`, err)
      }
    }

    // Mark only successfully synced entries as processed
    const successIds = pendingChanges
      .filter(c => successKeys.has(`${c.tableName}:${c.syncId}`))
      .map(c => c.id!)
      .filter(Boolean)
    if (successIds.length > 0) {
      await db.syncChangeLog.where('id').anyOf(successIds).modify({ processed: 1 })
    }

    // GC: remove processed entries older than 7 days
    const gcCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    await db.syncChangeLog
      .where('processed').equals(1)
      .filter(c => c.timestamp < gcCutoff)
      .delete()

    useAuthStore.getState().setSyncStatus('synced')
    useAuthStore.getState().setLastSyncTime(new Date().toISOString())
  } catch (err) {
    console.error('[sync] incremental upload failed:', err)
    useAuthStore.getState().setSyncStatus('error')
  }
}

// ─── FK Remapping Utilities ──────────────────────────────
// Build a mapping from cloud record IDs to local IDs via syncId chain:
// cloudId → cloudSyncId → localSyncId → localId

function buildIdMapping(
  cloudRecords: Record<string, unknown>[],
  localRecords: Array<{ id?: number; syncId?: string }>
): Map<number, number> {
  const cloudIdToSyncId = new Map<number, string>()
  for (const r of cloudRecords) {
    const id = r.id as number | undefined
    const syncId = r.syncId as string | undefined
    if (id != null && syncId) cloudIdToSyncId.set(id, syncId)
  }

  const syncIdToLocalId = new Map<string, number>()
  for (const r of localRecords) {
    if (r.syncId && r.id != null) syncIdToLocalId.set(r.syncId, r.id)
  }

  const mapping = new Map<number, number>()
  for (const [cloudId, syncId] of cloudIdToSyncId) {
    const localId = syncIdToLocalId.get(syncId)
    if (localId != null) mapping.set(cloudId, localId)
  }
  return mapping
}

function remapFkField(
  record: Record<string, unknown>,
  field: string,
  mapping: Map<number, number>
): void {
  const value = record[field]
  if (typeof value === 'number' && mapping.has(value)) {
    record[field] = mapping.get(value)!
  }
}

// ─── Merge On Login (replaces syncOnLogin) ────────────────
// Bidirectional merge with FK remapping for cross-device sync

/** @internal Exported for unit tests (cross-device merge collision regression). */
export async function mergeTableWithRemap(
  tableName: SyncableTable,
  cloudRecords: Record<string, unknown>[],
  /**
   * Optional natural-key generator for legacy reconciliation.
   * When a local record lacks `syncId` (e.g., seeded by db.on('populate') in older
   * builds), this function produces a stable key from name/type fields. If the
   * same key exists in cloudRecords, the local record adopts that cloud syncId
   * — preventing duplicates on new-device login.
   * Return null/empty to skip a particular record.
   */
  reconcileByName?: (record: Record<string, unknown>) => string | null,
): Promise<void> {
  const localTable = getLocalTable(tableName)
  const localRecords = await (localTable as typeof db.members).toArray()

  const cloudMap = new Map<string, Record<string, unknown>>()
  for (const rec of cloudRecords) {
    const syncId = rec.syncId as string | undefined
    if (syncId) cloudMap.set(syncId, rec)
  }

  // ── Natural-key reconciliation: align local seed records to cloud syncIds.
  //
  // Fixes the new-device duplicate bug where local default categories — whether
  // syncId-less (legacy `db.on('populate')`) or deterministic-syncId (new) —
  // fail to match cloud records that carry a different syncId (typically a
  // random UUID assigned by an older client's fullUpload). For any local row
  // whose syncId is absent or NOT present in cloud, we look up a name+type
  // match in cloud and adopt that cloud syncId. This collapses the two
  // populations into a single LWW-merged record in the main loop below.
  if (reconcileByName) {
    const cloudByName = new Map<string, string>() // natural key → cloud syncId
    const cloudSyncIdSet = new Set<string>()
    for (const rec of cloudRecords) {
      const key = reconcileByName(rec)
      const syncId = rec.syncId as string | undefined
      if (syncId) cloudSyncIdSet.add(syncId)
      if (key && syncId && !cloudByName.has(key)) cloudByName.set(key, syncId)
    }
    const adoptions: Array<{ id: number; syncId: string }> = []
    const claimedSyncIds = new Set<string>()
    for (const local of localRecords) {
      const localTyped = local as { id?: number; syncId?: string }
      if (localTyped.id == null) continue
      // Skip if local already aligns with a cloud record by syncId.
      if (localTyped.syncId && cloudSyncIdSet.has(localTyped.syncId)) continue
      const key = reconcileByName(local as unknown as Record<string, unknown>)
      if (!key) continue
      const cloudSyncId = cloudByName.get(key)
      if (cloudSyncId && !claimedSyncIds.has(cloudSyncId)) {
        adoptions.push({ id: localTyped.id, syncId: cloudSyncId })
        claimedSyncIds.add(cloudSyncId)
      }
    }
    if (adoptions.length > 0) {
      setSyncWritingFlag(true)
      syncWritingCount++
      try {
        for (const { id, syncId } of adoptions) {
          await (localTable as typeof db.members).update(id, { syncId } as Partial<Member>)
          // Reflect the change in the in-memory copy used below
          const ref = localRecords.find(r => (r as { id?: number }).id === id)
          if (ref) (ref as { syncId?: string }).syncId = syncId
        }
      } finally {
        syncWritingCount = Math.max(0, syncWritingCount - 1)
        setSyncWritingFlag(false)
      }
    }
  }

  const localMap = new Map<string, { record: Record<string, unknown>; id: number }>()
  for (const rec of localRecords) {
    if (rec.syncId) localMap.set(rec.syncId, { record: rec as unknown as Record<string, unknown>, id: rec.id! })
  }

  setSyncWritingFlag(true)
  syncWritingCount++
  try {
    // Case 1: Cloud-only records → download if not locally deleted
    const uniqueKeyField = TABLE_UNIQUE_KEYS[tableName]
    for (const [syncId, cloudRec] of cloudMap) {
      if (localMap.has(syncId)) continue
      const tombstone = await db.syncTombstones
        .where('[tableName+syncId]').equals([tableName, syncId]).first()
      if (tombstone) continue

      // Resolve FKs by `*_syncId` companion FIRST (definitive cross-device link),
      // THEN strip cloud-only fields. stripInternalCloudFields removes those
      // companions, so stripping first would silently force the fragile legacy
      // id-mapping fallback (the bug this ordering fixes).
      const resolved = { ...cloudRec }
      delete resolved.id // Remove cloud id, let Dexie auto-assign
      await resolveFksOnRecord(tableName, resolved)
      const toInsert = stripInternalCloudFields(resolved)

      // Unique-key collision guard: a local row may already hold this record's
      // natural key under a different syncId (same merchant learned on another
      // device). Inserting would throw a ConstraintError on the unique index and
      // abort the whole merge. Instead LWW-merge into the existing row so the two
      // converge onto one syncId (the cloud value, carried in `toInsert`).
      if (uniqueKeyField) {
        const keyVal = toInsert[uniqueKeyField]
        if (keyVal != null) {
          const dup = await (localTable as typeof db.members)
            .where(uniqueKeyField).equals(keyVal as string).first() as
            { id?: number; updatedAt?: string } | undefined
          if (dup?.id != null) {
            if (shouldApplyCloudUpdate(
              cloudRec.updatedAt as string,
              cloudRec.__deviceId as string | undefined,
              dup.updatedAt,
            )) {
              await (localTable as typeof db.members).update(dup.id, toInsert)
            }
            continue
          }
        }
      }

      try {
        await (localTable as typeof db.members).add(toInsert as unknown as Member)
      } catch (err) {
        // Safety net: never let one bad record abort the merge (which would skip
        // the trailing tombstone reconciliation + incrementalUpload).
        console.error(`[sync] merge insert ${tableName}/${syncId} failed:`, err)
      }
    }

    // Case 2: Both exist → LWW by updatedAt, deviceId as tiebreaker
    for (const [syncId, local] of localMap) {
      const cloudRec = cloudMap.get(syncId)
      if (cloudRec) {
        const cloudDeviceId = cloudRec.__deviceId as string | undefined
        if (shouldApplyCloudUpdate(
          cloudRec.updatedAt as string,
          cloudDeviceId,
          local.record.updatedAt as string,
        )) {
          // Resolve FKs (consumes *_syncId companions) before stripping them.
          const resolved = { ...cloudRec }
          delete resolved.id // Don't overwrite local primary key
          await resolveFksOnRecord(tableName, resolved)
          const updates = stripInternalCloudFields(resolved)
          await (localTable as typeof db.members).update(local.id, updates)
        }
      }
    }
  } finally {
    syncWritingCount = Math.max(0, syncWritingCount - 1)
    setSyncWritingFlag(false)
  }

  // Case 3: Ensure local-only / newer-local records have syncChangeLog entries (BULK)
  const toUploadEntries = new Map<string, 'create' | 'update'>()
  for (const [syncId, local] of localMap) {
    const cloudRec = cloudMap.get(syncId)
    const needsUpload = !cloudRec ||
      ((local.record.updatedAt as string || '') > ((cloudRec?.updatedAt as string) || ''))
    if (needsUpload && syncId) {
      toUploadEntries.set(syncId, cloudRec ? 'update' : 'create')
    }
  }
  if (toUploadEntries.size > 0) {
    const existingEntries = await db.syncChangeLog
      .where('tableName').equals(tableName)
      .filter(e => e.processed === 0)
      .toArray()
    const existingSyncIds = new Set(existingEntries.map(e => e.syncId))

    const now = new Date().toISOString()
    const toAdd = [...toUploadEntries]
      .filter(([syncId]) => !existingSyncIds.has(syncId))
      .map(([syncId, operation]) => ({
        tableName, syncId, operation, timestamp: now, processed: 0,
      }))
    if (toAdd.length > 0) {
      await db.syncChangeLog.bulkAdd(toAdd as SyncChangeLogEntry[])
    }
  }
}

async function applyCloudTombstones(uid: string): Promise<void> {
  const tombstoneRef = collection(firestore, `users/${uid}/syncTombstones`)
  let snapshot
  try {
    snapshot = await getDocs(tombstoneRef)
  } catch {
    // Collection may not exist yet
    return
  }
  if (snapshot.empty) return

  setSyncWritingFlag(true)
  syncWritingCount++
  try {
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data() as { tableName: string; syncId: string; deletedAt: string }
      if (!ALL_TABLES.includes(data.tableName as SyncableTable)) continue

      const localTable = getLocalTable(data.tableName as SyncableTable)
      const existing = await (localTable as typeof db.members)
        .where('syncId').equals(data.syncId).first()

      if (existing) {
        const localUpdatedAt = (existing as unknown as Record<string, unknown>).updatedAt as string || ''
        if (data.deletedAt > localUpdatedAt) {
          await (localTable as typeof db.members).delete(existing.id!)
        }
      }
    }
  } finally {
    syncWritingCount = Math.max(0, syncWritingCount - 1)
    setSyncWritingFlag(false)
  }
}

async function uploadLocalTombstones(uid: string): Promise<void> {
  const localTombstones = await db.syncTombstones.toArray()
  for (const tombstone of localTombstones) {
    try {
      await uploadTombstone(uid, tombstone.tableName, tombstone.syncId, tombstone.deletedAt)
      if (ALL_TABLES.includes(tombstone.tableName as SyncableTable)) {
        await deleteFromCloud(uid, tombstone.tableName as SyncableTable, tombstone.syncId)
      }
    } catch (err) {
      console.error(`[sync] upload tombstone ${tombstone.tableName}/${tombstone.syncId} failed:`, err)
    }
  }
}

async function garbageCollectTombstones(uid: string): Promise<void> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  // Clean local tombstones
  await db.syncTombstones.where('deletedAt').below(cutoff).delete()

  // Clean Firestore tombstones
  try {
    const tombstoneRef = collection(firestore, `users/${uid}/syncTombstones`)
    const snapshot = await getDocs(tombstoneRef)
    const toDelete: string[] = []
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data()
      if (data.deletedAt && data.deletedAt < cutoff) {
        toDelete.push(docSnap.ref.path)
      }
    }
    for (let i = 0; i < toDelete.length; i += BATCH_LIMIT) {
      const chunk = toDelete.slice(i, i + BATCH_LIMIT)
      const batch = writeBatch(firestore)
      for (const path of chunk) {
        batch.delete(doc(firestore, path))
      }
      await batch.commit()
    }
  } catch (err) {
    console.error('[sync] tombstone GC failed:', err)
  }
}

export async function mergeOnLogin(uid: string): Promise<void> {
  useAuthStore.getState().setSyncStatus('syncing')
  try {
    // Check if cloud has any data
    const colRef = collection(firestore, getUserCollectionPath(uid, 'members'))
    const snapshot = await getDocs(colRef)

    if (snapshot.empty) {
      // First time: upload everything
      await fullUpload(uid, { reconcile: true })
      return
    }

    // Download ALL cloud data in parallel
    const [
      cloudMembers, cloudAssetCategories, cloudAssetItems, cloudDailyValues,
      cloudTransactionCategories, cloudTransactions, cloudBudgets, cloudGoals,
      cloudPaymentMethodItems, cloudSubscriptions, cloudLoans, cloudMerchantAliases,
    ] = await Promise.all([
      downloadTable<Record<string, unknown>>(uid, 'members'),
      downloadTable<Record<string, unknown>>(uid, 'assetCategories'),
      downloadTable<Record<string, unknown>>(uid, 'assetItems'),
      downloadTable<Record<string, unknown>>(uid, 'dailyValues'),
      downloadTable<Record<string, unknown>>(uid, 'transactionCategories'),
      downloadTable<Record<string, unknown>>(uid, 'transactions'),
      downloadTable<Record<string, unknown>>(uid, 'budgets'),
      downloadTable<Record<string, unknown>>(uid, 'goals'),
      downloadTable<Record<string, unknown>>(uid, 'paymentMethodItems'),
      downloadTable<Record<string, unknown>>(uid, 'subscriptions'),
      downloadTable<Record<string, unknown>>(uid, 'loans'),
      downloadTable<Record<string, unknown>>(uid, 'merchantAliases'),
    ])

    // ── Layer 0: Independent tables (no FK dependencies) ──
    // Seed-derived tables (members + categories + payment methods) pass a
    // reconcileByName key so legacy syncId-less local rows (created by
    // db.on('populate') in older builds) adopt the cloud syncId instead of
    // being treated as cloud-only and duplicated.
    const nameTypeKey = (r: Record<string, unknown>): string | null => {
      const name = r.name as string | undefined
      const type = r.type as string | undefined
      return name ? `${name}|${type ?? ''}` : null
    }
    const nameOnlyKey = (r: Record<string, unknown>): string | null => {
      const name = r.name as string | undefined
      return name || null
    }
    await mergeTableWithRemap('members', cloudMembers, nameOnlyKey)
    await mergeTableWithRemap('assetCategories', cloudAssetCategories, nameTypeKey)
    await mergeTableWithRemap('transactionCategories', cloudTransactionCategories, nameTypeKey)
    await mergeTableWithRemap('goals', cloudGoals)

    // Legacy fkMappings: cloudId → localId. New clients resolve FKs by syncId
    // (resolveFksOnRecord) and rarely consult fkMappings, but it's still the
    // fallback when an old-client upload lacks the `*_syncId` companion field.
    // Rebuild after each layer so children can resolve their parents.
    const localMembers = await db.members.toArray()
    fkMappings['members'] = buildIdMapping(cloudMembers, localMembers)
    const localAssetCats = await db.assetCategories.toArray()
    fkMappings['assetCategories'] = buildIdMapping(cloudAssetCategories, localAssetCats)
    const localTxnCats = await db.transactionCategories.toArray()
    fkMappings['transactionCategories'] = buildIdMapping(cloudTransactionCategories, localTxnCats)

    // ── Layer 1: First-level dependents ──
    await mergeTableWithRemap('assetItems', cloudAssetItems)
    await mergeTableWithRemap('budgets', cloudBudgets)

    fkMappings['assetItems'] = buildIdMapping(cloudAssetItems, await db.assetItems.toArray())

    // ── Layer 2: Second-level dependents ──
    await mergeTableWithRemap('dailyValues', cloudDailyValues)
    await mergeTableWithRemap('paymentMethodItems', cloudPaymentMethodItems)

    fkMappings['paymentMethodItems'] = buildIdMapping(
      cloudPaymentMethodItems,
      await db.paymentMethodItems.toArray(),
    )

    // ── Layer 3: Third-level dependents ──
    await mergeTableWithRemap('subscriptions', cloudSubscriptions)

    fkMappings['subscriptions'] = buildIdMapping(cloudSubscriptions, await db.subscriptions.toArray())

    // ── Layer 4: Transactions (depends on members, txnCategories, payMethods, subscriptions) ──
    await mergeTableWithRemap('transactions', cloudTransactions)

    // ── Loans (depends on assetItems) ──
    await mergeTableWithRemap('loans', cloudLoans)

    // ── Merchant aliases (depends on transactionCategories + subscriptions) ──
    await mergeTableWithRemap('merchantAliases', cloudMerchantAliases)

    // Process tombstones
    await applyCloudTombstones(uid)
    await uploadLocalTombstones(uid)

    // Upload any remaining local-only changes
    await incrementalUpload(uid)

    // Tombstone garbage collection
    try {
      await garbageCollectTombstones(uid)
    } catch (err) {
      console.error('[sync] tombstone GC on login failed:', err)
    }

    useAuthStore.getState().setSyncStatus('synced')
    useAuthStore.getState().setLastSyncTime(new Date().toISOString())
  } catch (err) {
    console.error('[sync] merge on login failed:', err)
    useAuthStore.getState().setSyncStatus('error')
  }
}

/** @deprecated Use mergeOnLogin instead */
export async function syncOnLogin(uid: string): Promise<void> {
  await mergeOnLogin(uid)
}

// ─── Pending Changes Count ───────────────────────────────
export async function getPendingChangesCount(): Promise<number> {
  return db.syncChangeLog.where('processed').equals(0).count()
}

// Delete a single document from Firestore
export async function deleteFromCloud(uid: string, tableName: SyncableTable, syncId: string): Promise<void> {
  try {
    await deleteDoc(doc(firestore, getUserDocPath(uid, tableName, syncId)))
  } catch (err) {
    console.error(`[sync] delete ${tableName}/${syncId} failed:`, err)
  }
}

// Delete multiple documents from Firestore (batch)
export async function deleteMultipleFromCloud(uid: string, tableName: SyncableTable, syncIds: string[]): Promise<void> {
  if (syncIds.length === 0) return
  try {
    for (let i = 0; i < syncIds.length; i += BATCH_LIMIT) {
      const chunk = syncIds.slice(i, i + BATCH_LIMIT)
      const batch = writeBatch(firestore)
      for (const syncId of chunk) {
        batch.delete(doc(firestore, getUserDocPath(uid, tableName, syncId)))
      }
      await batch.commit()
    }
  } catch (err) {
    console.error(`[sync] batch delete ${tableName} failed:`, err)
  }
}

// Upload a single record to Firestore. Full-doc replace; see uploadTable.
export async function uploadSingleRecord<T extends { syncId?: string }>(
  uid: string,
  tableName: SyncableTable,
  record: T
): Promise<void> {
  if (!record.syncId) return
  try {
    const batch = writeBatch(firestore)
    const ref = doc(firestore, getUserDocPath(uid, tableName, record.syncId))
    const enriched = { ...record } as Record<string, unknown>
    await addFkSyncIds(tableName, enriched)
    batch.set(ref, toCloudPayload(enriched))
    await batch.commit()
  } catch (err) {
    console.error(`[sync] upload ${tableName}/${record.syncId} failed:`, err)
  }
}

// ─── Real-time Sync ───────────────────────────────────

let unsubscribers: Unsubscribe[] = []
let realtimeSyncPaused = false
let syncWritingCount = 0
let lastSnapshotAt = 0

export function pauseRealtimeSync() { realtimeSyncPaused = true }
export function resumeRealtimeSync() { realtimeSyncPaused = false }
export function getIsSyncWriting() { return syncWritingCount > 0 }
export function beginSyncWriting() { syncWritingCount++ }
export function endSyncWriting() { syncWritingCount = Math.max(0, syncWritingCount - 1) }
/** Timestamp (ms epoch) of the last Firestore snapshot fire. 0 if no snapshot yet. */
export function getLastSnapshotAt() { return lastSnapshotAt }

// ─── FK Mapping for Real-time Sync ──────────────────────
// Maps cloudId → localId per table, updated during merge and real-time sync

const fkMappings: Record<string, Map<number, number>> = {}
for (const t of ALL_TABLES) fkMappings[t] = new Map()

export function populateFkMappings(
  tableName: SyncableTable,
  cloudRecords: Record<string, unknown>[],
  localRecords: Array<{ id?: number; syncId?: string }>
): void {
  const mapping = buildIdMapping(cloudRecords, localRecords)
  fkMappings[tableName] = mapping
}

function updateFkMapping(tableName: SyncableTable, cloudId: number | undefined, localId: number): void {
  if (cloudId != null) fkMappings[tableName].set(cloudId, localId)
}

const TABLE_FK_DEFS: Partial<Record<SyncableTable, Array<{ field: string; refTable: SyncableTable }>>> = {
  assetItems: [
    { field: 'memberId', refTable: 'members' },
    { field: 'categoryId', refTable: 'assetCategories' },
  ],
  dailyValues: [
    { field: 'assetItemId', refTable: 'assetItems' },
  ],
  transactions: [
    { field: 'memberId', refTable: 'members' },
    { field: 'categoryId', refTable: 'transactionCategories' },
    { field: 'paymentMethodItemId', refTable: 'paymentMethodItems' },
    { field: 'subscriptionId', refTable: 'subscriptions' },
  ],
  budgets: [
    { field: 'categoryId', refTable: 'transactionCategories' },
  ],
  paymentMethodItems: [
    { field: 'linkedAssetItemId', refTable: 'assetItems' },
  ],
  subscriptions: [
    { field: 'paymentMethodItemId', refTable: 'paymentMethodItems' },
    { field: 'linkedTransactionCategoryId', refTable: 'transactionCategories' },
  ],
  loans: [
    { field: 'linkedAssetItemId', refTable: 'assetItems' },
  ],
  investmentTrades: [
    { field: 'memberId', refTable: 'members' },
  ],
  dividends: [
    { field: 'memberId', refTable: 'members' },
  ],
  accountInterests: [
    { field: 'memberId', refTable: 'members' },
  ],
  merchantAliases: [
    { field: 'categoryId', refTable: 'transactionCategories' },
    { field: 'subscriptionId', refTable: 'subscriptions' },
  ],
}

/**
 * Tables with a natural unique key (a Dexie `&` index). Two devices that create
 * the "same" logical record independently produce identical values for this key
 * but DIFFERENT random syncIds. On download, matching only by syncId would treat
 * them as distinct and call `.add()`, throwing a ConstraintError on the unique
 * index and aborting the merge. Sync therefore reconciles these tables by the
 * unique key too: a syncId miss that hits the unique key is the same row, so we
 * LWW-merge into it (adopting the peer's syncId) instead of inserting a copy.
 *
 * Currently only merchantAliases (`&merchantKey`) — the schema's sole unique index.
 */
const TABLE_UNIQUE_KEYS: Partial<Record<SyncableTable, string>> = {
  merchantAliases: 'merchantKey',
}

interface UnmappedFK {
  field: string
  refTable: SyncableTable
  // Exactly one of these is set:
  refSyncId?: string  // new path: parent known by syncId, not yet local
  cloudValue?: number // legacy path: only cloud auto-id available
}

/**
 * Resolve FK fields on a downloaded record. Tries syncId companions first
 * (new uploads), falls back to legacy fkMappings (old client uploads).
 *
 * Side effects:
 *   - Rewrites each FK field in `record` to the local id (or leaves the
 *     original value if unresolvable so the legacy fkMappings retry still has
 *     something to work with).
 *   - Consumes companion fields `<field>_syncId` from `record`.
 *
 * Returns the FKs that could not be resolved; callers should queue these for
 * deferred resolution (see `queuePendingChild`) and/or `scheduleFkRetry`.
 */
async function resolveFksOnRecord(
  tableName: SyncableTable,
  record: Record<string, unknown>,
): Promise<UnmappedFK[]> {
  const defs = TABLE_FK_DEFS[tableName]
  if (!defs) return []
  const unmapped: UnmappedFK[] = []
  for (const { field, refTable } of defs) {
    const syncIdField = `${field}_syncId`
    const refSyncId = record[syncIdField]

    // Path 1: companion present as string → resolve by syncId (definitive).
    if (typeof refSyncId === 'string') {
      const parent = await (getLocalTable(refTable) as typeof db.members)
        .where('syncId').equals(refSyncId).first() as { id?: number } | undefined
      if (parent?.id != null) {
        record[field] = parent.id
      } else {
        // Parent hasn't arrived locally — defer. Drop the cloud value so a
        // half-broken numeric FK doesn't get written.
        delete record[field]
        unmapped.push({ field, refTable, refSyncId })
      }
      delete record[syncIdField]
      continue
    }

    // Path 2: companion is null OR missing. Both can mean either
    //   (a) writer's parent had no syncId at upload time (`addFkSyncIds`
    //       returns `parent?.syncId ?? null`), OR
    //   (b) the FK was genuinely null (e.g., deleted category cleared by
    //       `deleteTransactionCategory`).
    // We can't distinguish (a) from (b) from the companion alone, so try the
    // legacy fkMappings fallback (cloud auto-id → local id) first. Only after
    // that also fails do we treat the FK as cleared. This rescues transactions
    // whose category sync-id was lost at write time but whose numeric cloud id
    // still resolves through the syncId chain.
    if (refSyncId === null) delete record[syncIdField]

    const value = record[field]
    if (typeof value === 'number') {
      const mapping = fkMappings[refTable]
      if (mapping && mapping.has(value)) {
        record[field] = mapping.get(value)!
      } else if (value === 0) {
        // 0 is sometimes used as "unset" — preserve existing behavior of
        // leaving it untouched so callers can normalize.
      } else {
        // Legacy fallback failed. Null the FK so we don't leave a ghost id
        // that points into an unrelated local row (Case E in cross-device
        // re-merge). Queue for deferred retry — if the parent table snapshot
        // arrives later (real-time sync), `flushPendingChildren` will fix it.
        record[field] = null
        unmapped.push({ field, refTable, cloudValue: value })
      }
    } else if (refSyncId === null) {
      // Companion was explicitly null AND record[field] isn't a number —
      // honour the clear.
      record[field] = null
    }
  }
  return unmapped
}

// (legacy remapCloudFks removed — superseded by resolveFksOnRecord)

// ─── Deferred FK resolution queue ──────────────────────────────────
//
// When a child snapshot arrives before its parent (real-time sync delivers
// table snapshots independently), we cannot map the child's FK to a local id.
// Queue the child by parent's identifier (preferring syncId) and flush when
// the parent's snapshot eventually arrives.

type PendingChildEntry = {
  table: SyncableTable
  localId: number
  field: string
}

const pendingChildren = new Map<string, PendingChildEntry[]>()

function queuePendingChild(key: string, entry: PendingChildEntry): void {
  if (!pendingChildren.has(key)) pendingChildren.set(key, [])
  pendingChildren.get(key)!.push(entry)
}

async function flushPendingChildren(
  refTable: SyncableTable,
  refSyncId: string | undefined,
  cloudId: number | undefined,
  refLocalId: number,
): Promise<void> {
  const keys: string[] = []
  if (refSyncId) keys.push(`${refTable}:syncId:${refSyncId}`)
  if (cloudId != null) keys.push(`${refTable}:cloudId:${cloudId}`)
  const tablesTouched = new Set<SyncableTable>()
  for (const key of keys) {
    const queue = pendingChildren.get(key)
    if (!queue || queue.length === 0) continue
    pendingChildren.delete(key)
    syncWritingCount++
    setSyncWritingFlag(true)
    try {
      for (const { table, localId, field } of queue) {
        try {
          await (getLocalTable(table) as typeof db.members).update(localId, { [field]: refLocalId } as never)
          tablesTouched.add(table)
        } catch (err) {
          console.error(`[sync] flush deferred FK ${table}#${localId}.${field} failed:`, err)
        }
      }
    } finally {
      syncWritingCount = Math.max(0, syncWritingCount - 1)
      setSyncWritingFlag(false)
    }
  }
  for (const t of tablesTouched) {
    window.dispatchEvent(new CustomEvent('fin-sync-update', { detail: { table: t } }))
  }
}

function recordUnmappedFks(
  tableName: SyncableTable,
  localId: number,
  unmapped: UnmappedFK[],
): void {
  for (const u of unmapped) {
    if (u.refSyncId) {
      queuePendingChild(`${u.refTable}:syncId:${u.refSyncId}`, { table: tableName, localId, field: u.field })
    } else if (u.cloudValue != null) {
      queuePendingChild(`${u.refTable}:cloudId:${u.cloudValue}`, { table: tableName, localId, field: u.field })
    }
  }
}

type DexieTable = typeof db.members | typeof db.assetCategories | typeof db.assetItems |
  typeof db.dailyValues | typeof db.transactionCategories | typeof db.transactions |
  typeof db.budgets | typeof db.goals | typeof db.paymentMethodItems | typeof db.subscriptions |
  typeof db.loans | typeof db.investmentTrades | typeof db.dividends | typeof db.accountInterests | typeof db.merchantAliases

function getLocalTable(tableName: SyncableTable): DexieTable {
  const map: Record<SyncableTable, DexieTable> = {
    members: db.members,
    assetCategories: db.assetCategories,
    assetItems: db.assetItems,
    dailyValues: db.dailyValues,
    transactionCategories: db.transactionCategories,
    transactions: db.transactions,
    budgets: db.budgets,
    goals: db.goals,
    paymentMethodItems: db.paymentMethodItems,
    subscriptions: db.subscriptions,
    loans: db.loans,
    investmentTrades: db.investmentTrades,
    dividends: db.dividends,
    accountInterests: db.accountInterests,
    merchantAliases: db.merchantAliases,
  }
  return map[tableName]
}

let syncGeneration = 0

/**
 * Deferred FK retry. When a child record arrives before its parent via
 * real-time sync, FK resolution fails. The deferred-children queue
 * (`flushPendingChildren`) handles most of these as soon as the parent's
 * snapshot lands — this timer is a belt-and-braces fallback in case the
 * parent snapshot fires for a non-keyed reason or the queue key drifts.
 *
 * Retries 6 times with exponential backoff (2s, 4s, 8s, 16s, 32s, 60s).
 * Logs a warning on permanent failure so orphaned FKs become observable.
 */
function scheduleFkRetry(
  tableName: SyncableTable,
  localId: number,
  unmapped: UnmappedFK[],
  localTable: DexieTable,
  attempt = 0
): void {
  const MAX_RETRIES = 6
  const delays = [2000, 4000, 8000, 16000, 32000, 60000]
  if (attempt >= MAX_RETRIES) {
    console.warn(`[sync] FK still unmapped after ${MAX_RETRIES} retries:`, { tableName, localId, unmapped })
    return
  }

  setTimeout(async () => {
    const updates: Record<string, unknown> = {}
    const stillUnmapped: UnmappedFK[] = []

    for (const u of unmapped) {
      const { field, refTable } = u
      if (u.refSyncId) {
        const parent = await (getLocalTable(refTable) as typeof db.members)
          .where('syncId').equals(u.refSyncId).first() as { id?: number } | undefined
        if (parent?.id != null) {
          updates[field] = parent.id
          continue
        }
      } else if (u.cloudValue != null) {
        const mapping = fkMappings[refTable]
        if (mapping?.has(u.cloudValue)) {
          updates[field] = mapping.get(u.cloudValue)!
          continue
        }
      }
      stillUnmapped.push(u)
    }

    if (Object.keys(updates).length > 0) {
      syncWritingCount++
      setSyncWritingFlag(true)
      try {
        await (localTable as typeof db.members).update(localId, updates)
      } catch (err) {
        console.error(`[sync] FK retry ${tableName}#${localId} failed:`, err)
      } finally {
        syncWritingCount = Math.max(0, syncWritingCount - 1)
        setSyncWritingFlag(false)
      }
      if (stillUnmapped.length === 0) {
        window.dispatchEvent(new CustomEvent('fin-sync-update', { detail: { table: tableName } }))
      }
    }

    if (stillUnmapped.length > 0) {
      scheduleFkRetry(tableName, localId, stillUnmapped, localTable, attempt + 1)
    }
  }, delays[attempt])
}

/**
 * Decide whether a cloud version should overwrite the local version, using
 * updatedAt LWW with deviceId as a deterministic tiebreaker. Without the
 * tiebreaker, two devices writing at the same millisecond would both skip
 * each other's updates and stay diverged forever.
 */
function shouldApplyCloudUpdate(
  cloudUpdatedAt: string | undefined,
  cloudDeviceId: string | undefined,
  localUpdatedAt: string | undefined,
): boolean {
  if (!cloudUpdatedAt) return false
  const cAt = cloudUpdatedAt
  const lAt = localUpdatedAt || ''
  if (cAt > lAt) return true
  if (cAt < lAt) return false
  // Equal timestamps — deterministic tiebreak by deviceId. Echo of our own
  // write (same deviceId) returns false. Higher deviceId wins.
  const peer = cloudDeviceId || ''
  const self = getDeviceId()
  return peer !== '' && peer !== self && peer > self
}

function subscribeTable(uid: string, tableName: SyncableTable, generation: number, retryCount = 0): void {
  const colRef = collection(firestore, getUserCollectionPath(uid, tableName))
  const unsub = onSnapshot(colRef, async (snapshot) => {
    lastSnapshotAt = Date.now()
    if (realtimeSyncPaused) return

    const localTable = getLocalTable(tableName)
    // Records whose parent FK resolved successfully (or didn't need resolving)
    // — collected so we can flush any children pending on them.
    const settledParents: Array<{ syncId: string; cloudId?: number; localId: number }> = []

    syncWritingCount++
    setSyncWritingFlag(true)
    try {
      for (const change of snapshot.docChanges()) {
        const cloudData = change.doc.data()
        const syncId = cloudData.syncId as string | undefined
        if (!syncId) continue

        try {
          if (change.type === 'added' || change.type === 'modified') {
            let existing = await (localTable as typeof db.members).where('syncId').equals(syncId).first()
            // syncId miss + unique-key hit ⇒ same logical row from another device.
            // Resolve to it so the LWW path below adopts the peer's syncId instead
            // of `.add()`-ing a duplicate (which throws on the unique index).
            if (!existing) {
              const uniqueKeyField = TABLE_UNIQUE_KEYS[tableName]
              const keyVal = uniqueKeyField ? (cloudData as Record<string, unknown>)[uniqueKeyField] : undefined
              if (uniqueKeyField && keyVal != null) {
                existing = await (localTable as typeof db.members).where(uniqueKeyField).equals(keyVal as string).first()
              }
            }
            const cloudDeviceId = cloudData.__deviceId as string | undefined
            if (existing) {
              if (!shouldApplyCloudUpdate(cloudData.updatedAt as string, cloudDeviceId, existing.updatedAt)) {
                continue
              }
              // Resolve FKs (consumes *_syncId companions) before stripping them.
              const resolved = { ...cloudData }
              const cloudId = resolved.id as number | undefined
              delete resolved.id // Don't overwrite local primary key
              const unmapped = await resolveFksOnRecord(tableName, resolved)
              const updates = stripInternalCloudFields(resolved)
              await (localTable as typeof db.members).update(existing.id!, updates)
              updateFkMapping(tableName, cloudId, existing.id!)
              settledParents.push({ syncId, cloudId, localId: existing.id! })
              if (unmapped.length > 0) {
                recordUnmappedFks(tableName, existing.id!, unmapped)
                scheduleFkRetry(tableName, existing.id!, unmapped, localTable)
              }
            } else {
              // Resolve FKs (consumes *_syncId companions) before stripping them.
              const resolved = { ...cloudData }
              const cloudId = resolved.id as number | undefined
              delete resolved.id // Let Dexie auto-assign local id
              const unmapped = await resolveFksOnRecord(tableName, resolved)
              const toInsert = stripInternalCloudFields(resolved)
              const newId = await (localTable as typeof db.members).add(toInsert as unknown as Member) as number
              updateFkMapping(tableName, cloudId, newId)
              settledParents.push({ syncId, cloudId, localId: newId })
              if (unmapped.length > 0) {
                recordUnmappedFks(tableName, newId, unmapped)
                scheduleFkRetry(tableName, newId, unmapped, localTable)
              }
            }
          } else if (change.type === 'removed') {
            const existing = await (localTable as typeof db.members).where('syncId').equals(syncId).first()
            if (existing) {
              await (localTable as typeof db.members).delete(existing.id!)
            }
          }
        } catch (err) {
          console.error(`[sync] real-time ${tableName} ${change.type} error:`, err)
        }
      }
    } finally {
      syncWritingCount = Math.max(0, syncWritingCount - 1)
      setSyncWritingFlag(false)
    }

    // Flush any children that were waiting on parents we just settled.
    for (const p of settledParents) {
      await flushPendingChildren(tableName, p.syncId, p.cloudId, p.localId)
    }

    if (snapshot.docChanges().length > 0) {
      window.dispatchEvent(new CustomEvent('fin-sync-update', { detail: { table: tableName } }))
    }
  }, (err) => {
    console.error(`[sync] ${tableName} listener error:`, err)
    // Auto-reconnect with exponential backoff (max 30s)
    if (syncGeneration === generation && retryCount < 5) {
      const delay = Math.min(Math.pow(2, retryCount) * 1000, 30000)
      console.log(`[sync] retrying ${tableName} listener in ${delay}ms (attempt ${retryCount + 1})`)
      setTimeout(() => {
        if (syncGeneration === generation) {
          subscribeTable(uid, tableName, generation, retryCount + 1)
        }
      }, delay)
    }
  })
  unsubscribers.push(unsub)
}

function subscribeTombstones(uid: string, generation: number): void {
  const colRef = collection(firestore, `users/${uid}/syncTombstones`)
  const unsub = onSnapshot(colRef, async (snapshot) => {
    lastSnapshotAt = Date.now()
    if (realtimeSyncPaused) return

    syncWritingCount++
    setSyncWritingFlag(true)
    try {
      for (const change of snapshot.docChanges()) {
        if (change.type !== 'added') continue

        const data = change.doc.data() as { tableName: string; syncId: string; deletedAt: string }
        if (!ALL_TABLES.includes(data.tableName as SyncableTable)) continue

        try {
          const localTable = getLocalTable(data.tableName as SyncableTable)
          const existing = await (localTable as typeof db.members)
            .where('syncId').equals(data.syncId).first()
          if (existing) {
            await (localTable as typeof db.members).delete(existing.id!)
          }
        } catch (err) {
          console.error(`[sync] tombstone apply ${data.tableName}/${data.syncId} error:`, err)
        }
      }
    } finally {
      syncWritingCount = Math.max(0, syncWritingCount - 1)
      setSyncWritingFlag(false)
    }

    if (snapshot.docChanges().length > 0) {
      window.dispatchEvent(new CustomEvent('fin-sync-update', { detail: { table: 'tombstones' } }))
    }
  }, (err) => {
    console.error('[sync] tombstones listener error:', err)
    if (syncGeneration === generation) {
      const delay = 2000
      console.log(`[sync] retrying tombstones listener in ${delay}ms`)
      setTimeout(() => {
        if (syncGeneration === generation) {
          subscribeTombstones(uid, generation)
        }
      }, delay)
    }
  })
  unsubscribers.push(unsub)
}

let activeListenerUid: string | null = null

/**
 * (Re)start Firestore real-time listeners.
 *
 * @param uid   Authenticated user id.
 * @param force Force a tear-down + re-subscribe even if listeners appear to
 *              already be active for this uid. Useful when the caller suspects
 *              the existing listeners have silently gone stale (e.g., after a
 *              long background sleep). The default no-op-if-active behavior
 *              is preserved otherwise to avoid replaying the entire initial
 *              snapshot on every visibility/online event.
 */
export function startRealtimeSync(uid: string, force: boolean = false): void {
  if (!force && activeListenerUid === uid && unsubscribers.length > 0) return

  stopRealtimeSync()
  activeListenerUid = uid
  syncGeneration++
  realtimeSyncPaused = false
  lastSnapshotAt = 0
  const gen = syncGeneration

  for (const tableName of ALL_TABLES) {
    subscribeTable(uid, tableName, gen)
  }

  // Also subscribe to tombstones for cross-device delete propagation
  subscribeTombstones(uid, gen)
}

export function stopRealtimeSync(): void {
  activeListenerUid = null
  syncGeneration++
  for (const unsub of unsubscribers) {
    unsub()
  }
  unsubscribers = []
  pendingChildren.clear()
}
