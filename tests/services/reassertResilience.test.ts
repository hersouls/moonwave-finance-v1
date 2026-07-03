// ─── 재-주장(re-assert) + 푸시 복원력 회귀 ──────────────────────────
//
// 적대적 리뷰가 확정한 코어 결함들의 회귀 테스트:
//  C2/H1 업로드 방향 LWW 부재 — 스테일 클라우드를 거부한 로컬 최신본을
//        재주장해 클라우드를 수렴시킨다 (에코는 재주장 안 함 → 무한 핑퐁 방지).
//  H3    poison 레코드 격리 — batch.set 동기 throw 1건이 나머지 정상 항목의
//        업로드를 막지 않고, 커밋 실패 시 아웃박스는 통째 보존된다.
import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => ({
  /** doc path에 이 문자열이 포함되면 batch.set이 동기 throw (poison 시뮬레이션). */
  poisonPathContains: null as string | null,
  /** commit()이 이 횟수만큼 reject (네트워크/쿼터 실패 시뮬레이션). */
  failCommits: 0,
  committedSets: [] as string[],
  committedDeletes: [] as string[],
}))

vi.mock('@/lib/firebase', () => ({ firestore: {}, auth: {} }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_fs: unknown, path: string) => ({ __type: 'collection', path })),
  doc: vi.fn((_fs: unknown, path: string) => ({ __type: 'doc', path })),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => undefined })),
  getDocs: vi.fn(async () => ({ empty: true, docs: [] })),
  getDocsFromServer: vi.fn(async () => ({ empty: true, docs: [] })),
  setDoc: vi.fn(async () => {}),
  deleteDoc: vi.fn(async () => {}),
  onSnapshot: vi.fn(() => () => {}),
  query: vi.fn((c: unknown) => c),
  limit: vi.fn(),
  where: vi.fn(),
  serverTimestamp: vi.fn(() => ({ __sentinel: 'serverTimestamp' })),
  writeBatch: vi.fn(() => {
    const sets: string[] = []
    const deletes: string[] = []
    return {
      set: (ref: { path: string }) => {
        if (h.poisonPathContains && ref.path.includes(h.poisonPathContains)) {
          throw new Error('poison: nested undefined (test)')
        }
        sets.push(ref.path)
      },
      delete: (ref: { path: string }) => { deletes.push(ref.path) },
      commit: async () => {
        if (h.failCommits > 0) { h.failCommits--; throw Object.assign(new Error('commit failed'), { code: 'unavailable' }) }
        h.committedSets.push(...sets)
        h.committedDeletes.push(...deletes)
      },
    }
  }),
}))

import { db, setSyncWritingFlag, drainChangeTracking, addTransaction, updateTransaction } from '@/services/database'
import { applyCloudChange, drainReassertQueue, flushOutbox } from '@/services/firestoreSync'
import { getDeviceId } from '@/lib/deviceId'
import type { Transaction } from '@/lib/types'

const OLDER = '2026-06-01T00:00:00.000Z'
const NEWER = '2026-06-09T00:00:00.000Z'

function cloudTxn(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    syncId: 'txn-1', memberId: null, memberId_syncId: null,
    categoryId: null, categoryId_syncId: null,
    type: 'expense', amount: 5000, date: '2026-06-01', isRecurring: false,
    createdAt: OLDER, updatedAt: OLDER,
    __deviceId: 'peer-device', __schemaV: 3, __uploadedAt: { seconds: 0 },
    ...over,
  }
}

async function seedLocal(row: Transaction): Promise<void> {
  setSyncWritingFlag(true)
  try { await db.transactions.put(row) } finally { setSyncWritingFlag(false) }
}

async function waitOutbox(pred: () => Promise<boolean>): Promise<void> {
  await vi.waitFor(async () => { expect(await pred()).toBe(true) }, { timeout: 3000 })
}

beforeEach(async () => {
  h.poisonPathContains = null
  h.failCommits = 0
  h.committedSets = []
  h.committedDeletes = []
  setSyncWritingFlag(true)
  try { await db.transactions.clear() } finally { setSyncWritingFlag(false) }
  await drainChangeTracking()
  await db.syncOutbox.clear()
})

