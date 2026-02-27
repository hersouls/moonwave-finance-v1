import { create } from 'zustand'

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

const DISMISS_DURATION = 30 * 60 * 1000 // 30 minutes

export const usePwaUpdateStore = create<PwaUpdateState & PwaUpdateActions>((set, get) => ({
  isUpdateAvailable: false,
  waitingWorker: null,
  dismissedAt: null,

  showUpdate: (worker) => {
    const { dismissedAt } = get()

    // If dismissed recently, don't show again yet
    if (dismissedAt && Date.now() - dismissedAt < DISMISS_DURATION) {
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
