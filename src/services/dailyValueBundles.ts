// ─── Daily Value Bundles — 순수 헬퍼 ────────────────────────────────
//
// dailyValues는 행 수가 지배적(1만+ — 전체 클라우드 문서의 ~91%)이라
// per-row 문서로는 신규 기기 베이스라인 비용이 비현실적이다. 클라우드
// 표현만 "자산×월 1문서"로 묶는다 — 로컬 Dexie 스키마는 행 단위 그대로.
//
// 문서 모양 (컬렉션 dailyValueBundles, 문서 id = encodeDocId(bundleKey)):
//   {
//     bundleKey: '<assetId>~~<YYYY-MM>',
//     assetItem_syncId, month,
//     days: { '05': [v, s, u, sid, d], ... },   // 일자 → 튜플 (아래 참조)
//     updatedAt, __deviceId, __schemaV, __uploadedAt
//   }
//
// Sync v2: 자산의 id가 곧 전역 id(구 syncId)이므로 bundleKey의 자산 식별자는
// row.assetItemId를 그대로 쓴다. 필드명 assetItem_syncId는 클라우드 스키마
// 호환(구버전 기기가 이 이름으로 읽음)을 위해 유지한다.
//
// 일자 튜플 [v, s, u, sid, d]:
//   v   값(number) — null이면 "삭제 마커" (좌표 기반 삭제 전파)
//   s   source('manual'|'projected'|null)
//   u   updatedAt/deletedAt ISO — 일자 단위 LWW 기준
//   sid 행의 id — 수신 기기가 입양해 행 식별을 기기 간 공유
//   d   기록한 기기의 deviceId — LWW 타임스탬프 동률 타이브레이커
//
// 핵심 결정 3가지 (적대적 리뷰 반영):
// 1. 모든 쓰기는 일자 단위 set(..., {merge:true}) — 두 기기가 같은 달의
//    다른 날을 동시에 써도 서로를 덮어쓰지 않는다.
// 2. 일자 엔트리는 "배열"이다 — Firestore merge는 맵을 깊은 병합하지만
//    배열은 통째로 교체하므로, 부분 갱신이 묵은 하위필드를 남기는 함정이
//    구조적으로 불가능하다.
// 3. 일자 삭제는 deleteField()가 아니라 v=null 마커다 — 마커는 좌표
//    (자산×일자)로 전파되어 sid와 무관하게 닿는다.
//
// 이 모듈은 Dexie/Firestore를 임포트하지 않는 순수 함수만 둔다 —
// firestoreSync.ts(오케스트레이션)와의 순환 의존을 피하고 단위테스트를
// 쉽게 하기 위해서다.

import type { DailyValue, SyncOutboxEntry } from '@/lib/types'

export const DV_BUNDLE_COLLECTION = 'dailyValueBundles'

/** 'YYYY-MM-DD' → 'YYYY-MM' */
export const dvMonthOf = (date: string): string => date.slice(0, 7)
/** 'YYYY-MM-DD' → 'DD' */
export const dvDayOf = (date: string): string => date.slice(8, 10)
/** '~~'는 UUID/날짜에 등장하지 않아 키 분해가 모호하지 않다. */
export const dvBundleKey = (assetId: string, month: string): string =>
  `${assetId}~~${month}`

/** 일자 튜플 — 문서 상단 주석 참조. v=null이면 삭제 마커. */
export type DvDayTuple = [v: number | null, s: string | null, u: string, sid: string, d: string]

export interface DvDayParsed {
  date: string
  v: number | null
  s: string | null
  u: string
  sid: string
  d: string
}

/** 증분 업로드용 번들 패치 — 바뀐 일자만 담는다 (merge:true로 커밋). */
export interface DvBundlePatch {
  bundleKey: string
  assetId: string
  month: string
  /** day('DD') → 튜플. 삭제는 v=null 마커. */
  days: Record<string, DvDayTuple>
  maxUpdatedAt: string
}

/**
 * dailyValues 아웃박스 항목들을 (자산×월) 번들 패치로 묶는다.
 *
 * @param entries        dailyValues의 아웃박스 항목 (레코드당 1행)
 * @param rowById        id → 현재 로컬 행 (업서트 데이터 출처)
 * @param rowByAssetDate `${assetItemId}|${date}` → 현재 로컬 행 — id가
 *                       어긋난 항목(번들 인제스트의 sid 입양으로 행의 id가
 *                       바뀐 경우)을 같은 논리 일자로 재해석한다.
 * @param deviceId       이 기기의 deviceId — 일자 LWW 타이브레이커용
 * @returns unresolved — 좌표를 해석할 수 없어 건너뛴 항목 수
 *          (자산이 cascade 삭제된 경우: 번들 문서 자체가 자산 삭제 경로에서
 *          통째로 지워지므로 일자 패치는 불필요하다)
 */
