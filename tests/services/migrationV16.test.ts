// ─── Dexie v13 → v16 마이그레이션 (Sync v2 문자열 PK 전환) ──────────────────
//
// 검증 대상 (database.ts v14~v16 버전 체인):
//   a) 각 행의 id가 구 syncId로 승격되고 syncId 필드는 소멸.
//      syncId 없던 행은 UUID를 부여받는다.
//   b) FK 재작성 — 숫자 FK가 부모의 문자열 id로. 매핑 실패 시:
//      nullable→null, optional→필드 소멸, required→'' (dailyValues 제외).
//   c) dailyValues — projected 행 드롭, assetItemId 재작성,
//      부모 자산 소실 행 드롭.
//   d) 미처리 syncChangeLog(processed=0) → syncOutbox 이관
//      (create/update→upsert, delete→delete, 레코드당 1행 + 마지막 op 승리,
//       dailyValues 좌표 메타 매핑, projected 업서트 드롭). processed=1 미이관.
//   e) syncChangeLog/syncTombstones/syncMeta 테이블 소멸, syncOutbox 신설.
//   f) 데이터 무손실 — 시드한 유효(비-projected, 비-고아) 행 수 보존.
//
// 방법: raw Dexie로 프로덕션 이름('MoonwaveFinance')의 v13 DB를 만들어
// 숫자 id 레코드를 시드하고 close → 실제 FinanceDatabase 싱글턴을 동적
// import해 open → v14(버퍼 변환)+v15(테이블 삭제)+v16(재생성) 업그레이드가
// 단일 versionchange 트랜잭션으로 실행된다. 파일 격리(fake-indexeddb는
// 테스트 파일별 독립)라 다른 파일과 DB 이름이 겹쳐도 안전하다.
import { describe, it, expect, beforeAll } from 'vitest'
import Dexie from 'dexie'
import type { SyncOutboxEntry } from '@/lib/types'

// database.ts v1~v13 선언의 누적 결과를 그대로 미러링한 레거시 스키마.
const V13_STORES = {
  members: '++id, syncId, name, sortOrder',
  assetCategories: '++id, syncId, name, type, sortOrder',
  assetItems: '++id, syncId, memberId, categoryId, type, isActive, sortOrder',
  dailyValues: '++id, syncId, assetItemId, date, [assetItemId+date]',
  transactionCategories: '++id, syncId, name, type, sortOrder',
  transactions: '++id, syncId, memberId, type, categoryId, date, isRecurring, recurSourceId, paymentMethod, paymentMethodItemId, subscriptionId',
  budgets: '++id, syncId, categoryId, month',
  goals: '++id, syncId, targetDate',
  paymentMethodItems: '++id, syncId, type, name, sortOrder, linkedAssetItemId',
  subscriptions: '++id, syncId, currency, category, status, billingDay, cycle, sortOrder, paymentMethodItemId',
  syncChangeLog: '++id, tableName, syncId, processed, timestamp, [tableName+syncId]',
  syncTombstones: '++id, tableName, syncId, deletedAt, [tableName+syncId]',
  loans: '++id, syncId, isActive, sortOrder',
  merchantAliases: '++id, syncId, &merchantKey, categoryId, source, learnedAt, lastUsedAt',
  investmentTrades: '++id, syncId, memberId, sellDate, assetType, market, stockName, sortOrder, [sellDate+stockName+sellQuantity]',
  dividends: '++id, syncId, memberId, paymentDate, exDividendDate, assetType, market, stockName, sortOrder, [paymentDate+stockName+quantity]',
  accountInterests: '++id, syncId, memberId, depositDate, currency, interestType, sortOrder, [depositDate+periodStart+periodEnd+currency]',
  syncMeta: '&key',
}

