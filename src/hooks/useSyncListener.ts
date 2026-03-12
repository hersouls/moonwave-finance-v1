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

  // Serialize tables to a stable string to avoid re-registering on every render
  const tablesKey = tables ? tables.join(',') : ''

  useEffect(() => {
    const tableList = tablesKey ? tablesKey.split(',') : null
    const handler = (event: Event) => {
      if (tableList && tableList.length > 0) {
        const detail = (event as CustomEvent).detail
        if (!tableList.includes(detail?.table)) return
      }
      callbackRef.current()
    }
    window.addEventListener('fin-sync-update', handler)
    return () => window.removeEventListener('fin-sync-update', handler)
  }, [tablesKey])
}
