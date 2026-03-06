import { create } from 'zustand'
import {
  IOS_INSTALL_DISMISS_DURATION_MS,
  IOS_INSTALL_DISMISSED_KEY,
} from '@/utils/constants'

interface IOSInstallState {
  shouldShow: boolean
  isIOSSafari: boolean
  isStandalone: boolean
  initialize: () => void
  dismiss: () => void
  dismissPermanently: () => void
}

export const useIOSInstallStore = create<IOSInstallState>()((set) => ({
  shouldShow: false,
  isIOSSafari: false,
  isStandalone: false,

  initialize: () => {
    const ua = navigator.userAgent

    // Detect iOS (including iPadOS reporting as Mac)
    const isIOS =
      /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

    // Detect Safari specifically (exclude Chrome, Firefox, Edge, Opera on iOS)
    const isSafari =
      isIOS &&
      /Safari/.test(ua) &&
      !/CriOS/.test(ua) &&
      !/FxiOS/.test(ua) &&
      !/OPiOS/.test(ua) &&
      !/EdgiOS/.test(ua)

    // Detect standalone (already installed as PWA)
    const isStandalone =
      (navigator as any).standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches

    // Check dismiss state from localStorage
    let dismissed = false
    try {
      const raw = localStorage.getItem(IOS_INSTALL_DISMISSED_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed.permanent) {
          dismissed = true
        } else if (parsed.until && Date.now() < parsed.until) {
          dismissed = true
        }
      }
    } catch { /* ignore */ }

    set({
      isIOSSafari: isSafari,
      isStandalone,
      shouldShow: isSafari && !isStandalone && !dismissed,
    })
  },

  dismiss: () => {
    localStorage.setItem(
      IOS_INSTALL_DISMISSED_KEY,
      JSON.stringify({ permanent: false, until: Date.now() + IOS_INSTALL_DISMISS_DURATION_MS })
    )
    set({ shouldShow: false })
  },

  dismissPermanently: () => {
    localStorage.setItem(
      IOS_INSTALL_DISMISSED_KEY,
      JSON.stringify({ permanent: true })
    )
    set({ shouldShow: false })
  },
}))
