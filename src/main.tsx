import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { router } from './router'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { usePwaUpdateStore } from './stores/pwaUpdateStore'
import { PWA_UPDATE_INTERVAL_MS } from './utils/constants'
import './index.css'

// Service Worker for PWA
if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    // Reload only when the new SW has taken control (safe timing)
    let refreshing = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return
      refreshing = true
      window.location.reload()
    })

    window.addEventListener('load', async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js')

        // Handle waiting worker that already exists (e.g. from previous visit)
        if (registration.waiting) {
          usePwaUpdateStore.getState().showUpdate(registration.waiting)
        }

        // Detect new updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing
          if (!newWorker) return

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              usePwaUpdateStore.getState().showUpdate(newWorker)
            }
          })
        })

        // Check for updates immediately + every 10 minutes
        registration.update()
        setInterval(() => registration.update(), PWA_UPDATE_INTERVAL_MS)

        // Also check on tab focus
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            registration.update()
          }
        })
      } catch (error) {
        console.error('SW registration failed:', error)
      }
    })
  } else {
    // Development: Unregister SW to prevent caching issues
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => registration.unregister())
    })
  }
}

// PWA Install Prompt handling
let deferredPrompt: BeforeInstallPromptEvent | null = null

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferredPrompt = e as BeforeInstallPromptEvent
  window.dispatchEvent(new CustomEvent('pwaInstallAvailable'))
})

  // Export install function
  ;(window as Window & { installPWA?: () => Promise<boolean> }).installPWA = async () => {
    if (!deferredPrompt) return false
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    deferredPrompt = null
    return outcome === 'accepted'
  }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  </StrictMode>
)
