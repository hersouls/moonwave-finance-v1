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
  SyncChangeLogEntry,
} from '@/lib/types'

export type SyncableTable = 'members' | 'assetCategories' | 'assetItems' | 'dailyValues' | 'transactionCategories' | 'transactions' | 'budgets' | 'goals' | 'paymentMethodItems' | 'subscriptions'

const BATCH_LIMIT = 499
const ALL_TABLES: SyncableTable[] = ['members', 'assetCategories', 'assetItems', 'dailyValues', 'transactionCategories', 'transactions', 'budgets', 'goals', 'paymentMethodItems', 'subscriptions']

/** Strip undefined values from an object — Firestore rejects undefined fields */
function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const result = {} as Record<string, unknown>
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) result[key] = value
  }
  return result as T
}

function getUserCollectionPath(uid: string, tableName: string): string {
  return `users/${uid}/${tableName}`
}

function getUserDocPath(uid: string, tableName: string, syncId: string): string {
  return `users/${uid}/${tableName}/${syncId}`
}

// Split records into Firestore batch-safe chunks and upload
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
      const data = stripUndefined({ ...record } as Record<string, unknown>)
      batch.set(ref, data, { merge: true })
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

    const [members, assetCategories, assetItems, dailyValues, transactionCategories, transactions, budgets, goals, paymentMethodItems, subscriptions] = await Promise.all([
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
    const [members, assetCategories, assetItems, dailyValues, transactionCategories, transactions, budgets, goals, paymentMethodItems, subscriptions] = await withRetry(() => Promise.all([
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
    ]))

    syncWritingCount++
    setSyncWritingFlag(true)
    try {
      await db.transaction('rw', [db.members, db.assetCategories, db.assetItems, db.dailyValues, db.transactionCategories, db.transactions, db.budgets, db.goals, db.paymentMethodItems, db.subscriptions], async () => {
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
  const tombstoneId = `${tableName}_${syncId}`
  const ref = doc(firestore, `users/${uid}/syncTombstones/${tombstoneId}`)
  const batch = writeBatch(firestore)
  batch.set(ref, { tableName, syncId, deletedAt })
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

async function mergeTableWithRemap(
  tableName: SyncableTable,
  cloudRecords: Record<string, unknown>[],
  remapFks?: (record: Record<string, unknown>) => void
): Promise<void> {
  const localTable = getLocalTable(tableName)
  const localRecords = await (localTable as typeof db.members).toArray()

  const cloudMap = new Map<string, Record<string, unknown>>()
  for (const rec of cloudRecords) {
    const syncId = rec.syncId as string | undefined
    if (syncId) cloudMap.set(syncId, rec)
  }

  const localMap = new Map<string, { record: Record<string, unknown>; id: number }>()
  for (const rec of localRecords) {
    if (rec.syncId) localMap.set(rec.syncId, { record: rec as unknown as Record<string, unknown>, id: rec.id! })
  }

  setSyncWritingFlag(true)
  syncWritingCount++
  try {
    // Case 1: Cloud-only records → download if not locally deleted
    for (const [syncId, cloudRec] of cloudMap) {
      if (!localMap.has(syncId)) {
        const tombstone = await db.syncTombstones
          .where('[tableName+syncId]').equals([tableName, syncId]).first()
        if (!tombstone) {
          const toInsert = { ...cloudRec }
          delete toInsert.id // Remove cloud id, let Dexie auto-assign
          if (remapFks) remapFks(toInsert)
          await (localTable as typeof db.members).add(toInsert as unknown as Member)
        }
      }
    }

    // Case 2: Both exist → LWW by updatedAt
    for (const [syncId, local] of localMap) {
      const cloudRec = cloudMap.get(syncId)
      if (cloudRec) {
        const cloudUpdatedAt = (cloudRec.updatedAt as string) || ''
        const localUpdatedAt = (local.record.updatedAt as string) || ''
        if (cloudUpdatedAt > localUpdatedAt) {
          const updates = { ...cloudRec }
          delete updates.id // Don't overwrite local primary key
          if (remapFks) remapFks(updates)
          await (localTable as typeof db.members).update(local.id, updates)
        }
        // If local is newer, incrementalUpload will handle it
      }
      // Case 3: Local-only records → incrementalUpload handles upload
    }
  } finally {
    syncWritingCount = Math.max(0, syncWritingCount - 1)
    setSyncWritingFlag(false)
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
      cloudPaymentMethodItems, cloudSubscriptions,
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
    ])

    // ── Layer 0: Independent tables (no FK dependencies) ──
    await mergeTableWithRemap('members', cloudMembers)
    await mergeTableWithRemap('assetCategories', cloudAssetCategories)
    await mergeTableWithRemap('transactionCategories', cloudTransactionCategories)
    await mergeTableWithRemap('goals', cloudGoals)

    // Build ID mappings: cloudId → localId (via syncId chain)
    // Also populate module-level fkMappings for real-time sync use
    const localMembers = await db.members.toArray()
    const memberMap = buildIdMapping(cloudMembers, localMembers)
    fkMappings['members'] = memberMap

    const localAssetCats = await db.assetCategories.toArray()
    const assetCatMap = buildIdMapping(cloudAssetCategories, localAssetCats)
    fkMappings['assetCategories'] = assetCatMap

    const localTxnCats = await db.transactionCategories.toArray()
    const txnCatMap = buildIdMapping(cloudTransactionCategories, localTxnCats)
    fkMappings['transactionCategories'] = txnCatMap

    // ── Layer 1: First-level dependents ──
    await mergeTableWithRemap('assetItems', cloudAssetItems, (rec) => {
      remapFkField(rec, 'memberId', memberMap)
      remapFkField(rec, 'categoryId', assetCatMap)
    })
    await mergeTableWithRemap('budgets', cloudBudgets, (rec) => {
      remapFkField(rec, 'categoryId', txnCatMap)
    })

    // Build assetItem mapping for layer 2
    const assetItemMap = buildIdMapping(cloudAssetItems, await db.assetItems.toArray())
    fkMappings['assetItems'] = assetItemMap

    // ── Layer 2: Second-level dependents ──
    await mergeTableWithRemap('dailyValues', cloudDailyValues, (rec) => {
      remapFkField(rec, 'assetItemId', assetItemMap)
    })
    await mergeTableWithRemap('paymentMethodItems', cloudPaymentMethodItems, (rec) => {
      remapFkField(rec, 'linkedAssetItemId', assetItemMap)
    })

    // Build paymentMethodItem mapping for layer 3
    const payMethodMap = buildIdMapping(cloudPaymentMethodItems, await db.paymentMethodItems.toArray())
    fkMappings['paymentMethodItems'] = payMethodMap

    // ── Layer 3: Third-level dependents ──
    await mergeTableWithRemap('subscriptions', cloudSubscriptions, (rec) => {
      remapFkField(rec, 'paymentMethodItemId', payMethodMap)
      remapFkField(rec, 'linkedTransactionCategoryId', txnCatMap)
    })

    // Build subscription mapping for layer 4
    const subscriptionMap = buildIdMapping(cloudSubscriptions, await db.subscriptions.toArray())
    fkMappings['subscriptions'] = subscriptionMap

    // ── Layer 4: Transactions (depends on members, txnCategories, payMethods, subscriptions) ──
    await mergeTableWithRemap('transactions', cloudTransactions, (rec) => {
      remapFkField(rec, 'memberId', memberMap)
      remapFkField(rec, 'categoryId', txnCatMap)
      remapFkField(rec, 'paymentMethodItemId', payMethodMap)
      remapFkField(rec, 'subscriptionId', subscriptionMap)
    })

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

// Upload a single record to Firestore
export async function uploadSingleRecord<T extends { syncId?: string }>(
  uid: string,
  tableName: SyncableTable,
  record: T
): Promise<void> {
  if (!record.syncId) return
  try {
    const batch = writeBatch(firestore)
    const ref = doc(firestore, getUserDocPath(uid, tableName, record.syncId))
    const data = stripUndefined({ ...record } as Record<string, unknown>)
    batch.set(ref, data, { merge: true })
    await batch.commit()
  } catch (err) {
    console.error(`[sync] upload ${tableName}/${record.syncId} failed:`, err)
  }
}

// ─── Real-time Sync ───────────────────────────────────

let unsubscribers: Unsubscribe[] = []
let realtimeSyncPaused = false
let syncWritingCount = 0

export function pauseRealtimeSync() { realtimeSyncPaused = true }
export function resumeRealtimeSync() { realtimeSyncPaused = false }
export function getIsSyncWriting() { return syncWritingCount > 0 }
export function beginSyncWriting() { syncWritingCount++ }
export function endSyncWriting() { syncWritingCount = Math.max(0, syncWritingCount - 1) }

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
}

function remapCloudFks(tableName: SyncableTable, record: Record<string, unknown>): void {
  const defs = TABLE_FK_DEFS[tableName]
  if (!defs) return
  for (const { field, refTable } of defs) {
    const mapping = fkMappings[refTable]
    if (mapping) remapFkField(record, field, mapping)
  }
}

type DexieTable = typeof db.members | typeof db.assetCategories | typeof db.assetItems |
  typeof db.dailyValues | typeof db.transactionCategories | typeof db.transactions |
  typeof db.budgets | typeof db.goals | typeof db.paymentMethodItems | typeof db.subscriptions

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
  }
  return map[tableName]
}

let currentSyncUid: string | null = null

function subscribeTable(uid: string, tableName: SyncableTable, retryCount = 0): void {
  const colRef = collection(firestore, getUserCollectionPath(uid, tableName))
  const unsub = onSnapshot(colRef, async (snapshot) => {
    if (realtimeSyncPaused) return

    const localTable = getLocalTable(tableName)

    syncWritingCount++
    setSyncWritingFlag(true)
    try {
      for (const change of snapshot.docChanges()) {
        const cloudData = change.doc.data()
        const syncId = cloudData.syncId as string | undefined

        if (!syncId) continue

        try {
          if (change.type === 'added' || change.type === 'modified') {
            const existing = await (localTable as typeof db.members).where('syncId').equals(syncId).first()
            if (existing) {
              const cloudUpdatedAt = cloudData.updatedAt as string
              if (cloudUpdatedAt && cloudUpdatedAt > (existing.updatedAt || '')) {
                const updates = { ...cloudData }
                const cloudId = updates.id as number | undefined
                delete updates.id // Don't overwrite local primary key
                remapCloudFks(tableName, updates)
                await (localTable as typeof db.members).update(existing.id!, updates)
                updateFkMapping(tableName, cloudId, existing.id!)
              }
            } else {
              const toInsert = { ...cloudData }
              const cloudId = toInsert.id as number | undefined
              delete toInsert.id // Let Dexie auto-assign local id
              remapCloudFks(tableName, toInsert)
              const newId = await (localTable as typeof db.members).add(toInsert as Member) as number
              updateFkMapping(tableName, cloudId, newId)
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

    if (snapshot.docChanges().length > 0) {
      window.dispatchEvent(new CustomEvent('fin-sync-update', { detail: { table: tableName } }))
    }
  }, (err) => {
    console.error(`[sync] ${tableName} listener error:`, err)
    // Auto-reconnect with exponential backoff (max 30s)
    if (currentSyncUid === uid && retryCount < 5) {
      const delay = Math.min(Math.pow(2, retryCount) * 1000, 30000)
      console.log(`[sync] retrying ${tableName} listener in ${delay}ms (attempt ${retryCount + 1})`)
      setTimeout(() => {
        if (currentSyncUid === uid) {
          subscribeTable(uid, tableName, retryCount + 1)
        }
      }, delay)
    }
  })
  unsubscribers.push(unsub)
}

function subscribeTombstones(uid: string): void {
  const colRef = collection(firestore, `users/${uid}/syncTombstones`)
  const unsub = onSnapshot(colRef, async (snapshot) => {
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
  })
  unsubscribers.push(unsub)
}

export function startRealtimeSync(uid: string): void {
  stopRealtimeSync()
  currentSyncUid = uid

  for (const tableName of ALL_TABLES) {
    subscribeTable(uid, tableName)
  }

  // Also subscribe to tombstones for cross-device delete propagation
  subscribeTombstones(uid)
}

export function stopRealtimeSync(): void {
  currentSyncUid = null
  for (const unsub of unsubscribers) {
    unsub()
  }
  unsubscribers = []
}
