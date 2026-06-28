// ─── regenerateProjections — 다중앵커 dense 재구성 (Phase 2 결정성) ─────────
//
// 신규/동기화 기기는 앵커(manual/레거시)만 받으므로 파생(projected) 시리즈를
// 로컬에서 재구성해야 한다. 핵심 불변식: 갭 (a_{i-1}, a_i) 은 더 늦은 앵커
// a_i 의 역산 backfill 이 채우고, 미래는 마지막 앵커의 forward 가 채운다 —
// 원본 기기의 증분 applyValueSeries 결과와 일치(기기 간 수렴).
import { describe, it, expect, beforeEach } from 'vitest'
import { db, setSyncWritingFlag, getDailyValue } from '@/services/database'
import { useDailyValueStore } from '@/stores/dailyValueStore'
import { useSettingsStore } from '@/stores/settingsStore'
import type { AssetItem, AssetValueProjection } from '@/lib/types'

const NOW = '2026-06-05T00:00:00.000Z'
const CARRY_FORWARD_KEY = 'finance:lastCarryForward'

async function addAsset(projection: AssetValueProjection | undefined, syncId = 'asset-R'): Promise<number> {
  setSyncWritingFlag(true)
  try {
    return await db.assetItems.add({
      syncId, memberId: null, categoryId: null, name: 'R',
      type: 'asset', isActive: true, sortOrder: 0, projection,
      createdAt: NOW, updatedAt: NOW,
    } as AssetItem) as number
  } finally { setSyncWritingFlag(false) }
}

async function addAnchor(assetItemId: number, date: string, value: number, syncId: string): Promise<void> {
  setSyncWritingFlag(true)
  try {
    await db.dailyValues.add({ syncId, assetItemId, date, value, source: 'manual', createdAt: NOW, updatedAt: NOW } as never)
  } finally { setSyncWritingFlag(false) }
}

beforeEach(async () => {
  setSyncWritingFlag(true)
  try {
    await db.assetItems.clear()
    await db.dailyValues.clear()
  } finally { setSyncWritingFlag(false) }
  await new Promise(r => setTimeout(r, 20))
  await db.syncChangeLog.clear()
  await db.syncTombstones.clear()
  try { localStorage.removeItem(CARRY_FORWARD_KEY) } catch { /* ignore */ }
  useDailyValueStore.setState({ values: [], allValues: [], selectedMonth: '2026-03' })
  // 설정 오염 방지 — 마지막 테스트가 끈 autoCarryForward 를 기본(true)으로 복원.
  useSettingsStore.setState((s) => ({ settings: { ...s.settings, autoCarryForward: true } }))
})

describe('regenerateProjections — 다중앵커 dense 재구성', () => {
  it('갭은 더 늦은 앵커의 역산, 미래는 마지막 앵커의 forward 로 채운다 (dailyDelta)', async () => {
    const assetId = await addAsset({ dailyDelta: 1000 })
    await addAnchor(assetId, '2026-03-01', 100_000, 'a1')
    await addAnchor(assetId, '2026-03-05', 200_000, 'a2')

    const n = await useDailyValueStore.getState().regenerateProjections(true)
    expect(n).toBeGreaterThan(0)

    // 앵커는 manual 로 보존
    expect((await getDailyValue(assetId, '2026-03-01'))).toMatchObject({ value: 100_000, source: 'manual' })
    expect((await getDailyValue(assetId, '2026-03-05'))).toMatchObject({ value: 200_000, source: 'manual' })
    // 갭 (a1,a2): a2(200000)에서 역산 — 03-04=199000, 03-03=198000, 03-02=197000
    expect((await getDailyValue(assetId, '2026-03-04'))).toMatchObject({ value: 199_000, source: 'projected' })
    expect((await getDailyValue(assetId, '2026-03-03'))).toMatchObject({ value: 198_000, source: 'projected' })
    expect((await getDailyValue(assetId, '2026-03-02'))).toMatchObject({ value: 197_000, source: 'projected' })
    // 미래: a2 에서 forward — 03-06=201000, 03-07=202000
    expect((await getDailyValue(assetId, '2026-03-06'))).toMatchObject({ value: 201_000, source: 'projected' })
    expect((await getDailyValue(assetId, '2026-03-07'))).toMatchObject({ value: 202_000, source: 'projected' })
    // 첫 앵커 앞: a1 에서 역산 — 02-28=99000
    expect((await getDailyValue(assetId, '2026-02-28'))).toMatchObject({ value: 99_000, source: 'projected' })
  })

  it('멱등 — 같은 앵커로 다시 돌리면 새로 쓰는 게 없다 (0건)', async () => {
    const assetId = await addAsset({ dailyDelta: 1000 })
    await addAnchor(assetId, '2026-03-01', 100_000, 'a1')
    await addAnchor(assetId, '2026-03-05', 200_000, 'a2')

    await useDailyValueStore.getState().regenerateProjections(true)
    const second = await useDailyValueStore.getState().regenerateProjections(true)
    expect(second).toBe(0)
  })

  it('앵커 순서와 무관하게 결정적 — 동일 날짜 앵커는 syncId 로 선택', async () => {
    const assetId = await addAsset({ dailyDelta: 1000 })
    // 같은 날짜에 두 앵커(sync race) — 더 작은 syncId('a-1')가 선택돼야
    await addAnchor(assetId, '2026-03-05', 200_000, 'a-2')
    await addAnchor(assetId, '2026-03-05', 555_555, 'a-1')
    await addAnchor(assetId, '2026-03-01', 100_000, 'b1')

    await useDailyValueStore.getState().regenerateProjections(true)
    // 03-04 = (선택된 앵커값)-1000. 'a-1'(555555) 선택 시 554555, 'a-2'(200000) 선택 시 199000.
    expect((await getDailyValue(assetId, '2026-03-04'))!.value).toBe(554_555)
  })

  it('평탄으로 바뀐 자산: 묵은 projected 정리, manual 앵커 보존', async () => {
    const assetId = await addAsset(undefined) // 평탄(규칙 없음)
    await addAnchor(assetId, '2026-03-01', 100_000, 'm1')
    setSyncWritingFlag(true)
    try {
      await db.dailyValues.add({ syncId: 'p1', assetItemId: assetId, date: '2026-03-02', value: 123, source: 'projected', createdAt: NOW, updatedAt: NOW } as never)
    } finally { setSyncWritingFlag(false) }

    await useDailyValueStore.getState().regenerateProjections(true)

    expect(await getDailyValue(assetId, '2026-03-02')).toBeUndefined()       // projected 정리됨
    expect((await getDailyValue(assetId, '2026-03-01'))).toMatchObject({ value: 100_000, source: 'manual' }) // 앵커 보존
  })

  it('force=false 는 autoCarryForward=false 면 건너뛰고, force=true 는 무시하고 실행', async () => {
    const assetId = await addAsset({ dailyDelta: 1000 })
    await addAnchor(assetId, '2026-03-01', 100_000, 'a1')
    useSettingsStore.setState((s) => ({ settings: { ...s.settings, autoCarryForward: false } }))

    expect(await useDailyValueStore.getState().regenerateProjections(false)).toBe(0) // 게이트
    expect(await useDailyValueStore.getState().regenerateProjections(true)).toBeGreaterThan(0) // 무시
  })
})
