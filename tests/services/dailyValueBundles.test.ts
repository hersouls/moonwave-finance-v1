// ─── dailyValues 번들 동기화 테스트 (Sync v2) ─────────────────────────
//
// 검증 대상:
// 1. 순수 헬퍼 — 패치 그룹핑/삭제-재생성 충돌/미해석 좌표/전량 번들/explode
//    (Sync v2: 자산 id가 곧 전역 id — assetSyncById 매핑 파라미터 소멸, sid=row.id)
// 2. 아웃박스 좌표 메타 — dailyValues 훅이 (assetItemId, date)를 동반 기록
// 3. 업로드 통합(flushOutbox) — 업서트는 번들 merge:true로만(per-row 금지),
//    삭제는 번들 v=null 마커 + 구버전 호환 톰스톤 문서
// 4. 인제스트 — 일자 단위 LWW(±500ms + deviceId) + sid 입양 + v=null 삭제 마커
// 5. Phase 2 — projected 업로드 제외 / cloud projected 인제스트 무시 /
//    앵커의 로컬 projected 무조건 승리(source-aware supersede)
// 6. 2-기기 왕복 수렴 하네스 — 업로드 캡처 → 빈 기기 인제스트 → 행 동일성
import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => ({
  /** batch.set 캡처: { path, payload, options } */
  sets: [] as Array<{ path: string; payload: Record<string, unknown>; options?: Record<string, unknown> }>,
  deletes: [] as string[],
  commitAttempts: 0,
}))

vi.mock('@/lib/firebase', () => ({ firestore: {}, auth: {} }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_fs: unknown, path: string) => ({ __type: 'collection', path })),
  doc: vi.fn((_fs: unknown, path: string) => ({ __type: 'doc', path })),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => undefined })),
  getDocs: vi.fn(async () => ({ empty: true, docs: [] })),
  setDoc: vi.fn(async () => {}),
  deleteDoc: vi.fn(async () => {}),
  onSnapshot: vi.fn(() => () => {}),
  query: vi.fn((c: unknown, ...constraints: unknown[]) => ({ __type: 'query', c, constraints })),
  limit: vi.fn(),
  where: vi.fn((field: string, op: string, value: unknown) => ({ __type: 'where', field, op, value })),
  serverTimestamp: vi.fn(() => ({ __sentinel: 'serverTimestamp' })),
  writeBatch: vi.fn(() => ({
    set: (ref: { path: string }, payload: Record<string, unknown>, options?: Record<string, unknown>) => {
      h.sets.push({ path: ref.path, payload, options })
    },
    delete: (ref: { path: string }) => { h.deletes.push(ref.path) },
    commit: async () => { h.commitAttempts++ },
  })),
}))

import { db, setSyncWritingFlag, drainChangeTracking } from '@/services/database'
import { flushOutbox, ingestDvBundleDoc, fullUpload } from '@/services/firestoreSync'
import {
  buildBundlePatches,
  buildFullBundles,
  explodeBundleDoc,
  dvBundleKey,
} from '@/services/dailyValueBundles'
import { useAuthStore } from '@/stores/authStore'
import type { AssetItem, DailyValue, SyncOutboxEntry } from '@/lib/types'

const UID = 'dv-bundle-test-uid'
const NOW = '2026-06-05T00:00:00.000Z'

function makeRow(over: Partial<DailyValue>): DailyValue {
  return {
    id: crypto.randomUUID(),
    assetItemId: 'asset-A',
    date: '2026-06-05',
    value: 1000,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  } as DailyValue
}

async function seedAsset(id = 'asset-A'): Promise<string> {
  setSyncWritingFlag(true)
  try {
    await db.assetItems.add({
      id, memberId: '', categoryId: '', name: '테스트자산',
      type: 'asset', isActive: true, sortOrder: 0,
      createdAt: NOW, updatedAt: NOW,
    } as AssetItem)
    return id
  } finally {
    setSyncWritingFlag(false)
  }
}

/** 로컬 dailyValues만 비운다 (자산 유지) — 기기 B 시뮬레이션용. */
async function wipeLocalDailyValues(): Promise<void> {
  setSyncWritingFlag(true)
  try { await db.dailyValues.clear() } finally { setSyncWritingFlag(false) }
}

beforeEach(async () => {
  h.sets = []
  h.deletes = []
  h.commitAttempts = 0
  setSyncWritingFlag(true)
  try {
    await db.dailyValues.clear()
    await db.assetItems.clear()
  } finally {
    setSyncWritingFlag(false)
  }
  await drainChangeTracking()
  await db.syncOutbox.clear()
  useAuthStore.setState({ syncStatus: 'idle', syncErrorMessage: null, pendingChangesCount: 0 })
})