const NOW = '2026-06-30T00:00:00.000Z'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// 시드한 "마이그레이션 후 살아남아야 하는" 행 수 (f 검증용).
// dailyValues: 4행 시드 중 projected 1행 + 고아 1행 드롭 → 2행 생존.
const EXPECTED_COUNTS: Record<string, number> = {
  members: 2,
  assetCategories: 1,
  assetItems: 2,
  dailyValues: 2,
  transactionCategories: 1,
  transactions: 4,
  budgets: 2,
  goals: 1,
  paymentMethodItems: 1,
  subscriptions: 1,
  loans: 1,
  investmentTrades: 1,
  dividends: 1,
  accountInterests: 1,
  merchantAliases: 1,
}

type DatabaseModule = typeof import('@/services/database')
let dbmod: DatabaseModule
let db: DatabaseModule['db']

beforeAll(async () => {
  // ── 1) v13 레거시 DB 사전 설치 (숫자 ++id PK + syncId 병행) ──
  const legacy = new Dexie('MoonwaveFinance')
  legacy.version(13).stores(V13_STORES)
  await legacy.open()

  await legacy.table('members').bulkAdd([
    { id: 1, syncId: 'm-1', name: '대성', color: '#3B82F6', isDefault: true, sortOrder: 0, createdAt: NOW, updatedAt: NOW },
    // syncId 없는 행 — 마이그레이션이 UUID를 부여해야 한다
    { id: 2, name: '다연', color: '#EC4899', isDefault: true, sortOrder: 1, createdAt: NOW, updatedAt: NOW },
  ])

  await legacy.table('assetCategories').bulkAdd([
    { id: 1, syncId: 'ac-1', name: '주식', type: 'asset', color: '#3B82F6', icon: 'TrendingUp', sortOrder: 0, createdAt: NOW, updatedAt: NOW },
  ])

  await legacy.table('assetItems').bulkAdd([
    { id: 1, syncId: 'ai-1', memberId: 1, categoryId: 1, name: '삼성전자', type: 'asset', isActive: true, sortOrder: 0, createdAt: NOW, updatedAt: NOW },
    // memberId 999 매핑 실패 — required 모드 → '' 표식
    { id: 2, syncId: 'ai-2', memberId: 999, categoryId: 1, name: '고아자산', type: 'asset', isActive: true, sortOrder: 1, createdAt: NOW, updatedAt: NOW },
  ])

  await legacy.table('dailyValues').bulkAdd([
    { id: 1, syncId: 'dv-1', assetItemId: 1, date: '2026-01-01', value: 100, createdAt: NOW, updatedAt: NOW },
    // projected — 드롭 대상
    { id: 2, syncId: 'dv-2', assetItemId: 1, date: '2026-01-02', value: 110, source: 'projected', createdAt: NOW, updatedAt: NOW },
    // 부모 자산(777) 소실 — 드롭 대상
    { id: 3, syncId: 'dv-3', assetItemId: 777, date: '2026-01-01', value: 50, createdAt: NOW, updatedAt: NOW },
    // syncId 없는 manual 행 — UUID 부여 + assetItemId 재작성으로 생존
    { id: 4, assetItemId: 1, date: '2026-01-03', value: 120, source: 'manual', createdAt: NOW, updatedAt: NOW },
  ])

  await legacy.table('transactionCategories').bulkAdd([
    { id: 1, syncId: 'tc-1', name: '식비', type: 'expense', color: '#F59E0B', isDefault: true, sortOrder: 0, createdAt: NOW, updatedAt: NOW },
  ])

  await legacy.table('transactions').bulkAdd([
    { id: 1, syncId: 't-1', memberId: 1, type: 'expense', amount: 1000, categoryId: 1, date: '2026-06-01', isRecurring: false, createdAt: NOW, updatedAt: NOW },
    // memberId/categoryId 매핑 실패(nullable→null), paymentMethodItemId 실패(optional→소멸)
    { id: 2, syncId: 't-2', memberId: 999, type: 'expense', amount: 2000, categoryId: 888, paymentMethodItemId: 777, date: '2026-06-02', isRecurring: false, createdAt: NOW, updatedAt: NOW },
    // 자기참조 FK(recurSourceId→transactions) + subscriptionId 재작성
    { id: 3, syncId: 't-3', memberId: null, type: 'expense', amount: 3000, categoryId: 1, recurSourceId: 1, subscriptionId: 1, date: '2026-06-03', isRecurring: true, createdAt: NOW, updatedAt: NOW },
    // syncId 없던 부모(member 2)를 참조 — 부여된 UUID와 일치해야 한다
    { id: 4, syncId: 't-4', memberId: 2, type: 'income', amount: 4000, categoryId: null, date: '2026-06-04', isRecurring: false, createdAt: NOW, updatedAt: NOW },
  ])

  await legacy.table('budgets').bulkAdd([
    { id: 1, syncId: 'b-1', categoryId: 1, month: '2026-06', amount: 500000, createdAt: NOW, updatedAt: NOW },
    // categoryId 매핑 실패 — required → ''
    { id: 2, syncId: 'b-2', categoryId: 999, month: '2026-06', amount: 100, createdAt: NOW, updatedAt: NOW },
  ])

  await legacy.table('goals').bulkAdd([
    { id: 1, syncId: 'g-1', name: '내집마련', targetAmount: 1, currentAmount: 0, targetDate: '2027-01-01', createdAt: NOW, updatedAt: NOW },
  ])

  await legacy.table('paymentMethodItems').bulkAdd([
    { id: 1, syncId: 'pm-1', type: 'credit_card', name: '신한카드', isActive: true, sortOrder: 0, linkedAssetItemId: 1, createdAt: NOW, updatedAt: NOW },
  ])

  await legacy.table('subscriptions').bulkAdd([
    // paymentMethodItemId 재작성 + linkedTransactionCategoryId 실패(optional→소멸)
    { id: 1, syncId: 'sub-1', name: '넷플릭스', amount: 17000, currency: 'KRW', category: 'entertainment', status: 'active', billingDay: 1, cycle: 'monthly', sortOrder: 0, paymentMethodItemId: 1, linkedTransactionCategoryId: 999, createdAt: NOW, updatedAt: NOW },
  ])

  await legacy.table('loans').bulkAdd([
    { id: 1, syncId: 'loan-1', name: '주택담보대출', isActive: true, sortOrder: 0, linkedAssetItemId: 2, createdAt: NOW, updatedAt: NOW },
  ])

  await legacy.table('investmentTrades').bulkAdd([
    { id: 1, syncId: 'it-1', memberId: 1, sellDate: '2026-05-01', assetType: 'stock', market: 'KR', stockName: '삼성전자', sellQuantity: 10, sortOrder: 0, createdAt: NOW, updatedAt: NOW },
  ])

  await legacy.table('dividends').bulkAdd([
    // memberId 매핑 실패 — nullable → null
    { id: 1, syncId: 'div-1', memberId: 999, paymentDate: '2026-05-15', exDividendDate: '2026-05-01', assetType: 'stock', market: 'US', stockName: 'AAPL', quantity: 3, sortOrder: 0, createdAt: NOW, updatedAt: NOW },
  ])

  await legacy.table('accountInterests').bulkAdd([
    { id: 1, syncId: 'int-1', memberId: 1, depositDate: '2026-05-31', currency: 'KRW', interestType: 'savings', periodStart: '2026-05-01', periodEnd: '2026-05-31', sortOrder: 0, createdAt: NOW, updatedAt: NOW },
  ])

  await legacy.table('merchantAliases').bulkAdd([
    { id: 1, syncId: 'ma-1', merchantKey: '스타벅스', categoryId: 1, source: 'user-override', usageCount: 1, learnedAt: NOW, createdAt: NOW, updatedAt: NOW },
  ])

  // ── 미처리 changelog (업로드 대기분) — 아웃박스 이관 대상 ──
  await legacy.table('syncChangeLog').bulkAdd([
    // t-1: create → update (같은 레코드 2건) → 아웃박스 1행 upsert, queuedAt=마지막 timestamp
    { tableName: 'transactions', syncId: 't-1', operation: 'create', processed: 0, timestamp: '2026-06-01T00:00:00.000Z' },
    { tableName: 'transactions', syncId: 't-1', operation: 'update', processed: 0, timestamp: '2026-06-01T00:01:00.000Z' },
    // t-x: 생성 후 삭제된 레코드 (행 부재) → 마지막 op 승리 → delete 1행
    { tableName: 'transactions', syncId: 't-x', operation: 'create', processed: 0, timestamp: '2026-06-02T00:00:00.000Z' },
    { tableName: 'transactions', syncId: 't-x', operation: 'delete', processed: 0, timestamp: '2026-06-02T00:01:00.000Z' },
    // processed=1 — 이미 업로드 완료분, 이관 금지
    { tableName: 'transactions', syncId: 't-3', operation: 'update', processed: 1, timestamp: '2026-06-03T00:00:00.000Z' },
    // dailyValues 업서트 (생존 행) → 좌표 메타가 문자열 id로 매핑돼 동반
    { tableName: 'dailyValues', syncId: 'dv-1', operation: 'update', processed: 0, assetItemId: 1, date: '2026-01-01', timestamp: '2026-06-04T00:00:00.000Z' },
    // dailyValues 업서트 (projected → 버퍼에서 드롭된 행) → 이관 금지
    { tableName: 'dailyValues', syncId: 'dv-2', operation: 'update', processed: 0, assetItemId: 1, date: '2026-01-02', timestamp: '2026-06-04T00:01:00.000Z' },
    // dailyValues 삭제 (행 이미 부재) → delete + 좌표 메타 매핑
    { tableName: 'dailyValues', syncId: 'dv-gone', operation: 'delete', processed: 0, assetItemId: 1, date: '2026-01-05', timestamp: '2026-06-04T00:02:00.000Z' },
    // 동기화 대상이 아닌 테이블명 — 무시돼야 한다 (크래시 금지)
    { tableName: 'notATable', syncId: 'x-1', operation: 'create', processed: 0, timestamp: '2026-06-05T00:00:00.000Z' },
  ])

  await legacy.table('syncTombstones').add({ tableName: 'transactions', syncId: 't-x', deletedAt: NOW })
  await legacy.table('syncMeta').add({ key: 'checkpoint', value: '2026-06-01T00:00:00.000Z' })

  legacy.close()

  // ── 2) 실제 FinanceDatabase를 열어 v14→v16 마이그레이션 발동 ──
  dbmod = await import('@/services/database')
  db = dbmod.db
  await db.open()
})

