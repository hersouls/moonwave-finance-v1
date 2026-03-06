import { useEffect } from 'react'
import { useIOSInstallStore } from '@/stores/iosInstallStore'

export function useIOSInstallPrompt() {
  const initialize = useIOSInstallStore((s) => s.initialize)
  const shouldShow = useIOSInstallStore((s) => s.shouldShow)
  const dismiss = useIOSInstallStore((s) => s.dismiss)
  const dismissPermanently = useIOSInstallStore((s) => s.dismissPermanently)

  useEffect(() => {
    initialize()
  }, [initialize])

  return { shouldShow, dismiss, dismissPermanently }
}
