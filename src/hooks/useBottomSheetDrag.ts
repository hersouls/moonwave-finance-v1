import { useRef, useCallback, type RefObject, type TouchEvent as ReactTouchEvent } from 'react'

interface BottomSheetDragReturn {
  handleRef: RefObject<HTMLDivElement | null>
  onTouchStart: (e: ReactTouchEvent) => void
  onTouchMove: (e: ReactTouchEvent) => void
  onTouchEnd: () => void
}

export function useBottomSheetDrag(
  onClose: () => void,
  panelRef: RefObject<HTMLElement | null>,
  threshold = 100
): BottomSheetDragReturn {
  const handleRef = useRef<HTMLDivElement>(null)
  const startY = useRef(0)
  const currentY = useRef(0)
  const isDragging = useRef(false)

  const onTouchStart = useCallback((e: ReactTouchEvent) => {
    // Only allow drag from the handle area (top 40px of panel)
    const touch = e.touches[0]
    const panel = panelRef.current
    if (!panel) return

    const panelRect = panel.getBoundingClientRect()
    const touchRelativeY = touch.clientY - panelRect.top

    if (touchRelativeY > 40) return

    isDragging.current = true
    startY.current = touch.clientY
    currentY.current = 0

    panel.style.transition = 'none'
  }, [panelRef])

  const onTouchMove = useCallback((e: ReactTouchEvent) => {
    if (!isDragging.current) return

    const panel = panelRef.current
    if (!panel) return

    const diff = e.touches[0].clientY - startY.current
    currentY.current = Math.max(0, diff)

    panel.style.transform = `translateY(${currentY.current}px)`
  }, [panelRef])

  const onTouchEnd = useCallback(() => {
    if (!isDragging.current) return
    isDragging.current = false

    const panel = panelRef.current
    if (!panel) return

    panel.style.transition = 'transform 200ms ease-out'

    if (currentY.current > threshold) {
      panel.style.transform = `translateY(100%)`
      setTimeout(onClose, 200)
    } else {
      panel.style.transform = 'translateY(0)'
    }

    currentY.current = 0
  }, [onClose, panelRef, threshold])

  return { handleRef, onTouchStart, onTouchMove, onTouchEnd }
}
