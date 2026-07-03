// ─── flushOutbox — 아웃박스 → Firestore 푸시 경로 테스트 ────────────────────
//
// firebase/firestore를 모킹해 네트워크 없이 검증한다 (Dexie는 실제
// fake-indexeddb 경로 — CRUD 훅이 실제로 아웃박스를 채운다).
//
// 검증 대상 (Sync v2 의미론):
// 1. upsert → set: 문서 경로는 encodeDocId, 페이로드는 toCloudPayload 형태
//    (id 필드 부재, syncId==id, <fk>_syncId 컴패니언, __schemaV=3)
// 2. delete → doc delete + syncTombstones set (구버전 호환)
// 3. dailyValues → 자산×월 번들 merge:true 패치 (v=null 삭제 마커 포함),
//    projected 행 업서트는 드롭
// 4. ack 후 아웃박스 비워짐 / ack 전 재변경(queuedAt 갱신) 항목은 보존
// 5. 행이 사라진 upsert는 delete로 처리
// 6. assetItems delete → 그 자산의 번들 문서 cascade 삭제
import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => ({
  /** batch.set 캡처: { path, payload, options } */
  sets: [] as Array<{ path: string; payload: Record<string, unknown>; options?: Record<string, unknown> }>,
  /** batch.delete 캡처: 문서 경로 */
  deletes: [] as string[],
  commitCount: 0,
  /** commit 시점 훅 — "ack 대기 중 재변경" 시뮬레이션용 (1회성으로 쓸 것) */
  onCommit: null as (() => Promise<void>) | null,
  /** getDocs 응답 문서 — 자산 삭제 cascade의 번들 조회용 */
  queryDocs: [] as Array<{ ref: { path: string } }>,
  /** where(...) 호출 캡처 */
  wheres: [] as Array<{ field: string; op: string; value: unknown }>,
}))

vi.mock('@/lib/firebase', () => ({ firestore: {}, auth: {} }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_fs: unknown, path: string) => ({ __type: 'collection', path })),
  doc: vi.fn((_fs: unknown, path: string) => ({ __type: 'doc', path })),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => undefined })),
  getDocs: vi.fn(async () => ({ empty: h.queryDocs.length === 0, docs: h.queryDocs })),
  setDoc: vi.fn(async () => {}),
  deleteDoc: vi.fn(async () => {}),
  onSnapshot: vi.fn(() => () => {}),
  query: vi.fn((c: unknown, ...constraints: unknown[]) => ({ __type: 'query', c, constraints })),
  limit: vi.fn(),
  where: vi.fn((field: string, op: string, value: unknown) => {
    h.wheres.push({ field, op, value })
    return { __type: 'where', field, op, value }
  }),
  serverTimestamp: vi.fn(() => ({ __sentinel: 'serverTimestamp' })),
  writeBatch: vi.fn(() => ({
    set: (ref: { path: string }, payload: Record<string, unknown>, options?: Record<string, unknown>) => {
      h.sets.push({ path: ref.path, payload, options })
    },
    delete: (ref: { path: string }) => { h.deletes.push(ref.path) },
    commit: async () => {
      h.commitCount++
      if (h.onCommit) await h.onCommit()
    },
  })),
}))

import { db, setSyncWritingFlag, drainChangeTracking } from '@/services/database'
import { flushOutbox, encodeDocId } from '@/services/firestoreSync'
import { DV_BUNDLE_COLLECTION, dvBundleKey } from '@/services/dailyValueBundles'
import { useAuthStore } from '@/stores/authStore'
import { getDeviceId } from '@/lib/deviceId'
import type { AssetItem, DailyValue, Transaction, TransactionCategory } from '@/lib/types'

const UID = 'outbox-test-uid'
const NOW = '2026-06-05T00:00:00.000Z'

function makeTxn(id: string, over: Partial<Transaction> = {}): Transaction {
  return {
    id,
    memberId: 'mem-1',
    type: 'expense',
    amount: 1000,
    categoryId: null,
    date: '2026-06-04',
    isRecurring: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  } as Transaction
}

function makeDv(id: string, over: Partial<DailyValue> = {}): DailyValue {
  return {
    id,
    assetItemId: 'asset-A',
    date: '2026-06-05',
    value: 1000,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  } as DailyValue
}