describe('buildBundlePatches (순수)', () => {
  const DEV = 'test-device'
  const entry = (over: Partial<SyncOutboxEntry> & { recordId: string }): SyncOutboxEntry => ({
    key: `dailyValues:${over.recordId}`,
    tableName: 'dailyValues',
    op: 'upsert',
    queuedAt: NOW,
    ...over,
  })

  it('자산×월로 그룹핑하고 일자 튜플 [v,s,u,sid,d]를 싣는다 (sid=row.id)', () => {
    const r1 = makeRow({ id: 's1', date: '2026-06-05', value: 100, source: 'manual' })
    const r2 = makeRow({ id: 's2', date: '2026-06-09', value: 200 })
    const r3 = makeRow({ id: 's3', date: '2026-07-01', value: 300 })
    const { patches, unresolved } = buildBundlePatches(
      [entry({ recordId: 's1' }), entry({ recordId: 's2' }), entry({ recordId: 's3' })],
      new Map([['s1', r1], ['s2', r2], ['s3', r3]]),
      new Map(),
      DEV,
    )
    expect(unresolved).toBe(0)
    expect(patches).toHaveLength(2) // 6월, 7월
    const june = patches.find(p => p.month === '2026-06')!
    // 자산의 id가 곧 전역 id — bundleKey는 row.assetItemId를 그대로 쓴다
    expect(june.bundleKey).toBe(dvBundleKey('asset-A', '2026-06'))
    expect(june.assetId).toBe('asset-A')
    expect(june.days['05']).toEqual([100, 'manual', NOW, 's1', DEV])
    expect(june.days['09']).toEqual([200, null, NOW, 's2', DEV])
  })

  it('삭제 항목은 (assetItemId, date) 메타로 v=null 삭제 마커를 만든다', () => {
    const { patches } = buildBundlePatches(
      [entry({ recordId: 'gone', op: 'delete', assetItemId: 'asset-A', date: '2026-06-05' })],
      new Map(), new Map(), DEV,
    )
    expect(patches).toHaveLength(1)
    expect(patches[0].bundleKey).toBe(dvBundleKey('asset-A', '2026-06'))
    expect(patches[0].days['05']).toEqual([null, null, NOW, 'gone', DEV])
  })

  it('삭제 후 재생성된 일자는 현재 로컬 행(업서트)이 이긴다', () => {
    const live = makeRow({ id: 's-new', date: '2026-06-05', value: 777 })
    const { patches } = buildBundlePatches(
      [
        entry({ recordId: 's-old', op: 'delete', assetItemId: 'asset-A', date: '2026-06-05' }),
        entry({ recordId: 's-new' }),
      ],
      new Map([['s-new', live]]),
      new Map([['asset-A|2026-06-05', live]]),
      DEV,
    )
    expect(patches).toHaveLength(1)
    expect(patches[0].days['05'][0]).toBe(777) // 마커가 아니라 살아있는 값
  })

  it('id 미스 + 좌표 메타로 같은 논리 일자를 재해석한다 (sid 입양 후 pending 업서트 보존)', () => {
    const adopted = makeRow({ id: 's-adopted', date: '2026-06-05', value: 555 })
    const { patches, unresolved } = buildBundlePatches(
      [entry({ recordId: 's-stale', op: 'upsert', assetItemId: 'asset-A', date: '2026-06-05' })],
      new Map(), // id로는 못 찾음 (인제스트의 sid 입양으로 행 id가 바뀜)
      new Map([['asset-A|2026-06-05', adopted]]),
      DEV,
    )
    expect(unresolved).toBe(0)
    expect(patches[0].days['05'][0]).toBe(555)
    expect(patches[0].days['05'][3]).toBe('s-adopted')
  })

  it('행이 그새 삭제된 업서트 항목은 좌표 메타로 삭제 마커가 된다', () => {
    const { patches, unresolved } = buildBundlePatches(
      [entry({ recordId: 's-vanished', op: 'upsert', assetItemId: 'asset-A', date: '2026-06-05' })],
      new Map(), new Map(), DEV,
    )
    expect(unresolved).toBe(0)
    expect(patches).toHaveLength(1)
    expect(patches[0].days['05']).toEqual([null, null, NOW, 's-vanished', DEV])
  })

  it('좌표를 해석할 수 없는 항목은 unresolved로 계수하고 패치를 만들지 않는다', () => {
    const { patches, unresolved } = buildBundlePatches(
      [
        entry({ recordId: 'x', op: 'delete' }),  // 좌표 메타 없는 삭제
        entry({ recordId: 'y', op: 'upsert' }),  // 행 소실 + 좌표 메타 없음
      ],
      new Map(), new Map(), DEV,
    )
    expect(patches).toHaveLength(0)
    expect(unresolved).toBe(2)
  })
})

