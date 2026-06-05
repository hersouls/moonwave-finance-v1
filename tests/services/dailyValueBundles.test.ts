// ─── dailyValues 번들 동기화 테스트 ─────────────────────────────────
//
// 검증 대상:
// 1. 순수 헬퍼 — 패치 그룹핑/삭제-재생성 충돌/미해석 좌표/전량 번들/explode
// 2. changelog 좌표 메타 — dailyValues 훅이 (assetItemId, date)를 동반 기록
// 3. 업로드 통합 — 업서트는 번들 merge:true로만, 레거시 per-row 업서트 금지,
//    삭제는 레거시 정리 + 톰스톤 + 번들 deleteField 모두 수행
// 4. 인제스트 — 일자 단위 LWW + sid 입양(톰스톤 매칭 보존)
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
  deleteField: vi.fn(() => ({ __sentinel: 'deleteField' })),
  onSnapshot: vi.fn(() => () => {}),
  query: vi.fn((c: unknown, ...constraints: unknown[]) => ({ __type: 'query', c, constraints })),
  limit: vi.fn(),
  where: vi.fn((field: string, op: string, value: unknown) => ({ __type: 'where', field, op, value })),
  serverTimestamp: vi.fn(() => ({ __sentinel: 'serverTimestamp' })),
  Timestamp: { fromMillis: (ms: number) => ({ toMillis: () => ms }) },
  writeBatch: vi.fn(() => ({
    set: (ref: { path: string }, payload: Record<string, unknown>, options?: Record<string, unknown>) => {
      h.sets.push({ path: ref.path, payload, options })
    },
    delete: (ref: { path: string }) => { h.deletes.push(ref.path) },
    commit: async () => { h.commitAttempts++ },
  })),
}))

import { db, setSyncWritingFlag } from '@/services/database'
import { incrementalUpload, ingestDvBundleDoc } from '@/services/firestoreSync'
import {
  buildBundlePatches,
  buildFullBundles,
  explodeBundleDoc,
  dvBundleKey,
} from '@/services/dailyValueBundles'
import { useAuthStore } from '@/stores/authStore'
import type { AssetItem, DailyValue, SyncChangeLogEntry } from '@/lib/types'

const UID = 'dv-bundle-test-uid'
const NOW = '2026-06-05T00:00:00.000Z'

function makeRow(over: Partial<DailyValue>): DailyValue {
  return {
    syncId: crypto.randomUUID(),
    assetItemId: 1,
    date: '2026-06-05',
    value: 1000,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  } as DailyValue
}

async function seedAsset(syncId = 'asset-A'): Promise<number> {
  setSyncWritingFlag(true)
  try {
    return await db.assetItems.add({
      syncId, memberId: null, categoryId: null, name: '테스트자산',
      type: 'asset', isActive: true, sortOrder: 0,
      createdAt: NOW, updatedAt: NOW,
    } as unknown as AssetItem) as number
  } finally {
    setSyncWritingFlag(false)
  }
}

beforeEach(async () => {
  h.sets = []
  h.deletes = []
  h.commitAttempts = 0
  setSyncWritingFlag(true)
  try {
    await db.dailyValues.clear()
    await db.assetItems.clear()
    await db.syncChangeLog.clear()
    await db.syncTombstones.clear()
  } finally {
    setSyncWritingFlag(false)
  }
  useAuthStore.setState({ syncStatus: 'idle', syncErrorMessage: null, pendingChangesCount: 0 })
})