describe('v13→v16 마이그레이션: id 승격 (a)', () => {
  it('syncId가 문자열 PK id로 승격되고 syncId 필드는 모든 행에서 소멸한다', async () => {
    const members = await db.members.toArray()
    expect(members.map((m) => m.id).sort()).toContain('m-1')

    for (const name of dbmod.SYNCABLE_TABLE_NAMES) {
      const rows = await db.table(name).toArray()
      for (const row of rows) {
        expect(typeof row.id).toBe('string')
        expect(row.id).not.toBe('')
        expect(Object.prototype.hasOwnProperty.call(row, 'syncId')).toBe(false)
      }
    }
  })

  it('구 syncId를 그대로 id로 쓰고 PK 조회가 동작한다', async () => {
    expect((await db.transactions.get('t-1'))?.amount).toBe(1000)
    expect((await db.assetItems.get('ai-1'))?.name).toBe('삼성전자')
    expect((await db.merchantAliases.get('ma-1'))?.merchantKey).toBe('스타벅스')
  })

  it('syncId 없던 행은 UUID를 부여받는다', async () => {
    const member2 = (await db.members.toArray()).find((m) => m.name === '다연')
    expect(member2).toBeDefined()
    expect(member2!.id).toMatch(UUID_RE)

    const dv = (await db.dailyValues.toArray()).find((v) => v.date === '2026-01-03')
    expect(dv).toBeDefined()
    expect(dv!.id).toMatch(UUID_RE)
    expect(dv!.source).toBe('manual')
  })
})

