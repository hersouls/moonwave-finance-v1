import { useRef, useCallback, useState, type TouchEvent as ReactTouchEvent } from 'react'
import { haptic } from '@/utils/haptic'

interface SwipeActionOptions {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  threshold?: number
}

interface SwipeActionReturn {
  offsetX: number
  isSwiping: boolean
  onTouchStart: (e: ReactTouchEvent) => void
  onTouchMove: (e: ReactTouchEvent) => void
  onTouchEnd: () => void
  reset: () => void
}

export function useSwipeAction({
  onSwipeLeft,
  onSwipeRight,
  threshold = 80,
}: SwipeActionOptions): SwipeActionReturn {
  const [offsetX, setOffsetX] = useState(0)
  const [isSwiping, setIsSwiping] = useState(false)
  const startX = useRef(0)
  const startY = useRef(0)
  const isTracking = useRef(false)
  const hasTriggeredHaptic = useRef(false)

  const onTouchStart = useCallback((e: ReactTouchEvent) => {
    startX.current = e.touches[0].clientX
    startY.current = e.touches[0].clientY
    isTracking.current = true
    hasTriggeredHaptic.current = false
    setIsSwiping(false)
  }, [])

  const onTouchMove = useCallback((e: ReactTouchEvent) => {
    if (!isTracking.current) return

    const diffX = e.touches[0].clientX - startX.current
    const diffY = e.touches[0].clientY - startY.current

    // If vertical scroll is dominant, stop tracking
    if (!isSwiping && Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > 10) {
      isTracking.current = false
      return
    }

    if (Math.abs(diffX) > 10) {
      setIsSwiping(true)
    }

    // Clamp: only allow left if onSwipeLeft, right if onSwipeRight
    let clamped = diffX
    if (!onSwipeRight && clamped > 0) clamped = 0
    if (!onSwipeLeft && clamped < 0) clamped = 0

    // Add resistance past threshold
    if (Math.abs(clamped) > threshold) {
      const over = Math.abs(clamped) - threshold
      clamped = (clamped > 0 ? 1 : -1) * (threshold + over * 0.3)

      if (!hasTriggeredHaptic.current) {
        hasTriggeredHaptic.current = true
        haptic('light')
      }
    }

    setOffsetX(clamped)
  }, [onSwipeLeft, onSwipeRight, threshold, isSwiping])

  const onTouchEnd = useCallback(() => {
    isTracking.current = false

    if (Math.abs(offsetX) >= threshold) {
      if (offsetX < 0 && onSwipeLeft) {
        haptic('medium')
        onSwipeLeft()
      } else if (offsetX > 0 && onSwipeRight) {
        haptic('medium')
        onSwipeRight()
      }
    }

    setOffsetX(0)
    setIsSwiping(false)
  }, [offsetX, threshold, onSwipeLeft, onSwipeRight])

  const reset = useCallback(() => {
    setOffsetX(0)
    setIsSwiping(false)
  }, [])

  return { offsetX, isSwiping, onTouchStart, onTouchMove, onTouchEnd, reset }
}