describe('buildBundlePatches (순수)', () => {
  const DEV = 'test-device'
  const entry = (over: Partial<SyncChangeLogEntry>): SyncChangeLogEntry => ({
    tableName: 'dailyValues', syncId: 's1', operation: 'update',
    timestamp: NOW, processed: 0, ...over,
  })

  it('자산×월로 그룹핑하고 일자 튜플 [v,s,u,sid,d]를 싣는다', () => {
    const r1 = makeRow({ syncId: 's1', date: '2026-06-05', value: 100, source: 'manual' })
    const r2 = makeRow({ syncId: 's2', date: '2026-06-09', value: 200 })
    const r3 = makeRow({ syncId: 's3', date: '2026-07-01', value: 300 })
    const { patches, unresolved } = buildBundlePatches(
      [entry({ syncId: 's1' }), entry({ syncId: 's2' }), entry({ syncId: 's3' })],
      new Map([['s1', r1], ['s2', r2], ['s3', r3]]),
      new Map(),
      new Map([[1, 'asset-A']]),
      DEV,
    )
    expect(unresolved).toBe(0)
    expect(patches).toHaveLength(2) // 6월, 7월
    const june = patches.find(p => p.month === '2026-06')!
    expect(june.bundleKey).toBe(dvBundleKey('asset-A', '2026-06'))
    expect(june.days['05']).toEqual([100, 'manual', NOW, 's1', DEV])
    expect(june.days['09']).toEqual([200, null, NOW, 's2', DEV])
  })

  it('삭제 항목은 (assetItemId, date) 메타로 v=null 삭제 마커를 만든다', () => {
    const { patches } = buildBundlePatches(
      [entry({ syncId: 'gone', operation: 'delete', assetItemId: 1, date: '2026-06-05' })],
      new Map(), new Map(), new Map([[1, 'asset-A']]), DEV,
    )
    expect(patches).toHaveLength(1)
    expect(patches[0].days['05']).toEqual([null, null, NOW, 'gone', DEV])
  })

  it('삭제 후 재생성된 일자는 현재 로컬 행(업서트)이 이긴다', () => {
    const live = makeRow({ syncId: 's-new', date: '2026-06-05', value: 777 })
    const { patches } = buildBundlePatches(
      [
        entry({ syncId: 's-old', operation: 'delete', assetItemId: 1, date: '2026-06-05' }),
        entry({ syncId: 's-new' }),
      ],
      new Map([['s-new', live]]),
      new Map([['1|2026-06-05', live]]),
      new Map([[1, 'asset-A']]),
      DEV,
    )
    expect(patches).toHaveLength(1)
    expect(patches[0].days['05'][0]).toBe(777) // 마커가 아니라 살아있는 값
  })

  it('syncId 미스 + 좌표 메타로 같은 논리 일자를 재해석한다 (sid 입양 후 pending 업서트 보존)', () => {
    const adopted = makeRow({ syncId: 's-adopted', date: '2026-06-05', value: 555 })
    const { patches, unresolved } = buildBundlePatches(
      [entry({ syncId: 's-stale', operation: 'update', assetItemId: 1, date: '2026-06-05' })],
      new Map(), // syncId로는 못 찾음
      new Map([['1|2026-06-05', adopted]]),
      new Map([[1, 'asset-A']]),
      DEV,
    )
    expect(unresolved).toBe(0)
    expect(patches[0].days['05'][0]).toBe(555)
    expect(patches[0].days['05'][3]).toBe('s-adopted')
  })

  it('자산이 사라진 항목은 unresolved로 계수하고 패치를 만들지 않는다 (자산 삭제 경로가 번들을 통째 정리)', () => {
    const { patches, unresolved } = buildBundlePatches(
      [entry({ syncId: 'x', operation: 'delete', assetItemId: 99, date: '2026-06-05' })],
      new Map(), new Map(), new Map(), DEV, // 자산 99 해석 불가
    )
    expect(patches).toHaveLength(0)
    expect(unresolved).toBe(1)
  })
})

