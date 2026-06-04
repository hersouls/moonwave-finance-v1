import {
  collection,
  doc,
  getDocs,
  writeBatch,
  deleteDoc,
  onSnapshot,
  query,
  limit,
  type Unsubscribe,
} from 'firebase/firestore'
import { firestore } from '@/lib/firebase'
import { db, markSyncTransaction, runSyncWrite } from '@/services/database'
import { useAuthStore } from '@/stores/authStore'
import { getDeviceId } from '@/lib/deviceId'
import { canDeviceWrite } from '@/lib/writeGuard'
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
  InvestmentTrade,
  Dividend,
  AccountInterest,
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
    // 배치 단위 타임아웃: 대용량 테이블(dailyValues 등)의 전체 업로드가 단일
    // 예산에 걸려 통째로 실패하지 않도록, 멈춤 감지는 commit 하나 단위로 한다.
    await withTimeout(batch.commit(), SYNC_BATCH_TIMEOUT_MS, `${tableName} batch upload`)
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

/**
 * 네트워크 작업에 타임아웃을 건다. Firestore 쓰기는 오프라인·반쯤 끊긴 연결에서
 * resolve도 reject도 하지 않고 영원히 pending 될 수 있어(온라인 복귀 전까지), 타임아웃이
 * 없으면 동기화 함수가 'syncing'에 영구 고착된다(스피너 무한 회전 + useAutoSync 락 고착).
 * 타임아웃 시 reject → 호출자 catch가 'error'로 정리 → 다음 변경/온라인 복귀에 재시도.
 *
 * 타임아웃은 개별 쓰기/배치 단위로 건다 — 업로드 루프 전체에 단일 예산을 걸면
 * 대량 백로그(CSV 임포트, 가치 전망 수천 행)가 예산을 초과할 때마다 통째로
 * 실패해 같은 선두 레코드만 영원히 재업로드하는 wedge가 된다.
 */
const SYNC_WRITE_TIMEOUT_MS = 15_000   // 단일 문서 쓰기/삭제/톰스톤
const SYNC_BATCH_TIMEOUT_MS = 30_000   // 최대 499건 batch.commit
const MAX_CONSECUTIVE_UPLOAD_FAILURES = 3 // 연속 실패 시 회로 차단(오프라인 추정)

function isQuotaExhaustedError(err: unknown): boolean {
  return (err as { code?: string })?.code === 'resource-exhausted'
}

/**
 * Firestore/네트워크 오류를 사용자가 원인을 알 수 있는 한국어 메시지로 분류한다.
 * '동기화 오류'라는 라벨만으로는 쿼터 소진(요금제)·권한·오프라인을 구분할 수
 * 없어 사용자가 디버깅할 수 없었다 — UI는 이 메시지를 라벨 아래에 함께 보여준다.
 */
export function classifySyncError(err: unknown): string {
  const code = (err as { code?: string })?.code
  if (code === 'resource-exhausted') {
    return '클라우드 사용량 한도 초과 — 한도가 리셋되면 자동으로 다시 동기화됩니다.'
  }
  if (code === 'permission-denied' || code === 'unauthenticated') {
    return '클라우드 접근 권한 오류 — 로그아웃 후 다시 로그인해 보세요.'
  }
  const msg = err instanceof Error ? err.message : ''
  if (msg.includes('timed out')) {
    return '네트워크 응답 없음 — 연결 상태를 확인하세요. 다음 변경 시 다시 시도합니다.'
  }
  return '동기화 중 오류가 발생했습니다 — 다음 변경 또는 재접속 시 다시 시도합니다.'
}
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`[sync] ${label} timed out after ${ms}ms (offline?)`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => { if (timer) clearTimeout(timer) })
}

// Ensure syncIds exist locally and persist them back to IndexedDB.
// 15개 동기화 테이블 전체 — 누락된 테이블의 syncId 없는 레코드는 fullUpload의
// ensureSyncId가 업로드 때마다 새 UUID를 만들어 클라우드 중복을 쌓는다.
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
    { table: db.investmentTrades, name: 'investmentTrades' },
    { table: db.dividends, name: 'dividends' },
    { table: db.accountInterests, name: 'accountInterests' },
    { table: db.merchantAliases, name: 'merchantAliases' },
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
  if (!canDeviceWrite()) {
    console.info('[sync] full upload skipped: 이 기기는 읽기 전용입니다 (설정 → 시스템 → 기기 쓰기)')
    return
  }
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

    // 전체 업로드에 단일 타임아웃을 걸지 않는다 — 수년치 데이터는 60초를 정상적으로
    // 초과할 수 있다. 멈춤 감지는 uploadTable 내부의 배치 단위 타임아웃이 담당.
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
    useAuthStore.getState().setSyncError(classifySyncError(err))
    // 호출자(manualUpload 토스트)가 성공/실패를 구분할 수 있도록 전파한다.
    throw err
  }
}

