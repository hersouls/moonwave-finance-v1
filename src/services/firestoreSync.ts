import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
  deleteDoc,
  onSnapshot,
  query,
  limit,
  where,
  serverTimestamp,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore'
import { firestore } from '@/lib/firebase'
import { db, markSyncTransaction, runSyncWrite, SYNCABLE_TABLE_NAMES, type SyncableTableName } from '@/services/database'
import { getSyncCheckpoint, advanceSyncCheckpoint, type SyncCheckpointMap } from '@/services/syncCheckpoint'
import {
  DV_BUNDLE_COLLECTION,
  buildBundlePatches,
  buildFullBundles,
  explodeBundleDoc,
} from '@/services/dailyValueBundles'
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

// SyncableTable 유니온과 ALL_TABLES는 database.ts의 단일 출처(SYNCABLE_TABLES)에서 파생한다.
export type SyncableTable = SyncableTableName

const BATCH_LIMIT = 499
const ALL_TABLES: SyncableTable[] = [...SYNCABLE_TABLE_NAMES]

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
const INTERNAL_CLOUD_FIELDS = new Set(['__deviceId', '__schemaV', '__uploadedAt'])

/** Builds the outbound cloud payload: drop undefined, stamp deviceId + schema version. */
function toCloudPayload<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue
    out[key] = value
  }
  out.__deviceId = getDeviceId()
  out.__schemaV = CLOUD_SCHEMA_VERSION
  // 서버가 찍는 업로드 시각 — 델타 머지(downloadTable의 sinceMs)의 기준.
  // 클라이언트 시계가 아니므로 기기 시계 오차로 문서를 놓칠 수 없다.
  out.__uploadedAt = serverTimestamp()
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

export async function downloadTable<T>(
  uid: string,
  tableName: SyncableTable,
  sinceMs?: number | null,
): Promise<T[]> {
  const colRef = collection(firestore, getUserCollectionPath(uid, tableName))
  // 델타 모드: 마지막 머지 이후 서버에 업로드된 문서만 읽는다. 경계는 '>='로
  // 겹치게 잡아(동일 타임스탬프 문서 재다운로드) 누락 가능성을 없앤다 —
  // 머지는 멱등 LWW라 중복 적용이 안전하다. __uploadedAt이 없는 레거시
  // 문서는 range 쿼리에 매칭되지 않는데, 그 문서들은 베이스라인(전량) 머지
  // 때 이미 로컬에 있으므로 다시 읽을 필요가 없다.
  const ref = sinceMs != null
    ? query(colRef, where('__uploadedAt', '>=', Timestamp.fromMillis(sinceMs)))
    : colRef
  const snapshot = await getDocs(ref)
  return snapshot.docs.map(d => d.data() as T)
}

