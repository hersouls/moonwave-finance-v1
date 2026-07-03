// ─── dailyValues 앵커 보존 가드 회귀 테스트 ──────────────────────────────
//
// 회귀 대상: 투영(projected) 계산값이 수동/레거시(source 미지정) 앵커를
// 덮어쓰고 source 를 projected 로 뒤집던 데이터 손실 (bulkSetDailyValues +
// planValueSeries backfill 의 source==='manual' 한정 중단점 불일치).
// 앵커는 사용자 원천 데이터이고, 덮어쓰면 동기화로 복구 불가하다.
import { describe, it, expect, beforeEach } from 'vitest'
import { db, bulkSetDailyValues, getDailyValue, createId, drainChangeTracking } from '@/services/database'

beforeEach(async () => {
  await db.dailyValues.clear()
  // 위 clear 가 큐잉했을 수 있는 post-commit 아웃박스 기록이 끝난 뒤 비운다.
  await drainChangeTracking()
  await db.syncOutbox.clear()
})

describe('bulkSetDailyValues — projected 가 앵커를 덮어쓰지 않음', () => {
  it('projected 엔트리는 기존 manual 앵커를 덮어쓰지 않는다', async () => {
    await bulkSetDailyValues([{ assetItemId: 'asset-1', date: '2026-03-01', value: 50_000, source: 'manual' }])
    await bulkSetDailyValues([{ assetItemId: 'asset-1', date: '2026-03-01', value: 99_999, source: 'projected' }])
    const row = await getDailyValue('asset-1', '2026-03-01')
    expect(row?.value).toBe(50_000)
    expect(row?.source).toBe('manual')
  })

  it('projected 엔트리는 기존 레거시(source 미지정) 앵커를 덮어쓰지 않는다', async () => {
    const now = new Date().toISOString()
    await db.dailyValues.add({
      id: createId(), assetItemId: 'asset-2', date: '2026-03-01', value: 700_000,
      createdAt: now, updatedAt: now,
    })
    await bulkSetDailyValues([{ assetItemId: 'asset-2', date: '2026-03-01', value: 12_345, source: 'projected' }])
    const row = await getDailyValue('asset-2', '2026-03-01')
    expect(row?.value).toBe(700_000)
    expect(row?.source).toBeUndefined()
  })

  it('projected→projected 재계산과 수동 편집은 정상 적용된다', async () => {
    await bulkSetDailyValues([{ assetItemId: 'asset-3', date: '2026-03-02', value: 100, source: 'projected' }])
    await bulkSetDailyValues([{ assetItemId: 'asset-3', date: '2026-03-02', value: 200, source: 'projected' }])
    expect((await getDailyValue('asset-3', '2026-03-02'))?.value).toBe(200)
    // 수동 편집(source 'manual')은 projected 위에 덮어쓸 수 있다
    await bulkSetDailyValues([{ assetItemId: 'asset-3', date: '2026-03-02', value: 300, source: 'manual' }])
    const row = await getDailyValue('asset-3', '2026-03-02')
    expect(row?.value).toBe(300)
    expect(row?.source).toBe('manual')
  })
})
