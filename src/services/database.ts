import Dexie, { type Table, type Transaction as DexieTransaction } from 'dexie'
import { DEFAULT_MEMBERS } from '@/utils/constants'
import type {
  Member,
  AssetCategory,
  AssetItem,
  DailyValue,
  TransactionCategory,
  Transaction,
  TransactionType,
  Budget,
  FinancialGoal,
  PaymentMethodItem,
  Subscription,
  Loan,
  InvestmentTrade,
  Dividend,
  AccountInterest,
  MerchantAlias,
  SyncOutboxEntry,
} from '@/lib/types'

/** 새 레코드 id 생성 — 전역 고유 문자열 (Firestore 문서 id 겸용). */
export function createId(): string {
  return crypto.randomUUID()
}

class FinanceDatabase extends Dexie {
  members!: Table<Member, string>
  assetCategories!: Table<AssetCategory, string>
  assetItems!: Table<AssetItem, string>
  dailyValues!: Table<DailyValue, string>
  transactionCategories!: Table<TransactionCategory, string>
  transactions!: Table<Transaction, string>
  budgets!: Table<Budget, string>
  goals!: Table<FinancialGoal, string>
  paymentMethodItems!: Table<PaymentMethodItem, string>
  subscriptions!: Table<Subscription, string>
  loans!: Table<Loan, string>
  investmentTrades!: Table<InvestmentTrade, string>
  dividends!: Table<Dividend, string>
  accountInterests!: Table<AccountInterest, string>
  merchantAliases!: Table<MerchantAlias, string>
  syncOutbox!: Table<SyncOutboxEntry, string>

