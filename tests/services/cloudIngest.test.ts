// ─── 클라우드 인제스트 — applyCloudChange + fromCloudDoc + LWW ──────────────
//
// 다운로드 경로의 의미론 검증 (Dexie는 실제 fake-indexeddb):
// 1. v3 문서(문자열 FK)는 그대로 적용
// 2. v2 레거시 문서(숫자 FK + <fk>_syncId 컴패니언)는 문자열 FK로 복원
//    — 전환기 플릿(구버전 기기가 남아있는 동안) 호환의 핵심
// 3. 컴패니언 없는 숫자 FK의 mode별 처리 (nullable→null / optional→제거 / required→'')
// 4. LWW: 더 새로운 로컬 보존, ±500ms 동률은 deviceId 타이브레이크, 자기 echo skip
// 5. removed → 로컬 삭제 (dailyValues의 removed는 무시 — 번들 마커가 담당)
// 6. put 전체교체 — 클라우드에서 사라진 필드가 로컬에도 사라진다
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/firebase', () => ({ firestore: {}, auth: {} }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_fs: unknown, path: string) => ({ __type: 'collection', path })),
  doc: vi.fn((_fs: unknown, path: string) => ({ __type: 'doc', path })),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => undefined })),
  getDocs: vi.fn(async () => ({ empty: true, docs: [] })),
  setDoc: vi.fn(async () => {}),
  deleteDoc: vi.fn(async () => {}),
  onSnapshot: vi.fn(() => () => {}),
  query: vi.fn((c: unknown) => c),
  limit: vi.fn(),
  where: vi.fn(),
  serverTimestamp: vi.fn(() => ({ __sentinel: 'serverTimestamp' })),
  writeBatch: vi.fn(() => ({ set: vi.fn(), delete: vi.fn(), commit: async () => {} })),
}))

import { db, setSyncWritingFlag, drainChangeTracking } from '@/services/database'
import { applyCloudChange, fromCloudDoc, shouldApplyCloudUpdate } from '@/services/firestoreSync'
import { getDeviceId } from '@/lib/deviceId'
import type { Transaction } from '@/lib/types'

const NOW = '2026-06-05T00:00:00.000Z'
const OLDER = '2026-06-01T00:00:00.000Z'
const NEWER = '2026-06-09T00:00:00.000Z'

/** v3 클라우드 문서 — 문자열 FK + 컴패니언 (업로더 toCloudPayload와 동형). */
function v3TxnDoc(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    syncId: 'txn-1',
    memberId: 'mem-1',
    memberId_syncId: 'mem-1',
    categoryId: 'cat-food',
    categoryId_syncId: 'cat-food',
    type: 'expense',
    amount: 5000,
    date: '2026-06-01',
    isRecurring: false,
    createdAt: OLDER,
    updatedAt: NOW,
    __deviceId: 'peer-device',
    __schemaV: 3,
    __uploadedAt: { seconds: 0 },
    ...over,
  }
}

async function seedSync(fn: () => Promise<unknown>): Promise<void> {
  setSyncWritingFlag(true)
  try { await fn() } finally { setSyncWritingFlag(false) }
}

function localTxn(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 'txn-1',
    memberId: 'mem-1',
    type: 'expense',
    amount: 111,
    categoryId: null,
    date: '2026-06-01',
    isRecurring: false,
    createdAt: OLDER,
    updatedAt: OLDER,
    ...over,
  } as Transaction
}

beforeEach(async () => {
  setSyncWritingFlag(true)
  try {
    await db.transactions.clear()
    await db.dailyValues.clear()
    await db.assetItems.clear()
  } finally {
    setSyncWritingFlag(false)
  }
  await drainChangeTracking()
  await db.syncOutbox.clear()
})

describe('applyCloudChange — v3 문서 적용', () => {
  it('문자열 FK를 그대로 저장하고 클라우드 전용 필드는 벗겨낸다', async () => {
    const applied = await applyCloudChange('transactions', 'added', v3TxnDoc())
    expect(applied).toBe(true)

    const row = await db.transactions.get('txn-1')
    expect(row).toBeDefined()
    expect(row!.memberId).toBe('mem-1')     // v3 문자열 FK 그대로
    expect(row!.categoryId).toBe('cat-food')
    expect(row!.amount).toBe(5000)
    // 클라우드 전용 필드/컴패니언은 로컬 레코드에 남지 않는다
    const raw = row as unknown as Record<string, unknown>
    expect(raw.syncId).toBeUndefined()
    expect(raw.memberId_syncId).toBeUndefined()
    expect(raw.__deviceId).toBeUndefined()
    expect(raw.__schemaV).toBeUndefined()
    expect(raw.__uploadedAt).toBeUndefined()
  })

  it('인제스트 쓰기는 아웃박스에 echo를 남기지 않는다', async () => {
    await applyCloudChange('transactions', 'added', v3TxnDoc())
    // post-commit 아웃박스 기록은 비동기 — 안정화 후 확인
    await drainChangeTracking()
    await new Promise(r => setTimeout(r, 30))
    expect(await db.syncOutbox.count()).toBe(0)
  })
})