describe('buildFullBundles + explodeBundleDoc (순수)', () => {
  it('전량 번들 → explode 왕복이 보존된다', () => {
    const rows = [
      makeRow({ id: 'a', date: '2026-06-01', value: 1, source: 'manual' }),
      makeRow({ id: 'b', date: '2026-06-15', value: 2 }),
      makeRow({ id: 'c', date: '2026-07-01', value: 3 }),
    ]
    const { bundles } = buildFullBundles(rows, 'dev-1')
    expect(bundles).toHaveLength(2)

    const june = bundles.find(b => b.month === '2026-06')!
    expect(june.assetId).toBe('asset-A')
    const exploded = explodeBundleDoc({
      assetItem_syncId: june.assetId, month: june.month, days: june.days,
    })!
    expect(exploded.assetId).toBe('asset-A')
    expect(exploded.days).toHaveLength(2)
    const d01 = exploded.days.find(d => d.date === '2026-06-01')!
    expect(d01).toMatchObject({ v: 1, s: 'manual', u: NOW, sid: 'a', d: 'dev-1' })
  })

  it('형식이 어긋난 일자 엔트리는 건너뛰고, v=null 마커는 보존한다', () => {
    const exploded = explodeBundleDoc({
      assetItem_syncId: 'asset-A', month: '2026-06',
      days: {
        '01': [1, null, NOW, 'a', 'dev'],
        '02': ['oops', null, NOW, 'b', 'dev'], // v 타입 불량
        '03': null,                              // 엔트리 자체 불량
        '04': [null, null, NOW, 'c', 'dev'],     // 삭제 마커 — 유효
      },
    })!
    expect(exploded.days).toHaveLength(2)
    expect(exploded.days.find(d => d.date === '2026-06-04')!.v).toBeNull()
  })
})

describe('아웃박스 좌표 메타 (실제 Dexie 훅)', () => {
  it('dailyValues 업서트/삭제가 (assetItemId, date)를 동반하고, 레코드당 1행(마지막 op 승리)', async () => {
    await db.dailyValues.add(makeRow({ id: 'meta-1', assetItemId: 'asset-7', date: '2026-06-05' }))
    await vi.waitFor(async () => {
      expect((await db.syncOutbox.get('dailyValues:meta-1'))?.op).toBe('upsert')
    })
    let e = await db.syncOutbox.get('dailyValues:meta-1')
    expect(e).toMatchObject({ recordId: 'meta-1', assetItemId: 'asset-7', date: '2026-06-05' })

    await db.dailyValues.delete('meta-1')
    await vi.waitFor(async () => {
      expect((await db.syncOutbox.get('dailyValues:meta-1'))?.op).toBe('delete')
    })
    e = await db.syncOutbox.get('dailyValues:meta-1')
    expect(e).toMatchObject({ recordId: 'meta-1', assetItemId: 'asset-7', date: '2026-06-05' })
    // 레코드당 1행 — create+delete가 2행이 아니라 delete 1행으로 수렴
    expect(await db.syncOutbox.count()).toBe(1)
  })

  it('다른 테이블 항목은 좌표 메타가 없다', async () => {
    await db.assetItems.add({
      id: 'plain-asset', memberId: '', categoryId: '', name: 'P',
      type: 'asset', isActive: true, sortOrder: 0, createdAt: NOW, updatedAt: NOW,
    } as AssetItem)
    await vi.waitFor(async () => {
      expect(await db.syncOutbox.get('assetItems:plain-asset')).toBeTruthy()
    })
    const e = await db.syncOutbox.get('assetItems:plain-asset')
    expect(e!.assetItemId).toBeUndefined()
    expect(e!.date).toBeUndefined()
  })
})

