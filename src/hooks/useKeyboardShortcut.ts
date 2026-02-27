import { useEffect } from 'react'

type KeyCombo = {
  key: string
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  meta?: boolean
}

export function useKeyboardShortcut(combo: KeyCombo, callback: () => void, enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return

    const handler = (e: KeyboardEvent) => {
      const matchesKey = e.key.toLowerCase() === combo.key.toLowerCase()
      const matchesCtrl = combo.ctrl ? (e.ctrlKey || e.metaKey) : true
      const matchesShift = combo.shift ? e.shiftKey : !e.shiftKey
      const matchesAlt = combo.alt ? e.altKey : !e.altKey

      if (matchesKey && matchesCtrl && matchesShift && matchesAlt) {
        e.preventDefault()
        callback()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [combo, callback, enabled])
}
