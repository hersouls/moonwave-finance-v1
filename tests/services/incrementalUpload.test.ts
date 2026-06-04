// ─── incrementalUpload 배치 경로 + LWW 판정 테스트 ──────────────────────────
//
// firebase/firestore를 모킹해 네트워크 없이 배치 묶음/processed 마킹/부분 실패
// 의 정확성을 검증한다. (Dexie/changelog는 실제 fake-indexeddb 경로)
import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => ({
  commits: [] as Array<{ sets: number; deletes: number }>,
  commitAttempts: 0,
  failNextCommits: 0,
  /** 설정 시 실패하는 commit이 이 code를 가진 FirebaseError처럼 던진다 */
  failCode: null as string | null,
}))

vi.mock('@/lib/firebase', () => ({ firestore: {}, auth: {} }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_fs: unknown, path: string) => ({ path })),
  getDocs: vi.fn(async () => ({ empty: true, docs: [] })),
  deleteDoc: vi.fn(async () => {}),
  onSnapshot: vi.fn(() => () => {}),
  query: vi.fn((c: unknown) => c),
  limit: vi.fn(),
  writeBatch: vi.fn(() => {
    const ops = { sets: 0, deletes: 0 }
    return {
      set: () => { ops.sets++ },
      delete: () => { ops.deletes++ },
      commit: async () => {
        h.commitAttempts++
        if (h.failNextCommits > 0) {
          h.failNextCommits--
          const err = new Error('commit failed (test)')
          if (h.failCode) Object.assign(err, { code: h.failCode })
          throw err
        }
        h.commits.push({ ...ops })
      },
    }
  }),
}))

import { db } from '@/services/database'
import { incrementalUpload, shouldApplyCloudUpdate } from '@/services/firestoreSync'
import { useAuthStore } from '@/stores/authStore'
import { getDeviceId } from '@/lib/deviceId'
import type { Transaction, Budget } from '@/lib/types'

function makeTxn(): Transaction {
  const now = new Date().toISOString()
  return {
    syncId: crypto.randomUUID(),
    memberId: null,
    type: 'expense',
    amount: 1000,
    categoryId: null,
    date: '2026-06-04',
    isRecurring: false,
    createdAt: now,
    updatedAt: now,
  } as Transaction
}

async function waitForChangeLogCount(expected: number): Promise<void> {
  await vi.waitFor(async () => {
    expect(await db.syncChangeLog.count()).toBe(expected)
  }, { timeout: 5000 })
}

beforeEach(async () => {
  h.commits = []
  h.commitAttempts = 0
  h.failNextCommits = 0
  h.failCode = null
  await db.transactions.clear()
  await db.budgets.clear()
  await new Promise((r) => setTimeout(r, 30))
  await db.syncChangeLog.clear()
  await db.syncTombstones.clear()
  useAuthStore.setState({ syncStatus: 'idle', syncErrorMessage: null, pendingChangesCount: 0 })
})

