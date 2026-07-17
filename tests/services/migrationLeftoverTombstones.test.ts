// ─── 레거시 syncTombstones 잔존 저장소 + v17/v18 업그레이드 회귀 ─────────────
//
// 실사용 인시던트(2026-07-17) 재현: 과거 빌드의 버전 경로를 탄 기기에는
// v15의 삭제 단계를 건너뛴 레거시 syncTombstones 저장소(PK '++id')가 DB
// 버전 16에서도 물리적으로 잔존한다. 구 v17이 같은 이름을 '&key' PK로
// 재선언하자 Dexie가 UpgradeError("Not yet support for changing primary
// key")로 DB 열기 자체를 거부 — 모든 화면이 "불러오기 실패"였다.
//
// 수정: v17 무해화 + v18에서 새 이름(syncDeletes)으로 생성. 이 테스트는
// "잔존 저장소가 있는 v16 DB"를 raw IndexedDB로 조립한 뒤 실제 싱글턴을
// 열어 업그레이드가 성공하고 데이터가 보존되는지 검증한다.
import { describe, it, expect, beforeAll } from 'vitest'

const NOW = '2026-07-01T00:00:00.000Z'

// database.ts v16 stores() 선언의 저장소 목록 (PK는 전부 'id', syncOutbox만 'key').
const V16_STORES: Array<{ name: string; keyPath: string }> = [
  'members', 'assetCategories', 'assetItems', 'dailyValues',
  'transactionCategories', 'transactions', 'budgets', 'goals',
  'paymentMethodItems', 'subscriptions', 'loans', 'investmentTrades',
  'dividends', 'accountInterests', 'merchantAliases',
].map((name) => ({ name, keyPath: 'id' }))
V16_STORES.push({ name: 'syncOutbox', keyPath: 'key' })

let dbModule: typeof import('@/services/database')

beforeAll(async () => {
  // Dexie는 내부적으로 선언 버전 × 10을 IndexedDB 네이티브 버전으로 쓴다.
  // v16 상태 + 레거시 syncTombstones(PK '++id') 잔존을 raw로 조립한다.
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open('MoonwaveFinance', 160)
    req.onupgradeneeded = () => {
      const rawDb = req.result
      for (const { name, keyPath } of V16_STORES) {
        rawDb.createObjectStore(name, { keyPath })
      }
      // 인시던트의 핵심: v15 삭제 단계를 건너뛴 레거시 저장소 (다른 PK)
      rawDb.createObjectStore('syncTombstones', { keyPath: 'id', autoIncrement: true })
    }
    req.onsuccess = () => {
      const rawDb = req.result
      const tx = rawDb.transaction(['transactions', 'syncTombstones'], 'readwrite')
      tx.objectStore('transactions').put({
        id: 'txn-keep', memberId: null, type: 'expense', amount: 42000,
        categoryId: null, date: '2026-06-30', isRecurring: false,
        createdAt: NOW, updatedAt: NOW,
      })
      tx.objectStore('syncTombstones').put({ tableName: 'transactions', syncId: 'old-del', deletedAt: NOW })
      tx.oncomplete = () => { rawDb.close(); resolve() }
      tx.onerror = () => reject(tx.error)
    }
    req.onerror = () => reject(req.error)
  })

  // 실제 싱글턴 import → 첫 쿼리에서 v17(no-op)+v18(syncDeletes 생성) 업그레이드
  dbModule = await import('@/services/database')
})

describe('레거시 syncTombstones 잔존 + v18 업그레이드', () => {
  it('DB 열기가 성공하고 기존 데이터가 보존된다 (구 v17은 UpgradeError로 전면 실패했다)', async () => {
    const { db } = dbModule
    const rows = await db.transactions.toArray() // 열기 실패면 여기서 던진다
    expect(rows.map(r => r.id)).toContain('txn-keep')
    expect(rows.find(r => r.id === 'txn-keep')!.amount).toBe(42000)
  })

  it('syncDeletes 테이블이 생성되어 정상 동작한다', async () => {
    const { db } = dbModule
    await db.syncDeletes.put({
      key: 'transactions:t-x', tableName: 'transactions', recordId: 't-x', deletedAt: NOW,
    })
    expect((await db.syncDeletes.get('transactions:t-x'))?.recordId).toBe('t-x')

    const stores = Array.from(db.backendDB().objectStoreNames)
    expect(stores).toContain('syncDeletes')
  })
})