/** 동기화 쓰기로 시드 — 훅의 아웃박스 큐잉을 차단한다. */
async function seedSync(fn: () => Promise<unknown>): Promise<void> {
  setSyncWritingFlag(true)
  try { await fn() } finally { setSyncWritingFlag(false) }
}

/** 훅의 post-commit 아웃박스 기록은 비동기 — 기대 건수까지 대기. */
async function waitForOutboxCount(expected: number): Promise<void> {
  await vi.waitFor(async () => {
    expect(await db.syncOutbox.count()).toBe(expected)
  }, { timeout: 5000 })
}

beforeEach(async () => {
  h.sets = []
  h.deletes = []
  h.commitCount = 0
  h.onCommit = null
  h.queryDocs = []
  h.wheres = []
  setSyncWritingFlag(true)
  try {
    await db.transactions.clear()
    await db.transactionCategories.clear()
    await db.dailyValues.clear()
    await db.assetItems.clear()
  } finally {
    setSyncWritingFlag(false)
  }
  await drainChangeTracking()
  await db.syncOutbox.clear()
  useAuthStore.setState({ syncStatus: 'idle', syncErrorMessage: null, pendingChangesCount: 0 })
})

describe('flushOutbox — upsert 경로', () => {
  it('upsert 항목을 toCloudPayload 형태로 set 한다 (syncId==id, 컴패니언, __schemaV=3, id 필드 부재)', async () => {
    await db.transactions.add(makeTxn('txn-1'))
    await waitForOutboxCount(1)

    await flushOutbox(UID)

    expect(h.commitCount).toBeGreaterThan(0)
    const txnSet = h.sets.find(s => s.path === `users/${UID}/transactions/txn-1`)
    expect(txnSet).toBeDefined()
    const p = txnSet!.payload
    expect(p.syncId).toBe('txn-1')          // 구버전 기기는 syncId 필드로 매칭
    expect('id' in p).toBe(false)           // 문서 id가 곧 id — 필드 중복 금지
    expect(p.memberId_syncId).toBe('mem-1') // 구버전 호환 FK 컴패니언
    expect(p.categoryId_syncId).toBeNull()  // null FK → 컴패니언도 null
    expect(p.memberId).toBe('mem-1')        // v3 본 필드는 문자열 FK 그대로
    expect(p.__schemaV).toBe(3)
    expect(p.__deviceId).toBe(getDeviceId())
    expect(p.__uploadedAt).toEqual({ __sentinel: 'serverTimestamp' })

    // ack 후 아웃박스가 비워지고 상태는 synced
    expect(await db.syncOutbox.count()).toBe(0)
    expect(useAuthStore.getState().syncStatus).toBe('synced')
    await vi.waitFor(() => {
      expect(useAuthStore.getState().pendingChangesCount).toBe(0)
    })
  })

  it("문서 경로는 encodeDocId — id의 '/'와 '~'가 이스케이프되어 충돌하지 않는다", async () => {
    await db.transactionCategories.add({
      id: 'cat/슬래시~틸드', name: '테스트', type: 'expense', color: '#000',
      isDefault: false, sortOrder: 99, createdAt: NOW, updatedAt: NOW,
    } as TransactionCategory)
    await waitForOutboxCount(1)

    await flushOutbox(UID)

    const catSet = h.sets.find(s => s.path.startsWith(`users/${UID}/transactionCategories/`))
    expect(catSet).toBeDefined()
    // '~' 먼저(~7e), 그 다음 '/'(~2f) — 단사 인코딩
    expect(catSet!.path).toBe(`users/${UID}/transactionCategories/cat~2f슬래시~7e틸드`)
    expect(catSet!.payload.syncId).toBe('cat/슬래시~틸드') // 페이로드의 id는 원본 그대로
  })

  it('행이 그새 사라진 upsert 항목은 delete로 처리한다 (doc delete + 톰스톤)', async () => {
    // 아웃박스에는 upsert 마커가 있는데 로컬 행이 없다 — 방어 경로
    await db.syncOutbox.put({
      key: 'transactions:ghost', tableName: 'transactions',
      recordId: 'ghost', op: 'upsert', queuedAt: NOW,
    })

    await flushOutbox(UID)

    expect(h.deletes).toContain(`users/${UID}/transactions/ghost`)
    expect(h.sets.some(s => s.path === `users/${UID}/syncTombstones/transactions_ghost`)).toBe(true)
    expect(await db.syncOutbox.count()).toBe(0)
  })
})