describe('재-주장 (업로드 방향 LWW 복구, C2/H1)', () => {
  it('로컬이 더 새로우면 스테일 non-echo 클라우드를 거부하고 재주장 마커를 아웃박스에 넣는다', async () => {
    // 로컬 T=NEWER (사용자가 방금 수정). 클라우드는 피어가 올린 OLDER.
    await seedLocal({ id: 'txn-1', memberId: null, type: 'expense', amount: 999,
      categoryId: null, date: '2026-06-01', isRecurring: false, createdAt: OLDER, updatedAt: NEWER })

    const applied = await applyCloudChange('transactions', 'modified', cloudTxn({ updatedAt: OLDER, amount: 5000 }))
    expect(applied).toBe(false)                 // 로컬 유지 (LWW)
    expect((await db.transactions.get('txn-1'))!.amount).toBe(999) // 로컬 최신본 보존

    await drainReassertQueue()
    const entry = await db.syncOutbox.get('transactions:txn-1')
    expect(entry).toBeDefined()                 // 재주장 마커 적재
    expect(entry!.op).toBe('upsert')
  })

  it('자기 에코(cloudDeviceId===self)는 재주장하지 않는다 (무한 핑퐁 방지)', async () => {
    await seedLocal({ id: 'txn-1', memberId: null, type: 'expense', amount: 999,
      categoryId: null, date: '2026-06-01', isRecurring: false, createdAt: OLDER, updatedAt: NEWER })

    const applied = await applyCloudChange('transactions', 'modified',
      cloudTxn({ updatedAt: OLDER, __deviceId: getDeviceId() }))
    expect(applied).toBe(false)

    await drainReassertQueue()
    expect(await db.syncOutbox.get('transactions:txn-1')).toBeUndefined() // 에코 → 재주장 없음
  })

  it('아웃박스에 이미 더 최신 사용자 편집이 있으면 재주장이 덮어쓰지 않는다', async () => {
    // 사용자가 방금 편집 → 훅이 아웃박스에 upsert 적재
    await addTransaction({ id: 'txn-1', memberId: null, type: 'expense', amount: 111,
      categoryId: null, date: '2026-06-01', isRecurring: false, createdAt: OLDER, updatedAt: NEWER } as Omit<Transaction, 'id'> & { id: string })
    await waitOutbox(async () => !!(await db.syncOutbox.get('transactions:txn-1')))
    const before = await db.syncOutbox.get('transactions:txn-1')

    await applyCloudChange('transactions', 'modified', cloudTxn({ updatedAt: OLDER }))
    await drainReassertQueue()
    const after = await db.syncOutbox.get('transactions:txn-1')
    expect(after!.queuedAt).toBe(before!.queuedAt) // 기존 사용자 마커 보존
  })
})

describe('푸시 복원력 (H3)', () => {
  it('poison 레코드(set throw)는 격리되고 나머지 정상 항목은 커밋·ack된다', async () => {
    // 두 건의 사용자 쓰기 → 아웃박스 2행
    await addTransaction({ id: 'good-1', memberId: null, type: 'expense', amount: 100,
      categoryId: null, date: '2026-06-01', isRecurring: false, createdAt: OLDER, updatedAt: OLDER } as Omit<Transaction, 'id'> & { id: string })
    await addTransaction({ id: 'poison-1', memberId: null, type: 'expense', amount: 200,
      categoryId: null, date: '2026-06-01', isRecurring: false, createdAt: OLDER, updatedAt: OLDER } as Omit<Transaction, 'id'> & { id: string })
    await waitOutbox(async () => (await db.syncOutbox.count()) === 2)

    h.poisonPathContains = 'poison-1'
    await flushOutbox('uid-1')

    // 정상 레코드는 커밋되고 아웃박스에서 제거, poison은 남는다
    expect(h.committedSets.some(p => p.includes('good-1'))).toBe(true)
    expect(h.committedSets.some(p => p.includes('poison-1'))).toBe(false)
    expect(await db.syncOutbox.get('transactions:good-1')).toBeUndefined()
    expect(await db.syncOutbox.get('transactions:poison-1')).toBeDefined()
  })

  it('커밋 실패 시 아웃박스를 통째로 보존한다 (데이터 손실 없음)', async () => {
    await addTransaction({ id: 'txn-1', memberId: null, type: 'expense', amount: 100,
      categoryId: null, date: '2026-06-01', isRecurring: false, createdAt: OLDER, updatedAt: OLDER } as Omit<Transaction, 'id'> & { id: string })
    await waitOutbox(async () => (await db.syncOutbox.count()) === 1)

    h.failCommits = 1
    await flushOutbox('uid-1')

    expect(await db.syncOutbox.get('transactions:txn-1')).toBeDefined() // 재시도 대상으로 보존
  })
})