describe('업로드 통합 (flushOutbox)', () => {
  it('업서트는 번들 문서에 merge:true로만 쓴다 — per-row 업서트 금지', async () => {
    await seedAsset('asset-A')
    await db.dailyValues.bulkAdd([
      makeRow({ id: 'u1', date: '2026-06-05', value: 100 }),
      makeRow({ id: 'u2', date: '2026-06-06', value: 200 }),
      makeRow({ id: 'u3', date: '2026-07-01', value: 300 }),
    ])
    await vi.waitFor(async () => {
      expect(await db.syncOutbox.count()).toBe(3)
    })

    await flushOutbox(UID)

    const bundleSets = h.sets.filter(s => s.path.includes('dailyValueBundles'))
    const perRowSets = h.sets.filter(s => s.path.includes(`/${UID}/dailyValues/`))
    expect(perRowSets).toHaveLength(0)
    expect(bundleSets).toHaveLength(2) // 6월 + 7월
    const june = bundleSets.find(s => (s.payload.month === '2026-06'))!
    expect(june.options).toEqual({ merge: true })
    const days = june.payload.days as Record<string, [number | null, string | null, string, string, string]>
    expect(days['05'][0]).toBe(100)
    expect(days['05'][3]).toBe('u1') // sid = 행의 id
    expect(days['06'][0]).toBe(200)
    expect(days['06'][3]).toBe('u2')
    expect(typeof days['05'][4]).toBe('string') // deviceId 동봉 (LWW 타이브레이커)
    expect(june.payload.bundleKey).toBe(dvBundleKey('asset-A', '2026-06'))
    expect(june.payload.assetItem_syncId).toBe('asset-A') // 구버전 호환 필드명
    expect(june.payload.__uploadedAt).toEqual({ __sentinel: 'serverTimestamp' })
    // ack 후 아웃박스 전량 제거
    expect(await db.syncOutbox.count()).toBe(0)
    expect(useAuthStore.getState().syncStatus).toBe('synced')
  })

  it('삭제는 번들 v=null 마커 + 구버전 호환 톰스톤을 수행한다 (per-row 삭제 없음)', async () => {
    await seedAsset('asset-A')
    await db.dailyValues.add(makeRow({ id: 'd1', date: '2026-06-05' }))
    await vi.waitFor(async () => {
      expect(await db.syncOutbox.count()).toBe(1)
    })
    await db.syncOutbox.clear() // create 항목 제거 — 삭제만 검증

    await db.dailyValues.delete('d1')
    await vi.waitFor(async () => {
      expect((await db.syncOutbox.get('dailyValues:d1'))?.op).toBe('delete')
    })

    await flushOutbox(UID)

    // ① per-row 문서 삭제는 더 이상 없다 — 삭제 전파는 번들 마커가 담당
    expect(h.deletes.some(p => p.includes(`/${UID}/dailyValues/`))).toBe(false)
    // ② 구버전 호환 톰스톤 업로드
    const tombstoneSets = h.sets.filter(s => s.path.includes('syncTombstones'))
    expect(tombstoneSets).toHaveLength(1)
    expect(tombstoneSets[0].payload.syncId).toBe('d1')
    expect(tombstoneSets[0].payload.tableName).toBe('dailyValues')
    // ③ 번들 삭제 마커 (v=null) — 좌표 기반 삭제 전파 (sid 분기에도 닿음)
    const bundleSets = h.sets.filter(s => s.path.includes('dailyValueBundles'))
    expect(bundleSets).toHaveLength(1)
    expect(bundleSets[0].options).toEqual({ merge: true })
    const days = bundleSets[0].payload.days as Record<string, [number | null, ...unknown[]]>
    expect(days['05'][0]).toBeNull()
    expect(days['05'][3]).toBe('d1')
    expect(await db.syncOutbox.count()).toBe(0)
  })
})