  constructor() {
    super('MoonwaveFinance')
    // ── v1~v13: 레거시 스키마 이력 (숫자 ++id PK + syncId 병행) ──
    // 업그레이드 경로를 위해 그대로 보존한다. 신규 설치는 v16 스키마로
    // 직행하고 populate만 실행된다.
    this.version(1).stores({
      members: '++id, syncId, name, sortOrder',
      assetCategories: '++id, syncId, name, type, sortOrder',
      assetItems: '++id, syncId, memberId, categoryId, type, isActive, sortOrder',
      dailyValues: '++id, syncId, assetItemId, date, [assetItemId+date]',
      transactionCategories: '++id, syncId, name, type, sortOrder',
      transactions: '++id, syncId, memberId, type, categoryId, date',
    })

    this.version(2).stores({
      transactions: '++id, syncId, memberId, type, categoryId, date, isRecurring, recurSourceId',
      budgets: '++id, syncId, categoryId, month',
      goals: '++id, syncId, targetDate',
    })

    this.version(3).stores({
      transactions: '++id, syncId, memberId, type, categoryId, date, isRecurring, recurSourceId, paymentMethod',
    })

    this.version(4).stores({
      transactions: '++id, syncId, memberId, type, categoryId, date, isRecurring, recurSourceId, paymentMethod, paymentMethodItemId',
      paymentMethodItems: '++id, syncId, type, name, sortOrder',
    }).upgrade(async (tx) => {
      // Open-time migration write: mark the versionchange tx as a sync write so
      // the CRUD hooks skip outbox queueing (see db.on('populate')).
      // Must precede the first await so the marker exists before any hook fires.
      markSyncTransaction()
      const transactions = await tx.table('transactions').toArray()
      const seen = new Map<string, { type: string; name: string }>()
      const now = new Date().toISOString()

      for (const t of transactions) {
        if (t.paymentMethod && t.paymentMethodDetail) {
          const key = `${t.paymentMethod}|${t.paymentMethodDetail}`
          if (!seen.has(key)) {
            seen.set(key, { type: t.paymentMethod, name: t.paymentMethodDetail })
          }
        }
      }

      const items = Array.from(seen.values())
      for (let i = 0; i < items.length; i++) {
        const id = await tx.table('paymentMethodItems').add({
          syncId: crypto.randomUUID(),
          type: items[i].type,
          name: items[i].name,
          isActive: true,
          sortOrder: i,
          createdAt: now,
          updatedAt: now,
        })
        await tx.table('transactions')
          .where('paymentMethod').equals(items[i].type)
          .filter((t: { paymentMethodDetail?: string }) => t.paymentMethodDetail === items[i].name)
          .modify({ paymentMethodItemId: id })
      }
    })

    this.version(5).stores({
      subscriptions: '++id, syncId, currency, category, status, billingDay, cycle, sortOrder',
    })

    this.version(6).stores({
      transactions: '++id, syncId, memberId, type, categoryId, date, isRecurring, recurSourceId, paymentMethod, paymentMethodItemId, subscriptionId',
      paymentMethodItems: '++id, syncId, type, name, sortOrder, linkedAssetItemId',
      subscriptions: '++id, syncId, currency, category, status, billingDay, cycle, sortOrder, paymentMethodItemId',
    })

    // v7: pauseHistory, customCycleDays added as non-indexed JSON fields
    this.version(7).stores({})

    // v8: syncChangeLog + syncTombstones (레거시 증분 동기화 — v15에서 폐기)
    this.version(8).stores({
      syncChangeLog: '++id, tableName, syncId, processed, timestamp, [tableName+syncId]',
      syncTombstones: '++id, tableName, syncId, deletedAt, [tableName+syncId]',
    })

    // v9: add 부동산 asset category for existing users
    this.version(9).stores({}).upgrade(async (tx) => {
      markSyncTransaction()
      const cats = await tx.table('assetCategories').toArray()
      const hasRealEstate = cats.some((c: { name?: string }) => c.name === '부동산')
      if (!hasRealEstate) {
        const now = new Date().toISOString()
        const maxSort = cats
          .filter((c: { type?: string }) => c.type === 'asset')
          .reduce((max: number, c: { sortOrder: number }) => Math.max(max, c.sortOrder), -1)
        await tx.table('assetCategories').add({
          name: '부동산',
          type: 'asset',
          color: '#D97706',
          icon: 'Home',
          sortOrder: maxSort + 1,
          // Deterministic syncId — v14 마이그레이션에서 그대로 id로 승격되어
          // 기기 간 수렴한다.
          syncId: defaultAssetCatId('asset', '부동산'),
          createdAt: now,
          updatedAt: now,
        })
      }
    })

    // v10: add loans table + "대출이자" expense category for existing users
    this.version(10).stores({
      loans: '++id, syncId, isActive, sortOrder',
    }).upgrade(async (tx) => {
      markSyncTransaction()
      const cats = await tx.table('transactionCategories').toArray()
      const hasLoanInterest = cats.some((c: { name?: string }) => c.name === '대출이자')
      if (!hasLoanInterest) {
        const now = new Date().toISOString()
        const expenseCats = cats.filter((c: { type?: string }) => c.type === 'expense')
        const maxSort = expenseCats.reduce((max: number, c: { sortOrder: number }) => Math.max(max, c.sortOrder), -1)
        await tx.table('transactionCategories').add({
          name: '대출이자',
          type: 'expense',
          color: '#B91C1C',
          icon: 'Percent',
          isDefault: true,
          sortOrder: maxSort + 1,
          syncId: defaultTxnCatId('expense', '대출이자'),
          createdAt: now,
          updatedAt: now,
        })
      }
    })

    // v11: merchantAliases table (AI / learned merchant→category aliases)
    this.version(11).stores({
      merchantAliases: '++id, syncId, &merchantKey, categoryId, source, learnedAt, lastUsedAt',
    })

    // v12: add investmentTrades + dividends + accountInterests tables
    this.version(12).stores({
      investmentTrades: '++id, syncId, memberId, sellDate, assetType, market, stockName, sortOrder, [sellDate+stockName+sellQuantity]',
      dividends: '++id, syncId, memberId, paymentDate, exDividendDate, assetType, market, stockName, sortOrder, [paymentDate+stockName+quantity]',
      accountInterests: '++id, syncId, memberId, depositDate, currency, interestType, sortOrder, [depositDate+periodStart+periodEnd+currency]',
    })

    // v13: syncMeta — 델타 체크포인트 (v15에서 폐기 — SDK resume token이 대체)
    this.version(13).stores({
      syncMeta: '&key',
    })

    // ═══ v14 → v16: Sync v2 문자열 PK 마이그레이션 ═══════════════════
    //
    // 목표: 모든 테이블의 PK를 숫자 ++id에서 문자열 id(구 syncId)로 전환하고
    // FK 필드(숫자)를 부모의 문자열 id로 재작성한다. Dexie는 PK를 제자리에서
    // 바꿀 수 없으므로 3단계 버전 체인을 쓴다:
    //   v14: 전체 테이블을 메모리 버퍼로 읽고 id/FK를 변환 (스키마 무변경)
    //   v15: 테이블 삭제 (syncChangeLog/syncTombstones/syncMeta 포함 영구 폐기)
    //   v16: 새 PK 스키마로 재생성 + 버퍼 재기록 + syncOutbox 신설
    //
    // 안전성: 세 버전은 단일 IndexedDB versionchange 트랜잭션으로 실행된다 —
    // 어느 단계에서 실패/강제종료돼도 통째로 롤백되어 v13 상태가 보존된다.
    // 클라우드 데이터는 이 마이그레이션과 무관하게 이미 syncId 키다.
    //
    // projected dailyValues는 버리고 간다 — 동기화 대상이 아니고(Phase 2),
    // 로그인/재생성 트리거가 앵커에서 즉시 재구성한다. 행 수의 대부분을
    // 차지하므로 메모리 버퍼도 그만큼 가벼워진다.
    this.version(14).stores({}).upgrade(async (tx) => {
      markSyncTransaction()
      const buffer: MigrationBuffer = { rows: {}, outbox: [] }
      const idMaps: Record<string, Map<number, string>> = {}

      // 1패스 — 모든 테이블을 읽고 숫자 id → 문자열 id 매핑을 만든다.
      const raw: Record<string, Record<string, unknown>[]> = {}
      for (const name of MIGRATED_TABLES) {
        const rows = await tx.table(name).toArray() as Record<string, unknown>[]
        raw[name] = rows
        const map = new Map<number, string>()
        for (const row of rows) {
          const numId = row.id as number | undefined
          const sid = typeof row.syncId === 'string' && row.syncId ? row.syncId : crypto.randomUUID()
          if (numId != null) map.set(numId, sid)
        }
        idMaps[name] = map
      }

      // 2패스 — id 승격 + FK 재작성 (+ projected dailyValues 제외).
      for (const name of MIGRATED_TABLES) {
        const out: Record<string, unknown>[] = []
        const fkDefs = MIGRATION_FK_DEFS[name] ?? []
        for (const row of raw[name]) {
          if (name === 'dailyValues' && row.source === 'projected') continue
          const numId = row.id as number | undefined
          const newId = numId != null
            ? idMaps[name].get(numId)!
            : (typeof row.syncId === 'string' && row.syncId ? row.syncId : crypto.randomUUID())
          const next: Record<string, unknown> = { ...row, id: newId }
          delete next.syncId
          let dropRow = false
          for (const def of fkDefs) {
            const v = next[def.field]
            if (typeof v !== 'number') continue // null/undefined는 그대로 (FK 없음)
            const mapped = idMaps[def.refTable].get(v)
            if (mapped != null) {
              next[def.field] = mapped
            } else if (name === 'dailyValues' && def.field === 'assetItemId') {
              dropRow = true // 자산 잃은 일별값은 쓰레기 — 버린다
            } else if (def.mode === 'nullable') {
              next[def.field] = null
            } else if (def.mode === 'optional') {
              delete next[def.field]
            } else {
              next[def.field] = '' // required — 미매칭 표식 ('' 조회는 항상 미스)
            }
          }
          if (!dropRow) out.push(next)
        }
        buffer.rows[name] = out
      }

      // 3패스 — 미처리 changelog를 아웃박스로 이관 (업로드 대기분 유실 방지).
      try {
        const pending = await tx.table('syncChangeLog')
          .where('processed').equals(0).toArray() as Array<{
            tableName: string; syncId: string; operation: string
            assetItemId?: number; date?: string; timestamp: string
          }>
        const byKey = new Map<string, SyncOutboxEntry>()
        for (const e of pending) {
          if (!MIGRATED_TABLES.includes(e.tableName as MigratedTableName)) continue
          // projected 행에 매달린 업서트는 드롭 (동기화 대상 아님)
          if (e.tableName === 'dailyValues' && e.operation !== 'delete') {
            const row = buffer.rows.dailyValues.find(r => r.id === e.syncId)
            if (!row) continue // 행 소실 — 좌표 메타 없으면 복원 불가, 드롭
          }
          const entry: SyncOutboxEntry = {
            key: `${e.tableName}:${e.syncId}`,
            tableName: e.tableName,
            recordId: e.syncId,
            op: e.operation === 'delete' ? 'delete' : 'upsert',
            queuedAt: e.timestamp || new Date().toISOString(),
          }
          if (e.tableName === 'dailyValues' && e.assetItemId != null && e.date) {
            const assetId = idMaps.assetItems.get(e.assetItemId)
            if (assetId) { entry.assetItemId = assetId; entry.date = e.date }
          }
          byKey.set(entry.key, entry) // 시간순 순회라 마지막 op가 이긴다
        }
        buffer.outbox = [...byKey.values()]
      } catch {
        // syncChangeLog가 없거나 읽기 실패 — 아웃박스 이관 없이 진행
        // (다음 로그인의 클라우드 리스너/수동 업로드가 수렴시킨다)
      }

      _migrationBuffer = buffer
    })

    // v15: 구 테이블 + 동기화 인프라 테이블 삭제 (버퍼가 데이터 보유 중)
    this.version(15).stores({
      members: null,
      assetCategories: null,
      assetItems: null,
      dailyValues: null,
      transactionCategories: null,
      transactions: null,
      budgets: null,
      goals: null,
      paymentMethodItems: null,
      subscriptions: null,
      loans: null,
      investmentTrades: null,
      dividends: null,
      accountInterests: null,
      merchantAliases: null,
      syncChangeLog: null,
      syncTombstones: null,
      syncMeta: null,
    })

    // v16: 문자열 PK 스키마로 재생성 + 버퍼 재기록 + syncOutbox 신설
    this.version(16).stores({
      members: 'id, name, sortOrder',
      assetCategories: 'id, name, type, sortOrder',
      assetItems: 'id, memberId, categoryId, type, isActive, sortOrder',
      dailyValues: 'id, assetItemId, date, [assetItemId+date]',
      transactionCategories: 'id, name, type, sortOrder',
      transactions: 'id, memberId, type, categoryId, date, isRecurring, recurSourceId, paymentMethod, paymentMethodItemId, subscriptionId',
      budgets: 'id, categoryId, month',
      goals: 'id, targetDate',
      paymentMethodItems: 'id, type, name, sortOrder, linkedAssetItemId',
      subscriptions: 'id, currency, category, status, billingDay, cycle, sortOrder, paymentMethodItemId',
      loans: 'id, isActive, sortOrder',
      investmentTrades: 'id, memberId, sellDate, assetType, market, stockName, sortOrder, [sellDate+stockName+sellQuantity]',
      dividends: 'id, memberId, paymentDate, exDividendDate, assetType, market, stockName, sortOrder, [paymentDate+stockName+quantity]',
      accountInterests: 'id, memberId, depositDate, currency, interestType, sortOrder, [depositDate+periodStart+periodEnd+currency]',
      merchantAliases: 'id, &merchantKey, categoryId, source, learnedAt, lastUsedAt',
      syncOutbox: '&key, tableName, queuedAt',
    }).upgrade(async (tx) => {
      markSyncTransaction()
      const buffer = _migrationBuffer
      if (!buffer) return // 신규 설치 (populate 경로) 또는 v14 미실행 — no-op
      for (const name of MIGRATED_TABLES) {
        const rows = buffer.rows[name]
        if (rows && rows.length > 0) {
          await tx.table(name).bulkAdd(rows)
        }
      }
      if (buffer.outbox.length > 0) {
        await tx.table('syncOutbox').bulkPut(buffer.outbox)
      }
      _migrationBuffer = null
    })
  }
}

