import { useEffect, useRef, useState } from 'react'

interface PullToRefreshOptions {
  /** Threshold in px before refresh is triggered */
  threshold?: number
  /** Maximum pull distance (rubber band cap) */
  max?: number
  /** Disable on desktop (hover: hover) */
  disableOnDesktop?: boolean
  /** Callback when pull threshold is released */
  onRefresh: () => Promise<void> | void
}

interface PullToRefreshState {
  /** Current pull distance (0..max) */
  distance: number
  /** Progress toward threshold (0..1) */
  progress: number
  /** Whether user is actively dragging */
  pulling: boolean
  /** Whether refresh handler is running */
  refreshing: boolean
}

/**
 * Native-feeling pull-to-refresh hook (mobile).
 * Listens on the window's scrollable root and tracks touchstart/move/end.
 * Respects prefers-reduced-motion (returns no-op state).
 */
export function usePullToRefresh({
  threshold = 64,
  max = 140,
  disableOnDesktop = true,
  onRefresh,
}: PullToRefreshOptions): PullToRefreshState {
  const [distance, setDistance] = useState(0)
  const [pulling, setPulling] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef<number | null>(null)
  const active = useRef(false)

  useEffect(() => {
    if (disableOnDesktop && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      return
    }
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) return

    const onTouchStart = (e: TouchEvent) => {
      // Only trigger at top of scroll
      if ((document.scrollingElement?.scrollTop ?? window.scrollY) > 0) return
      if (refreshing) return
      startY.current = e.touches[0].clientY
      active.current = true
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!active.current || startY.current === null) return
      const dy = e.touches[0].clientY - startY.current
      if (dy <= 0) {
        setDistance(0)
        setPulling(false)
        return
      }
      // Rubber-band easing
      const eased = Math.min(max, Math.pow(dy, 0.85))
      setDistance(eased)
      setPulling(true)
    }

    const onTouchEnd = async () => {
      if (!active.current) return
      active.current = false
      startY.current = null
      const d = distance
      setPulling(false)
      if (d >= threshold && !refreshing) {
        setRefreshing(true)
        setDistance(threshold * 0.65)
        try {
          await onRefresh()
        } finally {
          setRefreshing(false)
          setDistance(0)
        }
      } else {
        setDistance(0)
      }
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    window.addEventListener('touchcancel', onTouchEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [distance, refreshing, threshold, max, disableOnDesktop, onRefresh])

  return {
    distance,
    progress: Math.min(1, distance / threshold),
    pulling,
    refreshing,
  }
}