describe('ingestDvBundleDoc (일자 LWW + sid 입양 + 삭제 마커)', () => {
  it('부모 자산이 아직 로컬에 없어도 행을 쓴다 — 문자열 FK라 자산 도착 시 자연 조인', async () => {
    await ingestDvBundleDoc({
      assetItem_syncId: 'not-yet-arrived', month: '2026-06',
      days: { '05': [1, null, NOW, 'x', 'peer'] },
    })
    expect(await db.dailyValues.count()).toBe(1)
    const row = await db.dailyValues.get('x')
    expect(row).toMatchObject({ assetItemId: 'not-yet-arrived', date: '2026-06-05', value: 1 })
  })

  it('새 일자는 클라우드 sid를 입양해 행을 만든다 (행 식별 기기 간 공유)', async () => {
    const assetId = await seedAsset('asset-A')
    await ingestDvBundleDoc({
      assetItem_syncId: 'asset-A', month: '2026-06',
      days: { '05': [123, 'manual', NOW, 'cloud-sid', 'peer'] },
    })
    const row = await db.dailyValues.where('[assetItemId+date]').equals([assetId, '2026-06-05']).first()
    expect(row).toMatchObject({ id: 'cloud-sid', value: 123, source: 'manual', updatedAt: NOW })
    // 인제스트는 동기화 쓰기 — 아웃박스를 만들지 않는다 (에코 차단)
    await drainChangeTracking()
    expect(await db.syncOutbox.count()).toBe(0)
  })

  it('로컬이 더 새로우면 덮어쓰지 않는다 (일자 LWW)', async () => {
    const assetId = await seedAsset('asset-A')
    setSyncWritingFlag(true)
    try {
      await db.dailyValues.add(makeRow({
        id: 'local-sid', date: '2026-06-05',
        value: 999, updatedAt: '2026-06-09T00:00:00.000Z',
      }))
    } finally {
      setSyncWritingFlag(false)
    }
    await ingestDvBundleDoc({
      assetItem_syncId: 'asset-A', month: '2026-06',
      days: { '05': [1, null, NOW, 'cloud-sid', 'peer'] }, // NOW < 로컬 u
    })
    const row = await db.dailyValues.where('[assetItemId+date]').equals([assetId, '2026-06-05']).first()
    expect(row!.value).toBe(999)
    expect(row!.id).toBe('local-sid') // 더 오래된 클라우드의 sid는 입양 안 함
  })

  it('클라우드가 더 새로우면 값 적용 + sid 입양 (PK 교체는 delete+put)', async () => {
    const assetId = await seedAsset('asset-A')
    setSyncWritingFlag(true)
    try {
      await db.dailyValues.add(makeRow({
        id: 'local-sid', date: '2026-06-05',
        value: 1, createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z',
      }))
    } finally {
      setSyncWritingFlag(false)
    }
    await ingestDvBundleDoc({
      assetItem_syncId: 'asset-A', month: '2026-06',
      days: { '05': [424242, null, NOW, 'cloud-sid', 'peer'] },
    })
    // 구 id 행은 사라지고 정확히 1행 — sid 입양이 중복 행을 만들지 않는다
    expect(await db.dailyValues.count()).toBe(1)
    expect(await db.dailyValues.get('local-sid')).toBeUndefined()
    const row = await db.dailyValues.where('[assetItemId+date]').equals([assetId, '2026-06-05']).first()
    expect(row).toMatchObject({ id: 'cloud-sid', value: 424242, updatedAt: NOW })
    expect(row!.createdAt).toBe('2026-06-01T00:00:00.000Z') // createdAt은 보존
  })

  it('삭제 마커(v=null)는 좌표로 로컬 행을 지운다 — sid가 달라도 전파된다', async () => {
    await seedAsset('asset-A')
    setSyncWritingFlag(true)
    try {
      // 피어와 sid가 분기된 행 (per-row 톰스톤으로는 매칭 불가한 상황)
      await db.dailyValues.add(makeRow({
        id: 'diverged-local-sid', date: '2026-06-05',
        value: 100, updatedAt: '2026-06-01T00:00:00.000Z',
      }))
    } finally {
      setSyncWritingFlag(false)
    }
    await ingestDvBundleDoc({
      assetItem_syncId: 'asset-A', month: '2026-06',
      days: { '05': [null, null, NOW, 'peer-sid', 'peer'] }, // 삭제 마커, NOW > 로컬 u
    })
    expect(await db.dailyValues.count()).toBe(0)
  })

  it('삭제 마커가 로컬보다 오래되면 보존한다 (삭제 후 재생성 보호)', async () => {
    await seedAsset('asset-A')
    setSyncWritingFlag(true)
    try {
      await db.dailyValues.add(makeRow({
        id: 'recreated', date: '2026-06-05',
        value: 500, updatedAt: '2026-06-09T00:00:00.000Z', // 마커(NOW)보다 새로움
      }))
    } finally {
      setSyncWritingFlag(false)
    }
    await ingestDvBundleDoc({
      assetItem_syncId: 'asset-A', month: '2026-06',
      days: { '05': [null, null, NOW, 'old-sid', 'peer'] },
    })
    expect(await db.dailyValues.count()).toBe(1)
  })

  it('타임스탬프 동률은 deviceId 타이브레이커로 결정적으로 수렴한다 (영구 발산 방지)', async () => {
    const assetId = await seedAsset('asset-A')
    const { getDeviceId } = await import('@/lib/deviceId')
    const self = getDeviceId()
    setSyncWritingFlag(true)
    try {
      await db.dailyValues.add(makeRow({
        id: 'local-sid', date: '2026-06-05',
        value: 100, updatedAt: NOW,
      }))
    } finally {
      setSyncWritingFlag(false)
    }
    // 같은 u, 사전순으로 더 큰 peer deviceId → 클라우드가 이긴다 (수렴)
    await ingestDvBundleDoc({
      assetItem_syncId: 'asset-A', month: '2026-06',
      days: { '05': [200, null, NOW, 'peer-sid', `${self}~~`] },
    })
    const row = await db.dailyValues.where('[assetItemId+date]').equals([assetId, '2026-06-05']).first()
    expect(row!.value).toBe(200)
    // 같은 u, 사전순으로 더 작은 deviceId → 로컬 보존 (반대 기기에서는 반대로 적용 → 양쪽 동일 결론)
    await ingestDvBundleDoc({
      assetItem_syncId: 'asset-A', month: '2026-06',
      days: { '05': [300, null, NOW, 'x', '!'] },
    })
    const row2 = await db.dailyValues.where('[assetItemId+date]').equals([assetId, '2026-06-05']).first()
    expect(row2!.value).toBe(200)
  })
})

