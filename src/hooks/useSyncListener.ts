import { useEffect, useRef } from 'react'

type SyncableTable = 'members' | 'assetCategories' | 'assetItems' | 'dailyValues' | 'transactionCategories' | 'transactions' | 'budgets' | 'goals' | 'paymentMethodItems' | 'subscriptions' | 'loans' | 'investmentTrades' | 'dividends' | 'accountInterests' | 'merchantAliases'

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
    let timer: ReturnType<typeof setTimeout> | null = null
    const handler = (event: Event) => {
      if (tableList && tableList.length > 0) {
        const detail = (event as CustomEvent).detail
        if (!tableList.includes(detail?.table)) return
      }
      // Coalesce bursty sync echoes into a single quiet reload. One user action
      // (e.g. a value projection writing ~1.6k daily rows) echoes back from
      // Firestore as many snapshot events across multiple tables; firing
      // loadData on each one causes visible flicker. Debounce so the whole
      // burst settles into one background refresh.
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => { timer = null; callbackRef.current() }, 250)
    }
    window.addEventListener('fin-sync-update', handler)
    return () => {
      window.removeEventListener('fin-sync-update', handler)
      if (timer) clearTimeout(timer)
    }
  }, [tablesKey])
}
