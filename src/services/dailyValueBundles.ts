// ─── Daily Value Bundles — 순수 헬퍼 ────────────────────────────────
//
// dailyValues는 행 수가 지배적(1만+ — 전체 클라우드 문서의 ~91%)이라
// per-row 문서로는 신규 기기 베이스라인 비용이 비현실적이다. 클라우드
// 표현만 "자산×월 1문서"로 묶는다 — 로컬 Dexie 스키마는 행 단위 그대로.
//
// 문서 모양 (컬렉션 dailyValueBundles, 문서 id = encodeDocId(bundleKey)):
//   {
//     bundleKey: '<assetSyncId>~~<YYYY-MM>',
//     assetItem_syncId, month,
//     days: { '05': [v, s, u, sid, d], ... },   // 일자 → 튜플 (아래 참조)
//     updatedAt, __deviceId, __schemaV, __uploadedAt
//   }
//
// 일자 튜플 [v, s, u, sid, d]:
//   v   값(number) — null이면 "삭제 마커" (좌표 기반 삭제 전파)
//   s   source('manual'|'projected'|null)
//   u   updatedAt/deletedAt ISO — 일자 단위 LWW 기준
//   sid 행의 syncId — 수신 기기가 입양해 per-row 톰스톤 매칭을 보존
//   d   기록한 기기의 deviceId — LWW 타임스탬프 동률 타이브레이커
//
// 핵심 결정 3가지 (적대적 리뷰 반영):
// 1. 모든 쓰기는 일자 단위 set(..., {merge:true}) — 두 기기가 같은 달의
//    다른 날을 동시에 써도 서로를 덮어쓰지 않는다.
// 2. 일자 엔트리는 "배열"이다 — Firestore merge는 맵을 깊은 병합하지만
//    배열은 통째로 교체하므로, 부분 갱신이 묵은 하위필드를 남기는 함정이
//    구조적으로 불가능하다.
// 3. 일자 삭제는 deleteField()가 아니라 v=null 마커다 — deleteField는
//    삭제 흔적을 남기지 않아, syncId가 분기된 피어(같은 논리 일자를 다른
//    syncId로 보유)가 per-row 톰스톤 매칭에 실패하면 삭제가 영원히 전파
//    되지 않았다. 마커는 좌표(자산×일자)로 전파되어 sid와 무관하게 닿는다.
//
// 이 모듈은 Dexie/Firestore를 임포트하지 않는 순수 함수만 둔다 —
// firestoreSync.ts(오케스트레이션)와의 순환 의존을 피하고 단위테스트를
// 쉽게 하기 위해서다.

import type { DailyValue, SyncChangeLogEntry } from '@/lib/types'

export const DV_BUNDLE_COLLECTION = 'dailyValueBundles'

/** 'YYYY-MM-DD' → 'YYYY-MM' */
export const dvMonthOf = (date: string): string => date.slice(0, 7)
/** 'YYYY-MM-DD' → 'DD' */
export const dvDayOf = (date: string): string => date.slice(8, 10)
/** '~~'는 UUID/날짜에 등장하지 않아 키 분해가 모호하지 않다. */
export const dvBundleKey = (assetSyncId: string, month: string): string =>
  `${assetSyncId}~~${month}`

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
  assetSyncId: string
  month: string
  /** day('DD') → 튜플. 삭제는 v=null 마커. */
  days: Record<string, DvDayTuple>
  maxUpdatedAt: string
}

/**
 * changelog 항목들을 (자산×월) 번들 패치로 묶는다.
 *
 * @param entries        dailyValues의 dedupe된 changelog 항목
 * @param rowBySyncId    syncId → 현재 로컬 행 (업서트 데이터 출처)
 * @param rowByAssetDate `${assetItemId}|${date}` → 현재 로컬 행 — syncId가
 *                       어긋난 항목(번들 인제스트의 sid 입양 등으로 행의
 *                       syncId가 바뀐 경우)을 같은 논리 일자로 재해석한다.
 *                       이 폴백이 없으면 입양 직후의 pending 업서트가
 *                       "행 없음 → 삭제"로 오판된다.
 * @param assetSyncById  로컬 assetItemId → 자산 syncId
 * @param deviceId       이 기기의 deviceId — 일자 LWW 타이브레이커용
 * @returns unresolved — 번들 좌표를 해석할 수 없어 건너뛴 항목 수
 *          (자산이 cascade 삭제된 경우: 번들 문서 자체가 자산 삭제 경로에서
 *          통째로 지워지므로 일자 패치는 불필요하다)
 */