// ── 마이그레이션 상수 ──────────────────────────────────
const MIGRATED_TABLES = [
  'members', 'assetCategories', 'assetItems', 'dailyValues',
  'transactionCategories', 'transactions', 'budgets', 'goals',
  'paymentMethodItems', 'subscriptions', 'loans',
  'investmentTrades', 'dividends', 'accountInterests', 'merchantAliases',
] as const
type MigratedTableName = typeof MIGRATED_TABLES[number]

interface MigrationBuffer {
  rows: Record<string, Record<string, unknown>[]>
  outbox: SyncOutboxEntry[]
}
// v14가 채우고 v16이 소비 — 같은 versionchange 트랜잭션 안에서만 유효.
let _migrationBuffer: MigrationBuffer | null = null

/** FK 필드 정의 — 마이그레이션의 숫자→문자열 재작성 대상. mode는 미매칭 시 처리. */
const MIGRATION_FK_DEFS: Partial<Record<MigratedTableName, Array<{
  field: string
  refTable: MigratedTableName
  mode: 'required' | 'nullable' | 'optional'
}>>> = {
  assetItems: [
    { field: 'memberId', refTable: 'members', mode: 'required' },
    { field: 'categoryId', refTable: 'assetCategories', mode: 'required' },
  ],
  dailyValues: [
    { field: 'assetItemId', refTable: 'assetItems', mode: 'required' },
  ],
  transactions: [
    { field: 'memberId', refTable: 'members', mode: 'nullable' },
    { field: 'categoryId', refTable: 'transactionCategories', mode: 'nullable' },
    { field: 'paymentMethodItemId', refTable: 'paymentMethodItems', mode: 'optional' },
    { field: 'recurSourceId', refTable: 'transactions', mode: 'optional' },
    { field: 'subscriptionId', refTable: 'subscriptions', mode: 'optional' },
  ],
  budgets: [
    { field: 'categoryId', refTable: 'transactionCategories', mode: 'required' },
  ],
  paymentMethodItems: [
    { field: 'linkedAssetItemId', refTable: 'assetItems', mode: 'optional' },
  ],
  subscriptions: [
    { field: 'paymentMethodItemId', refTable: 'paymentMethodItems', mode: 'optional' },
    { field: 'linkedTransactionCategoryId', refTable: 'transactionCategories', mode: 'optional' },
  ],
  loans: [
    { field: 'linkedAssetItemId', refTable: 'assetItems', mode: 'optional' },
  ],
  investmentTrades: [{ field: 'memberId', refTable: 'members', mode: 'nullable' }],
  dividends: [{ field: 'memberId', refTable: 'members', mode: 'nullable' }],
  accountInterests: [{ field: 'memberId', refTable: 'members', mode: 'nullable' }],
  merchantAliases: [
    { field: 'categoryId', refTable: 'transactionCategories', mode: 'required' },
    { field: 'subscriptionId', refTable: 'subscriptions', mode: 'optional' },
  ],
}

const db = new FinanceDatabase()

// 스토리지 영속화 요청 — 재무 데이터 로컬 SOT가 브라우저 스토리지 압박으로
// 무단 축출(eviction)되는 것을 방지한다. UA가 거부해도 동작에는 지장 없음
// (덜 안전해질 뿐). Chrome/Safari PWA는 보통 무프롬프트로 승인한다.
if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
  navigator.storage.persist().catch(() => { /* 미지원/거부 — 무시 */ })
}

// ─── Sync-Write Discrimination ────────────────────────
//
// 동기화 시스템 자신의 쓰기(클라우드 인제스트)는 아웃박스에 기록하면 안 된다
// (echo 루프 — 받은 것을 되올리게 됨). 이를 구분하는 메커니즘 2종:
//
// 1. 트랜잭션 마커 (권장, runSyncWrite/markSyncTransaction) — 동기화 쓰기를
//    명시적 Dexie 트랜잭션으로 감싸고 그 Transaction 객체를 WeakSet에 등록.
//    훅은 자신이 속한 트랜잭션의 마커를 보므로, 동기화 인제스트가 진행되는
//    동안 끼어든 "사용자" 쓰기(별도 트랜잭션)는 정확히 사용자 쓰기로 분류된다.
//
// 2. 전역 카운터 (레거시, setSyncWritingFlag) — clearAllData/importBackup/
//    seedTestData처럼 여러 트랜잭션에 걸친 파괴적 모달 플로우에서만 사용.
//    이 플래그가 켜진 동안의 모든 쓰기가 동기화 쓰기로 분류되므로, 사용자
//    쓰기가 동시에 일어날 수 있는 장시간 흐름(스냅샷 인제스트 등)에는
//    절대 쓰지 말 것 — 그 사용자 쓰기의 아웃박스 기록이 조용히 누락된다.
let _syncWritingCount = 0
export function setSyncWritingFlag(v: boolean) {
  if (v) _syncWritingCount++
  else _syncWritingCount = Math.max(0, _syncWritingCount - 1)
}
export function getSyncWritingFlag() { return _syncWritingCount > 0 }

const _syncWriteTransactions = new WeakSet<DexieTransaction>()

/** 현재 Dexie 트랜잭션을 동기화 쓰기로 표시한다 (트랜잭션 콜백 안에서 호출). */
export function markSyncTransaction(): void {
  const tx = Dexie.currentTransaction
  if (tx) _syncWriteTransactions.add(tx)
}

/**
 * 이 쓰기가 동기화 시스템에서 비롯됐는가 — Dexie 훅 안에서 호출된다.
 * 트랜잭션 마커를 우선 보고, 레거시 전역 카운터를 폴백으로 본다.
 */
export function isSyncWriteContext(): boolean {
  const tx = Dexie.currentTransaction
  if (tx && _syncWriteTransactions.has(tx)) return true
  return _syncWritingCount > 0
}

