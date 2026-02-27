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
} from '@/lib/types'

type SyncableTable = 'members' | 'assetCategories' | 'assetItems' | 'dailyValues' | 'transactionCategories' | 'transactions' | 'budgets' | 'goals'

const BATCH_LIMIT = 499

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
      const data = { ...record }
      delete (data as Record<string, unknown>).id
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

export async function fullUpload(uid: string): Promise<void> {
  useAuthStore.getState().setSyncStatus('syncing')
  try {
    await ensureAndPersistSyncIds()

    const [members, assetCategories, assetItems, dailyValues, transactionCategories, transactions, budgets, goals] = await Promise.all([
      db.members.toArray(),
      db.assetCategories.toArray(),
      db.assetItems.toArray(),
      db.dailyValues.toArray(),
      db.transactionCategories.toArray(),
      db.transactions.toArray(),
      db.budgets.toArray(),
      db.goals.toArray(),
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
    ]))

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
    const [members, assetCategories, assetItems, dailyValues, transactionCategories, transactions, budgets, goals] = await withRetry(() => Promise.all([
      downloadTable<Member>(uid, 'members'),
      downloadTable<AssetCategory>(uid, 'assetCategories'),
      downloadTable<AssetItem>(uid, 'assetItems'),
      downloadTable<DailyValue>(uid, 'dailyValues'),
      downloadTable<TransactionCategory>(uid, 'transactionCategories'),
      downloadTable<Transaction>(uid, 'transactions'),
      downloadTable<Budget>(uid, 'budgets'),
      downloadTable<FinancialGoal>(uid, 'goals'),
    ]))

    await db.transaction('rw', [db.members, db.assetCategories, db.assetItems, db.dailyValues, db.transactionCategories, db.transactions, db.budgets, db.goals], async () => {
      await db.members.clear()
      await db.assetCategories.clear()
      await db.assetItems.clear()
      await db.dailyValues.clear()
      await db.transactionCategories.clear()
      await db.transactions.clear()
      await db.budgets.clear()
      await db.goals.clear()

      if (members.length > 0) await db.members.bulkAdd(members)
      if (assetCategories.length > 0) await db.assetCategories.bulkAdd(assetCategories)
      if (assetItems.length > 0) await db.assetItems.bulkAdd(assetItems)
      if (dailyValues.length > 0) await db.dailyValues.bulkAdd(dailyValues)
      if (transactionCategories.length > 0) await db.transactionCategories.bulkAdd(transactionCategories)
      if (transactions.length > 0) await db.transactions.bulkAdd(transactions)
      if (budgets.length > 0) await db.budgets.bulkAdd(budgets)
      if (goals.length > 0) await db.goals.bulkAdd(goals)
    })

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
    await fullUpload(uid)
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
    const data = { ...record }
    delete (data as Record<string, unknown>).id
    batch.set(ref, data, { merge: true })
    await batch.commit()
  } catch (err) {
    console.error(`[sync] upload ${tableName}/${record.syncId} failed:`, err)
  }
}

// ─── Real-time Sync ───────────────────────────────────

let unsubscribers: Unsubscribe[] = []
let realtimeSyncPaused = false

export function pauseRealtimeSync() { realtimeSyncPaused = true }
export function resumeRealtimeSync() { realtimeSyncPaused = false }

type DexieTable = typeof db.members | typeof db.assetCategories | typeof db.assetItems |
  typeof db.dailyValues | typeof db.transactionCategories | typeof db.transactions |
  typeof db.budgets | typeof db.goals

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
  }
  return map[tableName]
}

export function startRealtimeSync(uid: string): void {
  stopRealtimeSync()

  const tables: SyncableTable[] = ['members', 'assetCategories', 'assetItems', 'dailyValues', 'transactionCategories', 'transactions', 'budgets', 'goals']

  for (const tableName of tables) {
    const colRef = collection(firestore, getUserCollectionPath(uid, tableName))
    const unsub = onSnapshot(colRef, async (snapshot) => {
      if (realtimeSyncPaused) return

      const localTable = getLocalTable(tableName)

      for (const change of snapshot.docChanges()) {
        const cloudData = change.doc.data()
        const syncId = cloudData.syncId as string | undefined

        if (!syncId) continue

        try {
          if (change.type === 'added' || change.type === 'modified') {
            // Check if record exists locally by syncId
            const existing = await (localTable as typeof db.members).where('syncId').equals(syncId).first()
            if (existing) {
              // Update only if cloud is newer
              const cloudUpdatedAt = cloudData.updatedAt as string
              if (cloudUpdatedAt && cloudUpdatedAt > (existing.updatedAt || '')) {
                const { ...updates } = cloudData
                await (localTable as typeof db.members).update(existing.id!, updates)
              }
            } else {
              // Add new record from cloud
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
    }, (err) => {
      console.error(`[sync] ${tableName} listener error:`, err)
    })
    unsubscribers.push(unsub)
  }
}

export function stopRealtimeSync(): void {
  for (const unsub of unsubscribers) {
    unsub()
  }
  unsubscribers = []
}
