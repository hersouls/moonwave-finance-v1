import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Menu, Moon, Sun, Monitor, Wallet, Settings, Search } from 'lucide-react'
import { useSettingsStore } from '@/stores/settingsStore'
import { useUIStore } from '@/stores/uiStore'
import { useAuthStore } from '@/stores/authStore'
import { IconButton } from '@/components/ui/Button'
import { Tooltip } from '@/components/ui/Tooltip'
import type { ThemeMode } from '@/lib/types'

export function Header() {
  const navigate = useNavigate()
  const theme = useSettingsStore((state) => state.settings.theme)
  const setTheme = useSettingsStore((state) => state.setTheme)
  const openSettingsModal = useUIStore((state) => state.openSettingsModal)
  const openSearchModal = useUIStore((state) => state.openSearchModal)
  const openMobileMenu = useUIStore((state) => state.openMobileMenu)
  const user = useAuthStore((state) => state.user)
  const location = useLocation()

  const getPageTitle = (): string => {
    const path = location.pathname
    if (path === '/') return '대시보드'
    if (path === '/assets') return '자산'
    if (path.startsWith('/assets/')) return '자산 상세'
    if (path === '/liabilities') return '부채'
    if (path.startsWith('/liabilities/')) return '부채 상세'
    if (path === '/ledger') return '가계부'
    if (path === '/calendar') return '캘린더'
    if (path === '/reports') return '분석'
    if (path === '/profile') return '프로필'
    return '대시보드'
  }

  const cycleTheme = () => {
    const themeOrder: ThemeMode[] = ['light', 'dark', 'system']
    const currentIndex = themeOrder.indexOf(theme)
    const nextIndex = (currentIndex + 1) % themeOrder.length
    setTheme(themeOrder[nextIndex])
  }

  const getThemeIcon = () => {
    switch (theme) {
      case 'light': return <Sun className="w-5 h-5" />
      case 'dark': return <Moon className="w-5 h-5" />
      default: return <Monitor className="w-5 h-5" />
    }
  }

  const themeLabels: Record<ThemeMode, string> = {
    light: '라이트 모드',
    dark: '다크 모드',
    system: '시스템 설정',
  }

  return (
    <header className="sticky top-0 z-30 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-lg border-b border-zinc-200 dark:border-zinc-800">
      <nav className="flex items-center justify-between h-16 px-4 lg:px-6">
        <div className="flex items-center gap-3">
          <button onClick={openMobileMenu} className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" aria-label="메뉴 열기">
            <Menu className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
          </button>
          <Link to="/" className="lg:hidden flex items-center gap-2">
            <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center">
              <Wallet className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-zinc-900 dark:text-zinc-100">자산관리</span>
          </Link>
          <h2 className="hidden lg:block text-lg font-semibold text-zinc-900 dark:text-zinc-100">{getPageTitle()}</h2>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-1">
          {user && (
            <Tooltip content={user.displayName || user.email} placement="bottom">
              <button type="button" onClick={() => navigate('/profile')} className="mr-1 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500" aria-label="프로필 보기">
                {user.photoURL ? (
                  <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full ring-2 ring-white dark:ring-zinc-800 shadow-sm object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-700 dark:text-primary-300 text-sm font-bold ring-2 ring-white dark:ring-zinc-800 shadow-sm">
                    {user.displayName?.[0] || user.email?.[0] || '?'}
                  </div>
                )}
              </button>
            </Tooltip>
          )}
          <Tooltip content="검색 (Cmd+K)" placement="bottom">
            <IconButton plain color="secondary" onClick={openSearchModal} aria-label="검색">
              <Search className="w-5 h-5" />
            </IconButton>
          </Tooltip>
          <Tooltip content="설정" placement="bottom">
            <IconButton plain color="secondary" onClick={openSettingsModal} aria-label="설정 열기">
              <Settings className="w-5 h-5" />
            </IconButton>
          </Tooltip>
          <Tooltip content={themeLabels[theme]} placement="bottom">
            <IconButton plain color="secondary" onClick={cycleTheme} aria-label={`테마 변경 (현재: ${themeLabels[theme]})`}>
              {getThemeIcon()}
            </IconButton>
          </Tooltip>
        </div>
      </nav>
    </header>
  )
}
