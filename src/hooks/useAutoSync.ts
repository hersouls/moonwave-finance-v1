import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { db, isSyncWriteContext } from '@/services/database'
import { wakeFirestoreNetwork } from '@/lib/firebase'
import {
  incrementalUpload,
  startRealtimeSync,
  getLastSnapshotAt,
} from '@/services/firestoreSync'

/**
 * Watches Dexie for changes and debounce-uploads to Firestore when user is logged in.
 * Uses incremental sync: only changed records are uploaded (via syncChangeLog).
 *
 * Listener health: polls every 60s while the tab is visible. If no Firestore
 * snapshot has fired in the last 5 minutes, the listeners are considered
 * silently dead (mobile sleep, network blip, expired token) and we force a
 * teardown + re-subscribe. Visibility and online events also force a restart
 * when their last-snapshot age exceeds 30s, so foregrounding the tab quickly
 * heals a half-broken connection.
 */
export function useAutoSync() {
  const user = useAuthStore((s) => s.user)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const healthCheckRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const syncInProgressRef = useRef(false)

  useEffect(() => {
    if (!user) return

    const DEBOUNCE_MS = 5000
    const STALE_ON_FOCUS_MS = 30_000
    const STALE_FORCE_RESTART_MS = 5 * 60_000
    const HEALTH_POLL_MS = 60_000

    const scheduleSync = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(async () => {
        // 업로드 진행 중이면 버리지 말고 재예약 — 기존에는 그냥 return해서
        // 진행 중 발생한 변경이 다음 사용자 쓰기 전까지 업로드되지 않았다.
        if (syncInProgressRef.current) {
          scheduleSync()
          return
        }
        syncInProgressRef.current = true
        try {
          await incrementalUpload(user.uid)
        } catch (err) {
          console.error('[auto-sync] upload failed:', err)
        } finally {
          syncInProgressRef.current = false
        }
      }, DEBOUNCE_MS)
    }

    const snapshotAgeMs = () => {
      const last = getLastSnapshotAt()
      return last === 0 ? Infinity : Date.now() - last
    }

    // Sync when coming back online — uploads offline changes and force-restarts
    // listeners if the prior subscription has been silent for too long.
    const handleOnline = async () => {
      // 죽은 네트워크 채널을 먼저 깨운다 — 모바일 백그라운드에서 SDK가
      // 비활성화한 연결은 enableNetwork 없이는 재구독해도 안 살아날 수 있다.
      await wakeFirestoreNetwork()
      const force = snapshotAgeMs() > STALE_ON_FOCUS_MS
      startRealtimeSync(user.uid, force)

      try {
        const pendingCount = await db.syncChangeLog
          .where('processed').equals(0)
          .count()
        if (pendingCount > 0) {
          console.log(`[auto-sync] online: ${pendingCount} pending change(s), scheduling sync`)
          scheduleSync()
        }
      } catch {
        scheduleSync()
      }
    }
    window.addEventListener('online', handleOnline)

    // Foreground: ensure listeners are alive. startRealtimeSync is a no-op
    // unless the prior subscription has gone stale, in which case we force
    // a re-subscribe so peer changes that arrived during sleep can flow in.
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return
      void wakeFirestoreNetwork().then(() => {
        const force = snapshotAgeMs() > STALE_ON_FOCUS_MS
        startRealtimeSync(user.uid, force)
      })
    }
    document.addEventListener('visibilitychange', handleVisibility)

    // Periodic health probe. Catches silently dead listeners that never throw
    // an error callback (mobile sleep is the typical cause).
    healthCheckRef.current = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return
      if (snapshotAgeMs() > STALE_FORCE_RESTART_MS) {
        console.warn('[auto-sync] listener appears stale, forcing restart')
        void wakeFirestoreNetwork().then(() => startRealtimeSync(user.uid, true))
      }
    }, HEALTH_POLL_MS)

    // Dexie hooks: listen to creates, updates, deletes on ALL 15 synced tables.
    // (빠진 테이블의 쓰기는 변경로그에는 남지만 업로드 디바운스를 깨우지
    // 못해 다음 다른 쓰기/online 이벤트까지 업로드가 지연된다)
    const tables = [
      db.members, db.assetCategories, db.assetItems, db.dailyValues,
      db.transactionCategories, db.transactions, db.budgets, db.goals,
      db.paymentMethodItems, db.subscriptions, db.loans,
      db.investmentTrades, db.dividends, db.accountInterests, db.merchantAliases,
    ]

    const hookRemovers: (() => void)[] = []

    for (const table of tables) {
      // 동기화 인제스트의 echo는 업로드를 깨우지 않는다 — 훅은 자신이 속한
      // 트랜잭션의 마커(또는 레거시 전역 플래그)로 출처를 판별한다.
      const createHook = () => { if (!isSyncWriteContext()) scheduleSync() }
      const updateHook = () => { if (!isSyncWriteContext()) scheduleSync() }
      const deleteHook = () => { if (!isSyncWriteContext()) scheduleSync() }

      table.hook('creating', createHook)
      table.hook('updating', updateHook)
      table.hook('deleting', deleteHook)

      hookRemovers.push(
        () => table.hook('creating').unsubscribe(createHook),
        () => table.hook('updating').unsubscribe(updateHook),
        () => table.hook('deleting').unsubscribe(deleteHook),
      )
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (healthCheckRef.current) clearInterval(healthCheckRef.current)
      window.removeEventListener('online', handleOnline)
      document.removeEventListener('visibilitychange', handleVisibility)
      for (const remove of hookRemovers) {
        remove()
      }
    }
  }, [user])
}