describe('applyCloudChange — v2 레거시 문서 정규화 (전환기 플릿 호환)', () => {
  it('숫자 FK를 <fk>_syncId 컴패니언으로 문자열 id로 복원한다', async () => {
    const legacy: Record<string, unknown> = {
      id: 42, // 구버전 기기의 숫자 로컬 id — 폐기 대상
      syncId: 'txn-legacy',
      memberId: 3,
      memberId_syncId: 'mem-1',
      categoryId: 7,
      categoryId_syncId: 'cat-food',
      paymentMethodItemId: 9,
      paymentMethodItemId_syncId: 'pm-1',
      type: 'expense',
      amount: 100,
      date: '2026-06-01',
      isRecurring: false,
      createdAt: OLDER,
      updatedAt: NOW,
      __deviceId: 'old-device',
      __schemaV: 2,
    }
    const applied = await applyCloudChange('transactions', 'added', legacy)
    expect(applied).toBe(true)

    const row = await db.transactions.get('txn-legacy')
    expect(row).toBeDefined()
    expect(row!.id).toBe('txn-legacy') // 숫자 로컬 id(42)가 아니라 전역 id
    expect(row!.memberId).toBe('mem-1')
    expect(row!.categoryId).toBe('cat-food')
    expect(row!.paymentMethodItemId).toBe('pm-1')
  })

  it('컴패니언 없는 숫자 FK — nullable은 null, optional은 필드 제거', async () => {
    const legacy: Record<string, unknown> = {
      syncId: 'txn-orphan',
      memberId: 3,             // nullable, 컴패니언 없음
      categoryId: null,        // 이미 null — 그대로
      paymentMethodItemId: 9,  // optional, 컴패니언 없음
      type: 'expense',
      amount: 100,
      date: '2026-06-01',
      isRecurring: false,
      createdAt: OLDER,
      updatedAt: NOW,
      __deviceId: 'old-device',
      __schemaV: 2,
    }
    await applyCloudChange('transactions', 'added', legacy)
    const row = (await db.transactions.get('txn-orphan')) as unknown as Record<string, unknown>
    expect(row.memberId).toBeNull()
    expect(row.categoryId).toBeNull()
    expect('paymentMethodItemId' in row).toBe(false)
  })
})

describe('fromCloudDoc (단위)', () => {
  it('syncId가 없으면 null — id를 결정할 수 없는 문서는 버린다', () => {
    expect(fromCloudDoc('transactions', { amount: 1, updatedAt: NOW })).toBeNull()
  })

  it('required FK는 복원 불가 시 빈 문자열 표식이 된다', () => {
    const rec = fromCloudDoc('assetItems', {
      syncId: 'asset-1',
      memberId: 5,    // 숫자, 컴패니언 없음 → required
      categoryId: 8,  // 숫자, 컴패니언 있음
      categoryId_syncId: 'cat-A',
      name: '자산',
      updatedAt: NOW,
    })!
    expect(rec.id).toBe('asset-1')
    expect(rec.memberId).toBe('')        // required — '' 조회는 항상 미스
    expect(rec.categoryId).toBe('cat-A') // 컴패니언으로 복원
  })

  it('v3 문서의 null FK는 컴패니언과 무관하게 그대로 유지된다', () => {
    const rec = fromCloudDoc('transactions', {
      syncId: 'txn-x',
      memberId: null,
      memberId_syncId: 'mem-stale', // 묵은 컴패니언이 남아 있어도
      categoryId: 'cat-A',
      categoryId_syncId: 'cat-A',
      updatedAt: NOW,
    })!
    expect(rec.memberId).toBeNull() // v3 형식(null)이 우선 — 컴패니언 미적용
    expect(rec.categoryId).toBe('cat-A')
  })
})

describe('applyCloudChange — LWW 충돌', () => {
  it('로컬이 더 새로우면 클라우드를 적용하지 않는다', async () => {
    await seedSync(() => db.transactions.add(localTxn({ amount: 999, updatedAt: NEWER })))

    const applied = await applyCloudChange('transactions', 'modified', v3TxnDoc({ updatedAt: NOW }))
    expect(applied).toBe(false)
    expect((await db.transactions.get('txn-1'))!.amount).toBe(999) // 로컬 보존
  })

  it('±500ms 동률은 deviceId 타이브레이크 — 큰 쪽이 결정적으로 이긴다', async () => {
    const self = getDeviceId()
    await seedSync(() => db.transactions.add(localTxn({ amount: 999, updatedAt: NOW })))

    // 클라우드가 300ms 뒤(창 안) + 사전순으로 작은 peer → 적용 안 함
    const lost = await applyCloudChange('transactions', 'modified', v3TxnDoc({
      amount: 1, updatedAt: '2026-06-05T00:00:00.300Z', __deviceId: '!',
    }))
    expect(lost).toBe(false)
    expect((await db.transactions.get('txn-1'))!.amount).toBe(999)

    // 같은 창 안 차이라도 사전순으로 큰 peer → 적용 (양 기기 동일 결론 = 수렴)
    const won = await applyCloudChange('transactions', 'modified', v3TxnDoc({
      amount: 2, updatedAt: '2026-06-05T00:00:00.300Z', __deviceId: `${self}~~`,
    }))
    expect(won).toBe(true)
    expect((await db.transactions.get('txn-1'))!.amount).toBe(2)
  })

  it('자기 deviceId의 echo는 적용하지 않는다 (업로드 반향 억제)', async () => {
    const self = getDeviceId()
    await seedSync(() => db.transactions.add(localTxn({ amount: 999, updatedAt: NOW })))

    const applied = await applyCloudChange('transactions', 'modified', v3TxnDoc({
      amount: 1, updatedAt: NOW, __deviceId: self,
    }))
    expect(applied).toBe(false)
    expect((await db.transactions.get('txn-1'))!.amount).toBe(999)
  })
})

