import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'fin:subscriptions:hidden:v1'

/**
 * Tracks subscriptions the user has marked as "no longer used".
 * Persisted to localStorage; keyed by the detection's normalized merchant key
 * so the same key stays hidden even if the displayed name changes slightly.
 *
 * Stored as a JSON string array.
 */
export function useHiddenSubscriptions() {
  const [hidden, setHidden] = useState<Set<string>>(() => {
    if (typeof localStorage === 'undefined') return new Set()
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return new Set()
      const arr = JSON.parse(raw)
      return new Set(Array.isArray(arr) ? arr.filter((x: unknown): x is string => typeof x === 'string') : [])
    } catch {
      return new Set()
    }
  })

  const persist = useCallback((next: Set<string>) => {
    if (typeof localStorage === 'undefined') return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(next)))
    } catch {
      // ignore quota errors
    }
  }, [])

  const hide = useCallback((key: string) => {
    setHidden(prev => {
      if (prev.has(key)) return prev
      const next = new Set(prev)
      next.add(key)
      persist(next)
      return next
    })
  }, [persist])

  const unhide = useCallback((key: string) => {
    setHidden(prev => {
      if (!prev.has(key)) return prev
      const next = new Set(prev)
      next.delete(key)
      persist(next)
      return next
    })
  }, [persist])

  const isHidden = useCallback((key: string) => hidden.has(key), [hidden])

  // Cross-tab sync
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return
      try {
        const arr = e.newValue ? JSON.parse(e.newValue) : []
        setHidden(new Set(Array.isArray(arr) ? arr.filter((x: unknown): x is string => typeof x === 'string') : []))
      } catch {
        // ignore
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  return { hidden, hide, unhide, isHidden, count: hidden.size }
}