/**
 * 동기화 인제스트 쓰기를 마커가 달린 명시적 트랜잭션으로 실행한다.
 * scope에는 쓰기 대상 테이블뿐 아니라 콜백이 읽는 테이블도 포함해야 한다.
 * 콜백 안에서는 Dexie 연산 외의 await(네트워크 등)를 하지 말 것 —
 * 트랜잭션이 조기 커밋된다.
 */
export async function runSyncWrite<T>(tables: Table[], fn: () => Promise<T>): Promise<T> {
  return db.transaction('rw', tables, async () => {
    markSyncTransaction()
    return fn()
  })
}

/**
 * SINGLE SOURCE OF TRUTH for the 15 synced tables.
 * Add a new synced table HERE (one entry). The type union (SyncableTableName),
 * SYNCABLE_TABLE_NAMES, the change-tracking hooks below, and the Firestore
 * listener set (firestoreSync) all derive from this list. The exhaustive
 * Record<> maps elsewhere (getLocalTable…) will then fail to compile until
 * the new table is handled there too.
 */
export const SYNCABLE_TABLES = [
  { name: 'members', table: db.members },
  { name: 'assetCategories', table: db.assetCategories },
  { name: 'assetItems', table: db.assetItems },
  { name: 'dailyValues', table: db.dailyValues },
  { name: 'transactionCategories', table: db.transactionCategories },
  { name: 'transactions', table: db.transactions },
  { name: 'budgets', table: db.budgets },
  { name: 'goals', table: db.goals },
  { name: 'paymentMethodItems', table: db.paymentMethodItems },
  { name: 'subscriptions', table: db.subscriptions },
  { name: 'loans', table: db.loans },
  { name: 'investmentTrades', table: db.investmentTrades },
  { name: 'dividends', table: db.dividends },
  { name: 'accountInterests', table: db.accountInterests },
  { name: 'merchantAliases', table: db.merchantAliases },
] as const satisfies readonly { name: string; table: Table }[]

export type SyncableTableName = typeof SYNCABLE_TABLES[number]['name']
export const SYNCABLE_TABLE_NAMES = SYNCABLE_TABLES.map((t) => t.name) as SyncableTableName[]

// ─── Post-commit Outbox Queue ─────────────────────────
//
// CRUD 훅은 원본 테이블의 트랜잭션 안에서 발화하는데, 그 스코프에는
// syncOutbox가 없어 직접 쓰면 NotFoundError로 조용히 실패한다 (레거시
// changelog 시절 라이브 동기화 불능의 근본 원인이었다). 따라서 훅은 여기
// 큐에 적재하고, 트랜잭션당 1개의 'complete' 리스너가 커밋 후에
// Dexie.ignoreTransaction으로 일괄 기록한다. 커밋 후 기록이므로 abort된
// 트랜잭션의 변경이 아웃박스에 남는 일도 구조적으로 없다.
const _pendingOutboxEntries = new WeakMap<DexieTransaction, SyncOutboxEntry[]>()

// In-flight post-commit writes. 파괴적 리셋(clearAllData, importBackup)은
// syncOutbox를 비우기 전에 이것을 드레인한다 — 리셋 직전에 커밋된 쓰기의
// 아웃박스 행이 wipe 이후에 도착해 잔존하면 유령 업로드가 된다.
const _inflightOutboxWrites = new Set<Promise<void>>()

/** Waits for all queued post-commit outbox writes to settle. */
export async function drainChangeTracking(): Promise<void> {
  while (_inflightOutboxWrites.size > 0) {
    await Promise.allSettled([..._inflightOutboxWrites])
  }
}

// "사용자 쓰기가 아웃박스에 기록됨" 신호 — 동기화 푸시 스케줄러가 구독한다.
type UserWriteListener = () => void
const _userWriteListeners = new Set<UserWriteListener>()

/** 사용자 쓰기가 아웃박스에 기록될 때 호출될 리스너 등록. 해지 함수를 반환한다. */
export function onUserWritePersisted(listener: UserWriteListener): () => void {
  _userWriteListeners.add(listener)
  return () => { _userWriteListeners.delete(listener) }
}

function notifyUserWrite(): void {
  for (const listener of _userWriteListeners) {
    try { listener() } catch (err) { console.error('[sync] user-write listener failed:', err) }
  }
}

/** 미푸시 아웃박스 항목 수 — UI '대기 N건' 표시용. */
export async function countPendingOutbox(): Promise<number> {
  return db.syncOutbox.count()
}

function persistOutboxEntries(entries: SyncOutboxEntry[]): void {
  if (entries.length === 0) return
  // 레코드당 1행 — 같은 트랜잭션에서 여러 번 변경돼도 마지막 op가 이긴다.
  const byKey = new Map<string, SyncOutboxEntry>()
  for (const e of entries) byKey.set(e.key, e)
  const rows = [...byKey.values()]
  const p: Promise<void> = Dexie.ignoreTransaction(async () => {
    try {
      await db.syncOutbox.bulkPut(rows)
    } catch (err) {
      console.error('[sync] outbox write failed:', err)
    }
  }).finally(() => { _inflightOutboxWrites.delete(p) })
  _inflightOutboxWrites.add(p)
  notifyUserWrite()
}

function queueOutboxEntry(entry: SyncOutboxEntry): void {
  const tx = Dexie.currentTransaction
  if (!tx) {
    // Hooks always run inside a transaction; defensive fallback only.
    persistOutboxEntries([entry])
    return
  }
  let pending = _pendingOutboxEntries.get(tx)
  if (!pending) {
    const fresh: SyncOutboxEntry[] = []
    pending = fresh
    _pendingOutboxEntries.set(tx, fresh)
    tx.on('complete', () => persistOutboxEntries(fresh))
  }
  pending.push(entry)
}

function installChangeTracking() {
  // 동기화 테이블 목록은 SYNCABLE_TABLES(단일 출처)에서 파생한다.
  const tables = SYNCABLE_TABLES

  // dailyValues만 (자산×일자) 좌표를 아웃박스에 동반 기록한다 — 번들
  // 업로드(자산×월 묶음 문서)가 삭제 항목의 좌표를 복원할 유일한 출처다
  // (행은 이미 지워져 id만으로는 좌표를 알 수 없다).
  const dvMeta = (name: SyncableTableName, obj: unknown): { assetItemId?: string; date?: string } => {
    if (name !== 'dailyValues') return {}
    const dv = obj as { assetItemId?: string; date?: string } | undefined
    return dv?.assetItemId && dv?.date
      ? { assetItemId: dv.assetItemId, date: dv.date }
      : {}
  }

  // dailyValues 의 projected(파생) 행은 동기화하지 않는다 — 각 기기가 manual
  // 앵커로부터 로컬 재생성한다. 아웃박스에 기록하지 않는다.
  const skipProjectedDv = (name: SyncableTableName, source: unknown): boolean =>
    name === 'dailyValues' && source === 'projected'

  const entryFor = (
    name: SyncableTableName,
    id: unknown,
    op: 'upsert' | 'delete',
    obj: unknown,
  ): SyncOutboxEntry | null => {
    if (typeof id !== 'string' || !id) return null
    return {
      key: `${name}:${id}`,
      tableName: name,
      recordId: id,
      op,
      queuedAt: new Date().toISOString(),
      ...dvMeta(name, obj),
    }
  }

  for (const { table, name } of tables) {
    table.hook('creating', function (primKey, obj) {
      // Sync-originated writes (transaction marker or legacy global flag)
      // are never queued (echo suppression).
      if (isSyncWriteContext()) return
      if (skipProjectedDv(name, (obj as { source?: string })?.source)) return
      const entry = entryFor(name, primKey ?? (obj as { id?: string })?.id, 'upsert', obj)
      if (entry) queueOutboxEntry(entry)
    })

    table.hook('updating', function (mods, primKey, obj) {
      if (isSyncWriteContext()) return
      // 갱신 후의 유효 source 로 판정 (변경분에 source 가 있으면 그것, 없으면 기존).
      const effSource = (mods as { source?: string }).source !== undefined
        ? (mods as { source?: string }).source
        : (obj as { source?: string })?.source
      if (skipProjectedDv(name, effSource)) return
      const entry = entryFor(name, primKey, 'upsert', obj)
      if (entry) queueOutboxEntry(entry)
    })

    table.hook('deleting', function (primKey, obj) {
      if (isSyncWriteContext()) return
      if (skipProjectedDv(name, (obj as { source?: string })?.source)) return
      const entry = entryFor(name, primKey, 'delete', obj)
      if (entry) queueOutboxEntry(entry)
    })
  }
}

