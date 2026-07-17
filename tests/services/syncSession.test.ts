// ─── 동기화 세션 오케스트레이션 — startSyncSession / 리스너 수명주기 ─────────
//
// 회귀 맥락 (C19): 부트스트랩 프로브(빈 클라우드 + 로컬 데이터 → fullUpload)는
// 과거 스테일-로컬-덮어쓰기 사고를 낸 코드인데 회귀 테스트가 없었다. 또한
// C12(윈도우 리스너)와 톰스톤 삭제 전파가 이 파일의 수명주기에 얹혔다.
//
// 검증 대상:
// 1. 프로브 실패(오프라인) → fullUpload 생략, 리스너는 시작
// 2. 빈 클라우드 + 로컬 데이터 → 최초 전량 업로드 1회
// 3. 클라우드에 데이터 있음 → fullUpload 없음
// 4. stop/start 수명주기 — 전량 해지, 같은 uid 무-force 재시작은 중복 구독 없음
// 5. transactions 윈도우 리스너 — 체크포인트 유무에 따른 쿼리 형태 + 전진
// 6. syncTombstones 리스너 — 삭제 전파 + 삭제 LWW(더 새로운 로컬 수정 보존)
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const h = vi.hoisted(() => ({
  listeners: [] as Array<{ target: Record<string, unknown>; next: (snap: unknown) => Promise<void> | void }>,
  unsubCount: 0,
  serverThrows: false,
  serverEmpty: true,
  sets: [] as Array<{ path: string; payload: Record<string, unknown> }>,
}))

vi.mock('@/lib/firebase', () => ({ firestore: {}, auth: {} }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_fs: unknown, path: string) => ({ __type: 'collection', path })),
  doc: vi.fn((_fs: unknown, path: string) => ({ __type: 'doc', path })),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => undefined })),
  getDocs: vi.fn(async () => ({ empty: true, docs: [] })),
  getDocsFromServer: vi.fn(async () => {
    if (h.serverThrows) throw new Error('offline (test)')
    return { empty: h.serverEmpty, docs: [] }
  }),
  setDoc: vi.fn(async () => {}),
  deleteDoc: vi.fn(async () => {}),
  onSnapshot: vi.fn((target: Record<string, unknown>, _opts: unknown, next: (s: unknown) => void) => {
    h.listeners.push({ target, next })
    return () => { h.unsubCount++ }
  }),
  query: vi.fn((c: unknown, ...constraints: unknown[]) => ({ __type: 'query', c, constraints })),
  limit: vi.fn(() => ({ __type: 'limit' })),
  where: vi.fn((field: string, op: string, value: unknown) => ({ __type: 'where', field, op, value })),
  serverTimestamp: vi.fn(() => ({ __sentinel: 'serverTimestamp' })),
  Timestamp: { fromMillis: (ms: number) => ({ __type: 'ts', ms, toMillis: () => ms }) },
  writeBatch: vi.fn(() => ({
    set: (ref: { path: string }, payload: Record<string, unknown>) => { h.sets.push({ path: ref.path, payload }) },
    delete: () => {},
    commit: async () => {},
  })),
}))

import { db, setSyncWritingFlag, drainChangeTracking } from '@/services/database'
import { startSyncSession, startRealtimeSync, stopRealtimeSync } from '@/services/firestoreSync'
import { getDeviceId } from '@/lib/deviceId'
import type { Transaction } from '@/lib/types'

const UID = 'session-test-uid'
const OLDER = '2026-06-01T00:00:00.000Z'
const NEWER = '2026-06-09T00:00:00.000Z'

function makeTxn(id: string, over: Partial<Transaction> = {}): Transaction {
  return {
    id, memberId: null, type: 'expense', amount: 1000, categoryId: null,
    date: '2026-06-01', isRecurring: false, createdAt: OLDER, updatedAt: OLDER,
    ...over,
  } as Transaction
}

async function seedSync(fn: () => Promise<unknown>): Promise<void> {
  setSyncWritingFlag(true)
  try { await fn() } finally { setSyncWritingFlag(false) }
}

