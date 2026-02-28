import { create } from 'zustand'
import { PWA_DISMISS_DURATION_MS } from '@/utils/constants'

interface PwaUpdateState {
  isUpdateAvailable: boolean
  waitingWorker: ServiceWorker | null
  dismissedAt: number | null
}

interface PwaUpdateActions {
  showUpdate: (worker: ServiceWorker) => void
  dismissUpdate: () => void
  acceptUpdate: () => void
}

export const usePwaUpdateStore = create<PwaUpdateState & PwaUpdateActions>((set, get) => ({
  isUpdateAvailable: false,
  waitingWorker: null,
  dismissedAt: null,

  showUpdate: (worker) => {
    const { dismissedAt } = get()

    // If dismissed recently, don't show again yet
    if (dismissedAt && Date.now() - dismissedAt < PWA_DISMISS_DURATION_MS) {
      // Store the worker reference for later re-display
      set({ waitingWorker: worker })
      return
    }

    set({ isUpdateAvailable: true, waitingWorker: worker, dismissedAt: null })
  },

  dismissUpdate: () => {
    set({ isUpdateAvailable: false, dismissedAt: Date.now() })
  },

  acceptUpdate: () => {
    const { waitingWorker } = get()
    if (waitingWorker) {
      waitingWorker.postMessage('skipWaiting')
    }
    set({ isUpdateAvailable: false, waitingWorker: null, dismissedAt: null })
  },
}))