describe('v13→v16 마이그레이션: FK 재작성 (b)', () => {
  it('매핑 성공: 숫자 FK가 부모의 문자열 id로 재작성된다', async () => {
    const t1 = await db.transactions.get('t-1')
    expect(t1?.memberId).toBe('m-1')
    expect(t1?.categoryId).toBe('tc-1')

    const ai1 = await db.assetItems.get('ai-1')
    expect(ai1?.memberId).toBe('m-1')
    expect(ai1?.categoryId).toBe('ac-1')

    const b1 = await db.budgets.get('b-1')
    expect(b1?.categoryId).toBe('tc-1')

    const pm1 = await db.paymentMethodItems.get('pm-1')
    expect(pm1?.linkedAssetItemId).toBe('ai-1')

    const loan1 = await db.loans.get('loan-1')
    expect(loan1?.linkedAssetItemId).toBe('ai-2')

    const it1 = await db.investmentTrades.get('it-1')
    expect(it1?.memberId).toBe('m-1')

    const int1 = await db.accountInterests.get('int-1')
    expect(int1?.memberId).toBe('m-1')

    const ma1 = await db.merchantAliases.get('ma-1')
    expect(ma1?.categoryId).toBe('tc-1')
  })

  it('자기참조/체인 FK: recurSourceId·subscriptionId·paymentMethodItemId 재작성', async () => {
    const t3 = await db.transactions.get('t-3')
    expect(t3?.recurSourceId).toBe('t-1')
    expect(t3?.subscriptionId).toBe('sub-1')
    expect(t3?.memberId).toBeNull() // 비숫자(null) FK는 손대지 않는다

    const sub1 = await db.subscriptions.get('sub-1')
    expect(sub1?.paymentMethodItemId).toBe('pm-1')
  })

  it('syncId 없던 부모를 참조한 FK는 그 부모에 부여된 UUID와 일치한다', async () => {
    const member2 = (await db.members.toArray()).find((m) => m.name === '다연')!
    const t4 = await db.transactions.get('t-4')
    expect(t4?.memberId).toBe(member2.id)
  })

  it('매핑 실패 — nullable은 null, optional은 필드 소멸, required는 빈 문자열', async () => {
    const t2 = (await db.transactions.get('t-2')) as unknown as Record<string, unknown>
    expect(t2.memberId).toBeNull() // nullable
    expect(t2.categoryId).toBeNull() // nullable
    expect(Object.prototype.hasOwnProperty.call(t2, 'paymentMethodItemId')).toBe(false) // optional

    const sub1 = (await db.subscriptions.get('sub-1')) as unknown as Record<string, unknown>
    expect(Object.prototype.hasOwnProperty.call(sub1, 'linkedTransactionCategoryId')).toBe(false) // optional

    const ai2 = await db.assetItems.get('ai-2')
    expect(ai2?.memberId).toBe('') // required — '' 표식 (조회는 항상 미스)

    const b2 = await db.budgets.get('b-2')
    expect(b2?.categoryId).toBe('') // required

    const div1 = await db.dividends.get('div-1')
    expect(div1?.memberId).toBeNull() // nullable
  })
})