installChangeTracking()

// Deterministic ids for seeded defaults. Used by both `db.on('populate')`
// (initial seed) and `ensureDefaultCategories` (late-addition top-up) so that
// every device produces identical ids for the same logical default record.
// This eliminates the new-device duplicate bug at the source.
export const defaultMemberId = (name: string) => `default:member:${name}`
export const defaultAssetCatId = (type: string, name: string) => `default:assetCat:${type}:${name}`
export const defaultTxnCatId = (type: string, name: string) => `default:txnCat:${type}:${name}`

// Ensure default categories exist — called from App.tsx init, NOT from db.on('ready')
// because async db.on('ready') callbacks cause Dexie deadlock (queries hang forever).
//
// Uses deterministic ids (matching `db.on('populate')`) so that late-added
// defaults converge across devices via id equality instead of duplicating.
export async function ensureDefaultCategories(): Promise<void> {
  const assetCats = await db.assetCategories.toArray()
  if (!assetCats.some((c) => c.name === '부동산')) {
    // 시드는 deterministic id로 기기 간 수렴하므로 아웃박스 불필요 —
    // 마커 트랜잭션으로 감싼다 (첫 로그인 fullUpload가 어차피 전량을 올린다).
    const now = new Date().toISOString()
    const maxSort = assetCats
      .filter((c) => c.type === 'asset')
      .reduce((max, c) => Math.max(max, c.sortOrder), -1)
    await runSyncWrite([db.assetCategories], async () => {
      await db.assetCategories.add({
        id: defaultAssetCatId('asset', '부동산'),
        name: '부동산',
        type: 'asset',
        color: '#D97706',
        icon: 'Home',
        sortOrder: maxSort + 1,
        createdAt: now,
        updatedAt: now,
      })
    })
  }

  const txnCats = await db.transactionCategories.toArray()
  if (!txnCats.some((c) => c.name === '대출이자')) {
    const now = new Date().toISOString()
    const expenseCats = txnCats.filter((c) => c.type === 'expense')
    const maxSort = expenseCats.reduce((max, c) => Math.max(max, c.sortOrder), -1)
    await runSyncWrite([db.transactionCategories], async () => {
      await db.transactionCategories.add({
        id: defaultTxnCatId('expense', '대출이자'),
        name: '대출이자',
        type: 'expense',
        color: '#B91C1C',
        icon: 'Percent',
        isDefault: true,
        sortOrder: maxSort + 1,
        createdAt: now,
        updatedAt: now,
      })
    })
  }
}

db.on('populate', () => {
  // Seed writes run INSIDE db.open()'s versionchange transaction. Mark it as a
  // sync write so the CRUD 'creating' hooks skip outbox queueing (deterministic
  // default:* ids converge across devices; the first-login full upload re-reads
  // all rows regardless). Must be the FIRST statement: the bulkAdd 'creating'
  // hooks fire synchronously inside this tx.
  markSyncTransaction()
  const now = new Date().toISOString()

  // Default members
  db.members.bulkAdd(
    DEFAULT_MEMBERS.map((m, i) => ({
      ...m,
      id: defaultMemberId(m.name),
      isDefault: true,
      sortOrder: i,
      createdAt: now,
      updatedAt: now,
    }))
  )

  // Default asset categories
  const seedAssetCat = (name: string, type: 'asset' | 'liability', color: string, icon: string, sortOrder: number): AssetCategory => ({
    id: defaultAssetCatId(type, name), name, type, color, icon, sortOrder, createdAt: now, updatedAt: now,
  })
  db.assetCategories.bulkAdd([
    seedAssetCat('퇴직금', 'asset', '#6366F1', 'Landmark', 0),
    seedAssetCat('주식', 'asset', '#3B82F6', 'TrendingUp', 1),
    seedAssetCat('암호화폐', 'asset', '#F59E0B', 'Bitcoin', 2),
    seedAssetCat('거래소 현금', 'asset', '#10B981', 'Banknote', 3),
    seedAssetCat('금', 'asset', '#EAB308', 'Gem', 4),
    seedAssetCat('은행계좌', 'asset', '#06B6D4', 'Building2', 5),
    seedAssetCat('부동산', 'asset', '#D97706', 'Home', 6),
    seedAssetCat('기타자산', 'asset', '#8B5CF6', 'Package', 7),
    seedAssetCat('주택대출', 'liability', '#EF4444', 'Home', 0),
    seedAssetCat('신용대출', 'liability', '#F97316', 'CreditCard', 1),
    seedAssetCat('마이너스 대출', 'liability', '#DC2626', 'MinusCircle', 2),
    seedAssetCat('회사 대출', 'liability', '#E11D48', 'Building', 3),
    seedAssetCat('개인 대출', 'liability', '#BE185D', 'Users', 4),
  ])

  // Default transaction categories
  const seedTxnCat = (name: string, type: TransactionType, color: string, icon: string, sortOrder: number): TransactionCategory => ({
    id: defaultTxnCatId(type, name), name, type, color, icon, isDefault: true, sortOrder, createdAt: now, updatedAt: now,
  })
  db.transactionCategories.bulkAdd([
    // Income
    seedTxnCat('월급', 'income', '#10B981', 'Briefcase', 0),
    seedTxnCat('부수입', 'income', '#06B6D4', 'Coins', 1),
    seedTxnCat('투자수익', 'income', '#8B5CF6', 'TrendingUp', 2),
    seedTxnCat('다연여행수입', 'income', '#14B8A6', 'Plane', 3),
    seedTxnCat('가상화폐수익', 'income', '#F59E0B', 'Bitcoin', 4),
    seedTxnCat('주식수익', 'income', '#22C55E', 'LineChart', 5),
    seedTxnCat('기타', 'income', '#71717A', 'MoreHorizontal', 6),
    // Expense
    seedTxnCat('식비', 'expense', '#F59E0B', 'UtensilsCrossed', 0),
    seedTxnCat('교통비', 'expense', '#3B82F6', 'Car', 1),
    seedTxnCat('주거비', 'expense', '#8B5CF6', 'Home', 2),
    seedTxnCat('통신비', 'expense', '#EC4899', 'Smartphone', 3),
    seedTxnCat('의료비', 'expense', '#EF4444', 'Heart', 4),
    seedTxnCat('교육비', 'expense', '#6366F1', 'GraduationCap', 5),
    seedTxnCat('건강', 'expense', '#EF4444', 'HeartPulse', 6),
    seedTxnCat('경조사/회비', 'expense', '#A855F7', 'Gift', 7),
    seedTxnCat('대출상환', 'expense', '#DC2626', 'Landmark', 8),
    seedTxnCat('대출이자', 'expense', '#B91C1C', 'Percent', 9),
    seedTxnCat('마트/편의점', 'expense', '#FB923C', 'ShoppingCart', 10),
    seedTxnCat('보험', 'expense', '#0EA5E9', 'Shield', 11),
    seedTxnCat('부모님', 'expense', '#EC4899', 'Heart', 12),
    seedTxnCat('생활용품', 'expense', '#84CC16', 'Package', 13),
    seedTxnCat('여행', 'expense', '#06B6D4', 'Map', 14),
    seedTxnCat('카드대금', 'expense', '#F43F5E', 'CreditCard', 15),
    seedTxnCat('투자', 'expense', '#6366F1', 'TrendingUp', 16),
    seedTxnCat('패션/미용', 'expense', '#E879F9', 'Shirt', 17),
    seedTxnCat('기타', 'expense', '#71717A', 'MoreHorizontal', 18),
  ])
})

