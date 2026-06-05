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
//     days: { '05': { v, s, u, sid }, ... },   // 일자 → 값/출처/수정시각/행 syncId
//     updatedAt, __deviceId, __schemaV, __uploadedAt
//   }
//
// 핵심 결정 2가지:
// 1. 증분 쓰기는 일자 단위 set(..., {merge:true}) — 두 기기가 같은 달의
//    다른 날을 동시에 써도 서로를 덮어쓰지 않는다. 일자 삭제는 deleteField().
// 2. 일자 엔트리에 행의 syncId(sid)를 실어 보낸다 — 수신 기기가 행을 만들
//    때 이 sid를 입양해야 per-row 톰스톤(삭제 전파)이 기기 간에 매칭된다.
//    sid 없이 기기마다 랜덤 syncId를 만들면 삭제가 영원히 전파되지 않는다.
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

/** 번들 문서의 일자 엔트리. */
export interface DvDayEntry {
  v: number
  /** source — undefined는 Firestore가 거부하므로 null로 정규화 */
  s: string | null
  /** updatedAt ISO — 일자 단위 LWW 기준 */
  u: string
  /** 행의 syncId — 수신 기기가 입양해 톰스톤 매칭을 보존 */
  sid: string
}

/** 증분 업로드용 번들 패치 — 바뀐 일자만 담는다 (merge:true로 커밋). */
export interface DvBundlePatch {
  bundleKey: string
  assetSyncId: string
  month: string
  upserts: Record<string, DvDayEntry>
  /** deleteField()로 제거할 일자들 — upserts와 겹치면 upsert가 이긴다 */
  deletes: string[]
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
 * @returns unresolved — 번들 위치를 해석할 수 없어 건너뛴 항목 수
 *          (자산이 cascade 삭제된 경우: 번들 문서 자체가 자산 삭제 경로에서
 *          통째로 지워지므로 일자 패치는 불필요하다)
 */
export function buildBundlePatches(
  entries: SyncChangeLogEntry[],
  rowBySyncId: Map<string, DailyValue>,
  rowByAssetDate: Map<string, DailyValue>,
  assetSyncById: Map<number, string>,
): { patches: DvBundlePatch[]; unresolved: number } {
  const byBundle = new Map<string, DvBundlePatch>()
  let unresolved = 0

  const patchFor = (assetSyncId: string, month: string): DvBundlePatch => {
    const key = dvBundleKey(assetSyncId, month)
    let p = byBundle.get(key)
    if (!p) {
      p = { bundleKey: key, assetSyncId, month, upserts: {}, deletes: [], maxUpdatedAt: '' }
      byBundle.set(key, p)
    }
    return p
  }

  const addUpsert = (row: DailyValue): boolean => {
    const assetSyncId = assetSyncById.get(row.assetItemId)
    if (!assetSyncId || !row.syncId) return false
    const p = patchFor(assetSyncId, dvMonthOf(row.date))
    p.upserts[dvDayOf(row.date)] = {
      v: row.value, s: row.source ?? null, u: row.updatedAt, sid: row.syncId,
    }
    if (row.updatedAt > p.maxUpdatedAt) p.maxUpdatedAt = row.updatedAt
    return true
  }

  const addDelete = (assetItemId: number, date: string, timestamp: string): boolean => {
    const assetSyncId = assetSyncById.get(assetItemId)
    if (!assetSyncId) return false
    const p = patchFor(assetSyncId, dvMonthOf(date))
    p.deletes.push(dvDayOf(date))
    if (timestamp > p.maxUpdatedAt) p.maxUpdatedAt = timestamp
    return true
  }

  for (const e of entries) {
    if (e.operation !== 'delete') {
      // 업서트: 현재 로컬 행이 진실
      const row = rowBySyncId.get(e.syncId)
        ?? (e.assetItemId != null && e.date
          ? rowByAssetDate.get(`${e.assetItemId}|${e.date}`)
          : undefined)
      if (row) {
        if (!addUpsert(row)) unresolved++
      } else if (e.assetItemId != null && e.date) {
        // 행이 그새 삭제됨 — 일자 제거로 처리
        if (!addDelete(e.assetItemId, e.date, e.timestamp)) unresolved++
      } else {
        unresolved++ // 메타 없는 레거시 항목 + 행 소실 — 위치 해석 불가
      }
    } else {
      if (e.assetItemId != null && e.date) {
        // 같은 일자가 삭제 후 재생성된 경우(서로 다른 syncId의 delete+create가
        // 모두 pending) 현재 로컬 행이 있으면 업서트가 진실이다 — 삭제 스킵.
        const live = rowByAssetDate.get(`${e.assetItemId}|${e.date}`)
        if (live) continue
        if (!addDelete(e.assetItemId, e.date, e.timestamp)) unresolved++
      } else {
        unresolved++ // 메타 없는 레거시 삭제 — 레거시 per-row 삭제/톰스톤만으로 처리됨
      }
    }
  }

  // 같은 일자에 upsert와 delete가 공존하면 upsert(현재 로컬 상태)가 이긴다
  for (const p of byBundle.values()) {
    p.deletes = [...new Set(p.deletes)].filter((d) => !(d in p.upserts))
  }

  return { patches: [...byBundle.values()], unresolved }
}

/**
 * 전량 업로드용 — 로컬 전체 행으로 "완전한" 번들 문서들을 만든다.
 * merge 없이 통째로 set해 클라우드의 묵은 일자(stale day)를 함께 청소한다.
 */
export function buildFullBundles(
  rows: DailyValue[],
  assetSyncById: Map<number, string>,
): { bundles: Array<{ bundleKey: string; assetSyncId: string; month: string; days: Record<string, DvDayEntry>; maxUpdatedAt: string }>; unresolved: number } {
  const byBundle = new Map<string, { bundleKey: string; assetSyncId: string; month: string; days: Record<string, DvDayEntry>; maxUpdatedAt: string }>()
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
    b.days[dvDayOf(row.date)] = { v: row.value, s: row.source ?? null, u: row.updatedAt, sid: row.syncId }
    if (row.updatedAt > b.maxUpdatedAt) b.maxUpdatedAt = row.updatedAt
  }
  return { bundles: [...byBundle.values()], unresolved }
}

/** 번들 문서를 일자 행 후보로 푼다 (인제스트 측). 형식이 어긋난 일자는 건너뛴다. */
export function explodeBundleDoc(
  data: Record<string, unknown>,
): { assetSyncId: string; month: string; days: Array<{ date: string; entry: DvDayEntry }> } | null {
  const assetSyncId = data.assetItem_syncId as string | undefined
  const month = data.month as string | undefined
  const days = data.days as Record<string, unknown> | undefined
  if (!assetSyncId || !month || !days || typeof days !== 'object') return null
  const out: Array<{ date: string; entry: DvDayEntry }> = []
  for (const [dd, raw] of Object.entries(days)) {
    const e = raw as Partial<DvDayEntry> | null
    if (!e || typeof e.v !== 'number' || typeof e.u !== 'string' || typeof e.sid !== 'string') continue
    out.push({ date: `${month}-${dd}`, entry: { v: e.v, s: e.s ?? null, u: e.u, sid: e.sid } })
  }
  return { assetSyncId, month, days: out }
}
