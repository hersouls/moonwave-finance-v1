import { useEffect, useRef, useState, type ReactNode } from 'react'

interface LiveRegionProps {
  children: ReactNode
  politeness?: 'polite' | 'assertive'
  clearAfter?: number
  className?: string
}

/**
 * Announces dynamic content changes to screen readers.
 * Content is visually hidden but available to assistive technology.
 */
export function LiveRegion({
  children,
  politeness = 'polite',
  clearAfter,
  className,
}: LiveRegionProps) {
  const [content, setContent] = useState<ReactNode>(children)
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    setContent(children)

    if (clearAfter) {
      timeoutRef.current = setTimeout(() => setContent(null), clearAfter)
      return () => clearTimeout(timeoutRef.current)
    }
  }, [children, clearAfter])

  return (
    <div
      role="status"
      aria-live={politeness}
      aria-atomic="true"
      className={className ?? 'sr-only'}
    >
      {content}
    </div>
  )
}

/**
 * Visually hidden wrapper for screen-reader-only content.
 */
export function ScreenReaderOnly({ children }: { children: ReactNode }) {
  return (
    <span className="sr-only">{children}</span>
  )
}
