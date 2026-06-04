// ─── Delta-sync checkpoint ─────────────────────────────────────────
//
// 로그인 머지가 매번 클라우드 컬렉션 전체를 다운로드하면 실행 1회당 문서
// 수만큼 Firestore 읽기가 발생한다 (dailyValues 1만+ 문서 환경에서 실행당
// ~13K reads — 5개 기기면 하루 수십만 reads). 이 모듈은 "이 기기가 마지막
// 으로 본 서버 업로드 시각"을 uid·테이블별로 기억해, 다음 머지가 그 이후
// 변경분만 내려받게 한다.
//
// 시각의 출처는 클라이언트 시계가 아니라 업로드 시 Firestore가 찍은
// serverTimestamp(__uploadedAt)다 — 기기 시계 오차로 문서를 건너뛰는 사고가
// 구조적으로 불가능하다. 체크포인트는 머지가 "성공"한 뒤에만 전진한다
// (실패 시 다음 머지가 같은 구간을 다시 본다 — 머지는 멱등 LWW라 안전).
//
// localStorage 사용 이유: 이것은 기기-로컬 상태("이 기기가 어디까지
// 봤는가")라 Dexie 데이터처럼 동기화 대상이 되면 안 되고, clearAllData
// (로그아웃/백업 복원)가 로컬 DB를 비울 때 반드시 함께 리셋되어야 한다 —
// 빈 로컬 DB + 살아있는 체크포인트 조합은 곧 데이터 누락이다.

const KEY_PREFIX = 'fin:syncCheckpoint:'

/** tableName → 해당 테이블에서 본 최신 __uploadedAt (ms since epoch) */
export type SyncCheckpointMap = Record<string, number>

/** null = 베이스라인(전량) 머지를 아직 마치지 못한 기기. */
export function getSyncCheckpoint(uid: string): SyncCheckpointMap | null {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + uid)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    return parsed !== null && typeof parsed === 'object' ? (parsed as SyncCheckpointMap) : null
  } catch {
    return null
  }
}

/**
 * 머지 성공 후 호출 — 본 것 중 최신 서버 시각으로 단조 전진시킨다.
 * 스탬프된 문서가 0건이어도 항상 저장한다: "전량 머지를 마쳤다"는 사실
 * 자체가 다음 실행을 델타 경로로 보내는 신호다.
 */
export function advanceSyncCheckpoint(uid: string, updates: SyncCheckpointMap): void {
  try {
    const current = getSyncCheckpoint(uid) ?? {}
    for (const [table, ms] of Object.entries(updates)) {
      if (ms > (current[table] ?? 0)) current[table] = ms
    }
    localStorage.setItem(KEY_PREFIX + uid, JSON.stringify(current))
  } catch {
    // storage 불가 환경: 체크포인트가 없으면 전량 머지로 폴백 — 정확성 유지
  }
}

/**
 * 체크포인트 리셋. uid 생략 시 모든 사용자분 제거 — clearAllData(로그아웃,
 * 백업 복원)는 uid를 모르는 컨텍스트에서 돌므로 prefix 전체를 지운다.
 */
export function clearSyncCheckpoint(uid?: string): void {
  try {
    if (uid) {
      localStorage.removeItem(KEY_PREFIX + uid)
      return
    }
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(KEY_PREFIX)) keys.push(k)
    }
    for (const k of keys) localStorage.removeItem(k)
  } catch {
    // noop
  }
}
