import { useEffect } from 'react'

/**
 * Calls `onEscape` when the Escape key is pressed while `enabled` is true.
 * Used to dismiss bottom sheets / dialogs via keyboard (WCAG 2.1.2).
 */
export function useEscapeKey(onEscape: () => void, enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onEscape()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onEscape, enabled])
}
