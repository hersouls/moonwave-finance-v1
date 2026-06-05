import { useLocation } from 'react-router-dom'
import { useCallback, useEffect, useState } from 'react'
import { Sidebar } from './components/layout/Sidebar'
import { Header } from './components/layout/Header'
import { Footer } from './components/layout/Footer'
import { BottomNav } from './components/layout/BottomNav'
import { MobileNav } from './components/layout/MobileNav'
import { SettingsModal } from './components/settings/SettingsModal'
import { FAQModal } from './components/layout/FAQModal'
import { TermsModal } from './components/layout/TermsModal'
import { UndoToast } from './components/ui/UndoToast'
import { ToastContainer } from './components/ui/ToastContainer'
import { UpdateBanner } from './components/ui/UpdateBanner'
import { IOSInstallBanner } from './components/ui/IOSInstallBanner'
import { OfflineBanner } from './components/ui/OfflineBanner'
import { ReadOnlyBanner } from './components/ui/ReadOnlyBanner'
import { AppLoadingScreen } from './components/ui/AppLoadingScreen'
import { SearchModal } from './components/search/SearchModal'
import { PullToRefreshIndicator } from './components/ui/PullToRefreshIndicator'
import { CommandPalette } from './components/ui/CommandPalette'
import { KeyboardShortcutsModal } from './components/ui/KeyboardShortcutsModal'
import { AnimatedOutlet } from './components/ui/AnimatedOutlet'
import { SkipLink } from './components/ui/SkipLink'
import { OnboardingWizard } from './components/onboarding/OnboardingWizard'
import { useSettingsStore } from './stores/settingsStore'
import { useUIStore } from './stores/uiStore'
import { useAuthStore } from './stores/authStore'
import { useAssetStore } from './stores/assetStore'
import { useDailyValueStore } from './stores/dailyValueStore'
import { useSubscriptionStore } from './stores/subscriptionStore'
import { showBillingNotifications } from './services/notificationService'
import { useOnlineStatus } from './hooks/useOnlineStatus'
import { useAutoSync } from './hooks/useAutoSync'
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts'
import { usePullToRefresh } from './hooks/usePullToRefresh'
import { incrementalUpload, startRealtimeSync } from './services/firestoreSync'
import { ensureDefaultCategories } from './services/database'
import { canDeviceWrite } from './lib/writeGuard'

export default function App() {
  const [isInitialized, setIsInitialized] = useState(false)
  const initSettings = useSettingsStore((s) => s.initialize)
  const isSidebarOpen = useUIStore((s) => s.isSidebarOpen)
  const hasCompletedOnboarding = useSettingsStore((s) => s.settings.hasCompletedOnboarding)
  const setHasCompletedOnboarding = useSettingsStore((s) => s.setHasCompletedOnboarding)
  const isOnline = useOnlineStatus()
  useAutoSync()
  useGlobalShortcuts()

  // Mobile pull-to-refresh → push local changes + force-restart realtime sync
  const handleRefresh = useCallback(async () => {
    const u = useAuthStore.getState().user
    if (u) {
      try {
        await incrementalUpload(u.uid)
        startRealtimeSync(u.uid, true)
      } catch (err) {
        console.error('[pull-refresh] failed:', err)
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 350))
  }, [])
  const pull = usePullToRefresh({ onRefresh: handleRefresh })

  useEffect(() => {
    const initApp = async () => {
      try {
        initSettings()
        useAuthStore.getState().initialize()
        await ensureDefaultCategories()

        // Check subscription billing notifications
        const settings = useSettingsStore.getState().settings
        if (settings.notifications.subscriptionBillingAlert) {
          await useSubscriptionStore.getState().loadSubscriptions()
          const subs = useSubscriptionStore.getState().subscriptions
          showBillingNotifications(subs, settings.notifications.subscriptionAlertDaysBefore)
        }
      } finally {
        setIsInitialized(true)
      }
    }
    initApp()
  }, [])

  // Auto carry-forward today's asset values (once per day, self-guarded).
  // 사용자가 별도 입력을 안 해도 어제 값이 오늘로 자동 저장되어 일자별 연속성이 유지된다.
  useEffect(() => {
    if (!isInitialized) return
    let cancelled = false
    ;(async () => {
      try {
        await useAssetStore.getState().loadAll()
        await useDailyValueStore.getState().loadAllValues()
        if (cancelled) return
        // Read-only device: skip the auto carry-forward/projection WRITES
        // (the loads above still run so the UI shows current data).
        if (!canDeviceWrite()) return
        // 레거시 복구: 로컬-날짜 기록으로 전부 미래에 저장돼 오늘 0 으로 보이던 항목을 오늘 앵커로 치유.
        await useDailyValueStore.getState().healLegacyFutureValues()
        if (!cancelled) await useDailyValueStore.getState().ensureValueProjections()
      } catch (err) {
        console.error('[carry-forward] failed:', err)
      }
    })()
    return () => { cancelled = true }
  }, [isInitialized])

  const location = useLocation()
  const setCurrentView = useUIStore((s) => s.setCurrentView)

  useEffect(() => {
    const path = location.pathname
    if (path === '/') setCurrentView('dashboard')
    else if (path.startsWith('/assets') || path.startsWith('/liabilities')) setCurrentView('assets')
    else if (path.startsWith('/ledger')) setCurrentView('ledger')
    else if (path === '/reports') setCurrentView('reports')
    else if (path.startsWith('/subscriptions')) setCurrentView('subscriptions')
    else if (path === '/profile') setCurrentView('profile')
  }, [location.pathname, setCurrentView])

  if (!isInitialized) return <AppLoadingScreen />

  return (
    <div className="min-h-screen bg-surface-secondary flex flex-col">
      <SkipLink />
      <PullToRefreshIndicator distance={pull.distance} progress={pull.progress} refreshing={pull.refreshing} />
      {!isOnline && <OfflineBanner />}
      <Sidebar />
      <div className={`flex-1 flex flex-col transition-all duration-300 ${isSidebarOpen ? 'lg:ml-64' : 'lg:ml-16'}`}>
        <ReadOnlyBanner />
        <Header />
        <main id="main-content" tabIndex={-1} className="flex-1 pb-20 lg:pb-6" role="main" aria-label="본문">
          <AnimatedOutlet />
        </main>
        <Footer />
      </div>
      <BottomNav />
      <MobileNav />
      <SettingsModal />
      <FAQModal />
      <TermsModal />
      <UndoToast />
      <ToastContainer />
      <UpdateBanner />
      <IOSInstallBanner />
      <SearchModal />
      <CommandPalette />
      <KeyboardShortcutsModal />
      {!hasCompletedOnboarding && (
        <OnboardingWizard onComplete={() => setHasCompletedOnboarding(true)} />
      )}
    </div>
  )
}
