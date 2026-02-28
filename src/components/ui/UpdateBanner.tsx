import { useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import { usePwaUpdateStore } from '@/stores/pwaUpdateStore'
import { PWA_DISMISS_DURATION_MS } from '@/utils/constants'

export function UpdateBanner() {
  const isUpdateAvailable = usePwaUpdateStore((s) => s.isUpdateAvailable)
  const waitingWorker = usePwaUpdateStore((s) => s.waitingWorker)
  const dismissedAt = usePwaUpdateStore((s) => s.dismissedAt)
  const acceptUpdate = usePwaUpdateStore((s) => s.acceptUpdate)
  const dismissUpdate = usePwaUpdateStore((s) => s.dismissUpdate)

  // Re-show banner after dismiss duration expires
  useEffect(() => {
    if (!dismissedAt || !waitingWorker) return

    const remaining = PWA_DISMISS_DURATION_MS - (Date.now() - dismissedAt)
    if (remaining <= 0) {
      usePwaUpdateStore.setState({ isUpdateAvailable: true, dismissedAt: null })
      return
    }

    const timer = setTimeout(() => {
      usePwaUpdateStore.setState({ isUpdateAvailable: true, dismissedAt: null })
    }, remaining)

    return () => clearTimeout(timer)
  }, [dismissedAt, waitingWorker])

  // Also re-check on visibility change (tab focus)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return
      const state = usePwaUpdateStore.getState()
      if (!state.waitingWorker || state.isUpdateAvailable) return
      if (state.dismissedAt && Date.now() - state.dismissedAt >= PWA_DISMISS_DURATION_MS) {
        usePwaUpdateStore.setState({ isUpdateAvailable: true, dismissedAt: null })
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  if (!isUpdateAvailable) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-[var(--z-overlay)] animate-[slideInFromTop_0.3s_ease-out]">
      <div className="mx-auto max-w-lg px-4 pt-3 pb-2">
        <div className="flex items-center gap-3 px-4 py-3 bg-primary-600 dark:bg-primary-700 text-white rounded-xl shadow-2xl">
          <RefreshCw className="w-4 h-4 shrink-0" />
          <span className="text-sm flex-1">새 버전이 있습니다.</span>
          <button
            type="button"
            onClick={acceptUpdate}
            className="px-3 py-1 text-sm font-medium bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
          >
            업데이트
          </button>
          <button
            type="button"
            onClick={dismissUpdate}
            className="text-white/60 hover:text-white/90 text-xs"
          >
            나중에
          </button>
        </div>
      </div>
    </div>
  )
}
