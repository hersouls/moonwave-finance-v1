// ─── 델타 머지 테스트 ────────────────────────────────────────────────
//
// 검증 대상:
// 1. syncCheckpoint 헬퍼 — 단조 전진 / 리셋 / 빈 베이스라인 기록
// 2. downloadTable — 체크포인트 유무에 따른 전량 vs __uploadedAt 델타 쿼리
// 3. mergeTableWithRemap의 cloudIsComplete 게이트 — 델타 부분집합에서
//    로컬 전체가 "클라우드에 없는 신규"로 오판되어 재업로드되는 회귀 방지
// 4. clearAllData가 체크포인트를 리셋 (빈 DB + 체크포인트 = 데이터 누락)
import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => ({
  getDocsRefs: [] as Array<Record<string, unknown>>,
}))

vi.mock('@/lib/firebase', () => ({ firestore: {}, auth: {} }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_fs: unknown, path: string) => ({ __type: 'collection', path })),
  doc: vi.fn((_fs: unknown, path: string) => ({ path })),
  getDocs: vi.fn(async (ref: Record<string, unknown>) => {
    h.getDocsRefs.push(ref)
    return { empty: true, docs: [] }
  }),
  deleteDoc: vi.fn(async () => {}),
  onSnapshot: vi.fn(() => () => {}),
  query: vi.fn((col: unknown, ...constraints: unknown[]) => ({ __type: 'query', col, constraints })),
  limit: vi.fn((n: number) => ({ __type: 'limit', n })),
  where: vi.fn((field: string, op: string, value: unknown) => ({ __type: 'where', field, op, value })),
  serverTimestamp: vi.fn(() => ({ __sentinel: 'serverTimestamp' })),
  Timestamp: { fromMillis: (ms: number) => ({ __type: 'timestamp', ms, toMillis: () => ms }) },
  writeBatch: vi.fn(() => ({ set: () => {}, delete: () => {}, commit: async () => {} })),
}))

import { db, setSyncWritingFlag } from '@/services/database'
import { clearAllData } from '@/services/database'
import { downloadTable, mergeTableWithRemap } from '@/services/firestoreSync'
import {
  getSyncCheckpoint,
  advanceSyncCheckpoint,
  clearSyncCheckpoint,
} from '@/services/syncCheckpoint'
import type { Transaction } from '@/lib/types'

const UID = 'delta-test-uid'

beforeEach(async () => {
  h.getDocsRefs = []
  await clearSyncCheckpoint()
  setSyncWritingFlag(true)
  try {
    await db.transactions.clear()
    await db.syncChangeLog.clear()
    await db.syncTombstones.clear()
  } finally {
    setSyncWritingFlag(false)
  }
})

describe('syncCheckpoint 헬퍼', () => {
  it('없으면 null — 베이스라인(전량) 머지 신호', async () => {
    expect(await getSyncCheckpoint(UID)).toBeNull()
  })

  it('advance는 단조 전진한다 (과거 값으로 후퇴 불가)', async () => {
    await advanceSyncCheckpoint(UID, { transactions: 1000 })
    await advanceSyncCheckpoint(UID, { transactions: 500, members: 700 })
    expect(await getSyncCheckpoint(UID)).toEqual({ transactions: 1000, members: 700 })
  })

  it('스탬프 문서가 0건인 테이블도 키를 0으로 명시 기록한다 — "베이스라인을 봤다"는 증거', async () => {
    await advanceSyncCheckpoint(UID, { transactions: 0 })
    // null이 아니어야 다음 실행이 델타 경로를 타고, 키가 명시되어야
    // "한 번도 전량을 본 적 없는 신규 테이블"(키 없음 → 전량)과 구분된다.
    expect(await getSyncCheckpoint(UID)).toEqual({ transactions: 0 })
  })

  it('clearSyncCheckpoint()는 uid 없이 모든 체크포인트를 지운다', async () => {
    await advanceSyncCheckpoint(UID, { transactions: 1000 })
    await advanceSyncCheckpoint('other-uid', { members: 2000 })
    await clearSyncCheckpoint()
    expect(await getSyncCheckpoint(UID)).toBeNull()
    expect(await getSyncCheckpoint('other-uid')).toBeNull()
  })
})

