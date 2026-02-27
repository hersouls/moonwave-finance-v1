import {
  collection,
  doc,
  getDocs,
  writeBatch,
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
} from '@/lib/types'

type SyncableTable = 'members' | 'assetCategories' | 'assetItems' | 'dailyValues' | 'transactionCategories' | 'transactions'

function getUserDocPath(uid: string, tableName: SyncableTable, syncId: string): string {
  return `users/${uid}/${tableName}/${syncId}`
}

function getUserCollectionPath(uid: string, tableName: SyncableTable): string {
  return `users/${uid}/${tableName}`
}

async function uploadTable<T extends { syncId?: string }>(
  uid: string,
  tableName: SyncableTable,
  records: T[]
): Promise<void> {
  const batch = writeBatch(firestore)
  for (const record of records) {
    if (!record.syncId) continue
    const ref = doc(firestore, getUserDocPath(uid, tableName, record.syncId))
    const data = { ...record }
    delete (data as Record<string, unknown>).id
    batch.set(ref, data, { merge: true })
  }
  await batch.commit()
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

export async function fullUpload(uid: string): Promise<void> {
  useAuthStore.getState().setSyncStatus('syncing')
  try {
    const [members, assetCategories, assetItems, dailyValues, transactionCategories, transactions] = await Promise.all([
      db.members.toArray(),
      db.assetCategories.toArray(),
      db.assetItems.toArray(),
      db.dailyValues.toArray(),
      db.transactionCategories.toArray(),
      db.transactions.toArray(),
    ])

    // Ensure all records have syncIds
    const ensuredMembers = members.map(ensureSyncId)
    const ensuredAssetCategories = assetCategories.map(ensureSyncId)
    const ensuredAssetItems = assetItems.map(ensureSyncId)
    const ensuredDailyValues = dailyValues.map(ensureSyncId)
    const ensuredTransactionCategories = transactionCategories.map(ensureSyncId)
    const ensuredTransactions = transactions.map(ensureSyncId)

    await Promise.all([
      uploadTable(uid, 'members', ensuredMembers),
      uploadTable(uid, 'assetCategories', ensuredAssetCategories),
      uploadTable(uid, 'assetItems', ensuredAssetItems),
      uploadTable(uid, 'dailyValues', ensuredDailyValues),
      uploadTable(uid, 'transactionCategories', ensuredTransactionCategories),
      uploadTable(uid, 'transactions', ensuredTransactions),
    ])

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
    const [members, assetCategories, assetItems, dailyValues, transactionCategories, transactions] = await Promise.all([
      downloadTable<Member>(uid, 'members'),
      downloadTable<AssetCategory>(uid, 'assetCategories'),
      downloadTable<AssetItem>(uid, 'assetItems'),
      downloadTable<DailyValue>(uid, 'dailyValues'),
      downloadTable<TransactionCategory>(uid, 'transactionCategories'),
      downloadTable<Transaction>(uid, 'transactions'),
    ])

    // Clear and repopulate local DB
    await db.transaction('rw', [db.members, db.assetCategories, db.assetItems, db.dailyValues, db.transactionCategories, db.transactions], async () => {
      await db.members.clear()
      await db.assetCategories.clear()
      await db.assetItems.clear()
      await db.dailyValues.clear()
      await db.transactionCategories.clear()
      await db.transactions.clear()

      if (members.length > 0) await db.members.bulkAdd(members)
      if (assetCategories.length > 0) await db.assetCategories.bulkAdd(assetCategories)
      if (assetItems.length > 0) await db.assetItems.bulkAdd(assetItems)
      if (dailyValues.length > 0) await db.dailyValues.bulkAdd(dailyValues)
      if (transactionCategories.length > 0) await db.transactionCategories.bulkAdd(transactionCategories)
      if (transactions.length > 0) await db.transactions.bulkAdd(transactions)
    })

    useAuthStore.getState().setSyncStatus('synced')
    useAuthStore.getState().setLastSyncTime(new Date().toISOString())
  } catch (err) {
    console.error('Full download failed:', err)
    useAuthStore.getState().setSyncStatus('error')
  }
}

export async function syncOnLogin(uid: string): Promise<void> {
  // Check if cloud has data
  const colRef = collection(firestore, getUserCollectionPath(uid, 'members'))
  const snapshot = await getDocs(colRef)

  if (snapshot.empty) {
    // Cloud is empty, upload local data
    await fullUpload(uid)
  } else {
    // Cloud has data, download to local (cloud wins strategy for simplicity)
    await fullDownload(uid)
  }
}

let unsubscribers: Unsubscribe[] = []

export function startRealtimeSync(uid: string): void {
  stopRealtimeSync()

  const tables: SyncableTable[] = ['members', 'assetCategories', 'assetItems', 'dailyValues', 'transactionCategories', 'transactions']

  for (const tableName of tables) {
    const colRef = collection(firestore, getUserCollectionPath(uid, tableName))
    const unsub = onSnapshot(colRef, (snapshot) => {
      // Handle real-time updates from other devices
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'modified' || change.type === 'added') {
          // In a production app, we'd merge changes intelligently
          // For now, we just log that changes are detected
          console.debug(`[sync] ${tableName}: ${change.type}`, change.doc.id)
        }
      })
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