describe('buildFullBundles + explodeBundleDoc (순수)', () => {
  it('전량 번들 → explode 왕복이 보존된다', () => {
    const rows = [
      makeRow({ syncId: 'a', date: '2026-06-01', value: 1, source: 'manual' }),
      makeRow({ syncId: 'b', date: '2026-06-15', value: 2 }),
      makeRow({ syncId: 'c', date: '2026-07-01', value: 3 }),
    ]
    const { bundles } = buildFullBundles(rows, new Map([[1, 'asset-A']]), 'dev-1')
    expect(bundles).toHaveLength(2)

    const june = bundles.find(b => b.month === '2026-06')!
    const exploded = explodeBundleDoc({
      assetItem_syncId: june.assetSyncId, month: june.month, days: june.days,
    })!
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

describe('changelog 좌표 메타 (실제 Dexie 훅)', () => {
  it('dailyValues create/delete 항목이 (assetItemId, date)를 동반한다', async () => {
    const id = await db.dailyValues.add(makeRow({ syncId: 'meta-test', assetItemId: 7, date: '2026-06-05' }))
    await db.dailyValues.delete(id as number)
    await vi.waitFor(async () => {
      expect(await db.syncChangeLog.count()).toBe(2)
    })
    const entries = await db.syncChangeLog.toArray()
    for (const e of entries) {
      expect(e.assetItemId).toBe(7)
      expect(e.date).toBe('2026-06-05')
    }
    // 다른 테이블은 메타 없음
    await seedAsset('meta-asset')
  })
})

describe('업로드 통합 (incrementalUpload)', () => {
  it('업서트는 번들 문서에 merge:true로만 쓴다 — 레거시 per-row 업서트 금지', async () => {
    const assetId = await seedAsset('asset-A')
    await db.dailyValues.bulkAdd([
      makeRow({ syncId: 'u1', assetItemId: assetId, date: '2026-06-05', value: 100 }),
      makeRow({ syncId: 'u2', assetItemId: assetId, date: '2026-06-06', value: 200 }),
      makeRow({ syncId: 'u3', assetItemId: assetId, date: '2026-07-01', value: 300 }),
    ])
    await vi.waitFor(async () => {
      expect(await db.syncChangeLog.where('processed').equals(0).count()).toBe(3)
    })

    await incrementalUpload(UID)

    const bundleSets = h.sets.filter(s => s.path.includes('dailyValueBundles'))
    const legacySets = h.sets.filter(s => s.path.includes(`/${UID}/dailyValues/`))
    expect(legacySets).toHaveLength(0)
    expect(bundleSets).toHaveLength(2) // 6월 + 7월
    const june = bundleSets.find(s => (s.payload.month === '2026-06'))!
    expect(june.options).toEqual({ merge: true })
    const days = june.payload.days as Record<string, [number | null, string | null, string, string, string]>
    expect(days['05'][0]).toBe(100)
    expect(days['05'][3]).toBe('u1')
    expect(days['06'][0]).toBe(200)
    expect(days['06'][3]).toBe('u2')
    expect(typeof days['05'][4]).toBe('string') // deviceId 동봉 (LWW 타이브레이커)
    expect(june.payload.assetItem_syncId).toBe('asset-A')
    expect(june.payload.__uploadedAt).toEqual({ __sentinel: 'serverTimestamp' })
    // 전부 processed 처리
    expect(await db.syncChangeLog.where('processed').equals(0).count()).toBe(0)
    expect(useAuthStore.getState().syncStatus).toBe('synced')
  })

  it('삭제는 레거시 정리 + 톰스톤 + 번들 v=null 마커를 모두 수행한다', async () => {
    const assetId = await seedAsset('asset-A')
    const rowId = await db.dailyValues.add(
      makeRow({ syncId: 'd1', assetItemId: assetId, date: '2026-06-05' }),
    )
    await vi.waitFor(async () => {
      expect(await db.syncChangeLog.count()).toBe(1)
    })
    await db.syncChangeLog.clear() // create 항목 제거 — 삭제만 검증

    await db.dailyValues.delete(rowId as number)
    await vi.waitFor(async () => {
      expect(await db.syncChangeLog.where('processed').equals(0).count()).toBe(1)
    })

    await incrementalUpload(UID)

    // ① 레거시 per-row 문서 삭제
    expect(h.deletes.some(p => p.includes(`/${UID}/dailyValues/d1`))).toBe(true)
    // ② 톰스톤 업로드
    const tombstoneSets = h.sets.filter(s => s.path.includes('syncTombstones'))
    expect(tombstoneSets).toHaveLength(1)
    expect(tombstoneSets[0].payload.syncId).toBe('d1')
    // ③ 번들 삭제 마커 (v=null) — 좌표 기반 삭제 전파 (sid 분기에도 닿음)
    const bundleSets = h.sets.filter(s => s.path.includes('dailyValueBundles'))
    expect(bundleSets).toHaveLength(1)
    expect(bundleSets[0].options).toEqual({ merge: true })
    const days = bundleSets[0].payload.days as Record<string, [number | null, ...unknown[]]>
    expect(days['05'][0]).toBeNull()
    expect(days['05'][3]).toBe('d1')
    expect(await db.syncChangeLog.where('processed').equals(0).count()).toBe(0)
  })
})

describe('ingestDvBundleDoc (일자 LWW + sid 입양 + 삭제 마커)', () => {
  it('부모 자산이 없으면 false — 행을 만들지 않는다', async () => {
    const ok = await ingestDvBundleDoc({
      assetItem_syncId: 'no-such-asset', month: '2026-06',
      days: { '05': [1, null, NOW, 'x', 'peer'] },
    })
    expect(ok).toBe(false)
    expect(await db.dailyValues.count()).toBe(0)
  })

  it('부모 자산이 톰스톤(삭제됨)이면 true — 영구 보류 대신 완료 처리', async () => {
    setSyncWritingFlag(true)
    try {
      await db.syncTombstones.add({ tableName: 'assetItems', syncId: 'ghost-asset', deletedAt: NOW })
    } finally {
      setSyncWritingFlag(false)
    }
    const ok = await ingestDvBundleDoc({
      assetItem_syncId: 'ghost-asset', month: '2026-06',
      days: { '05': [1, null, NOW, 'x', 'peer'] },
    })
    expect(ok).toBe(true)
    expect(await db.dailyValues.count()).toBe(0)
  })

  it('새 일자는 클라우드 sid를 입양해 행을 만든다 (톰스톤 매칭 보존)', async () => {
    const assetId = await seedAsset('asset-A')
    const ok = await ingestDvBundleDoc({
      assetItem_syncId: 'asset-A', month: '2026-06',
      days: { '05': [123, 'manual', NOW, 'cloud-sid', 'peer'] },
    })
    expect(ok).toBe(true)
    const row = await db.dailyValues.where('[assetItemId+date]').equals([assetId, '2026-06-05']).first()
    expect(row).toMatchObject({ syncId: 'cloud-sid', value: 123, source: 'manual', updatedAt: NOW })
    // 인제스트는 동기화 쓰기 — changelog를 만들지 않는다 (에코 차단)
    expect(await db.syncChangeLog.count()).toBe(0)
  })

  it('로컬이 더 새로우면 덮어쓰지 않는다 (일자 LWW)', async () => {
    const assetId = await seedAsset('asset-A')
    setSyncWritingFlag(true)
    try {
      await db.dailyValues.add(makeRow({
        syncId: 'local-sid', assetItemId: assetId, date: '2026-06-05',
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
    expect(row!.syncId).toBe('local-sid') // 더 오래된 클라우드의 sid는 입양 안 함
  })

  it('클라우드가 더 새로우면 값 적용 + sid 입양', async () => {
    const assetId = await seedAsset('asset-A')
    setSyncWritingFlag(true)
    try {
      await db.dailyValues.add(makeRow({
        syncId: 'local-sid', assetItemId: assetId, date: '2026-06-05',
        value: 1, updatedAt: '2026-06-01T00:00:00.000Z',
      }))
    } finally {
      setSyncWritingFlag(false)
    }
    await ingestDvBundleDoc({
      assetItem_syncId: 'asset-A', month: '2026-06',
      days: { '05': [424242, null, NOW, 'cloud-sid', 'peer'] },
    })
    const row = await db.dailyValues.where('[assetItemId+date]').equals([assetId, '2026-06-05']).first()
    expect(row).toMatchObject({ value: 424242, syncId: 'cloud-sid', updatedAt: NOW })
  })

  it('삭제 마커(v=null)는 좌표로 로컬 행을 지운다 — sid가 달라도 전파된다', async () => {
    const assetId = await seedAsset('asset-A')
    setSyncWritingFlag(true)
    try {
      // 피어와 sid가 분기된 행 (per-row 톰스톤으로는 매칭 불가한 상황)
      await db.dailyValues.add(makeRow({
        syncId: 'diverged-local-sid', assetItemId: assetId, date: '2026-06-05',
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
    const assetId = await seedAsset('asset-A')
    setSyncWritingFlag(true)
    try {
      await db.dailyValues.add(makeRow({
        syncId: 'recreated', assetItemId: assetId, date: '2026-06-05',
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
        syncId: 'local-sid', assetItemId: assetId, date: '2026-06-05',
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
