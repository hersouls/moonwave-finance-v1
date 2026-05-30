import { format, parseISO, differenceInCalendarDays, addDays } from 'date-fns'
import type { AssetValueProjection } from '@/lib/types'

const ymd = (d: Date) => format(d, 'yyyy-MM-dd')

/** 백필 시작일 = (기준연도 - 1)-01-01 */
export function backfillStart(baseYmd: string): string {
  return `${parseISO(baseYmd).getFullYear() - 1}-01-01`
}

/** 전방 종료일 = (기준연도 + 1)-12-31 */
export function forwardEnd(baseYmd: string): string {
  return `${parseISO(baseYmd).getFullYear() + 1}-12-31`
}

/** (from, to] 구간에서 매월 dayOfMonth(말일 클램프)이 몇 번 등장하는지. */
function monthlyOccurrences(fromYmd: string, toYmd: string, dayOfMonth: number): number {
  const from = parseISO(fromYmd)
  const to = parseISO(toYmd)
  let count = 0
  let y = from.getFullYear()
  let m = from.getMonth()
  // 안전 상한 (최대 ~40개월)
  for (let i = 0; i < 60; i++) {
    const lastDay = new Date(y, m + 1, 0).getDate()
    const day = Math.min(dayOfMonth, lastDay)
    const contrib = new Date(y, m, day)
    if (contrib > to) break
    if (contrib > from) count++ // (from, to] — from 당일은 base 에 이미 포함
    m++
    if (m > 11) { m = 0; y++ }
  }
  return count
}

/**
 * 기준값/기준일로부터 targetYmd 시점의 투영 값.
 * - target <= base: 평탄(기준값) — 과거 백필은 동일 값.
 * - target  > base: dailyDelta(일수) + monthlyAmount(가산 횟수) 적용.
 * 음수 방지 클램프(자산 가치는 0 미만 불가).
 */
export function projectedValueOn(
  baseValue: number,
  baseYmd: string,
  targetYmd: string,
  p?: AssetValueProjection,
): number {
  if (targetYmd <= baseYmd) return Math.max(0, Math.round(baseValue))
  const days = differenceInCalendarDays(parseISO(targetYmd), parseISO(baseYmd))
  let v = baseValue + (p?.dailyDelta ?? 0) * days
  if (p?.monthlyAmount && p?.monthlyDay) {
    v += p.monthlyAmount * monthlyOccurrences(baseYmd, targetYmd, p.monthlyDay)
  }
  return Math.max(0, Math.round(v))
}

export interface ValueEntry {
  date: string
  value: number
}

/**
 * 전방(forward): 기준일 ~ (Y+1)-12-31. 값 유무와 무관하게 규칙대로 덮어쓴다.
 * - 규칙 없음(평탄): 동일 값
 * - dailyDelta: 매일 ± 반영
 * - monthlyAmount/Day: 매월 지정일 가산
 */
export function buildForward(
  baseValue: number,
  baseYmd: string,
  p?: AssetValueProjection,
): ValueEntry[] {
  const endYmd = forwardEnd(baseYmd)
  const forward: ValueEntry[] = []
  for (let d = parseISO(baseYmd); ymd(d) <= endYmd; d = addDays(d, 1)) {
    const dateStr = ymd(d)
    forward.push({ date: dateStr, value: projectedValueOn(baseValue, baseYmd, dateStr, p) })
  }
  return forward
}

/**
 * 백필(backfill): 기준일 직전(D-1)부터 과거로, **빈 날짜만** 평탄값(기준값)으로 채운다.
 * 값이 있는 날(이미 기록된 날)을 만나면 **즉시 중단**(기존 값 보존). 하한은 (Y-1)-01-01.
 * "D-1 값이 있으면 수정하지 말고, 없으면 현재값으로 중간에 값이 있는 날까지 자동입력".
 */
export function buildBackfill(
  baseValue: number,
  baseYmd: string,
  hasValue: (date: string) => boolean,
): ValueEntry[] {
  const start = backfillStart(baseYmd)
  const flat = Math.max(0, Math.round(baseValue))
  const entries: ValueEntry[] = []
  let d = addDays(parseISO(baseYmd), -1)
  while (ymd(d) >= start) {
    const dateStr = ymd(d)
    if (hasValue(dateStr)) break // 값이 있는 날을 만나면 중단
    entries.push({ date: dateStr, value: flat })
    d = addDays(d, -1)
  }
  return entries
}

/** 규칙이 비어있는지(평탄) 여부. */
export function isFlatProjection(p?: AssetValueProjection): boolean {
  return !p || (!p.dailyDelta && !(p.monthlyAmount && p.monthlyDay))
}
