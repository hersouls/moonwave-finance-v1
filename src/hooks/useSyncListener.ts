import { useEffect, useRef } from 'react'

type SyncableTable = 'members' | 'assetCategories' | 'assetItems' | 'dailyValues' | 'transactionCategories' | 'transactions' | 'budgets' | 'goals' | 'paymentMethodItems' | 'subscriptions'

/**
 * Listens for Firestore real-time sync updates and triggers a callback.
 * Optionally filters by specific table names.
 * Uses useRef to avoid re-registering the listener on every render.
 */
export function useSyncListener(callback: () => void, tables?: SyncableTable[]) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    const handler = (event: Event) => {
      if (tables && tables.length > 0) {
        const detail = (event as CustomEvent).detail
        if (!tables.includes(detail?.table)) return
      }
      callbackRef.current()
    }
    window.addEventListener('fin-sync-update', handler)
    return () => window.removeEventListener('fin-sync-update', handler)
  }, [tables])
}