/** 리스너 target에서 컬렉션 경로를 복원한다 (windowed query면 내부 컬렉션). */
function targetPath(l: { target: Record<string, unknown> }): string {
  const t = l.target as { path?: string; c?: { path?: string } }
  return t.path ?? t.c?.path ?? ''
}

function findListener(pathSuffix: string) {
  return h.listeners.find(l => targetPath(l).endsWith(pathSuffix))
}

/** 서버 확인 스냅샷 객체 조립. */
function snap(changes: Array<{ type: string; data: Record<string, unknown> }>, fromCache = false) {
  return {
    metadata: { fromCache },
    docChanges: () => changes.map(c => ({ type: c.type, doc: { data: () => c.data } })),
  }
}

beforeEach(async () => {
  stopRealtimeSync()
  h.listeners = []
  h.unsubCount = 0
  h.serverThrows = false
  h.serverEmpty = true
  h.sets = []
  localStorage.clear()
  setSyncWritingFlag(true)
  try {
    await db.transactions.clear()
    await db.syncTombstones.clear()
  } finally {
    setSyncWritingFlag(false)
  }
  await drainChangeTracking()
  await db.syncOutbox.clear()
})

afterEach(() => {
  stopRealtimeSync()
})

describe('startSyncSession — 부트스트랩 프로브 (C19)', () => {
  it('프로브 실패(오프라인)면 fullUpload를 생략하고 리스너는 시작한다', async () => {
    await seedSync(() => db.transactions.add(makeTxn('t-1')))
    h.serverThrows = true

    await startSyncSession(UID)

    expect(h.sets).toHaveLength(0) // 확인 없인 업로드하지 않는다 (보수적)
    expect(h.listeners.length).toBeGreaterThan(0) // 실시간 수신은 계속
  })

  it('빈 클라우드 + 로컬 데이터면 최초 전량 업로드를 수행한다', async () => {
    await seedSync(() => db.transactions.add(makeTxn('t-boot')))
    h.serverEmpty = true

    await startSyncSession(UID)

    const txnSets = h.sets.filter(s => s.path === `users/${UID}/transactions/t-boot`)
    expect(txnSets).toHaveLength(1)
  })

  it('클라우드에 데이터가 있으면 fullUpload를 하지 않는다', async () => {
    await seedSync(() => db.transactions.add(makeTxn('t-no-boot')))
    h.serverEmpty = false

    await startSyncSession(UID)

    expect(h.sets).toHaveLength(0)
  })
})

describe('리스너 수명주기', () => {
  it('같은 uid 무-force 재시작은 중복 구독하지 않고, stop은 전량 해지한다', () => {
    startRealtimeSync(UID)
    const n = h.listeners.length
    expect(n).toBeGreaterThan(0)

    startRealtimeSync(UID) // force 없음 — no-op이어야 한다
    expect(h.listeners.length).toBe(n)

    startRealtimeSync(UID, true) // force — 전량 해지 후 재구독
    expect(h.unsubCount).toBe(n)
    expect(h.listeners.length).toBe(n * 2)

    stopRealtimeSync()
    expect(h.unsubCount).toBe(n * 2)
  })
})