export { db }

/** 입력 객체에 id가 없으면 생성해 채운다 — add* 헬퍼 공용. */
function withId<T extends { id?: string }>(obj: T): T & { id: string } {
  return obj.id ? (obj as T & { id: string }) : { ...obj, id: createId() }
}

// ─── Member CRUD ──────────────────────────────────
export async function getAllMembers(): Promise<Member[]> {
  return db.members.orderBy('sortOrder').toArray()
}

export async function addMember(member: Omit<Member, 'id'> & { id?: string }): Promise<string> {
  return db.members.add(withId(member) as Member)
}

export async function updateMember(id: string, updates: Partial<Member>): Promise<void> {
  await db.members.update(id, { ...updates, updatedAt: new Date().toISOString() })
}

export async function deleteMember(id: string): Promise<void> {
  await db.transaction('rw', [db.members, db.assetItems, db.dailyValues, db.transactions], async () => {
    const items = await db.assetItems.where('memberId').equals(id).toArray()
    for (const item of items) {
      await db.dailyValues.where('assetItemId').equals(item.id).delete()
    }
    await db.assetItems.where('memberId').equals(id).delete()
    await db.transactions.where('memberId').equals(id).delete()
    await db.members.delete(id)
  })
}

// ─── AssetCategory CRUD ───────────────────────────
export async function getAllAssetCategories(): Promise<AssetCategory[]> {
  return db.assetCategories.orderBy('sortOrder').toArray()
}

export async function addAssetCategory(cat: Omit<AssetCategory, 'id'> & { id?: string }): Promise<string> {
  return db.assetCategories.add(withId(cat) as AssetCategory)
}

export async function updateAssetCategory(id: string, updates: Partial<AssetCategory>): Promise<void> {
  await db.assetCategories.update(id, { ...updates, updatedAt: new Date().toISOString() })
}

export async function deleteAssetCategory(id: string): Promise<void> {
  await db.transaction('rw', [db.assetCategories, db.assetItems, db.dailyValues], async () => {
    const items = await db.assetItems.where('categoryId').equals(id).toArray()
    for (const item of items) {
      await db.dailyValues.where('assetItemId').equals(item.id).delete()
    }
    await db.assetItems.where('categoryId').equals(id).delete()
    await db.assetCategories.delete(id)
  })
}

// ─── AssetItem CRUD ───────────────────────────────
export async function getAllAssetItems(): Promise<AssetItem[]> {
  return db.assetItems.orderBy('sortOrder').toArray()
}

export async function getAssetItemsByMember(memberId: string): Promise<AssetItem[]> {
  return db.assetItems.where('memberId').equals(memberId).toArray()
}

export async function getAssetItemsByCategory(categoryId: string): Promise<AssetItem[]> {
  return db.assetItems.where('categoryId').equals(categoryId).toArray()
}

export async function addAssetItem(item: Omit<AssetItem, 'id'> & { id?: string }): Promise<string> {
  return db.assetItems.add(withId(item) as AssetItem)
}

export async function updateAssetItem(id: string, updates: Partial<AssetItem>): Promise<void> {
  await db.assetItems.update(id, { ...updates, updatedAt: new Date().toISOString() })
}

/** 자산/부채 항목 삭제 + 일별값 삭제 + 연결된 대출의 댕글링 FK(linkedAssetItemId) 정리.
 *  클라우드 반영은 아웃박스(훅)가 자동 처리한다. */
export async function deleteAssetItem(id: string): Promise<Loan[]> {
  const now = new Date().toISOString()
  let cleared: Loan[] = []
  await db.transaction('rw', [db.assetItems, db.dailyValues, db.loans], async () => {
    await db.dailyValues.where('assetItemId').equals(id).delete()
    await db.assetItems.delete(id)
    // linkedAssetItemId 는 인덱스가 아니므로 인메모리 filter 로 조회 후 일괄 해제.
    const linked = await db.loans.filter(l => l.linkedAssetItemId === id).toArray()
    if (linked.length > 0) {
      cleared = linked.map(l => ({ ...l, linkedAssetItemId: undefined, updatedAt: now }))
      await db.loans.bulkPut(cleared)
    }
  })
  return cleared
}

// ─── DailyValue CRUD ──────────────────────────────
export async function getAllDailyValues(): Promise<DailyValue[]> {
  return db.dailyValues.toArray()
}

export async function getDailyValuesByMonth(month: string): Promise<DailyValue[]> {
  return db.dailyValues
    .where('date')
    .between(month + '-01', month + '-31', true, true)
    .toArray()
}

export async function getDailyValuesByItem(assetItemId: string): Promise<DailyValue[]> {
  return db.dailyValues.where('assetItemId').equals(assetItemId).toArray()
}

export async function getDailyValue(assetItemId: string, date: string): Promise<DailyValue | undefined> {
  return db.dailyValues.where('[assetItemId+date]').equals([assetItemId, date]).first()
}

export async function setDailyValue(assetItemId: string, date: string, value: number): Promise<void> {
  const now = new Date().toISOString()
  const existing = await getDailyValue(assetItemId, date)
  if (existing) {
    await db.dailyValues.update(existing.id, { value, updatedAt: now })
  } else {
    await db.dailyValues.add({
      id: createId(),
      assetItemId,
      date,
      value,
      createdAt: now,
      updatedAt: now,
    })
  }
}

export async function bulkSetDailyValues(entries: { assetItemId: string; date: string; value: number; source?: 'manual' | 'projected' }[]): Promise<void> {
  const now = new Date().toISOString()
  await db.transaction('rw', db.dailyValues, async () => {
    for (const entry of entries) {
      const existing = await getDailyValue(entry.assetItemId, entry.date)
      if (existing) {
        // projected 계산값은 수동/레거시(undefined) 앵커를 절대 덮어쓰지 않는다 —
        // 앵커는 사용자 원천 데이터이고 덮어쓰면 동기화로 복구 불가. projected→projected
        // 재계산과 수동 편집(source!=='projected')은 정상 통과한다.
        if (entry.source === 'projected' && existing.source !== 'projected') continue
        await db.dailyValues.update(existing.id, { value: entry.value, source: entry.source ?? existing.source, updatedAt: now })
      } else {
        await db.dailyValues.add({
          id: createId(),
          assetItemId: entry.assetItemId,
          date: entry.date,
          value: entry.value,
          source: entry.source,
          createdAt: now,
          updatedAt: now,
        })
      }
    }
  })
}

