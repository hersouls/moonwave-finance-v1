import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { wakeFirestoreNetwork } from '@/lib/firebase'
import {
  flushOutbox,
  startRealtimeSync,
  getLastSnapshotAt,
} from '@/services/firestoreSync'
import { registerDevicePresence } from '@/services/deviceRegistry'

/**
 * 동기화 생존 관리 훅 (Sync v2).
 *
 * 업로드 트리거는 여기 없다 — 사용자 쓰기는 Dexie 훅 → 아웃박스 →
 * firestoreSync.requestPush()가 즉시(250ms 마이크로배치) 푸시한다.
 * 이 훅이 맡는 것은 연결 생존뿐:
 *
 *   - online 복귀: 네트워크 채널 wake + 리스너 신선도 검사 + 아웃박스 잔량 푸시
 *   - 포그라운드 복귀: wake + stale 리스너 강제 재구독 + presence 갱신
 *   - 60초 헬스폴: 에러 콜백 없이 무소음 사망한 리스너(모바일 슬립)를
 *     5분 무스냅샷 기준으로 감지해 강제 재시작
 */
export function useAutoSync() {
  const user = useAuthStore((s) => s.user)
  const healthCheckRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!user) return

    // 포그라운드/온라인 복귀 시 강제 재구독 임계 — 너무 짧으면 폰에서 앱을
    // 전환할 때마다(하루 수십 번) 전 리스너를 재구독해 읽기가 재과금된다.
    // 짧은 백그라운드는 리스너가 대개 생존하고, 진짜 죽은 채널은 5분 헬스폴이
    // 잡으므로 3분이면 충분하다. (transactions는 윈도우 리스너라 재구독 비용이
    // 작지만 나머지 15개 컬렉션은 전량 재과금이다.)
    const STALE_ON_FOCUS_MS = 3 * 60_000
    const STALE_FORCE_RESTART_MS = 5 * 60_000
    const HEALTH_POLL_MS = 60_000
    const PRESENCE_THROTTLE_MS = 5 * 60_000

    let lastPresenceAt = 0
    const heartbeatPresence = () => {
      const now = Date.now()
      if (now - lastPresenceAt < PRESENCE_THROTTLE_MS) return
      lastPresenceAt = now
      void registerDevicePresence(user.uid)
    }

    const snapshotAgeMs = () => {
      const last = getLastSnapshotAt()
      return last === 0 ? Infinity : Date.now() - last
    }

    // 온라인 복귀 — 죽은 네트워크 채널을 먼저 깨운다. 모바일 백그라운드에서
    // SDK가 비활성화한 연결은 enableNetwork 없이는 재구독해도 안 살아난다.
    const handleOnline = async () => {
      await wakeFirestoreNetwork()
      const force = snapshotAgeMs() > STALE_ON_FOCUS_MS
      startRealtimeSync(user.uid, force)
      void flushOutbox(user.uid) // 오프라인 동안 쌓인 아웃박스 잔량
      heartbeatPresence()
    }
    window.addEventListener('online', handleOnline)

    // 포그라운드 복귀: 리스너 생존 확인. 직전 구독이 stale하면 강제 재구독해
    // 슬립 동안 도착한 피어 변경이 흘러들어오게 한다.
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return
      void wakeFirestoreNetwork().then(() => {
        const force = snapshotAgeMs() > STALE_ON_FOCUS_MS
        startRealtimeSync(user.uid, force)
        heartbeatPresence()
      })
    }
    document.addEventListener('visibilitychange', handleVisibility)

    // 주기 헬스 프로브 — 에러 콜백 없이 죽은 리스너를 잡는다 (모바일 슬립이 전형).
    healthCheckRef.current = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return
      if (snapshotAgeMs() > STALE_FORCE_RESTART_MS) {
        console.warn('[auto-sync] listener appears stale, forcing restart')
        void wakeFirestoreNetwork().then(() => startRealtimeSync(user.uid, true))
      }
    }, HEALTH_POLL_MS)

    return () => {
      if (healthCheckRef.current) clearInterval(healthCheckRef.current)
      window.removeEventListener('online', handleOnline)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [user])
}
