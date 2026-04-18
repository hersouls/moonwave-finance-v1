import { useEffect } from 'react'
import { addDays, format } from 'date-fns'

interface Options {
  enabled: boolean
  focusedDate: string | null
  onNavigate: (dateStr: string) => void
  onToday: () => void
  onPrevMonth: () => void
  onNextMonth: () => void
  onSelect?: () => void
  onEscape?: () => void
}

/**
 * Keyboard controls for the calendar grid.
 *
 * Arrow keys: move focus by 1 day (←→) or 7 days (↑↓).
 * Home/End: jump to start/end of week.
 * PageUp/PageDown: move focus ±1 month.
 * T: today · P: prev month · N: next month · Enter: select · Esc: clear selection.
 */
export function useCalendarKeyboard({
  enabled,
  focusedDate,
  onNavigate,
  onToday,
  onPrevMonth,
  onNextMonth,
  onSelect,
  onEscape,
}: Options) {
  useEffect(() => {
    if (!enabled) return
    const handleKey = (e: KeyboardEvent) => {
      // Ignore when typing in inputs
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return

      const key = e.key
      const current = focusedDate ? new Date(focusedDate) : new Date()

      const move = (days: number) => {
        const next = addDays(current, days)
        onNavigate(format(next, 'yyyy-MM-dd'))
        e.preventDefault()
      }

      switch (key) {
        case 'ArrowLeft':
          return move(-1)
        case 'ArrowRight':
          return move(1)
        case 'ArrowUp':
          return move(-7)
        case 'ArrowDown':
          return move(7)
        case 'Home':
          return move(-current.getDay())
        case 'End':
          return move(6 - current.getDay())
        case 'PageUp':
          e.preventDefault()
          return onPrevMonth()
        case 'PageDown':
          e.preventDefault()
          return onNextMonth()
        case 't':
        case 'T':
          e.preventDefault()
          return onToday()
        case 'p':
        case 'P':
          e.preventDefault()
          return onPrevMonth()
        case 'n':
        case 'N':
          e.preventDefault()
          return onNextMonth()
        case 'Enter':
          if (onSelect) {
            e.preventDefault()
            onSelect()
          }
          return
        case 'Escape':
          if (onEscape) {
            e.preventDefault()
            onEscape()
          }
          return
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [enabled, focusedDate, onNavigate, onToday, onPrevMonth, onNextMonth, onSelect, onEscape])
}