/** 항목의 자동 생성(projected) 일별 값을 모두 삭제한다. 수동 입력(manual)은 보존.
 *  평탄 규칙으로 전환하거나 희소 저장으로 정리할 때 사용. 반환=삭제된 id 목록. */
export async function clearProjectedDailyValues(assetItemId: string): Promise<string[]> {
  const vals = await db.dailyValues.where('assetItemId').equals(assetItemId).toArray()
  const toDelete = vals.filter(v => v.source !== 'manual' && v.source !== undefined) // 명시적 projected 만
  const ids = toDelete.map(v => v.id)
  if (ids.length > 0) await db.dailyValues.bulkDelete(ids)
  return ids
}

export async function getLatestDailyValues(assetItemId: string, limit: number = 30): Promise<DailyValue[]> {
  const vals = await db.dailyValues
    .where('assetItemId')
    .equals(assetItemId)
    .toArray()
  return vals.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit)
}

// ─── TransactionCategory CRUD ─────────────────────
export async function getAllTransactionCategories(): Promise<TransactionCategory[]> {
  return db.transactionCategories.orderBy('sortOrder').toArray()
}

export async function addTransactionCategory(cat: Omit<TransactionCategory, 'id'> & { id?: string }): Promise<string> {
  return db.transactionCategories.add(withId(cat) as TransactionCategory)
}

export async function updateTransactionCategory(id: string, updates: Partial<TransactionCategory>): Promise<void> {
  await db.transactionCategories.update(id, { ...updates, updatedAt: new Date().toISOString() })
}

export async function deleteTransactionCategory(id: string): Promise<void> {
  await db.transaction('rw', [db.transactionCategories, db.transactions], async () => {
    await db.transactions.where('categoryId').equals(id).modify({ categoryId: null })
    await db.transactionCategories.delete(id)
  })
}

export interface TransactionCategoryUsage {
  transactionCount: number
  transactionTotal: number
  incomeCount: number
  incomeTotal: number
  expenseCount: number
  expenseTotal: number
  recurringSourceCount: number
  budgetCount: number
  budgetMonths: string[]
  linkedSubscriptions: { id: string; name: string }[]
  recentTransactions: { id: string; date: string; amount: number; memo?: string; type: TransactionType }[]
}

export async function getTransactionCategoryUsage(id: string): Promise<TransactionCategoryUsage> {
  const [transactions, budgets, subscriptions] = await Promise.all([
    db.transactions.where('categoryId').equals(id).toArray(),
    db.budgets.where('categoryId').equals(id).toArray(),
    db.subscriptions.toArray(),
  ])

  let incomeCount = 0
  let incomeTotal = 0
  let expenseCount = 0
  let expenseTotal = 0
  let recurringSourceCount = 0
  for (const t of transactions) {
    if (t.type === 'income') {
      incomeCount += 1
      incomeTotal += t.amount
    } else {
      expenseCount += 1
      expenseTotal += t.amount
    }
    if (t.isRecurring && !t.recurSourceId) recurringSourceCount += 1
  }

  const recentTransactions = [...transactions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5)
    .map(t => ({ id: t.id, date: t.date, amount: t.amount, memo: t.memo, type: t.type }))

  const budgetMonths = Array.from(new Set(budgets.map(b => b.month))).sort((a, b) => b.localeCompare(a))

  const linkedSubscriptions = subscriptions
    .filter(s => s.linkedTransactionCategoryId === id)
    .map(s => ({ id: s.id, name: s.name }))

  return {
    transactionCount: transactions.length,
    transactionTotal: incomeTotal + expenseTotal,
    incomeCount,
    incomeTotal,
    expenseCount,
    expenseTotal,
    recurringSourceCount,
    budgetCount: budgets.length,
    budgetMonths,
    linkedSubscriptions,
    recentTransactions,
  }
}

// ─── PaymentMethodItem CRUD ──────────────────────
export async function getAllPaymentMethodItems(): Promise<PaymentMethodItem[]> {
  return db.paymentMethodItems.orderBy('sortOrder').toArray()
}

export async function getPaymentMethodItemsByType(type: string): Promise<PaymentMethodItem[]> {
  return db.paymentMethodItems.where('type').equals(type).sortBy('sortOrder')
}

export async function addPaymentMethodItem(item: Omit<PaymentMethodItem, 'id'> & { id?: string }): Promise<string> {
  return db.paymentMethodItems.add(withId(item) as PaymentMethodItem)
}

export async function updatePaymentMethodItem(id: string, updates: Partial<PaymentMethodItem>): Promise<void> {
  await db.paymentMethodItems.update(id, { ...updates, updatedAt: new Date().toISOString() })
}

export async function deletePaymentMethodItem(id: string): Promise<void> {
  await db.transaction('rw', [db.paymentMethodItems, db.transactions], async () => {
    await db.transactions.where('paymentMethodItemId').equals(id).modify({ paymentMethodItemId: undefined })
    await db.paymentMethodItems.delete(id)
  })
}

// ─── Transaction CRUD ─────────────────────────────
export async function getAllTransactions(): Promise<Transaction[]> {
  return db.transactions.toArray()
}

/** Count of expense transactions with no category — drives the AI bulk-categorize entry point. */
export async function countUncategorizedExpenses(): Promise<number> {
  return db.transactions.filter((t) => t.type === 'expense' && t.categoryId == null).count()
}

export async function getTransactionsByMonth(month: string): Promise<Transaction[]> {
  return db.transactions
    .where('date')
    .between(month + '-01', month + '-31', true, true)
    .toArray()
}

export async function getTransactionsByDateRange(start: string, end: string): Promise<Transaction[]> {
  return db.transactions
    .where('date')
    .between(start, end, true, true)
    .toArray()
}

export async function addTransaction(txn: Omit<Transaction, 'id'> & { id?: string }): Promise<string> {
  return db.transactions.add(withId(txn) as Transaction)
}

export async function updateTransaction(id: string, updates: Partial<Transaction>): Promise<void> {
  await db.transactions.update(id, { ...updates, updatedAt: new Date().toISOString() })
}

export async function deleteTransaction(id: string): Promise<void> {
  await db.transactions.delete(id)
}

export async function bulkDeleteTransactions(ids: string[]): Promise<void> {
  await db.transaction('rw', db.transactions, async () => {
    for (const id of ids) {
      await db.transactions.delete(id)
    }
  })
}

// ─── Budget CRUD ─────────────────────────────────
export async function getAllBudgets(): Promise<Budget[]> {
  return db.budgets.toArray()
}

export async function getBudgetsByMonth(month: string): Promise<Budget[]> {
  return db.budgets.where('month').equals(month).toArray()
}

export async function setBudget(categoryId: string, month: string, amount: number): Promise<void> {
  const now = new Date().toISOString()
  const existing = await db.budgets.where({ categoryId, month }).first()
  if (existing) {
    await db.budgets.update(existing.id, { amount, updatedAt: now })
  } else {
    await db.budgets.add({
      id: createId(),
      categoryId,
      month,
      amount,
      createdAt: now,
      updatedAt: now,
    })
  }
}