// ─── 2-기기 왕복 수렴 하네스 ──────────────────────────────────────────────
//
// 기기 A 업로드(flushOutbox → h.sets 번들 캡처) → 기기 B 시뮬레이션
// (로컬 dailyValues 비우고 자산 유지) → 캡처한 번들을 ingestDvBundleDoc 로
// 인제스트. manual 앵커의 수렴은 Phase 2(파생 projected 동기화 중단) 후에도
// 반드시 유지되어야 하는 불변식이므로 안정적 기준선이다.
describe('2-기기 왕복 수렴 (업로드→번들→인제스트)', () => {
  /** 기기 A가 업로드한 번들 문서들을 기기 B로 인제스트한다 (로컬 dv는 호출 전에 비운다). */
  async function ingestUploadedBundlesAsPeer(): Promise<void> {
    const bundleSets = h.sets.filter(s => s.path.includes('dailyValueBundles'))
    for (const s of bundleSets) {
      await ingestDvBundleDoc(s.payload as Record<string, unknown>)
    }
  }

  it('기기 A의 manual 앵커가 기기 B로 수렴한다 (Phase 2 불변식 기준선)', async () => {
    const assetId = await seedAsset('asset-A')
    await db.dailyValues.bulkAdd([
      makeRow({ id: 'm1', date: '2026-06-05', value: 100, source: 'manual' }),
      makeRow({ id: 'm2', date: '2026-07-10', value: 300, source: 'manual' }),
    ])
    await vi.waitFor(async () => {
      expect(await db.syncOutbox.count()).toBe(2)
    })
    await flushOutbox(UID)

    // 기기 B: 로컬 일별값만 비우고(자산 유지) 클라우드 번들 인제스트
    await wipeLocalDailyValues()
    await ingestUploadedBundlesAsPeer()

    const m1 = await db.dailyValues.where('[assetItemId+date]').equals([assetId, '2026-06-05']).first()
    const m2 = await db.dailyValues.where('[assetItemId+date]').equals([assetId, '2026-07-10']).first()
    // 행 동일성 수렴 — 값뿐 아니라 id(sid 입양)까지 같아진다
    expect(m1).toMatchObject({ id: 'm1', value: 100, source: 'manual' })
    expect(m2).toMatchObject({ id: 'm2', value: 300, source: 'manual' })
    // 인제스트는 동기화 쓰기 — 기기 B에서 아웃박스 에코를 만들지 않는다
    await drainChangeTracking()
    expect(await db.syncOutbox.count()).toBe(0)
  })

  it('여러 달에 걸친 manual 앵커가 자산×월 번들 왕복으로 모두 수렴한다', async () => {
    await seedAsset('asset-A')
    await db.dailyValues.bulkAdd([
      makeRow({ id: 'a', date: '2026-05-31', value: 10, source: 'manual' }),
      makeRow({ id: 'b', date: '2026-06-15', value: 20, source: 'manual' }),
      makeRow({ id: 'c', date: '2026-08-01', value: 30, source: 'manual' }),
    ])
    await vi.waitFor(async () => {
      expect(await db.syncOutbox.count()).toBe(3)
    })
    await flushOutbox(UID)

    await wipeLocalDailyValues()
    await ingestUploadedBundlesAsPeer()

    expect(await db.dailyValues.count()).toBe(3)
    const got = (await db.dailyValues.toArray())
      .map(r => [r.date, r.value]).sort()
    expect(got).toEqual([['2026-05-31', 10], ['2026-06-15', 20], ['2026-08-01', 30]])
  })
})

