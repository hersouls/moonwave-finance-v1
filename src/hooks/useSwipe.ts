import { useRef, useCallback, type TouchEvent } from 'react'

interface SwipeOptions {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  threshold?: number
}

export function useSwipe({ onSwipeLeft, onSwipeRight, threshold = 50 }: SwipeOptions) {
  const touchStartX = useRef(0)
  const touchEndX = useRef(0)

  const handleTouchStart = useCallback((e: TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }, [])

  const handleTouchMove = useCallback((e: TouchEvent) => {
    touchEndX.current = e.touches[0].clientX
  }, [])

  const handleTouchEnd = useCallback(() => {
    const diff = touchStartX.current - touchEndX.current
    if (Math.abs(diff) >= threshold) {
      if (diff > 0 && onSwipeLeft) onSwipeLeft()
      if (diff < 0 && onSwipeRight) onSwipeRight()
    }
    touchStartX.current = 0
    touchEndX.current = 0
  }, [onSwipeLeft, onSwipeRight, threshold])

  return {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
  }
}