describe('incrementalUpload 배치 경로', () => {
  it('600건 백로그를 499건 단위 writeBatch 2회로 업로드하고 전부 processed 처리한다', async () => {
    await db.transactions.bulkAdd(Array.from({ length: 600 }, makeTxn))
    await waitForChangeLogCount(600)

    await incrementalUpload('test-uid')

    expect(h.commits.length).toBe(2)
    expect(h.commits[0].sets).toBe(499)
    expect(h.commits[1].sets).toBe(101)
    expect(await db.syncChangeLog.where('processed').equals(0).count()).toBe(0)
    expect(useAuthStore.getState().syncStatus).toBe('synced')
    // 표시 카운트가 실제 DB 상태(0)로 재계산된다 — 로그인 시점 스냅샷 고정 금지
    await vi.waitFor(() => {
      expect(useAuthStore.getState().pendingChangesCount).toBe(0)
    })
  })

  it('한 그룹의 commit 실패 시 그 그룹만 pending으로 남기고 status=error로 정직하게 표시한다', async () => {
    // 두 테이블 = 두 그룹. transactions 그룹의 commit만 실패시킨다.
    await db.transactions.bulkAdd([makeTxn(), makeTxn()])
    const now = new Date().toISOString()
    await db.budgets.add({
      syncId: crypto.randomUUID(), categoryId: null, month: '2026-06',
      amount: 100, createdAt: now, updatedAt: now,
    } as unknown as Budget)
    await waitForChangeLogCount(3)

    h.failNextCommits = 1 // 첫 그룹(타임스탬프 순 = transactions)의 commit 실패
    await incrementalUpload('test-uid')

    const pending = await db.syncChangeLog.where('processed').equals(0).toArray()
    const processed = await db.syncChangeLog.where('processed').equals(1).toArray()
    expect(pending.length).toBe(2)
    expect(pending.every((e) => e.tableName === 'transactions')).toBe(true)
    expect(processed.length).toBe(1)
    expect(processed[0].tableName).toBe('budgets')
    // 부분 실패를 '동기화됨'으로 거짓 표시하지 않는다
    expect(useAuthStore.getState().syncStatus).toBe('error')
    // 분류된 원인 메시지가 함께 노출된다
    expect(useAuthStore.getState().syncErrorMessage).toBeTruthy()
    // 표시 카운트도 실패분(2건)으로 재계산된다
    await vi.waitFor(() => {
      expect(useAuthStore.getState().pendingChangesCount).toBe(2)
    })
  })

  it('쿼터 소진(resource-exhausted)은 즉시 중단하고 쿼터 메시지를 표시한다', async () => {
    // 두 테이블 = 두 그룹. 첫 그룹이 쿼터 오류로 실패하면 둘째 그룹은 시도조차
    // 하지 않아야 한다 (전부 같은 이유로 실패할 것이므로 헛수고 + 추가 과금).
    await db.transactions.bulkAdd([makeTxn(), makeTxn()])
    const now = new Date().toISOString()
    await db.budgets.add({
      syncId: crypto.randomUUID(), categoryId: null, month: '2026-06',
      amount: 100, createdAt: now, updatedAt: now,
    } as unknown as Budget)
    await waitForChangeLogCount(3)

    h.failNextCommits = 1
    h.failCode = 'resource-exhausted'
    await incrementalUpload('test-uid')

    expect(h.commitAttempts).toBe(1) // 둘째 그룹(budgets) 미시도
    expect(await db.syncChangeLog.where('processed').equals(0).count()).toBe(3)
    expect(useAuthStore.getState().syncStatus).toBe('error')
    expect(useAuthStore.getState().syncErrorMessage).toContain('한도')
  })

  it('성공 시 syncErrorMessage가 지워진다 (synced 전이 시 클리어)', async () => {
    useAuthStore.setState({ syncErrorMessage: '이전 오류', syncStatus: 'error' })
    await db.transactions.add(makeTxn())
    await waitForChangeLogCount(1)

    await incrementalUpload('test-uid')

    expect(useAuthStore.getState().syncStatus).toBe('synced')
    expect(useAuthStore.getState().syncErrorMessage).toBeNull()
  })

  it('삭제 백로그는 배치 삭제 + 톰스톤 배치 업로드로 처리한다', async () => {
    const txns = [makeTxn(), makeTxn(), makeTxn()]
    const ids = await db.transactions.bulkAdd(txns, { allKeys: true }) as number[]
    await waitForChangeLogCount(3)
    await db.syncChangeLog.clear()

    await db.transactions.bulkDelete(ids)
    await waitForChangeLogCount(3)

    await incrementalUpload('test-uid')

    // 1 commit = 삭제 배치(3 deletes), 1 commit = 톰스톤 배치(3 sets)
    const deleteCommit = h.commits.find((c) => c.deletes === 3)
    const tombstoneCommit = h.commits.find((c) => c.sets === 3)
    expect(deleteCommit).toBeDefined()
    expect(tombstoneCommit).toBeDefined()
    expect(await db.syncChangeLog.where('processed').equals(0).count()).toBe(0)
    expect(useAuthStore.getState().syncStatus).toBe('synced')
  })
})

describe('shouldApplyCloudUpdate (LWW + 시계오차 + echo 억제)', () => {
  it('허용 창(500ms) 밖에서 명확히 더 새로운 클라우드 변경은 항상 이긴다', () => {
    expect(shouldApplyCloudUpdate(
      '2026-06-04T00:00:10.000Z', 'peer-device', '2026-06-04T00:00:00.000Z',
    )).toBe(true)
    expect(shouldApplyCloudUpdate(
      '2026-06-04T00:00:00.000Z', 'peer-device', '2026-06-04T00:00:10.000Z',
    )).toBe(false)
  })

  it('자기 echo(동일 deviceId, 동일 타임스탬프)는 적용하지 않는다', () => {
    const self = getDeviceId()
    expect(shouldApplyCloudUpdate(
      '2026-06-04T00:00:00.000Z', self, '2026-06-04T00:00:00.000Z',
    )).toBe(false)
  })

  it('허용 창 안(±500ms)의 차이는 deviceId로 결정적으로 판정한다', () => {
    const self = getDeviceId()
    const higherPeer = `${self}~~` // 항상 self보다 사전순으로 큼
    // 클라우드가 300ms '뒤'여도 창 안이면 deviceId 판정 — higherPeer는 적용
    expect(shouldApplyCloudUpdate(
      '2026-06-04T00:00:00.300Z', higherPeer, '2026-06-04T00:00:00.000Z',
    )).toBe(true)
    // 같은 300ms 차이라도 peer가 사전순으로 작으면(빈 문자열 불가하므로 '!'
    // 같은 낮은 문자) 적용 안 함
    expect(shouldApplyCloudUpdate(
      '2026-06-04T00:00:00.300Z', '!', '2026-06-04T00:00:00.000Z',
    )).toBe(false)
    // 창 밖(600ms)은 일반 LWW — 더 새로우면 deviceId 무관 적용
    expect(shouldApplyCloudUpdate(
      '2026-06-04T00:00:00.600Z', '!', '2026-06-04T00:00:00.000Z',
    )).toBe(true)
  })
})
