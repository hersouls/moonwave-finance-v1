import { createBrowserRouter, Navigate } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import App from './App'
import OAuthCallback from './pages/OAuthCallback'
import { AppLoadingScreen } from './components/ui/AppLoadingScreen'

const DashboardPage = lazy(() => import('./components/dashboard/DashboardPage').then(m => ({ default: m.DashboardPage })))
const AssetListPage = lazy(() => import('./components/assets/AssetListPage').then(m => ({ default: m.AssetListPage })))
const AssetDetailPage = lazy(() => import('./components/assets/AssetDetailPage').then(m => ({ default: m.AssetDetailPage })))
const LiabilityListPage = lazy(() => import('./components/liabilities/LiabilityListPage').then(m => ({ default: m.LiabilityListPage })))
const LiabilityDetailPage = lazy(() => import('./components/liabilities/LiabilityDetailPage').then(m => ({ default: m.LiabilityDetailPage })))
const LedgerPage = lazy(() => import('./components/ledger/LedgerPage').then(m => ({ default: m.LedgerPage })))
const CalendarPage = lazy(() => import('./components/calendar/CalendarPage').then(m => ({ default: m.CalendarPage })))
const AssetCalendarPage = lazy(() => import('./components/calendar/AssetCalendarPage').then(m => ({ default: m.AssetCalendarPage })))
const ReportsPage = lazy(() => import('./components/reports/ReportsPage').then(m => ({ default: m.ReportsPage })))
const ProfilePage = lazy(() => import('./components/profile/ProfilePage').then(m => ({ default: m.ProfilePage })))
const SubscriptionPage = lazy(() => import('./components/subscriptions/SubscriptionPage').then(m => ({ default: m.SubscriptionPage })))
const NotFoundPage = lazy(() => import('./components/ui/NotFoundPage').then(m => ({ default: m.NotFoundPage })))

function LazyPage({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<AppLoadingScreen />}>{children}</Suspense>
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <LazyPage><DashboardPage /></LazyPage> },
      // 자산 축
      { path: 'assets', element: <LazyPage><AssetListPage /></LazyPage> },
      { path: 'assets/calendar', element: <LazyPage><AssetCalendarPage /></LazyPage> },
      { path: 'assets/:id', element: <LazyPage><AssetDetailPage /></LazyPage> },
      { path: 'liabilities', element: <LazyPage><LiabilityListPage /></LazyPage> },
      { path: 'liabilities/:id', element: <LazyPage><LiabilityDetailPage /></LazyPage> },
      // 가계부 축
      { path: 'ledger', element: <Navigate to="/ledger/expense" replace /> },
      { path: 'ledger/expense', element: <LazyPage><LedgerPage /></LazyPage> },
      { path: 'ledger/income', element: <LazyPage><LedgerPage /></LazyPage> },
      { path: 'ledger/calendar', element: <LazyPage><CalendarPage /></LazyPage> },
      { path: 'calendar', element: <Navigate to="/ledger/calendar" replace /> },
      // 구독 축
      { path: 'subscriptions', element: <Navigate to="/subscriptions/domestic" replace /> },
      { path: 'subscriptions/domestic', element: <LazyPage><SubscriptionPage /></LazyPage> },
      { path: 'subscriptions/international', element: <LazyPage><SubscriptionPage /></LazyPage> },
      // 기타
      { path: 'reports', element: <LazyPage><ReportsPage /></LazyPage> },
      { path: 'profile', element: <LazyPage><ProfilePage /></LazyPage> },
      { path: '*', element: <LazyPage><NotFoundPage /></LazyPage> },
    ],
  },
  { path: '/oauth/callback', element: <OAuthCallback /> },
])