describe('v13→v16 마이그레이션: dailyValues (c)', () => {
  it('projected 행은 드롭되고 manual/무표기 행만 생존한다', async () => {
    const all = await db.dailyValues.toArray()
    expect(all.length).toBe(2)
    expect(all.some((v) => v.source === 'projected')).toBe(false)
    expect(await db.dailyValues.get('dv-2')).toBeUndefined()
  })

  it('assetItemId가 문자열 id로 재작성된다', async () => {
    const dv1 = await db.dailyValues.get('dv-1')
    expect(dv1?.assetItemId).toBe('ai-1')
    expect(dv1?.value).toBe(100)
    // 복합 인덱스 [assetItemId+date] 조회도 새 문자열 좌표로 동작
    const byCoord = await db.dailyValues.where('[assetItemId+date]').equals(['ai-1', '2026-01-01']).first()
    expect(byCoord?.id).toBe('dv-1')
  })

  it('부모 자산이 소실된 행은 드롭된다', async () => {
    expect(await db.dailyValues.get('dv-3')).toBeUndefined()
  })
})

describe('v13→v16 마이그레이션: changelog → syncOutbox 이관 (d)', () => {
  it('processed=0 항목만 이관되고 레코드당 1행 + 마지막 op가 이긴다', async () => {
    const rows = await db.syncOutbox.toArray()
    const byKey = new Map(rows.map((r) => [r.key, r] as [string, SyncOutboxEntry]))

    // 총 4행: t-1(upsert), t-x(delete), dv-1(upsert), dv-gone(delete)
    expect(rows.length).toBe(4)

    const t1 = byKey.get('transactions:t-1')
    expect(t1).toMatchObject({ tableName: 'transactions', recordId: 't-1', op: 'upsert' })
    expect(t1?.queuedAt).toBe('2026-06-01T00:01:00.000Z') // 마지막(update) timestamp

    const tx = byKey.get('transactions:t-x')
    expect(tx).toMatchObject({ tableName: 'transactions', recordId: 't-x', op: 'delete' })

    // processed=1 은 이관 금지
    expect(byKey.has('transactions:t-3')).toBe(false)
    // 미지 테이블명은 무시
    expect(rows.some((r) => r.tableName === 'notATable')).toBe(false)
  })

  it('dailyValues 항목은 좌표 메타가 문자열 id로 매핑돼 동반된다', async () => {
    const rows = await db.syncOutbox.toArray()
    const byKey = new Map(rows.map((r) => [r.key, r] as [string, SyncOutboxEntry]))

    const dv1 = byKey.get('dailyValues:dv-1')
    expect(dv1).toMatchObject({ op: 'upsert', assetItemId: 'ai-1', date: '2026-01-01' })

    const dvGone = byKey.get('dailyValues:dv-gone')
    expect(dvGone).toMatchObject({ op: 'delete', assetItemId: 'ai-1', date: '2026-01-05' })
  })

  it('projected(버퍼에서 드롭된) 행의 업서트는 이관되지 않는다', async () => {
    const rows = await db.syncOutbox.toArray()
    expect(rows.some((r) => r.recordId === 'dv-2')).toBe(false)
  })
})