export async function deleteBudget(id: string): Promise<void> {
  await db.budgets.delete(id)
}

// ─── Goal CRUD ───────────────────────────────────
export async function getAllGoals(): Promise<FinancialGoal[]> {
  return db.goals.toArray()
}

export async function addGoal(goal: Omit<FinancialGoal, 'id'> & { id?: string }): Promise<string> {
  return db.goals.add(withId(goal) as FinancialGoal)
}

export async function updateGoal(id: string, updates: Partial<FinancialGoal>): Promise<void> {
  await db.goals.update(id, { ...updates, updatedAt: new Date().toISOString() })
}

export async function deleteGoal(id: string): Promise<void> {
  await db.goals.delete(id)
}

// ─── Subscription CRUD ──────────────────────────
export async function getAllSubscriptions(): Promise<Subscription[]> {
  return db.subscriptions.orderBy('sortOrder').toArray()
}

export async function getActiveSubscriptions(): Promise<Subscription[]> {
  return db.subscriptions.where('status').equals('active').sortBy('sortOrder')
}

export async function addSubscription(sub: Omit<Subscription, 'id'> & { id?: string }): Promise<string> {
  return db.subscriptions.add(withId(sub) as Subscription)
}

export async function updateSubscription(id: string, updates: Partial<Subscription>): Promise<void> {
  await db.subscriptions.update(id, { ...updates, updatedAt: new Date().toISOString() })
}

export async function deleteSubscription(id: string): Promise<void> {
  await db.subscriptions.delete(id)
}

// ─── Loan CRUD ──────────────────────────────────
export async function getAllLoans(): Promise<Loan[]> {
  return db.loans.orderBy('sortOrder').toArray()
}

export async function getActiveLoans(): Promise<Loan[]> {
  // isActive 는 JS boolean 으로 저장 — IndexedDB 인덱스에서 .equals(1) 은 매칭되지 않으므로
  // 인메모리 filter 로 평가한다.
  return (await db.loans.orderBy('sortOrder').toArray()).filter(l => l.isActive)
}

export async function addLoan(loan: Omit<Loan, 'id'> & { id?: string }): Promise<string> {
  return db.loans.add(withId(loan) as Loan)
}

export async function updateLoan(id: string, updates: Partial<Loan>): Promise<void> {
  await db.loans.update(id, { ...updates, updatedAt: new Date().toISOString() })
}

export async function deleteLoan(id: string): Promise<void> {
  await db.loans.delete(id)
}

// ─── Investment Trade CRUD ──────────────────────
export async function getAllInvestmentTrades(): Promise<InvestmentTrade[]> {
  return db.investmentTrades.orderBy('sortOrder').toArray()
}

export async function addInvestmentTrade(trade: Omit<InvestmentTrade, 'id'> & { id?: string }): Promise<string> {
  return db.investmentTrades.add(withId(trade) as InvestmentTrade)
}

export async function updateInvestmentTrade(id: string, updates: Partial<InvestmentTrade>): Promise<void> {
  await db.investmentTrades.update(id, { ...updates, updatedAt: new Date().toISOString() })
}

export async function deleteInvestmentTrade(id: string): Promise<void> {
  await db.investmentTrades.delete(id)
}

export async function findDuplicateInvestmentTrade(sellDate: string, stockName: string, sellQuantity: number): Promise<InvestmentTrade | undefined> {
  return db.investmentTrades
    .where('[sellDate+stockName+sellQuantity]')
    .equals([sellDate, stockName, sellQuantity])
    .first()
}

// ─── Dividend CRUD ──────────────────────────────
export async function getAllDividends(): Promise<Dividend[]> {
  return db.dividends.orderBy('sortOrder').toArray()
}

export async function addDividend(div: Omit<Dividend, 'id'> & { id?: string }): Promise<string> {
  return db.dividends.add(withId(div) as Dividend)
}

export async function updateDividend(id: string, updates: Partial<Dividend>): Promise<void> {
  await db.dividends.update(id, { ...updates, updatedAt: new Date().toISOString() })
}

export async function deleteDividend(id: string): Promise<void> {
  await db.dividends.delete(id)
}

export async function findDuplicateDividend(paymentDate: string, stockName: string, quantity: number): Promise<Dividend | undefined> {
  return db.dividends
    .where('[paymentDate+stockName+quantity]')
    .equals([paymentDate, stockName, quantity])
    .first()
}

// ─── Account Interest CRUD ──────────────────────
export async function getAllAccountInterests(): Promise<AccountInterest[]> {
  return db.accountInterests.orderBy('sortOrder').toArray()
}

export async function addAccountInterest(interest: Omit<AccountInterest, 'id'> & { id?: string }): Promise<string> {
  return db.accountInterests.add(withId(interest) as AccountInterest)
}

export async function updateAccountInterest(id: string, updates: Partial<AccountInterest>): Promise<void> {
  await db.accountInterests.update(id, { ...updates, updatedAt: new Date().toISOString() })
}

export async function deleteAccountInterest(id: string): Promise<void> {
  await db.accountInterests.delete(id)
}

export async function findDuplicateAccountInterest(depositDate: string, periodStart: string, periodEnd: string, currency: string): Promise<AccountInterest | undefined> {
  return db.accountInterests
    .where('[depositDate+periodStart+periodEnd+currency]')
    .equals([depositDate, periodStart, periodEnd, currency])
    .first()
}

// ─── Recurring Transaction Helpers ───────────────
export async function getRecurringTransactions(): Promise<Transaction[]> {
  return db.transactions.where('isRecurring').equals(1).toArray()
}

export async function getTransactionsBySubscriptionId(subscriptionId: string): Promise<Transaction[]> {
  return db.transactions.where('subscriptionId').equals(subscriptionId).toArray()
}

// ─── Bulk Operations ───────────────────────────────
/**
 * Destructive local reset — 이 기기의 로컬 복사본만 지운다. 클라우드 데이터는
 * 보존되며 다음 로그인/리스너 스냅샷에서 다시 내려온다.
 *
 * wipe 전체를 sync-writing 플래그로 감싼다: per-row deleting 훅이 아웃박스에
 * 수천 건의 delete를 큐잉하면 클라우드 전체가 지워진다(다른 기기 데이터
 * 소실). 이 리셋은 로컬 전용이어야 한다.
 */
export async function clearAllData(): Promise<void> {
  setSyncWritingFlag(true)
  try {
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
    await db.investmentTrades.clear()
    await db.dividends.clear()
    await db.accountInterests.clear()
    await db.merchantAliases.clear()
    // 직전 사용자 쓰기가 큐잉한 post-commit 아웃박스 행이 아래 clear 이후에
    // 도착해 잔존하지 않도록, 먼저 in-flight 기록을 모두 드레인한다.
    await drainChangeTracking()
    await db.syncOutbox.clear()

    const now = new Date().toISOString()
    await db.members.bulkAdd(
      DEFAULT_MEMBERS.map((m, i) => ({
        ...m,
        id: defaultMemberId(m.name),
        isDefault: true,
        sortOrder: i,
        createdAt: now,
        updatedAt: now,
      }))
    )
  } finally {
    setSyncWritingFlag(false)
  }
}
