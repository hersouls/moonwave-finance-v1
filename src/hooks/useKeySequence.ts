import { useEffect, useRef } from 'react'

interface KeySequence {
  keys: string[]
  callback: () => void
}

export function useKeySequence(sequences: KeySequence[], enabled = true, timeout = 500) {
  const buffer = useRef<string[]>([])
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    if (!enabled) return

    const handler = (e: KeyboardEvent) => {
      // Skip if user is typing in an input
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return
      }

      // Skip if modifier keys are held (let useKeyboardShortcut handle those)
      if (e.ctrlKey || e.metaKey || e.altKey) return

      const key = e.key.toLowerCase()
      buffer.current.push(key)

      // Clear buffer after timeout
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        buffer.current = []
      }, timeout)

      // Check for matching sequences
      for (const seq of sequences) {
        const seqKeys = seq.keys.map((k) => k.toLowerCase())
        const bufLen = buffer.current.length

        if (bufLen >= seqKeys.length) {
          const tail = buffer.current.slice(bufLen - seqKeys.length)
          if (tail.every((k, i) => k === seqKeys[i])) {
            e.preventDefault()
            buffer.current = []
            if (timerRef.current) clearTimeout(timerRef.current)
            seq.callback()
            return
          }
        }
      }
    }

    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('keydown', handler)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [sequences, enabled, timeout])
}