describe('applyCloudChange — removed', () => {
  it('removed는 로컬 행을 삭제한다', async () => {
    await seedSync(() => db.transactions.add(localTxn()))

    const applied = await applyCloudChange('transactions', 'removed', { syncId: 'txn-1' })
    expect(applied).toBe(true)
    expect(await db.transactions.get('txn-1')).toBeUndefined()
  })

  it('로컬에 없는 행의 removed는 no-op(false)', async () => {
    expect(await applyCloudChange('transactions', 'removed', { syncId: 'no-such' })).toBe(false)
  })

  it('dailyValues의 removed는 무시한다 — 삭제 전파는 번들 v=null 마커가 담당', async () => {
    await seedSync(() => db.dailyValues.add({
      id: 'dv-1', assetItemId: 'asset-A', date: '2026-06-05',
      value: 100, createdAt: OLDER, updatedAt: OLDER,
    }))

    const applied = await applyCloudChange('dailyValues', 'removed', { syncId: 'dv-1' })
    expect(applied).toBe(false)
    expect(await db.dailyValues.get('dv-1')).toBeDefined() // 보존
  })

  it('added 후 removed 순서가 깨끗이 수렴한다 (톰스톤성 시나리오)', async () => {
    await applyCloudChange('transactions', 'added', v3TxnDoc())
    expect(await db.transactions.get('txn-1')).toBeDefined()

    const removed = await applyCloudChange('transactions', 'removed', { syncId: 'txn-1' })
    expect(removed).toBe(true)
    expect(await db.transactions.get('txn-1')).toBeUndefined()
    expect(await db.transactions.count()).toBe(0)
  })
})

describe('applyCloudChange — put 전체교체', () => {
  it('클라우드에서 사라진 필드는 로컬에서도 사라진다 (부분 병합 잔존 금지)', async () => {
    await seedSync(() => db.transactions.add(localTxn({
      memo: '지워질 메모', paymentMethodItemId: 'pm-old', updatedAt: OLDER,
    })))

    const doc = v3TxnDoc({ updatedAt: NOW }) // memo/paymentMethodItemId 없음
    const applied = await applyCloudChange('transactions', 'modified', doc)
    expect(applied).toBe(true)

    const row = (await db.transactions.get('txn-1')) as unknown as Record<string, unknown>
    expect(row.amount).toBe(5000)
    expect('memo' in row).toBe(false)                 // put = 전체 교체
    expect('paymentMethodItemId' in row).toBe(false)
  })
})

describe('applyCloudChange — 레거시 dailyValues 인제스트 가드', () => {
  it('레거시 dv 문서의 projected는 동기화 범위 밖 — 무시한다', async () => {
    const applied = await applyCloudChange('dailyValues', 'added', {
      syncId: 'dv-pj', assetItemId: 'asset-A', assetItemId_syncId: 'asset-A',
      date: '2026-06-01', value: 5, source: 'projected', updatedAt: NOW,
    })
    expect(applied).toBe(false)
    expect(await db.dailyValues.count()).toBe(0)
  })

  it('좌표 복원 불가한 레거시 dv 행(컴패니언 소실)은 버린다', async () => {
    const applied = await applyCloudChange('dailyValues', 'added', {
      syncId: 'dv-lost', assetItemId: 7, /* 숫자 FK + 컴패니언 없음 → '' */
      date: '2026-06-01', value: 5, updatedAt: NOW,
    })
    expect(applied).toBe(false)
    expect(await db.dailyValues.count()).toBe(0)
  })
})

// ─── shouldApplyCloudUpdate 단위 케이스 — 구 incrementalUpload.test.ts에서 이식 ──
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

  it('cloudUpdatedAt이 없으면 절대 적용하지 않는다', () => {
    expect(shouldApplyCloudUpdate(undefined, 'peer-device', NOW)).toBe(false)
    expect(shouldApplyCloudUpdate(undefined, 'peer-device', undefined)).toBe(false)
  })

  it('로컬 updatedAt이 없으면(신규 수신) 클라우드가 이긴다', () => {
    expect(shouldApplyCloudUpdate(NOW, 'peer-device', undefined)).toBe(true)
  })
})