describe('flushOutbox — delete 경로', () => {
  it('delete 항목은 doc delete + syncTombstones set(구버전 호환)을 함께 수행한다', async () => {
    await seedSync(() => db.transactions.add(makeTxn('txn-del')))
    await db.transactions.delete('txn-del')
    await waitForOutboxCount(1)
    const entry = await db.syncOutbox.get('transactions:txn-del')
    expect(entry!.op).toBe('delete')

    await flushOutbox(UID)

    expect(h.deletes).toContain(`users/${UID}/transactions/txn-del`)
    const ts = h.sets.find(s => s.path === `users/${UID}/syncTombstones/transactions_txn-del`)
    expect(ts).toBeDefined()
    expect(ts!.payload).toMatchObject({
      tableName: 'transactions',
      syncId: 'txn-del',
      deletedAt: entry!.queuedAt,
      __schemaV: 3,
    })
    expect(ts!.payload.__uploadedAt).toEqual({ __sentinel: 'serverTimestamp' })
    expect(await db.syncOutbox.count()).toBe(0)
  })
})

describe('flushOutbox — dailyValues 번들 경로', () => {
  it('업서트는 자산×월 번들 문서에 merge:true 패치로만 올라간다 (per-row 업서트 금지)', async () => {
    await db.dailyValues.bulkAdd([
      makeDv('dv-1', { date: '2026-06-05', value: 100, source: 'manual' }),
      makeDv('dv-2', { date: '2026-06-09', value: 200 }),
      makeDv('dv-3', { date: '2026-07-01', value: 300 }),
    ])
    await waitForOutboxCount(3)

    await flushOutbox(UID)

    const bundleSets = h.sets.filter(s => s.path.includes(`/${DV_BUNDLE_COLLECTION}/`))
    expect(bundleSets).toHaveLength(2) // 6월 + 7월

    const june = bundleSets.find(s => s.payload.month === '2026-06')
    expect(june).toBeDefined()
    expect(june!.options).toEqual({ merge: true })
    expect(june!.path).toBe(
      `users/${UID}/${DV_BUNDLE_COLLECTION}/${encodeDocId(dvBundleKey('asset-A', '2026-06'))}`,
    )
    expect(june!.payload.bundleKey).toBe(dvBundleKey('asset-A', '2026-06'))
    expect(june!.payload.assetItem_syncId).toBe('asset-A')
    expect(june!.payload.__schemaV).toBe(3)
    const days = june!.payload.days as Record<string, unknown[]>
    expect(days['05']).toEqual([100, 'manual', NOW, 'dv-1', getDeviceId()])
    expect(days['09']).toEqual([200, null, NOW, 'dv-2', getDeviceId()])

    // 레거시 per-row dailyValues 문서는 더 이상 쓰지 않는다
    expect(h.sets.some(s => s.path.includes(`/${UID}/dailyValues/`))).toBe(false)
    expect(await db.syncOutbox.count()).toBe(0)
  })

  it('삭제는 v=null 좌표 마커(merge:true) + 톰스톤으로 전파된다', async () => {
    await seedSync(() => db.dailyValues.add(makeDv('dv-gone', { date: '2026-06-05' })))
    await db.dailyValues.delete('dv-gone')
    await waitForOutboxCount(1)

    await flushOutbox(UID)

    const bundleSets = h.sets.filter(s => s.path.includes(`/${DV_BUNDLE_COLLECTION}/`))
    expect(bundleSets).toHaveLength(1)
    expect(bundleSets[0].options).toEqual({ merge: true })
    const days = bundleSets[0].payload.days as Record<string, unknown[]>
    expect(days['05'][0]).toBeNull()      // 삭제 마커
    expect(days['05'][3]).toBe('dv-gone') // sid 동반 — 피어 행 식별
    // 구버전 호환 톰스톤
    expect(h.sets.some(s => s.path === `users/${UID}/syncTombstones/dailyValues_dv-gone`)).toBe(true)
    expect(await db.syncOutbox.count()).toBe(0)
  })

  it('projected 행에 매달린 업서트는 드롭한다 — 번들 패치 없이 ack 처리', async () => {
    await seedSync(() =>
      db.dailyValues.add(makeDv('pj-1', { date: '2026-06-07', value: 5, source: 'projected' })))
    // 신규 projected는 훅이 차단하므로 경계 사례를 직접 주입한다
    await db.syncOutbox.put({
      key: 'dailyValues:pj-1', tableName: 'dailyValues', recordId: 'pj-1',
      op: 'upsert', queuedAt: NOW, assetItemId: 'asset-A', date: '2026-06-07',
    })

    await flushOutbox(UID)

    expect(h.sets.filter(s => s.path.includes(`/${DV_BUNDLE_COLLECTION}/`))).toHaveLength(0)
    // 드롭된 항목도 ack되어 재시도 루프에 남지 않는다
    expect(await db.syncOutbox.count()).toBe(0)
  })
})