/** 다운로드 결과에서 가장 최신 __uploadedAt(서버 시각, ms)을 찾는다. 없으면 0. */
function maxUploadedAtMs(records: Array<Record<string, unknown>>): number {
  let max = 0
  for (const r of records) {
    const ts = r.__uploadedAt as { toMillis?: () => number } | null | undefined
    if (ts && typeof ts.toMillis === 'function') {
      const ms = ts.toMillis()
      if (ms > max) max = ms
    }
  }
  return max
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
    // 장시간 세션의 기기가 다른 기기의 purge 이후 fullUpload를 누르면 stale한
    // legacyDvActive=true로 레거시 12k 문서를 부활시킨다 — 마커를 재확인한다.
    await refreshDvMigrationState(uid)

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
      // 레거시 per-row dailyValues는 정리(purge) 전까지만 — 구버전 기기의
      // 읽기 호환용. 신버전 표현은 아래 uploadAllDvBundles가 담당한다.
      legacyDvActive
        ? uploadTable(uid, 'dailyValues', dailyValues.filter(r => r.source !== 'projected').map(ensureSyncId))
        : Promise.resolve(),
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

    // 일별가치의 신버전 클라우드 표현 — 자산×월 번들 (완전한 진실, 통째 set)
    await withRetry(() => uploadAllDvBundles(uid))

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
    await refreshDvMigrationState(uid)
    const [members, assetCategories, assetItems, dailyValues, transactionCategories, transactions, budgets, goals, paymentMethodItems, subscriptions, loans, merchantAliases, investmentTrades, dividends, accountInterests, dvBundles] = await withRetry(() => Promise.all([
      downloadTable<Record<string, unknown>>(uid, 'members'),
      downloadTable<Record<string, unknown>>(uid, 'assetCategories'),
      downloadTable<Record<string, unknown>>(uid, 'assetItems'),
      legacyDvActive
        ? downloadTable<Record<string, unknown>>(uid, 'dailyValues')
        : Promise.resolve([] as Record<string, unknown>[]),
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
      downloadDvBundles(uid),
    ]))

    // 체크포인트 갱신용 최신 서버 업로드 시각 — 아래 strip이 __uploadedAt을
    // 제거하므로 반드시 strip 전에 계산한다.
    const fullByTable: Array<[string, Record<string, unknown>[]]> = [
      ['members', members], ['assetCategories', assetCategories], ['assetItems', assetItems],
      ['dailyValues', dailyValues], ['transactionCategories', transactionCategories],
      ['transactions', transactions], ['budgets', budgets], ['goals', goals],
      ['paymentMethodItems', paymentMethodItems], ['subscriptions', subscriptions],
      ['loans', loans], ['merchantAliases', merchantAliases],
      ['investmentTrades', investmentTrades], ['dividends', dividends],
      ['accountInterests', accountInterests],
      [DV_BUNDLE_COLLECTION, dvBundles],
    ]
    const fullMaxes = Object.fromEntries(
      fullByTable.map(([t, recs]) => [t, maxUploadedAtMs(recs)]),
    ) as SyncCheckpointMap

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

    // 번들을 레거시 행 위에 겹쳐 적용 — 일자 단위 LWW라 더 새로운 쪽이 이긴다.
    // (자산은 위 트랜잭션에서 이미 삽입됨)
    let dvBundlesClean = true
    for (const b of dvBundles) {
      try {
        const ok = await ingestDvBundleDoc(b)
        if (!ok) dvBundlesClean = false
      } catch (err) {
        dvBundlesClean = false
        console.error('[sync] dv bundle full-download ingest failed:', err)
      }
    }

    // 전량 스냅샷을 성공적으로 적용했으므로 체크포인트도 그 시점으로 전진 —
    // 다음 로그인 머지는 이 이후 변경분만 내려받는다. 번들 인제스트가
    // 불완전하면 번들 키는 보류 (다음 머지가 재다운로드).
    if (!dvBundlesClean) delete fullMaxes[DV_BUNDLE_COLLECTION]
    await advanceSyncCheckpoint(uid, fullMaxes)

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
        if (change.tableName === 'dailyValues') continue // 번들 경로에서 처리됨
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

      // ── dailyValues: 자산×월 번들 경로 — 업서트는 더 이상 per-row 문서를
      // 쓰지 않는다 (삭제의 레거시 정리/톰스톤은 핸들러 내부에서 수행).
      // 반드시 일반 업서트 "이후"에 실행한다: 부모 자산(assetItems)이 먼저
      // 클라우드에 도착해야 피어가 번들을 고아 없이 인제스트할 수 있다 —
      // 역순이면 번들 커밋 직후 자산 업로드가 실패할 때 부모 없는 번들이
      // 클라우드에 남는다 (적대적 리뷰 확정 결함).
      const dvChanges = deduped.filter(c => c.tableName === 'dailyValues')
      if (dvChanges.length > 0) {
        try {
          await uploadDailyValueChanges(uid, dvChanges)
          for (const c of dvChanges) successKeys.add(`dailyValues:${c.syncId}`)
          consecutiveFailures = 0
        } catch (err) {
          console.error(`[sync] incremental dailyValues bundle upload (${dvChanges.length}) failed:`, err)
          lastGroupError = err
          consecutiveFailures++
          failedGroups++
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
        if (change.tableName === 'dailyValues') continue // 번들 경로에서 처리됨
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
          // 자산 삭제는 그 자산의 일별가치 번들도 통째로 청소한다 — 행 단위
          // 삭제 항목은 자산이 이미 사라져 번들 좌표를 해석할 수 없으므로,
          // 번들 정리는 자산 삭제 이벤트가 유일한 트리거다.
          if (tableName === 'assetItems') {
            for (const e of entries) {
              await deleteDvBundlesForAsset(uid, e.syncId)
            }
          }
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

// ─── Daily Value Bundles (자산×월 묶음 문서) ───────────────────────
//
// dailyValues는 행 수가 지배적(1만+ — 클라우드 문서의 ~91%)이라 per-row
// 문서로는 신규 기기 베이스라인 비용이 비현실적이다. 클라우드 표현만
// 자산×월 1문서로 묶는다 (로컬 Dexie는 행 단위 그대로). 패치는 일자 단위
// merge:true — 두 기기가 같은 달의 다른 날을 동시에 써도 클로버링 없음.
// 일자 삭제 전파는 기존 per-row 톰스톤을 그대로 쓰고(행 syncId는 일자
// 엔트리의 sid로 기기 간 공유됨), 번들 문서에서는 deleteField()로 해당
// 일자를 제거해 톰스톤 GC(30일) 이후의 부활을 막는다.
//
// 마이그레이션(혼용 호환): 쓰기는 번들로만 하되, 레거시 dailyValues
// 컬렉션은 dvMigration 마커가 설정될 때까지 계속 읽는다(구버전 기기의
// 쓰기 수신). 전 기기 업데이트 후 purgeLegacyDailyValues가 번들 전량
// 업로드 → 레거시 문서 삭제 → 마커 설정으로 전환을 완결한다.
// ⚠️ 레거시 문서 삭제는 구버전 리스너의 'removed' 핸들러가 로컬 행을
// 지우게 만든다 — 반드시 모든 기기가 신버전일 때만 실행할 것.

/**
 * 레거시 dailyValues 컬렉션이 아직 살아있는가. 마커 문서가 설정되기 전까지
 * true — 머지/리스너가 레거시 컬렉션도 읽는다. 세션 시작 머지에서 1회 갱신.
 */
let legacyDvActive = true
export function isLegacyDvActive(): boolean { return legacyDvActive }

const dvMigrationDocPath = (uid: string) => `users/${uid}/syncControl/dvMigration`

async function refreshDvMigrationState(uid: string): Promise<void> {
  try {
    const snap = await getDoc(doc(firestore, dvMigrationDocPath(uid)))
    legacyDvActive = !(snap.exists() && snap.data()?.legacyCleared === true)
  } catch {
    // 마커를 못 읽으면 보수적으로 레거시 읽기를 유지한다 (정확성 우선)
  }
}

/** 번들 컬렉션 다운로드 — downloadTable과 동일한 델타 의미론. */
async function downloadDvBundles(uid: string, sinceMs?: number | null): Promise<Record<string, unknown>[]> {
  const colRef = collection(firestore, `users/${uid}/${DV_BUNDLE_COLLECTION}`)
  const ref = sinceMs != null
    ? query(colRef, where('__uploadedAt', '>=', Timestamp.fromMillis(sinceMs)))
    : colRef
  const snapshot = await getDocs(ref)
  return snapshot.docs.map(d => d.data())
}

/**
 * dailyValues changelog 항목들을 클라우드에 반영한다. THROWS on failure —
 * incrementalUpload가 그룹 실패로 처리해 항목을 pending으로 보존한다.
 *
 * 두 갈래를 모두 수행해야 한 항목이 "완료"다:
 * 1) 삭제 항목: 레거시 per-row 문서 삭제 + 톰스톤 (구버전 기기 + 피어 행
 *    삭제 전파 — 신버전 피어도 톰스톤으로 행을 지운다)
 * 2) 번들 패치: 일자 단위 merge 업서트 / deleteField 제거
 */
async function uploadDailyValueChanges(uid: string, entries: SyncChangeLogEntry[]): Promise<void> {
  const deleteEntries = entries.filter(e => e.operation === 'delete')
  const upsertEntries = entries.filter(e => e.operation !== 'delete')

  // ① 레거시 삭제 + 톰스톤 (per-row syncId 기반 — sid 공유로 피어에 매칭됨)
  if (deleteEntries.length > 0) {
    await deleteMultipleFromCloud(uid, 'dailyValues', deleteEntries.map(e => e.syncId))
    await uploadTombstonesBatch(uid, deleteEntries.map(e => ({
      tableName: 'dailyValues', syncId: e.syncId, deletedAt: e.timestamp,
    })))
  }

  // ② 좌표 해석: 로컬 행(syncId/[asset+date]) + 자산 syncId
  const rows = upsertEntries.length > 0
    ? await db.dailyValues.where('syncId').anyOf(upsertEntries.map(e => e.syncId)).toArray()
    : []
  const rowBySyncId = new Map(rows.map(r => [r.syncId!, r]))

  const metaPairs: Array<[number, string]> = []
  for (const e of entries) {
    if (e.assetItemId != null && e.date) metaPairs.push([e.assetItemId, e.date])
  }
  const metaRows = metaPairs.length > 0
    ? await db.dailyValues.where('[assetItemId+date]').anyOf(metaPairs).toArray()
    : []
  const rowByAssetDate = new Map(metaRows.map(r => [`${r.assetItemId}|${r.date}`, r]))

  // projected(파생) 행에 매달린 업서트 엔트리는 통째로 드롭한다 — 행을 맵에서만
  // 빼면 buildBundlePatches가 "행 없음 → 삭제 마커(v=null)"로 오판해 projected
  // 좌표에 삭제를 전파하는 churn 이 생긴다. (신규 projected 는 변경추적 훅에서
  // 이미 차단되므로 여기 닿는 건 업그레이드 전 큐잉된 백로그뿐. 호출부가 전체
  // dvChanges 를 processed 마킹하므로 드롭해도 stuck 되지 않는다.)
  const resolveRow = (e: SyncChangeLogEntry): typeof rows[number] | undefined =>
    rowBySyncId.get(e.syncId)
      ?? (e.assetItemId != null && e.date ? rowByAssetDate.get(`${e.assetItemId}|${e.date}`) : undefined)
  const liveEntries = entries.filter(e =>
    e.operation === 'delete' || resolveRow(e)?.source !== 'projected',
  )

  const assetIds = new Set<number>()
  for (const r of [...rows, ...metaRows]) assetIds.add(r.assetItemId)
  for (const e of liveEntries) { if (e.assetItemId != null) assetIds.add(e.assetItemId) }
  const assets = assetIds.size > 0 ? await db.assetItems.bulkGet([...assetIds]) : []
  const assetSyncById = new Map<number, string>()
  for (const a of assets) {
    if (a?.id != null && a.syncId) assetSyncById.set(a.id, a.syncId)
  }

  // ③ 패치 빌드 + 배치 커밋 (일자 단위 merge — 삭제는 v=null 마커 튜플)
  const { patches, unresolved } = buildBundlePatches(
    liveEntries, rowBySyncId, rowByAssetDate, assetSyncById, getDeviceId(),
  )
  if (unresolved > 0) {
    // 자산 cascade 삭제(번들은 자산 삭제 경로가 통째로 지움) 또는 메타 없는
    // 레거시 로그 — 일자 패치 없이 완료 처리해도 안전한 경우들이다.
    console.info(`[sync] dailyValues ${unresolved}건은 번들 패치 생략 (자산 삭제됨/레거시 로그)`)
  }
  for (let i = 0; i < patches.length; i += BATCH_LIMIT) {
    const chunk = patches.slice(i, i + BATCH_LIMIT)
    const batch = writeBatch(firestore)
    for (const p of chunk) {
      const ref = doc(firestore, `users/${uid}/${DV_BUNDLE_COLLECTION}/${encodeDocId(p.bundleKey)}`)
      batch.set(ref, {
        bundleKey: p.bundleKey,
        assetItem_syncId: p.assetSyncId,
        month: p.month,
        days: p.days,
        updatedAt: p.maxUpdatedAt,
        __deviceId: getDeviceId(),
        __schemaV: CLOUD_SCHEMA_VERSION,
        __uploadedAt: serverTimestamp(),
      }, { merge: true })
    }
    await withTimeout(batch.commit(), SYNC_BATCH_TIMEOUT_MS, 'dailyValue bundle upload')
  }
}

/** 자산 삭제 시 그 자산의 번들 문서를 통째로 제거. THROWS on failure. */
async function deleteDvBundlesForAsset(uid: string, assetSyncId: string): Promise<void> {
  const colRef = collection(firestore, `users/${uid}/${DV_BUNDLE_COLLECTION}`)
  const snap = await getDocs(query(colRef, where('assetItem_syncId', '==', assetSyncId)))
  if (snap.empty) return
  const refs = snap.docs.map(d => d.ref)
  for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(firestore)
    for (const ref of refs.slice(i, i + BATCH_LIMIT)) batch.delete(ref)
    await withTimeout(batch.commit(), SYNC_BATCH_TIMEOUT_MS, 'dailyValue bundle cascade delete')
  }
}

/**
 * 번들 문서 1개를 로컬 행으로 풀어 적용 (머지/리스너 공용).
 * @returns false = 부모 자산이 아직 로컬에 없음 (호출자가 재시도/스킵 결정)
 *
 * 일자 단위 LWW는 shouldApplyCloudUpdate(시계오차 ±500ms 허용 + deviceId
 * 타이브레이커)를 그대로 쓴다 — 순수 `>` 비교는 두 기기가 같은 ms에 쓴
 * 동률에서 양쪽 모두 상대를 거부해 영구 발산한다 (적대적 리뷰 확정 결함).
 *
 * v=null은 좌표 기반 삭제 마커 — per-row 톰스톤이 syncId 분기로 매칭에
 * 실패해도 (자산×일자) 좌표로 삭제가 전파된다.
 *
 * 행 생성/적용 시 클라우드 sid를 입양한다 — 모든 기기가 같은 논리 행에
 * 같은 syncId를 갖게 되어 per-row 톰스톤이 기기 간에 매칭된다.
 * @internal Exported for unit tests.
 */
export async function ingestDvBundleDoc(data: Record<string, unknown>): Promise<boolean> {
  const exploded = explodeBundleDoc(data)
  if (!exploded) return true // malformed — 재시도 무의미
  const asset = await db.assetItems.where('syncId').equals(exploded.assetSyncId).first()
  if (!asset?.id) {
    // 자산이 로컬에서 "삭제된" 경우(톰스톤 존재)는 영구 미해석이 정상이다 —
    // 이 번들은 자산 삭제 경로의 cascade가 클라우드에서 곧 지울 운명이고,
    // false로 보고하면 체크포인트 클램프가 영원히 풀리지 않는다.
    const tombstoned = await db.syncTombstones
      .where('[tableName+syncId]').equals(['assetItems', exploded.assetSyncId]).first()
    return tombstoned ? true : false
  }
  const assetItemId = asset.id

  await runSyncWrite([db.dailyValues], async () => {
    for (const day of exploded.days) {
      // 클라우드의 projected(파생) 값 튜플은 무시한다 — 각 기기가 manual
      // 앵커로 로컬 재생성한다. 업그레이드 전 클라우드에 남은(또는 구버전
      // 피어가 올린) projected 를 inert 처리. 삭제 마커(v===null)는 source 와
      // 무관하게 적용해야 하므로 v!==null 일 때만 건너뛴다.
      if (day.v !== null && day.s === 'projected') continue

      const existing = await db.dailyValues
        .where('[assetItemId+date]').equals([assetItemId, day.date]).first()

      if (day.v === null) {
        // 삭제 마커 — 좌표로 매칭, LWW로 보호 (로컬이 더 새로우면 보존)
        if (existing && shouldApplyCloudUpdate(day.u, day.d, existing.updatedAt)) {
          await db.dailyValues.delete(existing.id!)
        }
        continue
      }

      if (!existing) {
        await db.dailyValues.add({
          syncId: day.sid,
          assetItemId,
          date: day.date,
          value: day.v,
          source: (day.s ?? undefined) as DailyValue['source'],
          createdAt: day.u,
          updatedAt: day.u,
        } as DailyValue)
      } else {
        // 들어온 것은 앵커(여기 닿는 day.s 는 projected 가 아님: 위에서 스킵됨).
        // 로컬이 projected 면 타임스탬프와 무관하게 앵커가 이긴다 — 로컬 재생성
        // projected 의 새 타임스탬프가 더 오래된 피어 manual 앵커를 영구히
        // 가리는 것을 막는다. 앵커↔앵커는 일반 일자 LWW.
        const anchorOverProjected = existing.source === 'projected'
        if (anchorOverProjected || shouldApplyCloudUpdate(day.u, day.d, existing.updatedAt)) {
          await db.dailyValues.update(existing.id!, {
            value: day.v,
            source: (day.s ?? undefined) as DailyValue['source'],
            updatedAt: day.u,
            // sid 입양 — 같은 논리 일자가 기기마다 다른 syncId를 갖는 분기를 수렴
            ...(existing.syncId !== day.sid ? { syncId: day.sid } : {}),
          })
        }
      }
    }
  })
  return true
}

/**
 * 전량 번들 업로드 — 반드시 merge:true다. 통째 set은 이 기기가 아직
 * 다운로드하지 못한 피어의 일자를 클라우드에서 지워버린다 (적대적 리뷰
 * 확정 결함: '로컬→클라우드' 수동 업로드가 무음 데이터 손실 유발).
 * 묵은 일자 청소는 포기한다 — 삭제는 발생 시점의 v=null 마커가 담당한다.
 */
async function uploadAllDvBundles(uid: string): Promise<number> {
  // 파생(projected) 행은 클라우드에 올리지 않는다 — 각 기기가 manual 앵커로
  // 로컬 재생성한다. (Phase 2: dailyValues 91% 차지하던 projected 동기화 중단)
  const rows = (await db.dailyValues.toArray()).filter(r => r.source !== 'projected')
  const assets = await db.assetItems.toArray()
  const assetSyncById = new Map<number, string>()
  for (const a of assets) { if (a.id != null && a.syncId) assetSyncById.set(a.id, a.syncId) }
  const { bundles, unresolved } = buildFullBundles(rows, assetSyncById, getDeviceId())
  if (unresolved > 0) console.warn(`[sync] full bundle upload: ${unresolved}개 행은 자산 해석 불가로 생략`)
  for (let i = 0; i < bundles.length; i += BATCH_LIMIT) {
    const chunk = bundles.slice(i, i + BATCH_LIMIT)
    const batch = writeBatch(firestore)
    for (const b of chunk) {
      const ref = doc(firestore, `users/${uid}/${DV_BUNDLE_COLLECTION}/${encodeDocId(b.bundleKey)}`)
      batch.set(ref, {
        bundleKey: b.bundleKey,
        assetItem_syncId: b.assetSyncId,
        month: b.month,
        days: b.days,
        updatedAt: b.maxUpdatedAt,
        __deviceId: getDeviceId(),
        __schemaV: CLOUD_SCHEMA_VERSION,
        __uploadedAt: serverTimestamp(),
      }, { merge: true })
    }
    await withTimeout(batch.commit(), SYNC_BATCH_TIMEOUT_MS, 'dailyValue full bundle upload')
  }
  return bundles.length
}

/**
 * Phase B — 레거시 per-row dailyValues 컬렉션 정리. 순서가 안전의 전부다:
 * ① 전량 번들 업로드(완전한 진실 확보) → ② 레거시 문서 삭제 → ③ 마커.
 * 어느 단계에서 실패해도 다음 실행이 이어서 안전하다 (①은 멱등, ②는
 * 재실행 가능, 마커 전까지 레거시 읽기가 유지된다).
 *
 * ⚠️ 구버전 기기의 리스너는 레거시 문서 삭제를 'removed'로 받아 로컬 행을
 * 지운다 — 반드시 모든 기기가 신버전으로 업데이트된 후 실행할 것 (호출 UI가
 * 경고를 표시한다).
 */
export async function purgeLegacyDailyValues(uid: string): Promise<{ bundles: number; deleted: number }> {
  if (!canDeviceWrite()) throw new Error('읽기 전용 기기에서는 실행할 수 없습니다.')

  const bundles = await uploadAllDvBundles(uid)

  const colRef = collection(firestore, `users/${uid}/dailyValues`)
  const snap = await getDocs(colRef)
  const refs = snap.docs.map(d => d.ref)
  for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(firestore)
    for (const ref of refs.slice(i, i + BATCH_LIMIT)) batch.delete(ref)
    await withTimeout(batch.commit(), SYNC_BATCH_TIMEOUT_MS, 'legacy dailyValues purge')
  }

  await setDoc(doc(firestore, dvMigrationDocPath(uid)), {
    legacyCleared: true,
    clearedAt: new Date().toISOString(),
    __deviceId: getDeviceId(),
  })
  legacyDvActive = false
  // 레거시 dailyValues 리스너를 내리고 번들 리스너만 남긴다
  startRealtimeSync(uid, true)
  return { bundles, deleted: refs.length }
}

// 부모 자산이 아직 로컬에 없어 적용하지 못한 번들 보류 큐 (bundleKey → raw).
// 번들 리스너는 번들 문서가 다시 바뀔 때만 재발화하므로, 자산이 나중에
// 도착해도 이 큐가 없으면 그 세션 동안 일별가치가 화면에서 실종된다
// (적대적 리뷰 확정 결함). assetItems 리스너가 자산을 settle할 때 flush.
const pendingDvBundles = new Map<string, Record<string, unknown>>()
const PENDING_DV_BUNDLES_CAP = 500

async function flushPendingDvBundlesFor(assetSyncId: string): Promise<void> {
  for (const [key, data] of pendingDvBundles) {
    if (data.assetItem_syncId !== assetSyncId) continue
    try {
      const ok = await ingestDvBundleDoc(data)
      if (ok) {
        pendingDvBundles.delete(key)
        window.dispatchEvent(new CustomEvent('fin-sync-update', { detail: { table: 'dailyValues' } }))
      }
    } catch (err) {
      console.error('[sync] pending dv bundle flush failed:', err)
    }
  }
}

/** 번들 컬렉션 실시간 구독 — subscribeTable과 동일한 생존/백오프 규약. */
function subscribeDvBundles(uid: string, generation: number, retryCount = 0): void {
  const colRef = collection(firestore, `users/${uid}/${DV_BUNDLE_COLLECTION}`)
  let hadSnapshot = false
  const unsub = onSnapshot(colRef, { includeMetadataChanges: true }, async (snapshot) => {
    hadSnapshot = true
    if (!snapshot.metadata.fromCache) {
      lastSnapshotByTable.set(DV_BUNDLE_COLLECTION, Date.now())
    }
    if (realtimeSyncPaused) return

    const docChanges = snapshot.docChanges()
    if (docChanges.length === 0) return

    let appliedCount = 0
    for (const change of docChanges) {
      const data = change.doc.data()
      try {
        if (change.type === 'added' || change.type === 'modified') {
          const ok = await ingestDvBundleDoc(data)
          if (ok) {
            appliedCount++
            pendingDvBundles.delete(change.doc.id)
          } else if (pendingDvBundles.size < PENDING_DV_BUNDLES_CAP) {
            // 부모 자산 미도착 — 자산 리스너가 자산을 settle할 때 flush된다.
            pendingDvBundles.set(change.doc.id, data)
          }
        } else if (change.type === 'removed') {
          // 번들 제거 = 자산 cascade 삭제(또는 빈 달 정리). 로컬의 해당
          // 자산×월 행을 제거한다. 자산이 이미 로컬에서 지워졌으면 남은
          // 행들은 per-row 톰스톤이 처리한다.
          const assetSyncId = data.assetItem_syncId as string | undefined
          const month = data.month as string | undefined
          if (assetSyncId && month) {
            const asset = await db.assetItems.where('syncId').equals(assetSyncId).first()
            if (asset?.id != null) {
              await runSyncWrite([db.dailyValues], async () => {
                await db.dailyValues
                  .where('[assetItemId+date]')
                  .between([asset.id!, `${month}-00`], [asset.id!, `${month}-99`])
                  .delete()
              })
              appliedCount++
            }
          }
        }
      } catch (err) {
        console.error(`[sync] dv bundle ${change.type} ingest error:`, err)
      }
    }

    if (appliedCount > 0) {
      window.dispatchEvent(new CustomEvent('fin-sync-update', { detail: { table: 'dailyValues' } }))
    }
  }, (err) => {
    console.error('[sync] dv bundles listener error:', err)
    if (syncGeneration === generation) {
      const nextRetry = hadSnapshot ? 0 : retryCount + 1
      const delay = Math.min(Math.pow(2, nextRetry) * 1000, 30000)
      console.log(`[sync] retrying dv bundles listener in ${delay}ms`)
      setTimeout(() => {
        if (syncGeneration === generation) {
          subscribeDvBundles(uid, generation, nextRetry)
        }
      }, delay)
    }
  })
  unsubscribers.push(unsub)
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
  /**
   * cloudRecords가 해당 컬렉션의 "전량 스냅샷"인가 (기본 true).
   * 델타 머지는 부분집합을 넘기므로 false — 이때 "클라우드에 없음"을 근거로
   * 하는 추론(이름 기반 syncId 입양, Case 3의 로컬-온리 업로드 큐잉)은
   * 성립하지 않아 건너뛴다. false인데 건너뛰지 않으면 매 델타 머지마다
   * 로컬 전체가 "클라우드에 없는 신규"로 오판되어 전량 재업로드가 일어난다.
   */
  cloudIsComplete: boolean = true,
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
  if (reconcileByName && cloudIsComplete) {
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
    // 델타 부분집합에서 "cloudMap에 없음"은 "클라우드에 없음"이 아니다 —
    // 전량 스냅샷일 때만 로컬-온리 추론을 허용한다.
    const needsUpload = cloudRec
      ? ((local.record.updatedAt as string || '') > ((cloudRec.updatedAt as string) || ''))
      : cloudIsComplete
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

    // 레거시 dailyValues 컬렉션이 정리(purge)되었는지 마커로 확인 —
    // 정리 전에는 구버전 기기의 쓰기를 받기 위해 레거시도 계속 읽는다.
    await refreshDvMigrationState(uid)

    // 다운로드 범위 결정 — 체크포인트가 있으면 그 이후 서버 업로드분만(델타),
    // 없으면(첫 로그인/로컬 초기화 후) 전량. 전량 다운로드는 문서 수만큼
    // Firestore 읽기를 과금하므로(dailyValues 1만+ 환경에서 실행당 ~13K reads)
    // 베이스라인 이후에는 반드시 델타로 내려받는다.
    const checkpoint = await getSyncCheckpoint(uid)
    const isDelta = checkpoint != null
    // 체크포인트에 키가 없는 테이블은 이 기기가 한 번도 전량을 본 적 없는
    // 테이블이다(예: 앱 업데이트로 새로 추가된 동기화 테이블) — 그 테이블만
    // 전량(null)으로 내려받는다. 0으로 보내면 스탬프 없는 레거시 문서를
    // 영원히 놓친다. (베이스라인을 본 테이블은 advance가 0이라도 키를 기록)
    const sinceFor = (t: SyncableTable): number | null =>
      isDelta ? (checkpoint[t] ?? null) : null

    // Download cloud data in parallel — 15개 동기화 테이블 전체.
    // (이전에는 investmentTrades/dividends/accountInterests 3개가 빠져 있어
    // 새 기기 로그인 시 투자 데이터가 실시간 리스너로만 우연히 내려왔다)
    const [
      cloudMembers, cloudAssetCategories, cloudAssetItems, cloudDailyValues,
      cloudTransactionCategories, cloudTransactions, cloudBudgets, cloudGoals,
      cloudPaymentMethodItems, cloudSubscriptions, cloudLoans, cloudMerchantAliases,
      cloudInvestmentTrades, cloudDividends, cloudAccountInterests,
      cloudDvBundles,
    ] = await Promise.all([
      downloadTable<Record<string, unknown>>(uid, 'members', sinceFor('members')),
      downloadTable<Record<string, unknown>>(uid, 'assetCategories', sinceFor('assetCategories')),
      downloadTable<Record<string, unknown>>(uid, 'assetItems', sinceFor('assetItems')),
      // 레거시 dailyValues는 정리 마커 이후 더 이상 읽지 않는다 (베이스라인
      // 1만+ 읽기의 주범 — 번들 컬렉션이 대체)
      legacyDvActive
        ? downloadTable<Record<string, unknown>>(uid, 'dailyValues', sinceFor('dailyValues'))
        : Promise.resolve([] as Record<string, unknown>[]),
      downloadTable<Record<string, unknown>>(uid, 'transactionCategories', sinceFor('transactionCategories')),
      downloadTable<Record<string, unknown>>(uid, 'transactions', sinceFor('transactions')),
      downloadTable<Record<string, unknown>>(uid, 'budgets', sinceFor('budgets')),
      downloadTable<Record<string, unknown>>(uid, 'goals', sinceFor('goals')),
      downloadTable<Record<string, unknown>>(uid, 'paymentMethodItems', sinceFor('paymentMethodItems')),
      downloadTable<Record<string, unknown>>(uid, 'subscriptions', sinceFor('subscriptions')),
      downloadTable<Record<string, unknown>>(uid, 'loans', sinceFor('loans')),
      downloadTable<Record<string, unknown>>(uid, 'merchantAliases', sinceFor('merchantAliases')),
      downloadTable<Record<string, unknown>>(uid, 'investmentTrades', sinceFor('investmentTrades')),
      downloadTable<Record<string, unknown>>(uid, 'dividends', sinceFor('dividends')),
      downloadTable<Record<string, unknown>>(uid, 'accountInterests', sinceFor('accountInterests')),
      downloadDvBundles(uid, isDelta ? (checkpoint['dailyValueBundles'] ?? null) : null),
    ])

    // 체크포인트 전진용 — 머지가 끝까지 성공한 뒤에만 advance한다.
    // (도중 실패 시 다음 머지가 같은 구간을 다시 읽는다 — 멱등이라 안전)
    const downloadedByTable: Array<[string, Record<string, unknown>[]]> = [
      ['members', cloudMembers], ['assetCategories', cloudAssetCategories],
      ['assetItems', cloudAssetItems], ['dailyValues', cloudDailyValues],
      ['transactionCategories', cloudTransactionCategories], ['transactions', cloudTransactions],
      ['budgets', cloudBudgets], ['goals', cloudGoals],
      ['paymentMethodItems', cloudPaymentMethodItems], ['subscriptions', cloudSubscriptions],
      ['loans', cloudLoans], ['merchantAliases', cloudMerchantAliases],
      ['investmentTrades', cloudInvestmentTrades], ['dividends', cloudDividends],
      ['accountInterests', cloudAccountInterests],
      [DV_BUNDLE_COLLECTION, cloudDvBundles],
    ]
    const totalDocs = downloadedByTable.reduce((n, [, recs]) => n + recs.length, 0)
    console.log(`[sync] merge on login (${isDelta ? '델타' : '전량'}): ${totalDocs}개 문서 다운로드 (번들 ${cloudDvBundles.length})`)

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
    await mergeTableWithRemap('members', cloudMembers, nameOnlyKey, !isDelta)
    await mergeTableWithRemap('assetCategories', cloudAssetCategories, nameTypeKey, !isDelta)
    await mergeTableWithRemap('transactionCategories', cloudTransactionCategories, nameTypeKey, !isDelta)
    await mergeTableWithRemap('goals', cloudGoals, undefined, !isDelta)

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
    await mergeTableWithRemap('assetItems', cloudAssetItems, undefined, !isDelta)
    await mergeTableWithRemap('budgets', cloudBudgets, undefined, !isDelta)
    // 투자 3종 — memberId FK만 가지므로 members 이후면 안전
    await mergeTableWithRemap('investmentTrades', cloudInvestmentTrades, undefined, !isDelta)
    await mergeTableWithRemap('dividends', cloudDividends, undefined, !isDelta)
    await mergeTableWithRemap('accountInterests', cloudAccountInterests, undefined, !isDelta)

    fkMappings['assetItems'] = buildIdMapping(cloudAssetItems, await db.assetItems.toArray())

    // ── Layer 2: Second-level dependents ──
    // 레거시 dailyValues: 정리 전까지만 머지. 정리 후에는 빈 배열을 전량으로
    // 머지하면 Case 3이 로컬 전체를 업로드 큐에 넣으므로 호출 자체를 건너뛴다.
    if (legacyDvActive) {
      await mergeTableWithRemap('dailyValues', cloudDailyValues, undefined, !isDelta)
    }
    // 번들 인제스트 — 자산(Layer 1)이 머지된 뒤라 부모 해석이 안전하다.
    // 일자 단위 LWW이므로 레거시 머지 결과 위에 겹쳐도 멱등이다.
    // 하나라도 미적용(부모 미해석/예외)이면 dvBundlesClean=false — 아래
    // 체크포인트 전진에서 번들 키를 보류해 다음 델타가 재다운로드하게 한다
    // (적대적 리뷰 확정: 무조건 전진은 미적용 번들의 영구 누락).
    let dvBundlesClean = true
    for (const b of cloudDvBundles) {
      try {
        const ok = await ingestDvBundleDoc(b)
        if (!ok) dvBundlesClean = false
      } catch (err) {
        dvBundlesClean = false
        console.error('[sync] dv bundle merge ingest failed:', err)
      }
    }
    if (!dvBundlesClean) {
      console.warn('[sync] 일부 번들이 미적용 — dailyValueBundles 체크포인트 전진 보류 (다음 머지가 재시도)')
    }
    await mergeTableWithRemap('paymentMethodItems', cloudPaymentMethodItems, undefined, !isDelta)

    fkMappings['paymentMethodItems'] = buildIdMapping(
      cloudPaymentMethodItems,
      await db.paymentMethodItems.toArray(),
    )

    // ── Layer 3: Third-level dependents ──
    await mergeTableWithRemap('subscriptions', cloudSubscriptions, undefined, !isDelta)

    fkMappings['subscriptions'] = buildIdMapping(cloudSubscriptions, await db.subscriptions.toArray())

    // ── Layer 4: Transactions (depends on members, txnCategories, payMethods, subscriptions) ──
    await mergeTableWithRemap('transactions', cloudTransactions, undefined, !isDelta)

    // ── Loans (depends on assetItems) ──
    await mergeTableWithRemap('loans', cloudLoans, undefined, !isDelta)

    // ── Merchant aliases (depends on transactionCategories + subscriptions) ──
    await mergeTableWithRemap('merchantAliases', cloudMerchantAliases, undefined, !isDelta)

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

    // 머지가 끝까지 성공했을 때만 체크포인트 전진 — 다음 실행은 이번에 본
    // 최신 서버 시각 이후의 변경분만 내려받는다. 번들 인제스트가 불완전하면
    // 번들 키는 전진을 보류한다 (재다운로드는 멱등이라 안전).
    const advanceMap = Object.fromEntries(
      downloadedByTable.map(([t, recs]) => [t, maxUploadedAtMs(recs)]),
    ) as SyncCheckpointMap
    if (!dvBundlesClean) delete advanceMap[DV_BUNDLE_COLLECTION]
    await advanceSyncCheckpoint(uid, advanceMap)

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
            // dailyValues 레거시 컬렉션의 removed는 무시한다 — 신버전의 일별
            // 가치 삭제 전파는 per-row 톰스톤 + 번들 deleteField가 담당하며,
            // 레거시 문서 제거는 "저장 구조 최적화"(purge)가 12,244개 문서를
            // 일괄 삭제할 때 발생한다. 이를 로컬 삭제로 반영하면 purge 순간
            // 마커를 아직 못 본 신버전 기기들의 로컬 일별가치가 통째로
            // 비워진다 (다음 세션의 번들 재인제스트 전까지 데이터 실종).
            if (tableName === 'dailyValues') continue
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
    // 자산이 settle되면 그 자산을 기다리던 보류 번들도 재인제스트한다 —
    // 번들 리스너는 자산 도착으로 재발화하지 않으므로 이 경로가 유일하다.
    if (tableName === 'assetItems' && pendingDvBundles.size > 0) {
      for (const p of settledParents) {
        await flushPendingDvBundlesFor(p.syncId)
      }
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
    // 레거시 dailyValues는 정리(purge) 후 구독하지 않는다 — 빈 컬렉션 +
    // 신규 기기 초기 스냅샷 비용 절감. 일별가치 실시간은 번들 리스너가 담당.
    if (tableName === 'dailyValues' && !legacyDvActive) continue
    lastSnapshotByTable.set(tableName, now)
    subscribeTable(uid, tableName, gen)
  }

  // 일별가치 번들 (자산×월 묶음) 실시간 구독
  lastSnapshotByTable.set(DV_BUNDLE_COLLECTION, now)
  subscribeDvBundles(uid, gen)

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
  pendingDvBundles.clear()
  lastSnapshotByTable.clear()
}
