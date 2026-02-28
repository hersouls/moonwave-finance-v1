import { useNavigate } from 'react-router-dom'
import { LayoutDashboard, Landmark, Receipt, Repeat, BarChart3 } from 'lucide-react'
import { clsx } from 'clsx'
import { useUIStore, type CurrentView } from '@/stores/uiStore'

const NAV_TARGETS: Record<string, string> = {
  dashboard: '/',
  assets: '/assets',
  ledger: '/ledger/expense',
  subscriptions: '/subscriptions/domestic',
  reports: '/reports',
}

export function BottomNav() {
  const navigate = useNavigate()
  const currentView = useUIStore((state) => state.currentView)
  const setCurrentView = useUIStore((state) => state.setCurrentView)

  const handleNavigate = (target: CurrentView) => {
    setCurrentView(target)
    navigate(NAV_TARGETS[target] || '/')
  }

  const navItems = [
    { id: 'dashboard' as const, label: '대시보드', icon: LayoutDashboard },
    { id: 'assets' as const, label: '자산', icon: Landmark },
    { id: 'ledger' as const, label: '가계부', icon: Receipt },
    { id: 'subscriptions' as const, label: '구독', icon: Repeat },
    { id: 'reports' as const, label: '분석', icon: BarChart3 },
  ]

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-[var(--z-nav)] bg-white/80 dark:bg-zinc-950/80 backdrop-blur-lg border-t border-zinc-200 dark:border-zinc-800 pb-safe"
      aria-label="하단 메인 네비게이션"
    >
      <ul className="flex items-center justify-around h-16 fold:h-14" role="menubar">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = currentView === item.id

          return (
            <li key={item.id} className="flex-1" role="none">
              <button
                onClick={() => handleNavigate(item.id)}
                className={clsx(
                  'w-full flex flex-col items-center justify-center gap-1 py-2 transition-colors min-h-[44px] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500',
                  isActive
                    ? 'text-primary-600 dark:text-primary-400'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-primary-600 dark:hover:text-primary-400'
                )}
                role="menuitem"
                aria-current={isActive ? 'page' : undefined}
                aria-label={`${item.label}${isActive ? ' (현재 페이지)' : ''}`}
              >
                <Icon className="w-5 h-5 fold:w-4 fold:h-4" aria-hidden="true" />
                <span className="text-[10px] font-medium bottom-nav-label fold:hidden">{item.label}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