// ─── Full Download (preserved for manual sync) ───────────
export async function fullDownload(uid: string): Promise<void> {
  useAuthStore.getState().setSyncStatus('syncing')
  try {
    const [members, assetCategories, assetItems, dailyValues, transactionCategories, transactions, budgets, goals, paymentMethodItems, subscriptions, loans, merchantAliases, investmentTrades, dividends, accountInterests] = await withRetry(() => Promise.all([
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
      downloadTable<Record<string, unknown>>(uid, 'investmentTrades'),
      downloadTable<Record<string, unknown>>(uid, 'dividends'),
      downloadTable<Record<string, unknown>>(uid, 'accountInterests'),
    ]))

    // Strip cloud-only fields (__deviceId, __schemaV, *_syncId companions)
    // in place so the Dexie schema isn't polluted by transport metadata.
    for (const arr of [members, assetCategories, assetItems, dailyValues, transactionCategories, transactions, budgets, goals, paymentMethodItems, subscriptions, loans, merchantAliases, investmentTrades, dividends, accountInterests]) {
      for (const r of arr) {
        for (const k of Object.keys(r)) {
          if (INTERNAL_CLOUD_FIELDS.has(k) || (k.endsWith('_syncId') && k !== 'syncId')) {
            delete (r as Record<string, unknown>)[k]
          }
        }
      }
    }

    await db.transaction('rw', [db.members, db.assetCategories, db.assetItems, db.dailyValues, db.transactionCategories, db.transactions, db.budgets, db.goals, db.paymentMethodItems, db.subscriptions, db.loans, db.merchantAliases, db.investmentTrades, db.dividends, db.accountInterests], async () => {
        markSyncTransaction()
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
        await db.investmentTrades.clear()
        await db.dividends.clear()
        await db.accountInterests.clear()

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

        // ── 투자 3종 (depends on members) ──
        for (const rec of investmentTrades) {
          delete rec.id
          remapFkField(rec, 'memberId', memberIdMap)
          await db.investmentTrades.add(rec as unknown as InvestmentTrade)
        }
        for (const rec of dividends) {
          delete rec.id
          remapFkField(rec, 'memberId', memberIdMap)
          await db.dividends.add(rec as unknown as Dividend)
        }
        for (const rec of accountInterests) {
          delete rec.id
          remapFkField(rec, 'memberId', memberIdMap)
          await db.accountInterests.add(rec as unknown as AccountInterest)
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

    useAuthStore.getState().setSyncStatus('synced')
    useAuthStore.getState().setLastSyncTime(new Date().toISOString())
  } catch (err) {
    console.error('Full download failed:', err)
    useAuthStore.getState().setSyncStatus('error')
    useAuthStore.getState().setSyncError(classifySyncError(err))
    throw err
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

/** 톰스톤 일괄 업로드 — incrementalUpload의 배치 삭제 경로용. THROWS on failure. */
async function uploadTombstonesBatch(
  uid: string,
  entries: Array<{ tableName: string; syncId: string; deletedAt: string }>
): Promise<void> {
  for (let i = 0; i < entries.length; i += BATCH_LIMIT) {
    const chunk = entries.slice(i, i + BATCH_LIMIT)
    const batch = writeBatch(firestore)
    for (const e of chunk) {
      const tombstoneId = encodeDocId(`${e.tableName}_${e.syncId}`)
      const ref = doc(firestore, `users/${uid}/syncTombstones/${tombstoneId}`)
      batch.set(ref, toCloudPayload({ tableName: e.tableName, syncId: e.syncId, deletedAt: e.deletedAt }))
    }
    await withTimeout(batch.commit(), SYNC_BATCH_TIMEOUT_MS, 'tombstone batch upload')
  }
}

export async function incrementalUpload(uid: string): Promise<void> {
  if (!canDeviceWrite()) {
    // 읽기전용 기기: 클라우드 쓰기 금지. 조용한 no-op은 "동기화가 안 된다"
    // 디버깅을 어렵게 하므로 이유를 남긴다.
    console.info('[sync] incremental upload skipped: 이 기기는 읽기 전용입니다 (설정 → 시스템 → 기기 쓰기)')
    return
  }
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

    // 테이블별 배치 업로드 + 그룹 단위 서킷브레이커. 행마다 commit 1회를 치던
    // 기존 방식은 대량 백로그(CSV 임포트, 가치 전망 수천 행)에서 행×왕복으로
    // 비현실적으로 느렸다 — uploadTable의 499건 writeBatch로 묶는다.
    // 일시적 실패는 그 그룹만 pending으로 남기고 전진하되, 연속 N회 실패
    // (오프라인 추정)면 중단해 헛수고를 멈춘다.
    let consecutiveFailures = 0
    let failedGroups = 0
    let lastGroupError: unknown = null
    try {
      // ── 업서트: 테이블별 그룹 → 로컬 일괄 조회 → 배치 업로드 ──
      const upsertsByTable = new Map<SyncableTable, string[]>()
      for (const change of deduped) {
        if (change.operation === 'delete') continue
        const t = change.tableName as SyncableTable
        if (!upsertsByTable.has(t)) upsertsByTable.set(t, [])
        upsertsByTable.get(t)!.push(change.syncId)
      }
      for (const [tableName, syncIds] of upsertsByTable) {
        try {
          const localTable = getLocalTable(tableName)
          const records = await (localTable as typeof db.members)
            .where('syncId').anyOf(syncIds).toArray()
          await uploadTable(uid, tableName, records) // 내부에서 배치 + 배치별 타임아웃
          // 로컬에서 이미 사라진(삭제된) syncId도 더 할 일이 없으므로 처리 완료
          for (const sid of syncIds) successKeys.add(`${tableName}:${sid}`)
          consecutiveFailures = 0
        } catch (err) {
          console.error(`[sync] incremental upload ${tableName} (${syncIds.length}) failed:`, err)
          lastGroupError = err
          consecutiveFailures++
          failedGroups++
          // 쿼터 소진은 모든 그룹이 같은 이유로 실패한다 — 나머지 그룹 시도는
          // 헛수고이므로 즉시 중단한다 (finally가 성공분 마킹은 보존).
          if (isQuotaExhaustedError(err)) throw err
          if (consecutiveFailures >= MAX_CONSECUTIVE_UPLOAD_FAILURES) {
            throw new Error(`[sync] aborting incremental upload after ${consecutiveFailures} consecutive failures (offline?)`)
          }
        }
      }

      // ── 삭제: 테이블별 배치 삭제 + 톰스톤 배치 업로드 ──
      const deletesByTable = new Map<SyncableTable, SyncChangeLogEntry[]>()
      for (const change of deduped) {
        if (change.operation !== 'delete') continue
        const t = change.tableName as SyncableTable
        if (!deletesByTable.has(t)) deletesByTable.set(t, [])
        deletesByTable.get(t)!.push(change)
      }
      for (const [tableName, entries] of deletesByTable) {
        try {
          await deleteMultipleFromCloud(uid, tableName, entries.map(e => e.syncId))
          await uploadTombstonesBatch(uid, entries.map(e => ({
            tableName, syncId: e.syncId, deletedAt: e.timestamp,
          })))
          for (const e of entries) successKeys.add(`${tableName}:${e.syncId}`)
          consecutiveFailures = 0
        } catch (err) {
          console.error(`[sync] incremental delete ${tableName} (${entries.length}) failed:`, err)
          lastGroupError = err
          consecutiveFailures++
          failedGroups++
          if (isQuotaExhaustedError(err)) throw err
          if (consecutiveFailures >= MAX_CONSECUTIVE_UPLOAD_FAILURES) {
            throw new Error(`[sync] aborting incremental upload after ${consecutiveFailures} consecutive failures (offline?)`)
          }
        }
      }
    } finally {
      // 어떤 중단 경로에서도 성공분은 processed 처리해 진행을 보존한다 — 다음
      // 시도는 남은 항목부터 이어간다. (기존: 루프 전체 타임아웃 시 이 블록까지
      // 통째로 스킵되어 대량 백로그가 영원히 처음부터 재시도되는 wedge였음)
      const successIds = pendingChanges
        .filter(c => successKeys.has(`${c.tableName}:${c.syncId}`))
        .map(c => c.id!)
        .filter(Boolean)
      if (successIds.length > 0) {
        await db.syncChangeLog.where('id').anyOf(successIds).modify({ processed: 1 })
      }
    }

    // GC: remove processed entries older than 7 days
    const gcCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    await db.syncChangeLog
      .where('processed').equals(1)
      .filter(c => c.timestamp < gcCutoff)
      .delete()

    if (failedGroups > 0) {
      // 일부 그룹이 실패해 pending으로 남음 — '동기화됨'으로 거짓 표시하지
      // 않는다. 다음 변경/online 이벤트의 재시도가 남은 항목을 처리한다.
      useAuthStore.getState().setSyncStatus('error')
      useAuthStore.getState().setSyncError(classifySyncError(lastGroupError))
      return
    }
    useAuthStore.getState().setSyncStatus('synced')
    useAuthStore.getState().setLastSyncTime(new Date().toISOString())
  } catch (err) {
    console.error('[sync] incremental upload failed:', err)
    useAuthStore.getState().setSyncStatus('error')
    useAuthStore.getState().setSyncError(classifySyncError(err))
  } finally {
    // 표시 카운트를 실제 DB 상태로 재계산 — 기존에는 로그인 시 1회만 계산되어
    // 업로드가 성공해도 'N건 대기 중'이 화면에 영구 고정되는 거짓 표시였다.
    void useAuthStore.getState().updatePendingCount()
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
      await runSyncWrite([localTable], async () => {
        for (const { id, syncId } of adoptions) {
          await (localTable as typeof db.members).update(id, { syncId } as Partial<Member>)
          // Reflect the change in the in-memory copy used below
          const ref = localRecords.find(r => (r as { id?: number }).id === id)
          if (ref) (ref as { syncId?: string }).syncId = syncId
        }
      })
    }
  }

  const localMap = new Map<string, { record: Record<string, unknown>; id: number }>()
  for (const rec of localRecords) {
    if (rec.syncId) localMap.set(rec.syncId, { record: rec as unknown as Record<string, unknown>, id: rec.id! })
  }

  // 마커 트랜잭션으로 인제스트 — 이 긴 루프가 도는 동안 끼어드는 사용자
  // 쓰기(별도 트랜잭션)는 정상적으로 changelog에 기록된다. 스코프에는 쓰기
  // 대상 외에 콜백이 읽는 syncTombstones와 FK 부모 테이블도 포함해야 한다.
  await runSyncWrite([localTable, db.syncTombstones, ...getRefTables(tableName)], async () => {
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
  })

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

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data() as { tableName: string; syncId: string; deletedAt: string }
    if (!ALL_TABLES.includes(data.tableName as SyncableTable)) continue

    const localTable = getLocalTable(data.tableName as SyncableTable)
    await runSyncWrite([localTable], async () => {
      const existing = await (localTable as typeof db.members)
        .where('syncId').equals(data.syncId).first()

      if (existing) {
        const localUpdatedAt = (existing as unknown as Record<string, unknown>).updatedAt as string || ''
        if (data.deletedAt > localUpdatedAt) {
          await (localTable as typeof db.members).delete(existing.id!)
        }
      }
    })
  }
}

async function uploadLocalTombstones(uid: string): Promise<void> {
  if (!canDeviceWrite()) return  // read-only device: never write to the cloud
  const localTombstones = await db.syncTombstones.toArray()
  for (const tombstone of localTombstones) {
    try {
      await withTimeout(
        uploadTombstone(uid, tombstone.tableName, tombstone.syncId, tombstone.deletedAt),
        SYNC_WRITE_TIMEOUT_MS, `tombstone ${tombstone.tableName}/${tombstone.syncId}`)
      if (ALL_TABLES.includes(tombstone.tableName as SyncableTable)) {
        await withTimeout(
          deleteFromCloud(uid, tombstone.tableName as SyncableTable, tombstone.syncId),
          SYNC_WRITE_TIMEOUT_MS, `delete ${tombstone.tableName}/${tombstone.syncId}`)
      }
    } catch (err) {
      console.error(`[sync] upload tombstone ${tombstone.tableName}/${tombstone.syncId} failed:`, err)
    }
  }
}

async function garbageCollectTombstones(uid: string): Promise<void> {
  if (!canDeviceWrite()) return  // read-only device: skip cloud + local tombstone GC
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

/**
 * 클라우드에 데이터가 하나라도 있는가 — 15개 컬렉션 전체를 limit(1)로 프로브.
 * members 컬렉션 하나만 보고 판정하면, members만 비어 있는 계정에서 첫 로그인
 * 기기가 "클라우드 비어 있음 → fullUpload(reconcile)"를 타며 reconcileOrphans가
 * 다른 기기가 올린 클라우드 데이터 전체를 고아로 오인해 삭제한다.
 */
async function cloudHasAnyData(uid: string): Promise<boolean> {
  const probes = await Promise.all(ALL_TABLES.map(async (tableName) => {
    const colRef = collection(firestore, getUserCollectionPath(uid, tableName))
    const snap = await getDocs(query(colRef, limit(1)))
    return !snap.empty
  }))
  return probes.some(Boolean)
}

export async function mergeOnLogin(uid: string): Promise<void> {
  useAuthStore.getState().setSyncStatus('syncing')
  try {
    if (!(await cloudHasAnyData(uid))) {
      // First time: upload everything (write-capable devices only).
      if (canDeviceWrite()) {
        await fullUpload(uid, { reconcile: true })
      } else {
        // 읽기전용 + 빈 클라우드: 업로드할 게 없음 → 동기화 완료로 정리(스피너 멈춤).
        // (fullUpload는 읽기전용에서 'syncing' set 전에 no-op 반환하므로 직접 종결해야 함)
        useAuthStore.getState().setSyncStatus('synced')
        useAuthStore.getState().setLastSyncTime(new Date().toISOString())
      }
      return
    }

    // Download ALL cloud data in parallel — 15개 동기화 테이블 전체.
    // (이전에는 investmentTrades/dividends/accountInterests 3개가 빠져 있어
    // 새 기기 로그인 시 투자 데이터가 실시간 리스너로만 우연히 내려왔다)
    const [
      cloudMembers, cloudAssetCategories, cloudAssetItems, cloudDailyValues,
      cloudTransactionCategories, cloudTransactions, cloudBudgets, cloudGoals,
      cloudPaymentMethodItems, cloudSubscriptions, cloudLoans, cloudMerchantAliases,
      cloudInvestmentTrades, cloudDividends, cloudAccountInterests,
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
      downloadTable<Record<string, unknown>>(uid, 'investmentTrades'),
      downloadTable<Record<string, unknown>>(uid, 'dividends'),
      downloadTable<Record<string, unknown>>(uid, 'accountInterests'),
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
    // 투자 3종 — memberId FK만 가지므로 members 이후면 안전
    await mergeTableWithRemap('investmentTrades', cloudInvestmentTrades)
    await mergeTableWithRemap('dividends', cloudDividends)
    await mergeTableWithRemap('accountInterests', cloudAccountInterests)

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
    useAuthStore.getState().setSyncError(classifySyncError(err))
  } finally {
    // 안전망: 어떤 early-return 경로에서도 'syncing'이 영구 고착되지 않도록 정리.
    // (정상 종료는 이미 'synced', 실패는 'error'로 빠져 있어 영향 없음)
    if (useAuthStore.getState().syncStatus === 'syncing') {
      useAuthStore.getState().setSyncStatus('synced')
    }
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

// Delete a single document from Firestore.
//
// THROWS on failure — callers must handle it. incrementalUpload relies on the
// throw to keep the change-log entry pending (processed=0) for a later retry;
// swallowing here used to make every failure look like success, permanently
// marking unsynced deletes as processed.
export async function deleteFromCloud(uid: string, tableName: SyncableTable, syncId: string): Promise<void> {
  if (!canDeviceWrite()) return  // read-only device: never write to the cloud
  await deleteDoc(doc(firestore, getUserDocPath(uid, tableName, syncId)))
}

// Delete multiple documents from Firestore (batch). THROWS on failure — the
// change-log/tombstone entries the deleting hooks queued stay pending, so
// incrementalUpload retries the deletion later.
export async function deleteMultipleFromCloud(uid: string, tableName: SyncableTable, syncIds: string[]): Promise<void> {
  if (!canDeviceWrite()) return  // read-only device: never write to the cloud
  if (syncIds.length === 0) return
  for (let i = 0; i < syncIds.length; i += BATCH_LIMIT) {
    const chunk = syncIds.slice(i, i + BATCH_LIMIT)
    const batch = writeBatch(firestore)
    for (const syncId of chunk) {
      batch.delete(doc(firestore, getUserDocPath(uid, tableName, syncId)))
    }
    await withTimeout(batch.commit(), SYNC_BATCH_TIMEOUT_MS, `${tableName} batch delete`)
  }
}

// Upload a single record to Firestore. Full-doc replace; see uploadTable.
//
// THROWS on failure — incrementalUpload relies on the throw to keep the
// change-log entry pending (processed=0) for a later retry; swallowing here
// used to make every failed upload look like success.
export async function uploadSingleRecord<T extends { syncId?: string }>(
  uid: string,
  tableName: SyncableTable,
  record: T
): Promise<void> {
  if (!canDeviceWrite()) return  // read-only device: never write to the cloud
  if (!record.syncId) return
  const batch = writeBatch(firestore)
  const ref = doc(firestore, getUserDocPath(uid, tableName, record.syncId))
  const enriched = { ...record } as Record<string, unknown>
  await addFkSyncIds(tableName, enriched)
  batch.set(ref, toCloudPayload(enriched))
  await batch.commit()
}

// ─── Real-time Sync ───────────────────────────────────

let unsubscribers: Unsubscribe[] = []
let realtimeSyncPaused = false

// 테이블별 마지막 스냅샷 시각. 전역 단일 타임스탬프를 쓰면 살아 있는 리스너
// 하나(예: tombstones)가 죽은 리스너의 staleness를 가려 헬스체크가 영원히
// 복구하지 못한다 — 최솟값(가장 오래된 테이블)으로 판정해야 한다.
// 구독 시점을 baseline으로 깔아, 초기 스냅샷 로딩 중을 stale로 오인하지 않는다.
const lastSnapshotByTable = new Map<string, number>()

export function pauseRealtimeSync() { realtimeSyncPaused = true }
export function resumeRealtimeSync() { realtimeSyncPaused = false }
/**
 * 가장 오래된(가장 stale한) 리스너의 마지막 스냅샷 시각(ms epoch).
 * 구독이 없으면 0 — 호출부는 Infinity age로 취급한다.
 */
export function getLastSnapshotAt() {
  if (lastSnapshotByTable.size === 0) return 0
  let min = Infinity
  for (const v of lastSnapshotByTable.values()) min = Math.min(min, v)
  return min
}

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
    for (const { table, localId, field } of queue) {
      try {
        await runSyncWrite([getLocalTable(table)], async () => {
          await (getLocalTable(table) as typeof db.members).update(localId, { [field]: refLocalId } as never)
        })
        tablesTouched.add(table)
      } catch (err) {
        console.error(`[sync] flush deferred FK ${table}#${localId}.${field} failed:`, err)
      }
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

/** tableName의 FK 부모 테이블들 — 인제스트 트랜잭션 스코프(읽기)용. */
function getRefTables(tableName: SyncableTable): DexieTable[] {
  const defs = TABLE_FK_DEFS[tableName]
  if (!defs) return []
  return [...new Set(defs.map((d) => getLocalTable(d.refTable)))]
}

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
      try {
        await runSyncWrite([localTable], async () => {
          await (localTable as typeof db.members).update(localId, updates)
        })
      } catch (err) {
        console.error(`[sync] FK retry ${tableName}#${localId} failed:`, err)
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
 *
 * 시계 오차 허용(TDL 패턴, 창은 더 보수적으로): updatedAt은 기기 로컬 시계로
 * 찍히므로 기기 간 오차가 있다. ±500ms 이내의 차이는 '동시 기록'으로 보고
 * deviceId로 결정적으로 판정한다 — 그렇지 않으면 시계 오차만큼 어긋난 동시
 * 기록이 기기마다 다르게 판정되어 발산한다. 창을 좁게 잡은 이유: 가계부는
 * 사용자가 2초 안에 같은 레코드를 연속 수정하는 일이 흔한데, 넓은 창은 그
 * '진짜 나중' 수정을 deviceId 순서로 패배시킬 수 있다. 톰스톤 비교
 * (deletedAt > updatedAt)에는 이 허용 창이 없다는 비대칭에 유의.
 */
const CLOCK_SKEW_TOLERANCE_MS = 500

/** @internal Exported for unit tests (LWW + 시계오차 + echo 억제 회귀). */
export function shouldApplyCloudUpdate(
  cloudUpdatedAt: string | undefined,
  cloudDeviceId: string | undefined,
  localUpdatedAt: string | undefined,
): boolean {
  if (!cloudUpdatedAt) return false
  const cAt = cloudUpdatedAt
  const lAt = localUpdatedAt || ''

  const tiebreak = () => {
    // Echo of our own write (same deviceId) returns false. Higher deviceId wins.
    const peer = cloudDeviceId || ''
    const self = getDeviceId()
    return peer !== '' && peer !== self && peer > self
  }

  const cMs = Date.parse(cAt)
  const lMs = lAt ? Date.parse(lAt) : NaN
  if (!Number.isNaN(cMs) && !Number.isNaN(lMs) && Math.abs(cMs - lMs) <= CLOCK_SKEW_TOLERANCE_MS) {
    return tiebreak()
  }

  if (cAt > lAt) return true
  if (cAt < lAt) return false
  return tiebreak()
}

// 인제스트 트랜잭션 청크 크기 — 초기 스냅샷(수천 docChanges)을 단일 rw
// 트랜잭션으로 처리하면 그 테이블에 대한 사용자 쓰기가 전체 기간 동안 직렬
// 대기한다. 청크 단위로 쪼개 쓰기 락 점유를 짧게 유지한다(청크 사이에 사용자
// 쓰기가 끼어들 수 있고, 그 쓰기는 마커가 없으므로 정상적으로 changelog에
// 기록된다). 원자성은 청크 단위로 낮아지지만 실시간 경로는 다음 스냅샷이
// 수습하므로 수용 가능한 트레이드오프.
const INGEST_CHUNK_SIZE = 300

function subscribeTable(uid: string, tableName: SyncableTable, generation: number, retryCount = 0): void {
  const colRef = collection(firestore, getUserCollectionPath(uid, tableName))
  let hadSnapshot = false
  const unsub = onSnapshot(colRef, { includeMetadataChanges: true }, async (snapshot) => {
    hadSnapshot = true
    // 서버가 확인한 스냅샷만 staleness 타이머를 리셋한다 — persistentLocalCache는
    // 재구독 직후 캐시 전용 스냅샷(fromCache=true)을 즉시 발화하는데, 이것까지
    // 신선함으로 치면 '캐시만 살아있는 죽은 서버 채널'을 헬스체크가 못 잡는다.
    if (!snapshot.metadata.fromCache) {
      lastSnapshotByTable.set(tableName, Date.now())
    }
    if (realtimeSyncPaused) return

    const docChanges = snapshot.docChanges()
    if (docChanges.length === 0) return // metadata-only 발화 등

    const localTable = getLocalTable(tableName)
    // Records whose parent FK resolved successfully (or didn't need resolving)
    // — collected so we can flush any children pending on them.
    const settledParents: Array<{ syncId: string; cloudId?: number; localId: number }> = []
    // Records we actually wrote locally. We notify the UI only on real changes —
    // not on echoes of our own uploads (LWW-skipped), which would otherwise storm
    // `fin-sync-update` during a bulk upload and flicker every consumer.
    let appliedCount = 0

    // 마커 트랜잭션으로 인제스트 — 전역 플래그와 달리, 스냅샷 적용이 도는
    // 동안 끼어드는 사용자 쓰기(별도 트랜잭션)가 changelog에 정상 기록된다.
    try {
      for (let chunkStart = 0; chunkStart < docChanges.length; chunkStart += INGEST_CHUNK_SIZE) {
      const chunk = docChanges.slice(chunkStart, chunkStart + INGEST_CHUNK_SIZE)
      await runSyncWrite([localTable, ...getRefTables(tableName)], async () => {
      for (const change of chunk) {
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
              appliedCount++
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
              appliedCount++
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
              appliedCount++
            }
          }
        } catch (err) {
          console.error(`[sync] real-time ${tableName} ${change.type} error:`, err)
        }
      }
      })
      }
    } catch (err) {
      // 트랜잭션 자체가 abort된 드문 경우 — 다음 스냅샷/재구독이 수습한다.
      console.error(`[sync] real-time ${tableName} ingest transaction failed:`, err)
    }

    // Flush any children that were waiting on parents we just settled.
    for (const p of settledParents) {
      await flushPendingChildren(tableName, p.syncId, p.cloudId, p.localId)
    }

    if (appliedCount > 0) {
      window.dispatchEvent(new CustomEvent('fin-sync-update', { detail: { table: tableName } }))
    }
  }, (err) => {
    console.error(`[sync] ${tableName} listener error:`, err)
    // 무한 재연결 (지수 백오프, 최대 30초). 기존의 5회 상한은 토큰 만료 등
    // 장시간 장애 후 리스너가 영구 사망한 채 방치되는 원인이었다 — 상한을
    // 없애되 generation 가드로 stopRealtimeSync 이후의 유령 재구독은 차단.
    // 한 번이라도 스냅샷을 받은 적 있는 리스너의 장애는 새 장애로 보고
    // 백오프를 처음부터 다시 시작한다.
    if (syncGeneration === generation) {
      const nextRetry = hadSnapshot ? 0 : retryCount + 1
      const delay = Math.min(Math.pow(2, nextRetry) * 1000, 30000)
      console.log(`[sync] retrying ${tableName} listener in ${delay}ms`)
      setTimeout(() => {
        if (syncGeneration === generation) {
          subscribeTable(uid, tableName, generation, nextRetry)
        }
      }, delay)
    }
  })
  unsubscribers.push(unsub)
}

function subscribeTombstones(uid: string, generation: number, retryCount = 0): void {
  const colRef = collection(firestore, `users/${uid}/syncTombstones`)
  let hadSnapshot = false
  const unsub = onSnapshot(colRef, { includeMetadataChanges: true }, async (snapshot) => {
    hadSnapshot = true
    // 서버 확인 스냅샷만 staleness 리셋 — subscribeTable과 동일한 이유.
    if (!snapshot.metadata.fromCache) {
      lastSnapshotByTable.set('__tombstones', Date.now())
    }
    if (realtimeSyncPaused) return

    for (const change of snapshot.docChanges()) {
      if (change.type !== 'added') continue

      const data = change.doc.data() as { tableName: string; syncId: string; deletedAt: string }
      if (!ALL_TABLES.includes(data.tableName as SyncableTable)) continue

      try {
        const localTable = getLocalTable(data.tableName as SyncableTable)
        await runSyncWrite([localTable], async () => {
          const existing = await (localTable as typeof db.members)
            .where('syncId').equals(data.syncId).first()
          if (existing) {
            // LWW 검사 — applyCloudTombstones와 동일. 재구독 초기 스냅샷은
            // 과거 톰스톤 전부를 'added'로 재생하므로, 무조건 삭제하면 삭제
            // 이후 같은 syncId로 갱신/복원된 레코드를 포그라운드 복귀마다
            // 다시 지워버린다.
            const localUpdatedAt = (existing as unknown as Record<string, unknown>).updatedAt as string || ''
            if (data.deletedAt && data.deletedAt > localUpdatedAt) {
              await (localTable as typeof db.members).delete(existing.id!)
            }
          }
        })
      } catch (err) {
        console.error(`[sync] tombstone apply ${data.tableName}/${data.syncId} error:`, err)
      }
    }

    if (snapshot.docChanges().length > 0) {
      window.dispatchEvent(new CustomEvent('fin-sync-update', { detail: { table: 'tombstones' } }))
    }
  }, (err) => {
    console.error('[sync] tombstones listener error:', err)
    if (syncGeneration === generation) {
      const nextRetry = hadSnapshot ? 0 : retryCount + 1
      const delay = Math.min(Math.pow(2, nextRetry) * 1000, 30000)
      console.log(`[sync] retrying tombstones listener in ${delay}ms`)
      setTimeout(() => {
        if (syncGeneration === generation) {
          subscribeTombstones(uid, generation, nextRetry)
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
  const gen = syncGeneration

  // 구독 시점을 staleness baseline으로 깐다 — 초기 스냅샷이 아직 안 온
  // 테이블이 즉시 stale(Infinity age)로 판정되어 재시작 루프가 돌지 않게.
  const now = Date.now()
  for (const tableName of ALL_TABLES) {
    lastSnapshotByTable.set(tableName, now)
    subscribeTable(uid, tableName, gen)
  }

  // Also subscribe to tombstones for cross-device delete propagation
  lastSnapshotByTable.set('__tombstones', now)
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
  lastSnapshotByTable.clear()
}
