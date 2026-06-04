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
// 저장소는 Dexie(syncMeta 테이블)다 — localStorage가 아니다. 체크포인트는
// "로컬 DB가 베이스라인을 갖고 있다"는 전제 위에서만 유효하므로, 로컬 DB와
// 운명을 같이해야 한다. localStorage에 두면 PWA 재설치·사이트 데이터 부분
// 삭제·스토리지 축출로 IndexedDB만 사라졌을 때 체크포인트가 살아남아,
// 빈 DB에 델타만 내려받는 무성 데이터 누락이 된다 (적대적 리뷰 확정 결함).
// Dexie에 두면 그 시나리오에서 체크포인트도 함께 사라져 자동으로 전량
// 머지로 폴백한다.

import { db } from '@/services/database'

/** tableName → 해당 테이블에서 본 최신 __uploadedAt (ms since epoch) */
export type SyncCheckpointMap = Record<string, number>

const keyFor = (uid: string) => `checkpoint:${uid}`

/** null = 베이스라인(전량) 머지를 아직 마치지 못한 기기. */
export async function getSyncCheckpoint(uid: string): Promise<SyncCheckpointMap | null> {
  try {
    const row = await db.syncMeta.get(keyFor(uid))
    const value = row?.value
    return value !== null && typeof value === 'object' ? (value as SyncCheckpointMap) : null
  } catch {
    return null
  }
}

/**
 * 머지 성공 후 호출 — 본 것 중 최신 서버 시각으로 단조 전진시킨다.
 *
 * 스탬프된 문서가 0건인 테이블도 키를 0으로 "명시" 기록한다. 두 가지를
 * 구분하기 위해서다: 키가 있는 테이블(베이스라인을 봤음 → 델타 안전)과
 * 키가 없는 테이블(이 기기가 한 번도 전량을 본 적 없음 — 예: 앱 업데이트로
 * 새로 추가된 동기화 테이블 → 전량 다운로드 필요). mergeOnLogin의 sinceFor가
 * 이 구분(`?? null`)으로 미지의 테이블을 전량 경로로 보낸다.
 */
export async function advanceSyncCheckpoint(uid: string, updates: SyncCheckpointMap): Promise<void> {
  try {
    const current = (await getSyncCheckpoint(uid)) ?? {}
    for (const [table, ms] of Object.entries(updates)) {
      current[table] = Math.max(current[table] ?? 0, ms)
    }
    await db.syncMeta.put({ key: keyFor(uid), value: current })
  } catch (err) {
    // 저장 실패 = 다음 실행이 같은 구간을 다시 읽는다(정확성 유지, 비용 증가).
    // 무성으로 두면 "왜 매번 전량이지"를 디버깅할 수 없으므로 흔적을 남긴다.
    console.warn('[sync] checkpoint 저장 실패 — 다음 머지는 같은 구간을 재다운로드합니다:', err)
  }
}

/**
 * 체크포인트 리셋. uid 생략 시 모든 사용자분 제거 — 로컬 데이터를 통째로
 * 교체하는 흐름(백업 복원, 테스트 시드)은 uid를 모르는 컨텍스트에서 돌므로
 * 전체를 지운다. (clearAllData는 db.syncMeta.clear()로 직접 지운다 —
 * database.ts가 이 모듈을 임포트하면 순환 의존이 생기기 때문)
 */
export async function clearSyncCheckpoint(uid?: string): Promise<void> {
  try {
    if (uid) {
      await db.syncMeta.delete(keyFor(uid))
      return
    }
    await db.syncMeta.where('key').startsWith('checkpoint:').delete()
  } catch {
    // noop — 테이블이 아직 없으면 지울 것도 없다
  }
}