describe('downloadTable 델타 쿼리', () => {
  it('sinceMs 없음 → 컬렉션 전량 getDocs', async () => {
    await downloadTable(UID, 'transactions')
    expect(h.getDocsRefs).toHaveLength(1)
    expect(h.getDocsRefs[0].__type).toBe('collection')
    expect(h.getDocsRefs[0].path).toBe(`users/${UID}/transactions`)
  })

  it('sinceMs 지정 → __uploadedAt >= Timestamp(sinceMs) 범위 쿼리', async () => {
    await downloadTable(UID, 'transactions', 12345)
    expect(h.getDocsRefs).toHaveLength(1)
    const ref = h.getDocsRefs[0] as { __type: string; constraints: Array<Record<string, unknown>> }
    expect(ref.__type).toBe('query')
    expect(ref.constraints).toHaveLength(1)
    expect(ref.constraints[0]).toMatchObject({
      __type: 'where',
      field: '__uploadedAt',
      op: '>=',
      value: { __type: 'timestamp', ms: 12345 },
    })
  })

  it('sinceMs = 0도 델타 쿼리다 (베이스라인 직후: 스탬프된 문서 전부)', async () => {
    await downloadTable(UID, 'transactions', 0)
    expect((h.getDocsRefs[0] as { __type: string }).__type).toBe('query')
  })
})

describe('mergeTableWithRemap cloudIsComplete 게이트', () => {
  async function seedLocalTxns(n: number): Promise<void> {
    const now = new Date().toISOString()
    setSyncWritingFlag(true) // 시드가 changelog를 적재하지 않게
    try {
      await db.transactions.bulkAdd(Array.from({ length: n }, (_, i) => ({
        syncId: `local-${i}`, memberId: null, type: 'expense', amount: 1000 + i,
        categoryId: null, date: '2026-06-05', isRecurring: false,
        createdAt: now, updatedAt: now,
      } as Transaction)))
    } finally {
      setSyncWritingFlag(false)
    }
  }

  it('델타(cloudIsComplete=false): 부분집합에 없는 로컬 레코드를 업로드 큐에 넣지 않는다', async () => {
    await seedLocalTxns(5)
    // 델타 머지: 클라우드에서 0건 내려온 상황 (변경 없음)
    await mergeTableWithRemap('transactions', [], undefined, false)
    // 회귀 방지의 핵심: 로컬 5건이 "클라우드에 없는 신규"로 오판되면
    // 매 델타 머지마다 로컬 전체 재업로드가 일어난다.
    expect(await db.syncChangeLog.where('processed').equals(0).count()).toBe(0)
  })

  it('전량(cloudIsComplete=true, 기본값): 클라우드에 없는 로컬 레코드는 업로드 큐에 들어간다', async () => {
    await seedLocalTxns(3)
    await mergeTableWithRemap('transactions', [])
    expect(await db.syncChangeLog.where('processed').equals(0).count()).toBe(3)
  })

  it('델타에서도 교집합의 로컬-신규 변경은 업로드 큐에 들어간다', async () => {
    await seedLocalTxns(1)
    // 로컬이 더 최신인 같은 syncId의 클라우드 문서가 델타에 포함된 경우
    const cloudOlder = {
      syncId: 'local-0', memberId: null, type: 'expense', amount: 1,
      categoryId: null, date: '2026-06-01', isRecurring: false,
      createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z',
    }
    await mergeTableWithRemap('transactions', [cloudOlder], undefined, false)
    expect(await db.syncChangeLog.where('processed').equals(0).count()).toBe(1)
  })
})

describe('로컬 교체 시 체크포인트 리셋', () => {
  it('clearAllData가 체크포인트를 지운다 — 다음 머지는 전량으로 재수렴', async () => {
    await advanceSyncCheckpoint(UID, { transactions: 99999 })
    await clearAllData({ force: true })
    expect(await getSyncCheckpoint(UID)).toBeNull()
  })

  it('체크포인트는 Dexie 안에 산다 — IndexedDB 삭제 시 운명을 같이한다 (데이터 누락 방지)', async () => {
    await advanceSyncCheckpoint(UID, { transactions: 12345 })
    // localStorage에는 어떤 체크포인트도 없어야 한다 — localStorage에 두면
    // IndexedDB만 삭제(PWA 재설치/스토리지 축출)됐을 때 빈 DB + 델타 머지
    // 조합으로 과거 데이터가 무성 누락된다 (적대적 리뷰 확정 결함).
    const lsKeys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.toLowerCase().includes('checkpoint')) lsKeys.push(k)
    }
    expect(lsKeys).toEqual([])
    expect(await db.syncMeta.count()).toBeGreaterThan(0)
  })
})
