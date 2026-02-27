import { createBrowserRouter } from 'react-router-dom'
import App from './App'
import OAuthCallback from './pages/OAuthCallback'
import { DashboardPage } from './components/dashboard/DashboardPage'
import { AssetListPage } from './components/assets/AssetListPage'
import { AssetDetailPage } from './components/assets/AssetDetailPage'
import { LiabilityListPage } from './components/liabilities/LiabilityListPage'
import { LiabilityDetailPage } from './components/liabilities/LiabilityDetailPage'
import { LedgerPage } from './components/ledger/LedgerPage'
import { CalendarPage } from './components/calendar/CalendarPage'
import { ReportsPage } from './components/reports/ReportsPage'
import { ProfilePage } from './components/profile/ProfilePage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'assets', element: <AssetListPage /> },
      { path: 'assets/:id', element: <AssetDetailPage /> },
      { path: 'liabilities', element: <LiabilityListPage /> },
      { path: 'liabilities/:id', element: <LiabilityDetailPage /> },
      { path: 'ledger', element: <LedgerPage /> },
      { path: 'calendar', element: <CalendarPage /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: 'profile', element: <ProfilePage /> },
    ],
  },
  { path: '/oauth/callback', element: <OAuthCallback /> },
])
