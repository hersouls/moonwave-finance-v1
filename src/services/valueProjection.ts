import { format, parseISO, addDays } from 'date-fns'
import type { AssetValueProjection } from '@/lib/types'

const ymd = (d: Date) => format(d, 'yyyy-MM-dd')
const clamp = (n: number) => Math.max(0, Math.round(n))

/** 백필 시작일 = (기준연도 - 1)-01-01 */
export function backfillStart(baseYmd: string): string {
  return `${parseISO(baseYmd).getFullYear() - 1}-01-01`
}

/** 전방 종료일 = (기준연도 + 1)-12-31 */
export function forwardEnd(baseYmd: string): string {
  return `${parseISO(baseYmd).getFullYear() + 1}-12-31`
}

/** 다음 날(YYYY-MM-DD). */
export function nextDayYmd(baseYmd: string): string {
  return ymd(addDays(parseISO(baseYmd), 1))
}

/** 규칙이 비어있는지(평탄) 여부. */
export function isFlatProjection(p?: AssetValueProjection): boolean {
  if (!p) return true
  return !p.dailyDelta && !(p.monthlyAmount && p.monthlyDay) && !p.annualRatePct
}

/** d 가 매월 적용일(말일 클램프)인지. */
function isContribDay(d: Date, monthlyDay: number): boolean {
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  return d.getDate() === Math.min(monthlyDay, last)
}

export interface ValueEntry {
  date: string
  value: number
}

/**
 * 전방(forward): 기준일 ~ (Y+1)-12-31. 하루씩 잔액을 이어가며(반복) 규칙 적용.
 * 적용 순서(매일): ① 연 정률(복리=잔액 기준 / 단리=기준값 기준) ② 매일 정액 ③ 매월 정액(적용일).
 * 음수 클램프(0 미만 불가). 기준일 값은 baseValue 그대로.
 */
export function buildForward(
  baseValue: number,
  baseYmd: string,
  p?: AssetValueProjection,
): ValueEntry[] {
  const endYmd = forwardEnd(baseYmd)
  const r = (p?.annualRatePct ?? 0) / 100
  const compound = !!p?.compound
  const daily = p?.dailyDelta ?? 0
  const monthly = p?.monthlyAmount ?? 0
  const monthlyDay = p?.monthlyDay ?? 0

  const entries: ValueEntry[] = [{ date: baseYmd, value: clamp(baseValue) }]
  let bal = baseValue
  let d = addDays(parseISO(baseYmd), 1)
  while (ymd(d) <= endYmd) {
    // 잔액이 0(완납·소진)이면 이자 미가산. 단리는 baseValue 기준이라 가드 없으면
    // 0 도달 후에도 매일 baseValue*r/365 만큼 되살아나는 '유령 잔액'이 생긴다.
    if (r && bal > 0) bal += (compound ? bal : baseValue) * r / 365
    bal += daily
    if (monthly && monthlyDay && isContribDay(d, monthlyDay)) bal += monthly
    bal = Math.max(0, bal)
    entries.push({ date: ymd(d), value: Math.round(bal) })
    d = addDays(d, 1)
  }
  return entries
}

/**
 * 백필(backfill): 기준일 직전(D-1)부터 과거로 — 규칙을 **역산**(Q1=B)해 값 생성.
 * 평탄이면 동일 값. 매 단계 isManual(date)을 만나면 **즉시 중단**(직전 수동기록 보존, Q7).
 * 하한 (Y-1)-01-01. 음수 클램프.
 */