describe('v13→v16 마이그레이션: 테이블 구조 (e)', () => {
  it('syncChangeLog/syncTombstones/syncMeta는 소멸하고 syncOutbox가 신설된다', () => {
    const declared = db.tables.map((t) => t.name)
    expect(declared).toContain('syncOutbox')
    expect(declared).not.toContain('syncChangeLog')
    expect(declared).not.toContain('syncTombstones')
    expect(declared).not.toContain('syncMeta')

    // 실제 IndexedDB objectStore 차원에서도 삭제됐는지 확인
    const stores = Array.from(db.backendDB().objectStoreNames)
    expect(stores).toContain('syncOutbox')
    expect(stores).not.toContain('syncChangeLog')
    expect(stores).not.toContain('syncTombstones')
    expect(stores).not.toContain('syncMeta')
  })
})

describe('v13→v16 마이그레이션: 데이터 무손실 (f)', () => {
  it('시드한 유효 행 수(비-projected·비-고아)가 테이블별로 보존된다', async () => {
    for (const [name, expected] of Object.entries(EXPECTED_COUNTS)) {
      expect(await db.table(name).count(), `${name} 행 수`).toBe(expected)
    }
  })

  it('마이그레이션 자체 쓰기는 아웃박스를 오염시키지 않는다 (changelog 이관분 4행뿐)', async () => {
    // v16 bulkAdd는 markSyncTransaction 하에 실행 — 훅이 큐잉하면 수백 행이 생긴다
    await dbmod.drainChangeTracking()
    expect(await db.syncOutbox.count()).toBe(4)
  })
})
