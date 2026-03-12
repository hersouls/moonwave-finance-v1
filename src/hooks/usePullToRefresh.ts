import { useRef, useCallback, useState, useEffect, type RefObject } from 'react'
import { haptic } from '@/utils/haptic'

interface PullToRefreshOptions {
  onRefresh: () => Promise<void>
  threshold?: number
  scrollRef?: RefObject<HTMLElement | null>
}

interface PullToRefreshReturn {
  pullDistance: number
  isRefreshing: boolean
  isPulling: boolean
  containerProps: {
    onTouchStart: (e: TouchEvent) => void
    onTouchMove: (e: TouchEvent) => void
    onTouchEnd: () => void
  }
}

export function usePullToRefresh({
  onRefresh,
  threshold = 80,
  scrollRef,
}: PullToRefreshOptions): PullToRefreshReturn {
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isPulling, setIsPulling] = useState(false)

  const startY = useRef(0)
  const isTracking = useRef(false)
  const hasTriggeredHaptic = useRef(false)

  const isMobile = typeof window !== 'undefined' && 'ontouchstart' in window

  const getScrollTop = useCallback(() => {
    if (scrollRef?.current) return scrollRef.current.scrollTop
    return window.scrollY || document.documentElement.scrollTop
  }, [scrollRef])

  const onTouchStart = useCallback((e: TouchEvent) => {
    if (isRefreshing || !isMobile) return
    if (getScrollTop() > 0) return

    startY.current = e.touches[0].clientY
    isTracking.current = true
    hasTriggeredHaptic.current = false
  }, [isRefreshing, isMobile, getScrollTop])

  const onTouchMove = useCallback((e: TouchEvent) => {
    if (!isTracking.current || isRefreshing) return

    const diff = e.touches[0].clientY - startY.current
    if (diff < 0) {
      isTracking.current = false
      setPullDistance(0)
      setIsPulling(false)
      return
    }

    // Add resistance
    const distance = Math.min(diff * 0.4, threshold * 1.5)
    setPullDistance(distance)
    setIsPulling(true)

    if (distance >= threshold && !hasTriggeredHaptic.current) {
      hasTriggeredHaptic.current = true
      haptic('light')
    }
  }, [isRefreshing, threshold])

  const onTouchEnd = useCallback(async () => {
    if (!isTracking.current) return
    isTracking.current = false

    if (pullDistance >= threshold) {
      setIsRefreshing(true)
      haptic('medium')
      try {
        await onRefresh()
      } finally {
        setIsRefreshing(false)
      }
    }

    setPullDistance(0)
    setIsPulling(false)
  }, [pullDistance, threshold, onRefresh])

  useEffect(() => {
    if (!isMobile) return

    const target = scrollRef?.current || document
    target.addEventListener('touchstart', onTouchStart as EventListener, { passive: true })
    target.addEventListener('touchmove', onTouchMove as EventListener, { passive: true })
    target.addEventListener('touchend', onTouchEnd as EventListener)

    return () => {
      target.removeEventListener('touchstart', onTouchStart as EventListener)
      target.removeEventListener('touchmove', onTouchMove as EventListener)
      target.removeEventListener('touchend', onTouchEnd as EventListener)
    }
  }, [isMobile, onTouchStart, onTouchMove, onTouchEnd, scrollRef])

  return { pullDistance, isRefreshing, isPulling, containerProps: { onTouchStart, onTouchMove, onTouchEnd } }
}