// ─── Phase 2: 파생(projected) 일별값 동기화 제외 (업로드 측) ──────────────
//
// projected 행은 각 기기가 manual 앵커로부터 로컬 재생성하므로 클라우드에
// 올리지 않는다. ① 변경추적 훅이 projected 쓰기에 아웃박스 항목을 남기지
// 않음 ② fullUpload/번들 업로드가 projected 를 제외 ③ 마이그레이션 이관 등
// 으로 큐잉된 projected 아웃박스 항목은 패치 없이 ack 처리(stuck 방지).
describe('Phase 2 — projected 업로드 제외', () => {
  it('projected 쓰기는 아웃박스에 기록되지 않는다 (manual/레거시 undefined 는 기록)', async () => {
    await seedAsset('asset-A')
    await db.dailyValues.add(makeRow({ id: 'pj', date: '2026-06-10', value: 50, source: 'projected' }))
    await db.dailyValues.add(makeRow({ id: 'mn', date: '2026-06-11', value: 60, source: 'manual' }))
    await db.dailyValues.add(makeRow({ id: 'lg', date: '2026-06-12', value: 70 })) // 레거시(undefined)=앵커
    await vi.waitFor(async () => {
      expect(await db.syncOutbox.count()).toBe(2)
    })
    const logged = (await db.syncOutbox.toArray()).map(e => e.recordId).sort()
    expect(logged).toEqual(['lg', 'mn'])
  })

  it('projected 삭제는 아웃박스 항목을 남기지 않는다', async () => {
    await seedAsset('asset-A')
    await db.dailyValues.add(makeRow({ id: 'pj', date: '2026-06-10', value: 50, source: 'projected' }))
    await new Promise(r => setTimeout(r, 30))
    await db.dailyValues.delete('pj')
    await new Promise(r => setTimeout(r, 30))
    await drainChangeTracking()
    expect(await db.syncOutbox.count()).toBe(0)
  })

  it('큐잉돼 있던 projected 아웃박스 항목은 패치 없이 ack 처리된다 (stuck 방지)', async () => {
    await seedAsset('asset-A')
    setSyncWritingFlag(true)
    try {
      await db.dailyValues.add(makeRow({ id: 'old-pj', date: '2026-06-10', value: 50, source: 'projected' }))
      await db.dailyValues.add(makeRow({ id: 'old-mn', date: '2026-06-11', value: 60, source: 'manual' }))
    } finally { setSyncWritingFlag(false) }
    // 마이그레이션 이관 등으로 아웃박스에 직접 남아 있던 항목을 시뮬레이션
    await db.syncOutbox.bulkPut([
      { key: 'dailyValues:old-pj', tableName: 'dailyValues', recordId: 'old-pj', op: 'upsert', queuedAt: NOW, assetItemId: 'asset-A', date: '2026-06-10' },
      { key: 'dailyValues:old-mn', tableName: 'dailyValues', recordId: 'old-mn', op: 'upsert', queuedAt: NOW, assetItemId: 'asset-A', date: '2026-06-11' },
    ])

    await flushOutbox(UID)

    expect(await db.syncOutbox.count()).toBe(0) // stuck 없음
    const bundleSets = h.sets.filter(s => s.path.includes('dailyValueBundles'))
    const june = bundleSets.find(s => s.payload.month === '2026-06')!
    const days = june.payload.days as Record<string, unknown>
    expect(days['11']).toBeDefined()   // manual 업로드됨
    expect(days['10']).toBeUndefined() // projected 제외됨
  })

  it('fullUpload: dailyValues 는 번들로만, projected 는 그마저도 제외한다', async () => {
    await seedAsset('asset-A')
    setSyncWritingFlag(true)
    try {
      await db.dailyValues.bulkAdd([
        makeRow({ id: 'f-mn', date: '2026-06-05', value: 100, source: 'manual' }),
        makeRow({ id: 'f-pj', date: '2026-06-06', value: 150, source: 'projected' }),
      ])
    } finally { setSyncWritingFlag(false) }

    await fullUpload(UID)

    const bundleSets = h.sets.filter(s => s.path.includes('dailyValueBundles'))
    const june = bundleSets.find(s => s.payload.month === '2026-06')
    const days = (june?.payload.days ?? {}) as Record<string, unknown>
    expect(days['05']).toBeDefined()   // manual
    expect(days['06']).toBeUndefined() // projected 제외
    // per-row dailyValues 문서는 어떤 것도 올리지 않는다 (번들 단일 경로)
    expect(h.sets.filter(s => s.path.includes(`/${UID}/dailyValues/`))).toHaveLength(0)
  })

  it('왕복: projected 는 동기화되지 않고 manual 만 기기 B 로 수렴한다', async () => {
    const assetId = await seedAsset('asset-A')
    await db.dailyValues.bulkAdd([
      makeRow({ id: 'rt-mn', date: '2026-06-05', value: 100, source: 'manual' }),
      makeRow({ id: 'rt-pj', date: '2026-06-06', value: 150, source: 'projected' }),
    ])
    // projected 는 아웃박스 항목을 만들지 않으므로 manual 1건만 대기
    await vi.waitFor(async () => {
      expect(await db.syncOutbox.count()).toBe(1)
    })
    await flushOutbox(UID)

    await wipeLocalDailyValues()
    for (const s of h.sets.filter(s => s.path.includes('dailyValueBundles'))) {
      await ingestDvBundleDoc(s.payload as Record<string, unknown>)
    }
    expect(await db.dailyValues.where('[assetItemId+date]').equals([assetId, '2026-06-05']).first())
      .toMatchObject({ value: 100, source: 'manual' })
    expect(await db.dailyValues.where('[assetItemId+date]').equals([assetId, '2026-06-06']).count()).toBe(0)
  })
})

