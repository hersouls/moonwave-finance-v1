import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { db } from '@/services/database'
import { incrementalUpload, getIsSyncWriting, startRealtimeSync } from '@/services/firestoreSync'

/**
 * Watches Dexie for changes and debounce-uploads to Firestore when user is logged in.
 * Uses incremental sync: only changed records are uploaded (via syncChangeLog).
 */
export function useAutoSync() {
  const user = useAuthStore((s) => s.user)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const syncInProgressRef = useRef(false)

  useEffect(() => {
    if (!user) return

    const DEBOUNCE_MS = 5000

    const scheduleSync = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(async () => {
        if (syncInProgressRef.current) return
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

    // Sync when coming back online (uploads offline changes + restart listeners)
    const handleOnline = async () => {
      startRealtimeSync(user.uid)

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

    // Ensure listeners are alive when tab becomes visible
    // startRealtimeSync is a no-op if already active for this uid
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        startRealtimeSync(user.uid)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    // Dexie hooks: listen to creates, updates, deletes on all tables
    const tables = [
      db.members, db.assetCategories, db.assetItems, db.dailyValues,
      db.transactionCategories, db.transactions, db.budgets, db.goals,
      db.paymentMethodItems, db.subscriptions, db.loans,
    ]

    const hookRemovers: (() => void)[] = []

    for (const table of tables) {
      const createHook = () => { if (!getIsSyncWriting()) scheduleSync() }
      const updateHook = () => { if (!getIsSyncWriting()) scheduleSync() }
      const deleteHook = () => { if (!getIsSyncWriting()) scheduleSync() }

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
      window.removeEventListener('online', handleOnline)
      document.removeEventListener('visibilitychange', handleVisibility)
      for (const remove of hookRemovers) {
        remove()
      }
    }
  }, [user])
}
