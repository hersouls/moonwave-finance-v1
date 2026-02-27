import { Outlet, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Sidebar } from './components/layout/Sidebar'
import { Header } from './components/layout/Header'
import { Footer } from './components/layout/Footer'
import { BottomNav } from './components/layout/BottomNav'
import { MobileNav } from './components/layout/MobileNav'
import { SettingsModal } from './components/layout/SettingsModal'
import { FAQModal } from './components/layout/FAQModal'
import { TermsModal } from './components/layout/TermsModal'
import { UndoToast } from './components/ui/UndoToast'
import { UpdateBanner } from './components/ui/UpdateBanner'
import { OfflineBanner } from './components/ui/OfflineBanner'
import { AppLoadingScreen } from './components/ui/AppLoadingScreen'
import { useSettingsStore } from './stores/settingsStore'
import { useUIStore } from './stores/uiStore'
import { useAuthStore } from './stores/authStore'
import { useUndoStore } from './stores/undoStore'
import { useOnlineStatus } from './hooks/useOnlineStatus'

export default function App() {
  const [isInitialized, setIsInitialized] = useState(false)
  const initSettings = useSettingsStore((s) => s.initialize)
  const isSidebarOpen = useUIStore((s) => s.isSidebarOpen)
  const isOnline = useOnlineStatus()

  useEffect(() => {
    const initApp = async () => {
      try {
        initSettings()
        useAuthStore.getState().initialize()
      } finally {
        setIsInitialized(true)
      }
    }
    initApp()
  }, [])

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        useUndoStore.getState().undo()
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        useUndoStore.getState().redo()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const location = useLocation()
  const setCurrentView = useUIStore((s) => s.setCurrentView)

  useEffect(() => {
    const path = location.pathname
    if (path === '/') setCurrentView('dashboard')
    else if (path.startsWith('/assets')) setCurrentView('assets')
    else if (path.startsWith('/liabilities')) setCurrentView('liabilities')
    else if (path === '/ledger') setCurrentView('ledger')
    else if (path === '/calendar') setCurrentView('calendar')
    else if (path === '/reports') setCurrentView('reports')
    else if (path === '/profile') setCurrentView('profile')
  }, [location.pathname, setCurrentView])

  if (!isInitialized) return <AppLoadingScreen />

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 flex flex-col">
      {!isOnline && <OfflineBanner />}
      <Sidebar />
      <div className={`flex-1 flex flex-col transition-all duration-300 ${isSidebarOpen ? 'lg:ml-64' : 'lg:ml-16'}`}>
        <Header />
        <main id="main-content" className="flex-1 pb-20 lg:pb-6">
          <Outlet />
        </main>
        <Footer />
      </div>
      <BottomNav />
      <MobileNav />
      <SettingsModal />
      <FAQModal />
      <TermsModal />
      <UndoToast />
      <UpdateBanner />
    </div>
  )
}