// ─── Phase 2: projected 인제스트 무시 + source-aware supersede ─────────────
//
// 업그레이드 전 클라우드에 남은(또는 구버전 피어가 올린) projected 튜플은
// 무시하고, 들어온 앵커(manual/undefined)는 로컬 projected 를 타임스탬프와
// 무관하게 덮어쓴다 — 로컬 재생성 projected 의 새 타임스탬프가 더 오래된 피어
// 앵커를 영구히 가리는 것을 막는다(영구 발산 방지).
describe('Phase 2 — projected 인제스트 무시 + source-aware', () => {
  it('클라우드 projected 일자 튜플은 무시한다 (로컬 재생성에 맡김), 앵커는 적용', async () => {
    const assetId = await seedAsset('asset-A')
    await ingestDvBundleDoc({
      assetItem_syncId: 'asset-A', month: '2026-06',
      days: {
        '05': [100, 'manual', NOW, 'm-sid', 'peer'],    // 앵커 — 적용
        '06': [150, 'projected', NOW, 'p-sid', 'peer'], // 파생 — 무시
      },
    })
    expect(await db.dailyValues.where('[assetItemId+date]').equals([assetId, '2026-06-05']).count()).toBe(1)
    expect(await db.dailyValues.where('[assetItemId+date]').equals([assetId, '2026-06-06']).count()).toBe(0)
  })

  it('삭제 마커(v=null)는 source 와 무관하게 적용된다 (projected 스킵에 안 걸림)', async () => {
    const assetId = await seedAsset('asset-A')
    setSyncWritingFlag(true)
    try {
      await db.dailyValues.add(makeRow({
        id: 'x', date: '2026-06-05', value: 100,
        source: 'manual', updatedAt: '2026-06-01T00:00:00.000Z',
      }))
    } finally { setSyncWritingFlag(false) }
    await ingestDvBundleDoc({
      assetItem_syncId: 'asset-A', month: '2026-06',
      days: { '05': [null, null, '2026-06-20T00:00:00.000Z', 'x', 'peer'] }, // 마커 (더 새로움)
    })
    expect(await db.dailyValues.where('[assetItemId+date]').equals([assetId, '2026-06-05']).count()).toBe(0)
  })

  it('들어온 manual 앵커는 더 오래돼도 로컬 projected 를 덮어쓴다 (source-aware supersede)', async () => {
    const assetId = await seedAsset('asset-A')
    setSyncWritingFlag(true)
    try {
      await db.dailyValues.add(makeRow({
        id: 'local-pj', date: '2026-06-05',
        value: 999, source: 'projected', updatedAt: '2026-06-30T00:00:00.000Z', // 로컬 재생성 = fresh
      }))
    } finally { setSyncWritingFlag(false) }
    await ingestDvBundleDoc({
      assetItem_syncId: 'asset-A', month: '2026-06',
      days: { '05': [123, 'manual', '2026-06-01T00:00:00.000Z', 'peer-sid', 'peer'] }, // 더 오래된 앵커
    })
    const row = await db.dailyValues.where('[assetItemId+date]').equals([assetId, '2026-06-05']).first()
    expect(row).toMatchObject({ value: 123, source: 'manual', id: 'peer-sid' })
  })

  it('manual↔manual 은 일반 LWW — anchor-wins 가 앵커끼리엔 적용되지 않는다', async () => {
    const assetId = await seedAsset('asset-A')
    setSyncWritingFlag(true)
    try {
      await db.dailyValues.add(makeRow({
        id: 'local-mn', date: '2026-06-05',
        value: 999, source: 'manual', updatedAt: '2026-06-30T00:00:00.000Z',
      }))
    } finally { setSyncWritingFlag(false) }
    await ingestDvBundleDoc({
      assetItem_syncId: 'asset-A', month: '2026-06',
      days: { '05': [123, 'manual', '2026-06-01T00:00:00.000Z', 'peer-sid', 'peer'] }, // 더 오래됨
    })
    const row = await db.dailyValues.where('[assetItemId+date]').equals([assetId, '2026-06-05']).first()
    expect(row!.value).toBe(999) // 더 새로운 로컬 manual 보존
  })
})
