import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
  enableNetwork,
  type Firestore,
} from 'firebase/firestore'

const env = (key: string) => (import.meta.env[key] as string || '').trim()

const firebaseConfig = {
  apiKey: env('VITE_FIREBASE_API_KEY'),
  authDomain: env('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: env('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: env('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: env('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: env('VITE_FIREBASE_APP_ID'),
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)

// Firestore 설정 버전 — localCache/transport 설정이 바뀌면 올려서 이전
// IndexedDB 캐시를 정리한다(손상 캐시의 INTERNAL ASSERTION FAILED 예방).
// TDL_v1.0에서 검증된 운영 패턴.
const FIRESTORE_CONFIG_VERSION = 1

function clearStaleFirestoreCacheIfConfigChanged(): void {
  const CACHE_VERSION_KEY = 'fin_firestore_config_v'
  try {
    const stored = localStorage.getItem(CACHE_VERSION_KEY)
    const current = String(FIRESTORE_CONFIG_VERSION)
    if (stored === current) return
    if (stored !== null) {
      console.info(`[firebase] Firestore 설정 변경 (v${stored}→v${current}), 캐시 정리`)
      // fire-and-forget — 모듈 동기 초기화 경로라 await 불가. SDK는 캐시를
      // 동기 open하지 않고(첫 작업 시 비동기), 캐시 open 실패 시 자체적으로
      // memoryCache로 폴백하므로 삭제가 한 사이클 늦어도 다음 실행에서 정리된다.
      void indexedDB.databases?.().then((dbs) => {
        for (const d of dbs) {
          // Firestore 캐시만 삭제 — Auth DB(firebaseLocalStorage)는 보존
          if (d.name && d.name.includes('firestore') && !d.name.includes('firebaseLocalStorage')) {
            indexedDB.deleteDatabase(d.name)
          }
        }
      }).catch(() => {})
    }
    localStorage.setItem(CACHE_VERSION_KEY, current)
  } catch { /* localStorage 접근 불가(시크릿 모드 등) 무시 */ }
}

clearStaleFirestoreCacheIfConfigChanged()

// persistentLocalCache + forceLongPolling 조합 (TDL_v1.0 운영 검증):
//   - IndexedDB 캐시: resume token 보존 → 재연결 시 누락 없이 이어받기
//   - Long Polling: 매 요청이 독립 HTTP → 모바일 PWA에서 WebSocket이
//     에러 콜백 없이 무소음 사망하는 패턴 자체가 불가능해짐
// TDL이 겪은 실패 이력: 기본 WebSocket → 시간 경과 후 무소음 사망,
// memoryCache+forceLongPolling → resume token 미보존으로 시간 후 연결 사망.
let _firestore: Firestore
try {
  _firestore = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentSingleTabManager({}),
    }),
    experimentalForceLongPolling: true,
  })
} catch {
  // 다른 옵션으로 이미 초기화된 경우(HMR, 테스트 등)의 이중 초기화 폴백.
  // 주의: 캐시 open 실패는 여기서 잡히지 않는다 — SDK가 첫 작업 시 비동기로
  // 열고, 실패하면 자체 경로로 memoryCache 폴백한다.
  _firestore = getFirestore(app)
}
export const firestore = _firestore

/**
 * 백그라운드 복귀/네트워크 복구 시 Firestore 네트워크 채널을 명시적으로
 * 재활성화한다. 모바일 브라우저가 백그라운드에서 끊은 연결은 SDK가 스스로
 * 깨우지 못할 수 있다 — enableNetwork가 죽은 채널을 강제로 살린다.
 * 호출부(useAutoSync)는 이어서 리스너 staleness를 검사해 재구독한다.
 */
export async function wakeFirestoreNetwork(): Promise<void> {
  try {
    await enableNetwork(firestore)
  } catch {
    // 이미 활성 상태이거나 종료 중 — 무시
  }
}
