import { createBrowserRouter } from 'react-router-dom'
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
      { path: 'assets', element: <LazyPage><AssetListPage /></LazyPage> },
      { path: 'assets/:id', element: <LazyPage><AssetDetailPage /></LazyPage> },
      { path: 'liabilities', element: <LazyPage><LiabilityListPage /></LazyPage> },
      { path: 'liabilities/:id', element: <LazyPage><LiabilityDetailPage /></LazyPage> },
      { path: 'ledger', element: <LazyPage><LedgerPage /></LazyPage> },
      { path: 'calendar', element: <LazyPage><CalendarPage /></LazyPage> },
      { path: 'reports', element: <LazyPage><ReportsPage /></LazyPage> },
      { path: 'subscriptions', element: <LazyPage><SubscriptionPage /></LazyPage> },
      { path: 'profile', element: <LazyPage><ProfilePage /></LazyPage> },
      { path: '*', element: <LazyPage><NotFoundPage /></LazyPage> },
    ],
  },
  { path: '/oauth/callback', element: <OAuthCallback /> },
])
