import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { db } from '@/services/database'
import { fullUpload, pauseRealtimeSync, resumeRealtimeSync } from '@/services/firestoreSync'

/**
 * Watches Dexie for changes and debounce-uploads to Firestore when user is logged in.
 * Uses Dexie's built-in observable hooks to detect any table mutation.
 */
export function useAutoSync() {
  const user = useAuthStore((s) => s.user)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!user) return

    const DEBOUNCE_MS = 5000

    const scheduleSync = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(async () => {
        try {
          // Pause real-time listeners to avoid echo loop
          pauseRealtimeSync()
          await fullUpload(user.uid)
        } catch (err) {
          console.error('[auto-sync] upload failed:', err)
        } finally {
          resumeRealtimeSync()
        }
      }, DEBOUNCE_MS)
    }

    // Dexie hooks: listen to creates, updates, deletes on all tables
    const tables = [
      db.members, db.assetCategories, db.assetItems, db.dailyValues,
      db.transactionCategories, db.transactions, db.budgets, db.goals,
      db.paymentMethodItems,
    ]

    const hookRemovers: (() => void)[] = []

    for (const table of tables) {
      const createHook = () => scheduleSync()
      const updateHook = () => scheduleSync()
      const deleteHook = () => scheduleSync()

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
      for (const remove of hookRemovers) {
        remove()
      }
    }
  }, [user])
}
