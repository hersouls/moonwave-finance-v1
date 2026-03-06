import { useEffect } from 'react'

type SyncableTable = 'members' | 'assetCategories' | 'assetItems' | 'dailyValues' | 'transactionCategories' | 'transactions' | 'budgets' | 'goals' | 'paymentMethodItems' | 'subscriptions'

/**
 * Listens for Firestore real-time sync updates and triggers a callback.
 * Optionally filters by specific table names.
 */
export function useSyncListener(callback: () => void, tables?: SyncableTable[]) {
  useEffect(() => {
    const handler = (event: Event) => {
      if (tables && tables.length > 0) {
        const detail = (event as CustomEvent).detail
        if (!tables.includes(detail?.table)) return
      }
      callback()
    }
    window.addEventListener('fin-sync-update', handler)
    return () => window.removeEventListener('fin-sync-update', handler)
  }, [callback, tables])
}
