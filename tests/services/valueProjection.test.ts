import { describe, it, expect } from 'vitest'
import { planValueSeries, type ExistingValue } from '@/services/valueProjection'
import type { AssetValueProjection } from '@/lib/types'

function ev(date: string, value: number, source?: 'manual' | 'projected'): ExistingValue {
  return { date, value, source }
}

describe('planValueSeries — 평탄(규칙 없음) 일자별 값 수정', () => {
  it('직전 값이 없으면(첫 기록) 과거를 같은 숫자로 백필한다', () => {
    const entries = planValueSeries([], 1_000_000, '2026-03-15')
    // 기준일 수동 앵커
    expect(entries).toContainEqual({ date: '2026-03-15', value: 1_000_000, source: 'manual' })
    // (Y-1)-01-01 평탄 백필 앵커 — 같은 숫자
    expect(entries).toContainEqual({ date: '2025-01-01', value: 1_000_000, source: 'projected' })
    expect(entries).toHaveLength(2)
  })

  it('직전 수동 값이 있으면 공백을 덮어쓰지 않는다 (버그 회귀 방지)', () => {
    // 1/1=100만 기록 후 2/15=200만 으로 수정 — 1/2~2/14 는 100만이 이월돼야 한다.
    const existing = [ev('2026-01-01', 1_000_000, 'manual')]
    const entries = planValueSeries(existing, 2_000_000, '2026-02-15')
    // 기준일 수동 앵커만 — 백필/이월 앵커 없음
    expect(entries).toEqual([{ date: '2026-02-15', value: 2_000_000, source: 'manual' }])
    // 새 값으로 공백을 채우는 projected 앵커가 절대 없어야 한다
    expect(entries.some(e => e.source === 'projected')).toBe(false)
    // 직전 기록일과 기준일 사이에 어떤 기록도 새로 만들지 않는다
    expect(entries.some(e => e.date > '2026-01-01' && e.date < '2026-02-15')).toBe(false)
  })

  it('직전 값이 부채(잔액)여도 동일하게 보존한다', () => {
    const existing = [ev('2026-04-10', 30_000_000, 'manual')]
    const entries = planValueSeries(existing, 28_000_000, '2026-05-20')
    expect(entries).toEqual([{ date: '2026-05-20', value: 28_000_000, source: 'manual' }])
  })

  it('레거시 source 미지정 기록도 "직전 값"으로 취급해 보존한다', () => {
    const existing = [ev('2026-01-01', 500_000, undefined)]
    const entries = planValueSeries(existing, 700_000, '2026-02-15')
    expect(entries).toEqual([{ date: '2026-02-15', value: 700_000, source: 'manual' }])
  })

  it('첫 기록을 그 날짜에서 다시 수정하면 과거를 새 값으로 백필한다', () => {
    // 직전(< 기준일) 앵커가 없으므로 Scenario A
    const existing = [ev('2026-03-15', 100, 'manual')]
    const entries = planValueSeries(existing, 200, '2026-03-15')
    expect(entries).toContainEqual({ date: '2026-03-15', value: 200, source: 'manual' })
    expect(entries).toContainEqual({ date: '2025-01-01', value: 200, source: 'projected' })
  })

  it('남아있던 projected 기록은 "직전 값"으로 치지 않는다 (clearProjected 대상)', () => {
    // projected 만 과거에 있으면 = 정리 대상 → 첫 기록처럼 백필 발생
    const existing = [ev('2026-01-01', 100, 'projected')]
    const entries = planValueSeries(existing, 300, '2026-02-15')
    expect(entries).toContainEqual({ date: '2025-01-01', value: 300, source: 'projected' })
    expect(entries).toContainEqual({ date: '2026-02-15', value: 300, source: 'manual' })
  })

  it('음수 기준값은 0 으로 클램프한다', () => {
    const entries = planValueSeries([], -50, '2026-03-15')
    expect(entries[0]).toEqual({ date: '2026-03-15', value: 0, source: 'manual' })
  })
})

describe('planValueSeries — 변동 규칙(dense)', () => {
  const dailyDelta: AssetValueProjection = { dailyDelta: 1000 }

  it('규칙이 있으면 전방 투영 + 백필 엔트리를 생성한다', () => {
    const entries = planValueSeries([], 100_000, '2026-03-15', dailyDelta)
    // 기준일 수동 앵커 포함
    expect(entries).toContainEqual({ date: '2026-03-15', value: 100_000, source: 'manual' })
    // 평탄 2건보다 훨씬 많은 dense 시리즈
    expect(entries.length).toBeGreaterThan(2)
    // 다음날은 +1000 투영
    expect(entries).toContainEqual({ date: '2026-03-16', value: 101_000, source: 'projected' })
  })

  it('백필은 직전 수동기록을 만나면 중단한다(수동 보존)', () => {
    const existing = [ev('2026-03-01', 50_000, 'manual')]
    const entries = planValueSeries(existing, 100_000, '2026-03-15', dailyDelta)
    // 3/01 이전으로는 백필하지 않는다 — 직전 수동기록에서 중단
    expect(entries.some(e => e.date < '2026-03-01')).toBe(false)
    // 3/01 자체(수동)는 백필 엔트리로 다시 만들지 않는다
    expect(entries.some(e => e.date === '2026-03-01' && e.source === 'projected')).toBe(false)
  })

  it('백필은 레거시 source 미지정 기록도 앵커로 보고 중단한다 (데이터 손실 회귀 방지)', () => {
    // undefined-source 과거 행(퇴직금/레거시)은 사용자 원천 데이터다. backfill 이
    // 이를 지나치며 projected 로 덮어쓰면 동기화로 복구 불가한 손실이 난다.
    const existing = [ev('2026-03-01', 50_000, undefined)]
    const entries = planValueSeries(existing, 100_000, '2026-03-15', dailyDelta)
    // 3/01 이전으로 백필하지 않는다 — 레거시 앵커에서 중단
    expect(entries.some(e => e.date < '2026-03-01')).toBe(false)
    // 3/01(레거시 행)을 projected 엔트리로 덮어쓰지 않는다
    expect(entries.some(e => e.date === '2026-03-01')).toBe(false)
  })
})
