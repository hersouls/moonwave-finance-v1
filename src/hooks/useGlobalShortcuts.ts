import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUIStore, type CurrentView } from '@/stores/uiStore'
import { useUndoStore } from '@/stores/undoStore'

function isTypingTarget(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null
  if (!t || !t.tagName) return false
  const tag = t.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable === true
}

/** g-chord navigation targets (press `g` then the key). */
const NAV: Record<string, { path: string; view?: CurrentView }> = {
  d: { path: '/', view: 'dashboard' },
  l: { path: '/ledger/expense', view: 'ledger' },
  a: { path: '/assets', view: 'assets' },
  b: { path: '/liabilities', view: 'assets' },
  s: { path: '/subscriptions', view: 'subscriptions' },
  i: { path: '/investments', view: 'investments' },
  r: { path: '/reports', view: 'reports' },
  c: { path: '/ledger/calendar', view: 'ledger' },
}

/**
 * App-wide keyboard layer (power-user / desktop):
 *  - Ctrl/Cmd+K : command palette (works even while typing)
 *  - Ctrl/Cmd+Z / Shift+Z / Y : undo / redo
 *  - g then {d,l,a,b,s,i,r,c} : navigate
 *  - n : new transaction · / : search · ? : shortcuts help
 * Single-key shortcuts are suppressed while typing in a field or when any
 * overlay/modal is open.
 */
export function useGlobalShortcuts() {
  const navigate = useNavigate()
  const gPending = useRef(false)
  const gTimer = useRef<number | null>(null)

  useEffect(() => {
    const store = useUIStore.getState
    const clearG = () => {
      gPending.current = false
      if (gTimer.current) {
        clearTimeout(gTimer.current)
        gTimer.current = null
      }
    }

    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()

      // Command palette — always available, even from inputs
      if (mod && key === 'k') {
        e.preventDefault()
        store().toggleCommandPalette()
        return
      }
      // Undo / redo
      if (mod && key === 'z' && !e.shiftKey) {
        e.preventDefault()
        useUndoStore.getState().undo()
        return
      }
      if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) {
        e.preventDefault()
        useUndoStore.getState().redo()
        return
      }

      if (mod || e.altKey) return
      if (isTypingTarget(e.target)) return

      const s = store()
      const overlayOpen =
        s.isCommandPaletteOpen || s.isSearchModalOpen || s.isSettingsModalOpen ||
        s.isFAQModalOpen || s.isTermsModalOpen || s.isShortcutsModalOpen || s.isMobileMenuOpen ||
        s.isTransactionCreateModalOpen || s.isAssetCreateModalOpen || s.isLiabilityCreateModalOpen ||
        s.isSubscriptionCreateModalOpen || s.isTransactionEditModalOpen || s.isAssetEditModalOpen ||
        s.isSubscriptionEditModalOpen
      if (overlayOpen) {
        clearG()
        return
      }

      // g-chord second key
      if (gPending.current && NAV[key]) {
        e.preventDefault()
        clearG()
        const dest = NAV[key]
        if (dest.view) store().setCurrentView(dest.view)
        navigate(dest.path)
        return
      }
      clearG()

      if (key === 'g') {
        gPending.current = true
        gTimer.current = window.setTimeout(clearG, 1200)
        return
      }
      if (key === '?') {
        e.preventDefault()
        store().openShortcutsModal()
        return
      }
      if (key === '/') {
        e.preventDefault()
        store().openSearchModal()
        return
      }
      if (key === 'n') {
        e.preventDefault()
        navigate('/ledger/expense')
        window.setTimeout(() => store().openTransactionCreateModal(), 60)
        return
      }
    }

    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      clearG()
    }
  }, [navigate])
}