describe('transactions 윈도우 리스너 (C12)', () => {
  it('체크포인트가 없으면 전량 컬렉션을 구독한다 (첫 실행 베이스라인)', () => {
    startRealtimeSync(UID)
    const l = findListener(`/${UID}/transactions`)!
    expect(l).toBeDefined()
    expect((l.target as { __type: string }).__type).toBe('collection')
  })

  it('체크포인트가 있으면 __uploadedAt 윈도우 쿼리로 구독한다', () => {
    localStorage.setItem(`fin:syncCheckpoint:${UID}:transactions`, '1750000000000')
    startRealtimeSync(UID)

    const l = findListener(`/${UID}/transactions`)!
    const target = l.target as { __type: string; constraints?: Array<{ field: string; op: string }> }
    expect(target.__type).toBe('query')
    expect(target.constraints?.[0]).toMatchObject({ field: '__uploadedAt', op: '>' })

    // 윈도우가 아닌 테이블은 여전히 전량 컬렉션
    const members = findListener(`/${UID}/members`)!
    expect((members.target as { __type: string }).__type).toBe('collection')
  })

  it('로컬 wipe는 윈도우 체크포인트를 함께 제거한다 (빈 로컬 + 스테일 체크포인트 금지)', async () => {
    localStorage.setItem(`fin:syncCheckpoint:${UID}:transactions`, '123456')
    localStorage.setItem(`fin:syncCheckpoint:${UID}:syncTombstones`, '123456')
    const { clearAllData } = await import('@/services/database')
    await clearAllData()
    expect(localStorage.getItem(`fin:syncCheckpoint:${UID}:transactions`)).toBeNull()
    expect(localStorage.getItem(`fin:syncCheckpoint:${UID}:syncTombstones`)).toBeNull()
  })

  it('서버 확인 스냅샷의 최대 __uploadedAt으로 체크포인트를 전진시킨다', async () => {
    startRealtimeSync(UID)
    const l = findListener(`/${UID}/transactions`)!

    await l.next(snap([{
      type: 'added',
      data: {
        syncId: 't-cp', memberId: null, categoryId: null, type: 'expense',
        amount: 500, date: '2026-06-01', isRecurring: false,
        createdAt: OLDER, updatedAt: OLDER,
        __deviceId: 'peer-device', __uploadedAt: { toMillis: () => 424242 },
      },
    }]))

    expect(localStorage.getItem(`fin:syncCheckpoint:${UID}:transactions`)).toBe('424242')
    expect(await db.transactions.get('t-cp')).toBeDefined() // 인제스트도 정상
  })
})

describe('syncTombstones 리스너 — 삭제 전파 (C12/U23)', () => {
  it('피어 톰스톤은 로컬 행을 삭제하고 로컬 톰스톤을 남긴다', async () => {
    await seedSync(() => db.transactions.add(makeTxn('t-del', { updatedAt: OLDER })))
    startRealtimeSync(UID)
    const l = findListener(`/${UID}/syncTombstones`)!
    expect(l).toBeDefined()

    await l.next(snap([{
      type: 'added',
      data: {
        tableName: 'transactions', syncId: 't-del', deletedAt: NEWER,
        __deviceId: 'peer-device', __uploadedAt: { toMillis: () => 77 },
      },
    }]))

    expect(await db.transactions.get('t-del')).toBeUndefined()
    expect(await db.syncTombstones.get('transactions:t-del')).toBeDefined()
  })

  it('삭제보다 새로운 로컬 수정은 보존하고 재주장한다 (삭제 LWW)', async () => {
    await seedSync(() => db.transactions.add(makeTxn('t-keep', { updatedAt: NEWER })))
    startRealtimeSync(UID)
    const l = findListener(`/${UID}/syncTombstones`)!

    await l.next(snap([{
      type: 'added',
      data: {
        tableName: 'transactions', syncId: 't-keep', deletedAt: OLDER,
        __deviceId: 'peer-device', __uploadedAt: { toMillis: () => 78 },
      },
    }]))

    expect(await db.transactions.get('t-keep')).toBeDefined() // 수정이 이긴다
    // 클라우드 복원을 위한 재주장(upsert)이 아웃박스에 큐잉된다
    const entry = await db.syncOutbox.get('transactions:t-keep')
    expect(entry?.op).toBe('upsert')
  })

  it('자기 기기의 톰스톤 에코는 무시한다', async () => {
    await seedSync(() => db.transactions.add(makeTxn('t-echo')))
    startRealtimeSync(UID)
    const l = findListener(`/${UID}/syncTombstones`)!

    await l.next(snap([{
      type: 'added',
      data: {
        tableName: 'transactions', syncId: 't-echo', deletedAt: NEWER,
        __deviceId: getDeviceId(), __uploadedAt: { toMillis: () => 79 },
      },
    }]))

    expect(await db.transactions.get('t-echo')).toBeDefined() // 이미 로컬 처리됨 — 재적용 없음
  })
})