export function buildBundlePatches(
  entries: SyncOutboxEntry[],
  rowById: Map<string, DailyValue>,
  rowByAssetDate: Map<string, DailyValue>,
  deviceId: string,
): { patches: DvBundlePatch[]; unresolved: number } {
  const byBundle = new Map<string, DvBundlePatch>()
  let unresolved = 0

  const patchFor = (assetId: string, month: string): DvBundlePatch => {
    const key = dvBundleKey(assetId, month)
    let p = byBundle.get(key)
    if (!p) {
      p = { bundleKey: key, assetId, month, days: {}, maxUpdatedAt: '' }
      byBundle.set(key, p)
    }
    return p
  }

  const addUpsert = (row: DailyValue): void => {
    const p = patchFor(row.assetItemId, dvMonthOf(row.date))
    p.days[dvDayOf(row.date)] = [row.value, row.source ?? null, row.updatedAt, row.id, deviceId]
    if (row.updatedAt > p.maxUpdatedAt) p.maxUpdatedAt = row.updatedAt
  }

  const addDeleteMarker = (assetItemId: string, date: string, rowId: string, timestamp: string): void => {
    const p = patchFor(assetItemId, dvMonthOf(date))
    const day = dvDayOf(date)
    // 같은 패치에 이미 살아있는 업서트가 있으면(삭제 후 재생성) 그쪽이 진실
    if (p.days[day] && p.days[day][0] !== null) return
    p.days[day] = [null, null, timestamp, rowId, deviceId]
    if (timestamp > p.maxUpdatedAt) p.maxUpdatedAt = timestamp
  }

  // 업서트를 먼저 처리해 "삭제 후 재생성" 일자에서 업서트가 이기게 한다
  const upserts = entries.filter((e) => e.op !== 'delete')
  const deletes = entries.filter((e) => e.op === 'delete')

  for (const e of upserts) {
    const row = rowById.get(e.recordId)
      ?? (e.assetItemId && e.date
        ? rowByAssetDate.get(`${e.assetItemId}|${e.date}`)
        : undefined)
    if (row) {
      addUpsert(row)
    } else if (e.assetItemId && e.date) {
      // 행이 그새 삭제됨 — 삭제 마커로 처리
      addDeleteMarker(e.assetItemId, e.date, e.recordId, e.queuedAt)
    } else {
      unresolved++ // 좌표 메타 없는 항목 + 행 소실 — 좌표 해석 불가
    }
  }

  for (const e of deletes) {
    if (e.assetItemId && e.date) {
      // 현재 로컬에 같은 좌표의 살아있는 행이 있으면(삭제 후 재생성) 업서트가 진실
      const live = rowByAssetDate.get(`${e.assetItemId}|${e.date}`)
      if (live) continue
      addDeleteMarker(e.assetItemId, e.date, e.recordId, e.queuedAt)
    } else {
      unresolved++ // 좌표 메타 없는 삭제 — 번들 패치로 전파 불가
    }
  }

  return { patches: [...byBundle.values()], unresolved }
}

/**
 * 전량 업로드용 — 로컬 전체 행으로 번들 문서들을 만든다 (살아있는 일자만).
 * 주의: 호출자는 반드시 merge:true로 커밋해야 한다. 통째 set은 이 기기가
 * 아직 다운로드하지 못한 피어의 일자를 클라우드에서 지워버린다 (적대적
 * 리뷰 확정 결함 — '로컬→클라우드' 수동 업로드가 무음 데이터 손실 유발).
 */
export function buildFullBundles(
  rows: DailyValue[],
  deviceId: string,
): { bundles: DvBundlePatch[] } {
  const byBundle = new Map<string, DvBundlePatch>()
  for (const row of rows) {
    const month = dvMonthOf(row.date)
    const key = dvBundleKey(row.assetItemId, month)
    let b = byBundle.get(key)
    if (!b) {
      b = { bundleKey: key, assetId: row.assetItemId, month, days: {}, maxUpdatedAt: '' }
      byBundle.set(key, b)
    }
    b.days[dvDayOf(row.date)] = [row.value, row.source ?? null, row.updatedAt, row.id, deviceId]
    if (row.updatedAt > b.maxUpdatedAt) b.maxUpdatedAt = row.updatedAt
  }
  return { bundles: [...byBundle.values()] }
}

/**
 * 번들 문서를 일자 후보로 푼다 (인제스트 측). 형식이 어긋난 일자는 건너뛴다.
 * v=null(삭제 마커)도 그대로 전달한다 — 적용 판단은 호출자의 LWW가 한다.
 */
export function explodeBundleDoc(
  data: Record<string, unknown>,
): { assetId: string; month: string; days: DvDayParsed[] } | null {
  const assetId = data.assetItem_syncId as string | undefined
  const month = data.month as string | undefined
  const days = data.days as Record<string, unknown> | undefined
  if (!assetId || !month || !days || typeof days !== 'object') return null
  const out: DvDayParsed[] = []
  for (const [dd, raw] of Object.entries(days)) {
    if (!Array.isArray(raw) || raw.length < 5) continue
    const [v, s, u, sid, d] = raw as DvDayTuple
    if (v !== null && typeof v !== 'number') continue
    if (typeof u !== 'string' || typeof sid !== 'string') continue
    out.push({
      date: `${month}-${dd}`,
      v,
      s: typeof s === 'string' ? s : null,
      u,
      sid,
      d: typeof d === 'string' ? d : '',
    })
  }
  return { assetId, month, days: out }
}