export function buildBackfill(
  baseValue: number,
  baseYmd: string,
  isManual: (date: string) => boolean,
  p?: AssetValueProjection,
): ValueEntry[] {
  const startYmd = backfillStart(baseYmd)
  const flat = isFlatProjection(p)
  const r = (p?.annualRatePct ?? 0) / 100
  const compound = !!p?.compound
  const daily = p?.dailyDelta ?? 0
  const monthly = p?.monthlyAmount ?? 0
  const monthlyDay = p?.monthlyDay ?? 0

  const entries: ValueEntry[] = []
  let bal = baseValue // 기준일(=baseYmd)의 값
  let d = addDays(parseISO(baseYmd), -1)
  while (ymd(d) >= startYmd) {
    const ds = ymd(d)
    if (isManual(ds)) break // 직전 수동기록을 만나면 중단

    if (!flat) {
      // d+1 → d 로 역산: 전방 적용(정률→정액→월)의 역순으로 되돌린다.
      const dPlus1 = addDays(d, 1)
      if (monthly && monthlyDay && isContribDay(dPlus1, monthlyDay)) bal -= monthly
      bal -= daily
      if (r && bal > 0) bal = compound ? bal / (1 + r / 365) : bal - baseValue * r / 365
      bal = Math.max(0, bal)
    }
    entries.push({ date: ds, value: flat ? clamp(baseValue) : Math.round(bal) })
    d = addDays(d, -1)
  }
  return entries
}

/** 일자별 값 기록 1건(항목 ID 제외 — 호출측에서 assetItemId 를 합친다). */
export interface PlannedEntry {
  date: string
  value: number
  source: 'manual' | 'projected'
}

/** planValueSeries 입력: 한 항목의 기존 기록 중 판단에 필요한 필드만. */
export interface ExistingValue {
  date: string
  value: number
  source?: 'manual' | 'projected'
}

/**
 * 한 항목의 기존 기록 + (기준값, 기준일, 규칙)으로 DB 에 기록할 엔트리를 계산한다(순수).
 *
 * 평탄(규칙 없음):
 *   - 기준일에 수동 앵커 1개.
 *   - 기준일 **이전**에 앵커(수동 또는 레거시 source 미지정 — clearProjected 후에도 남는 기록)가
 *     하나라도 있으면, 그 값이 forward-fill 로 공백(앵커+1 ~ 기준일-1)을 그대로 덮으므로
 *     **백필하지 않는다.** 백필하면 기존 값을 새 값으로 덮어쓰는 버그가 된다.
 *   - 직전 앵커가 전혀 없으면(첫 기록) (Y-1)-01-01 에 평탄 백필 앵커 1개를 둬 과거 빈 구간을 기준값으로 채운다.
 *   ※ 평탄은 기존 projected 기록을 호출측에서 먼저 정리(clearProjectedDailyValues)해야 한다.
 *
 * 변동 규칙: 전방(기준일~(Y+1)-12-31) 규칙 적용분 중 변경분만 + 역산 백필(직전 수동기록에서 중단).
 */
export function planValueSeries(
  existing: ExistingValue[],
  baseValue: number,
  baseDate: string,
  p?: AssetValueProjection,
): PlannedEntry[] {
  const base0 = clamp(baseValue)
  const entries: PlannedEntry[] = [{ date: baseDate, value: base0, source: 'manual' }]

  if (isFlatProjection(p)) {
    // clearProjected 후에도 남는 앵커(수동 + 레거시 source 미지정)가 기준일 이전에 있는가.
    const hasPriorAnchor = existing.some(v => v.source !== 'projected' && v.date < baseDate)
    if (!hasPriorAnchor) {
      const soupStart = backfillStart(baseDate)
      if (soupStart < baseDate) entries.push({ date: soupStart, value: base0, source: 'projected' })
    }
    return entries
  }

  // 변동 규칙(dense): 전방 변경분 + 역산 백필.
  const manualDates = new Set(existing.filter(v => v.source === 'manual').map(v => v.date))
  const existingVal = new Map(existing.map(v => [v.date, v.value] as const))
  for (const e of buildForward(baseValue, baseDate, p)) {
    if (e.date === baseDate) continue
    if (existingVal.get(e.date) !== e.value) entries.push({ date: e.date, value: e.value, source: 'projected' })
  }
  for (const e of buildBackfill(baseValue, baseDate, (d) => manualDates.has(d), p)) {
    entries.push({ date: e.date, value: e.value, source: 'projected' })
  }
  return entries
}