describe('flushOutbox — ack 의미론', () => {
  it('ack 대기 중 재변경(queuedAt 갱신)된 항목은 보존해 다음 푸시가 다시 올린다', async () => {
    await db.transactions.add(makeTxn('txn-rc'))
    await waitForOutboxCount(1)
    const before = (await db.syncOutbox.get('transactions:txn-rc'))!

    const LATER = '2099-01-01T00:00:00.000Z'
    // 서버 ack(commit) 시점에 같은 레코드가 또 바뀐 상황을 결정적으로 재현
    h.onCommit = async () => {
      h.onCommit = null
      await db.syncOutbox.put({ ...before, queuedAt: LATER })
    }

    await flushOutbox(UID)

    const after = await db.syncOutbox.get('transactions:txn-rc')
    expect(after).toBeDefined()          // 지워지지 않고 보존됨
    expect(after!.queuedAt).toBe(LATER)  // 최신 마커 그대로
  })

  it('ack된 항목만 지운다 — 변경 없는 항목은 전부 비워진다', async () => {
    await db.transactions.add(makeTxn('txn-a'))
    await db.transactions.add(makeTxn('txn-b'))
    await waitForOutboxCount(2)

    await flushOutbox(UID)

    expect(await db.syncOutbox.count()).toBe(0)
    expect(useAuthStore.getState().syncStatus).toBe('synced')
  })
})

describe('flushOutbox — assetItems 삭제 cascade', () => {
  it('assetItems delete는 그 자산의 dailyValueBundles 문서를 통째로 삭제한다', async () => {
    await seedSync(() => db.assetItems.add({
      id: 'asset-A', memberId: 'mem-1', categoryId: 'cat-1', name: '자산',
      type: 'asset', isActive: true, sortOrder: 0, createdAt: NOW, updatedAt: NOW,
    } as AssetItem))
    await db.assetItems.delete('asset-A')
    await waitForOutboxCount(1)

    const juneBundle = `users/${UID}/${DV_BUNDLE_COLLECTION}/${encodeDocId(dvBundleKey('asset-A', '2026-06'))}`
    const julyBundle = `users/${UID}/${DV_BUNDLE_COLLECTION}/${encodeDocId(dvBundleKey('asset-A', '2026-07'))}`
    h.queryDocs = [{ ref: { path: juneBundle } }, { ref: { path: julyBundle } }]

    await flushOutbox(UID)

    // 자산 문서 삭제 + 톰스톤
    expect(h.deletes).toContain(`users/${UID}/assetItems/asset-A`)
    expect(h.sets.some(s => s.path === `users/${UID}/syncTombstones/assetItems_asset-A`)).toBe(true)
    // 번들 조회가 자산 id로 걸리고, 조회된 번들 문서가 모두 삭제된다
    expect(h.wheres).toContainEqual({ field: 'assetItem_syncId', op: '==', value: 'asset-A' })
    expect(h.deletes).toContain(juneBundle)
    expect(h.deletes).toContain(julyBundle)
    expect(await db.syncOutbox.count()).toBe(0)
  })
})