export function buildBundlePatches(
  entries: SyncChangeLogEntry[],
  rowBySyncId: Map<string, DailyValue>,
  rowByAssetDate: Map<string, DailyValue>,
  assetSyncById: Map<number, string>,
  deviceId: string,
): { patches: DvBundlePatch[]; unresolved: number } {
  const byBundle = new Map<string, DvBundlePatch>()
  let unresolved = 0

  const patchFor = (assetSyncId: string, month: string): DvBundlePatch => {
    const key = dvBundleKey(assetSyncId, month)
    let p = byBundle.get(key)
    if (!p) {
      p = { bundleKey: key, assetSyncId, month, days: {}, maxUpdatedAt: '' }
      byBundle.set(key, p)
    }
    return p
  }

  const addUpsert = (row: DailyValue): boolean => {
    const assetSyncId = assetSyncById.get(row.assetItemId)
    if (!assetSyncId || !row.syncId) return false
    const p = patchFor(assetSyncId, dvMonthOf(row.date))
    p.days[dvDayOf(row.date)] = [row.value, row.source ?? null, row.updatedAt, row.syncId, deviceId]
    if (row.updatedAt > p.maxUpdatedAt) p.maxUpdatedAt = row.updatedAt
    return true
  }

  const addDeleteMarker = (assetItemId: number, date: string, syncId: string, timestamp: string): boolean => {
    const assetSyncId = assetSyncById.get(assetItemId)
    if (!assetSyncId) return false
    const p = patchFor(assetSyncId, dvMonthOf(date))
    const day = dvDayOf(date)
    // 같은 패치에 이미 살아있는 업서트가 있으면(삭제 후 재생성) 그쪽이 진실
    if (p.days[day] && p.days[day][0] !== null) return true
    p.days[day] = [null, null, timestamp, syncId, deviceId]
    if (timestamp > p.maxUpdatedAt) p.maxUpdatedAt = timestamp
    return true
  }

  // 업서트를 먼저 처리해 "삭제 후 재생성" 일자에서 업서트가 이기게 한다
  const upserts = entries.filter((e) => e.operation !== 'delete')
  const deletes = entries.filter((e) => e.operation === 'delete')

  for (const e of upserts) {
    const row = rowBySyncId.get(e.syncId)
      ?? (e.assetItemId != null && e.date
        ? rowByAssetDate.get(`${e.assetItemId}|${e.date}`)
        : undefined)
    if (row) {
      if (!addUpsert(row)) unresolved++
    } else if (e.assetItemId != null && e.date) {
      // 행이 그새 삭제됨 — 삭제 마커로 처리
      if (!addDeleteMarker(e.assetItemId, e.date, e.syncId, e.timestamp)) unresolved++
    } else {
      unresolved++ // 메타 없는 레거시 항목 + 행 소실 — 좌표 해석 불가
    }
  }

  for (const e of deletes) {
    if (e.assetItemId != null && e.date) {
      // 현재 로컬에 같은 좌표의 살아있는 행이 있으면(삭제 후 재생성) 업서트가 진실
      const live = rowByAssetDate.get(`${e.assetItemId}|${e.date}`)
      if (live) continue
      if (!addDeleteMarker(e.assetItemId, e.date, e.syncId, e.timestamp)) unresolved++
    } else {
      unresolved++ // 메타 없는 레거시 삭제 — 레거시 per-row 삭제/톰스톤만으로 처리됨
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
  assetSyncById: Map<number, string>,
  deviceId: string,
): { bundles: Array<{ bundleKey: string; assetSyncId: string; month: string; days: Record<string, DvDayTuple>; maxUpdatedAt: string }>; unresolved: number } {
  const byBundle = new Map<string, { bundleKey: string; assetSyncId: string; month: string; days: Record<string, DvDayTuple>; maxUpdatedAt: string }>()
  let unresolved = 0
  for (const row of rows) {
    const assetSyncId = assetSyncById.get(row.assetItemId)
    if (!assetSyncId || !row.syncId) { unresolved++; continue }
    const month = dvMonthOf(row.date)
    const key = dvBundleKey(assetSyncId, month)
    let b = byBundle.get(key)
    if (!b) {
      b = { bundleKey: key, assetSyncId, month, days: {}, maxUpdatedAt: '' }
      byBundle.set(key, b)
    }
    b.days[dvDayOf(row.date)] = [row.value, row.source ?? null, row.updatedAt, row.syncId, deviceId]
    if (row.updatedAt > b.maxUpdatedAt) b.maxUpdatedAt = row.updatedAt
  }
  return { bundles: [...byBundle.values()], unresolved }
}

/**
 * 번들 문서를 일자 후보로 푼다 (인제스트 측). 형식이 어긋난 일자는 건너뛴다.
 * v=null(삭제 마커)도 그대로 전달한다 — 적용 판단은 호출자의 LWW가 한다.
 */
export function explodeBundleDoc(
  data: Record<string, unknown>,
): { assetSyncId: string; month: string; days: DvDayParsed[] } | null {
  const assetSyncId = data.assetItem_syncId as string | undefined
  const month = data.month as string | undefined
  const days = data.days as Record<string, unknown> | undefined
  if (!assetSyncId || !month || !days || typeof days !== 'object') return null
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
  return { assetSyncId, month, days: out }
}
