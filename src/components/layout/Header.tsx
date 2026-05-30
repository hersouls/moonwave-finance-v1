import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Menu, Moon, Sun, Monitor, Settings, Search, ArrowLeft, Command } from 'lucide-react'
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
  const openCommandPalette = useUIStore((state) => state.openCommandPalette)
  const openMobileMenu = useUIStore((state) => state.openMobileMenu)
  const user = useAuthStore((state) => state.user)
  const location = useLocation()
  const isDetailPage = /^\/(assets|liabilities)\/[^/]+$/.test(location.pathname) && !location.pathname.endsWith('/calendar')

  const getPageTitle = (): string => {
    const path = location.pathname
    if (path === '/') return '대시보드'
    if (path === '/assets') return '자본관리'
    if (path === '/assets/calendar') return '자산 캘린더'
    if (path.startsWith('/assets/')) return '자산 상세'
    if (path === '/liabilities') return '부채관리'
    if (path.startsWith('/liabilities/')) return '부채 상세'
    if (path === '/ledger/expense') return '지출관리'
    if (path === '/ledger/income') return '수입관리'
    if (path === '/ledger/calendar') return '가계부 캘린더'
    if (path === '/reports') return '분석'
    if (path === '/subscriptions') return '구독 관리'
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
    <header className="sticky top-0 z-[var(--z-header)] bg-[var(--surface-elevated)] glass-heavy border-b border-base el-header pt-safe-only">
      <nav className="flex items-center justify-between nav-header nav-header-inset">
        <div className="flex items-center gap-3">
          {isDetailPage ? (
            <button onClick={() => navigate(-1)} className="lg:hidden touch-target-icon -ml-2" aria-label="뒤로 가기">
              <ArrowLeft className="w-5 h-5 text-sub" />
            </button>
          ) : (
            <button onClick={openMobileMenu} className="lg:hidden touch-target-icon -ml-2" aria-label="메뉴 열기">
              <Menu className="w-5 h-5 text-sub" />
            </button>
          )}
          <Link to="/" className="lg:hidden flex items-center gap-2">
            <img src="/icons/icon-192.png" alt="FIN" className="w-8 h-8 rounded-lg" />
            <span className="font-bold text-heading">FIN</span>
          </Link>
          <h2 className="hidden lg:block text-h2-fluid text-heading">{getPageTitle()}</h2>
        </div>
        <div className="flex-1" />
        <div className="nav-header-actions">
          {user && (
            <Tooltip content={user.displayName || user.email} placement="bottom">
              <button type="button" onClick={() => navigate('/profile')} className="mr-1 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500" aria-label="프로필 보기">
                {user.photoURL ? (
                  <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full ring-2 ring-[var(--surface-primary)] elevation-1 object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-accent-primary flex items-center justify-center text-accent-primary text-sm font-bold ring-2 ring-[var(--surface-primary)] elevation-1">
                    {user.displayName?.[0] || user.email?.[0] || '?'}
                  </div>
                )}
              </button>
            </Tooltip>
          )}
          <Tooltip content="명령 팔레트 (⌘K)" placement="bottom">
            <IconButton plain color="secondary" onClick={openCommandPalette} aria-label="명령 팔레트 열기" className="hidden lg:inline-flex">
              <Command className="w-5 h-5" />
            </IconButton>
          </Tooltip>
          <Tooltip content="검색 (/)" placement="bottom">
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
