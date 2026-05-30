import { useNavigate } from 'react-router-dom'
import { LayoutDashboard, Landmark, Receipt, Repeat, BarChart3 } from 'lucide-react'
import { clsx } from 'clsx'
import { motion } from 'framer-motion'
import { useUIStore, type CurrentView } from '@/stores/uiStore'

const NAV_TARGETS: Record<string, string> = {
  dashboard: '/',
  assets: '/assets',
  ledger: '/ledger/expense',
  subscriptions: '/subscriptions',
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
      className="lg:hidden fixed bottom-0 left-0 right-0 z-[var(--z-nav)] bg-[var(--surface-elevated)] glass-heavy border-t border-base pb-safe nav-bottom el-bottomnav"
      aria-label="하단 메인 네비게이션"
    >
      <ul className="flex items-center justify-around nav-bottom fold:h-14" role="menubar">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = currentView === item.id

          return (
            <li key={item.id} className="flex-1" role="none">
              <button
                onClick={() => handleNavigate(item.id)}
                className={clsx(
                  'nav-bottom-item relative w-full flex flex-col items-center justify-center gap-0.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--ring-focus)]',
                  isActive
                    ? 'text-accent-primary'
                    : 'text-sub hover:text-accent-primary'
                )}
                role="menuitem"
                aria-current={isActive ? 'page' : undefined}
                aria-label={`${item.label}${isActive ? ' (현재 페이지)' : ''}`}
              >
                <span className="relative inline-flex items-center justify-center w-9 h-9 fold:w-7 fold:h-7">
                  {isActive && (
                    <motion.span
                      layoutId="bottomNavBlob"
                      aria-hidden="true"
                      className="absolute inset-0 rounded-full bg-[color:var(--accent-primary-bg)]"
                      style={{ boxShadow: 'var(--el-glow-soft)' }}
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                  <motion.span
                    initial={false}
                    animate={{ scale: isActive ? 1.08 : 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                    className="relative z-10 inline-flex"
                  >
                    <Icon
                      className={clsx('w-5 h-5 fold:w-4 fold:h-4', isActive ? 'stroke-[2]' : 'stroke-[1.5]')}
                      aria-hidden="true"
                    />
                  </motion.span>
                </span>
                <span
                  className={clsx(
                    'nav-bottom-label bottom-nav-label fold:hidden',
                    isActive ? 'font-semibold' : 'font-medium'
                  )}
                >
                  {item.label}
                </span>
                {isActive && (
                  <motion.span
                    layoutId="bottomNavIndicator"
                    className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-5 h-1 rounded-full bg-accent-primary"
                    aria-hidden="true"
                    transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                  />
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
