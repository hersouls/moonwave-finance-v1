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
import { db } from '@/services/database'
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
} from '@/lib/types'

export type SyncableTable = 'members' | 'assetCategories' | 'assetItems' | 'dailyValues' | 'transactionCategories' | 'transactions' | 'budgets' | 'goals' | 'paymentMethodItems' | 'subscriptions'

const BATCH_LIMIT = 499

/** Strip undefined values from an object — Firestore rejects undefined fields */
function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const result = {} as Record<string, unknown>
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) result[key] = value
  }
  return result as T
}

function getUserCollectionPath(uid: string, tableName: SyncableTable): string {
  return `users/${uid}/${tableName}`
}

function getUserDocPath(uid: string, tableName: SyncableTable, syncId: string): string {
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
      delete data.id
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

export async function fullDownload(uid: string): Promise<void> {
  useAuthStore.getState().setSyncStatus('syncing')
  try {
    const [members, assetCategories, assetItems, dailyValues, transactionCategories, transactions, budgets, goals, paymentMethodItems, subscriptions] = await withRetry(() => Promise.all([
      downloadTable<Member>(uid, 'members'),
      downloadTable<AssetCategory>(uid, 'assetCategories'),
      downloadTable<AssetItem>(uid, 'assetItems'),
      downloadTable<DailyValue>(uid, 'dailyValues'),
      downloadTable<TransactionCategory>(uid, 'transactionCategories'),
      downloadTable<Transaction>(uid, 'transactions'),
      downloadTable<Budget>(uid, 'budgets'),
      downloadTable<FinancialGoal>(uid, 'goals'),
      downloadTable<PaymentMethodItem>(uid, 'paymentMethodItems'),
      downloadTable<Subscription>(uid, 'subscriptions'),
    ]))

    syncWritingCount++
    try {
      await db.transaction('rw', [db.members, db.assetCategories, db.assetItems, db.dailyValues, db.transactionCategories, db.transactions, db.budgets, db.goals, db.paymentMethodItems, db.subscriptions], async () => {
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

        if (members.length > 0) await db.members.bulkPut(members)
        if (assetCategories.length > 0) await db.assetCategories.bulkPut(assetCategories)
        if (assetItems.length > 0) await db.assetItems.bulkPut(assetItems)
        if (dailyValues.length > 0) await db.dailyValues.bulkPut(dailyValues)
        if (transactionCategories.length > 0) await db.transactionCategories.bulkPut(transactionCategories)
        if (transactions.length > 0) await db.transactions.bulkPut(transactions)
        if (budgets.length > 0) await db.budgets.bulkPut(budgets)
        if (goals.length > 0) await db.goals.bulkPut(goals)
        if (paymentMethodItems.length > 0) await db.paymentMethodItems.bulkPut(paymentMethodItems)
        if (subscriptions.length > 0) await db.subscriptions.bulkPut(subscriptions)
      })
    } finally {
      syncWritingCount = Math.max(0, syncWritingCount - 1)
    }

    useAuthStore.getState().setSyncStatus('synced')
    useAuthStore.getState().setLastSyncTime(new Date().toISOString())
  } catch (err) {
    console.error('Full download failed:', err)
    useAuthStore.getState().setSyncStatus('error')
  }
}

export async function syncOnLogin(uid: string): Promise<void> {
  const colRef = collection(firestore, getUserCollectionPath(uid, 'members'))
  const snapshot = await getDocs(colRef)

  if (snapshot.empty) {
    await fullUpload(uid, { reconcile: true })
  } else {
    await fullDownload(uid)
  }
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
    delete data.id
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
                const { ...updates } = cloudData
                await (localTable as typeof db.members).update(existing.id!, updates)
              }
            } else {
              await (localTable as typeof db.members).add(cloudData as Member)
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

export function startRealtimeSync(uid: string): void {
  stopRealtimeSync()
  currentSyncUid = uid

  const tables: SyncableTable[] = ['members', 'assetCategories', 'assetItems', 'dailyValues', 'transactionCategories', 'transactions', 'budgets', 'goals', 'paymentMethodItems', 'subscriptions']

  for (const tableName of tables) {
    subscribeTable(uid, tableName)
  }
}

export function stopRealtimeSync(): void {
  currentSyncUid = null
  for (const unsub of unsubscribers) {
    unsub()
  }
  unsubscribers = []
}
