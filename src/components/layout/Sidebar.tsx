import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Landmark,
  Receipt,
  Repeat,
  BarChart3,
  HelpCircle,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  CreditCard,
  Calendar,
} from 'lucide-react'
import { clsx } from 'clsx'
import { Tooltip } from '@/components/ui/Tooltip'
import { useUIStore } from '@/stores/uiStore'

interface NavChild {
  id: string
  label: string
  path: string
  icon?: React.ComponentType<{ className?: string }>
}

interface NavGroup {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  children: NavChild[]
}

interface NavStandalone {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  path?: string
  action?: 'faq' | 'settings'
}

const navGroups: NavGroup[] = [
  {
    id: 'assets',
    label: '자산',
    icon: Landmark,
    children: [
      { id: 'assets-capital', label: '자본관리', path: '/assets' },
      { id: 'assets-liability', label: '부채관리', path: '/liabilities', icon: CreditCard },
      { id: 'assets-calendar', label: '캘린더', path: '/assets/calendar', icon: Calendar },
    ],
  },
  {
    id: 'ledger',
    label: '가계부',
    icon: Receipt,
    children: [
      { id: 'ledger-expense', label: '지출관리', path: '/ledger/expense' },
      { id: 'ledger-income', label: '수입관리', path: '/ledger/income' },
      { id: 'ledger-calendar', label: '캘린더', path: '/ledger/calendar', icon: Calendar },
    ],
  },
  {
    id: 'subscriptions',
    label: '구독',
    icon: Repeat,
    children: [
      { id: 'sub-domestic', label: '국내관리', path: '/subscriptions/domestic' },
      { id: 'sub-international', label: '국외관리', path: '/subscriptions/international' },
    ],
  },
]

const standaloneTop: NavStandalone = {
  id: 'dashboard',
  label: '대시보드',
  icon: LayoutDashboard,
  path: '/',
}

const standaloneBottom: NavStandalone[] = [
  { id: 'reports', label: '분석', icon: BarChart3, path: '/reports' },
  { id: 'faq', label: 'FAQ', icon: HelpCircle, action: 'faq' },
  { id: 'settings', label: '설정', icon: Settings, action: 'settings' },
]

function getActiveGroupId(pathname: string): string | null {
  if (pathname.startsWith('/assets') || pathname.startsWith('/liabilities')) return 'assets'
  if (pathname.startsWith('/ledger')) return 'ledger'
  if (pathname.startsWith('/subscriptions')) return 'subscriptions'
  return null
}

export function Sidebar() {
  const location = useLocation()
  const isSidebarOpen = useUIStore((state) => state.isSidebarOpen)
  const toggleSidebar = useUIStore((state) => state.toggleSidebar)
  const openFAQModal = useUIStore((state) => state.openFAQModal)
  const openSettingsModal = useUIStore((state) => state.openSettingsModal)

  const activeGroupId = getActiveGroupId(location.pathname)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    activeGroupId ? new Set([activeGroupId]) : new Set()
  )

  useEffect(() => {
    if (activeGroupId) {
      setExpandedGroups((prev) => {
        if (prev.has(activeGroupId)) return prev
        return new Set([...prev, activeGroupId])
      })
    }
  }, [activeGroupId])

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  const isPathActive = (path: string) => {
    if (path === '/') return location.pathname === '/'
    return location.pathname === path
  }

  const handleAction = (action: 'faq' | 'settings') => {
    if (action === 'faq') openFAQModal()
    else openSettingsModal()
  }

  const renderStandaloneLink = (item: NavStandalone) => {
    const Icon = item.icon
    const active = item.path ? isPathActive(item.path) : false

    const content = item.path ? (
      <Link
        to={item.path}
        className={clsx(
          'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
          active
            ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
            : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
        )}
        role="menuitem"
        aria-current={active ? 'page' : undefined}
      >
        <Icon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
        {isSidebarOpen && <span className="text-sm font-medium truncate">{item.label}</span>}
      </Link>
    ) : (
      <button
        onClick={() => item.action && handleAction(item.action)}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        role="menuitem"
      >
        <Icon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
        {isSidebarOpen && <span className="text-sm font-medium truncate">{item.label}</span>}
      </button>
    )

    return (
      <li key={item.id} role="none">
        {!isSidebarOpen ? (
          <Tooltip content={item.label} placement="right">
            {content}
          </Tooltip>
        ) : (
          content
        )}
      </li>
    )
  }

  const renderGroup = (group: NavGroup) => {
    const Icon = group.icon
    const isExpanded = expandedGroups.has(group.id)
    const isGroupActive = activeGroupId === group.id

    if (!isSidebarOpen) {
      // Collapsed: show group icon, clicking navigates to first child
      const firstPath = group.children[0].path
      return (
        <li key={group.id} role="none">
          <Tooltip content={group.label} placement="right">
            <Link
              to={firstPath}
              className={clsx(
                'w-full flex items-center justify-center px-3 py-2.5 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
                isGroupActive
                  ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                  : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              )}
              role="menuitem"
            >
              <Icon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
            </Link>
          </Tooltip>
        </li>
      )
    }

    return (
      <li key={group.id} role="none">
        <button
          onClick={() => toggleGroup(group.id)}
          className={clsx(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
            isGroupActive
              ? 'text-primary-700 dark:text-primary-300'
              : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
          )}
          aria-expanded={isExpanded}
        >
          <Icon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
          <span className="text-sm font-medium truncate flex-1 text-left">{group.label}</span>
          <ChevronDown
            className={clsx(
              'w-4 h-4 flex-shrink-0 transition-transform duration-200',
              isExpanded && 'rotate-180'
            )}
            aria-hidden="true"
          />
        </button>
        {isExpanded && (
          <ul className="mt-1 space-y-0.5 ml-4 pl-4 border-l border-zinc-200 dark:border-zinc-700" role="menu">
            {group.children.map((child) => {
              const childActive = isPathActive(child.path)
              return (
                <li key={child.id} role="none">
                  <Link
                    to={child.path}
                    className={clsx(
                      'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
                      childActive
                        ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-medium'
                        : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-300'
                    )}
                    role="menuitem"
                    aria-current={childActive ? 'page' : undefined}
                  >
                    {child.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </li>
    )
  }

  return (
    <aside
      className={clsx(
        'hidden lg:flex flex-col fixed h-screen bg-zinc-50 dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 transition-all duration-300 z-[var(--z-sidebar)]',
        isSidebarOpen ? 'w-64' : 'w-16'
      )}
      role="complementary"
      aria-label="사이드 네비게이션"
      aria-expanded={isSidebarOpen}
    >
      {/* Logo */}
      <div className="flex items-center h-16 px-4 border-b border-zinc-200 dark:border-zinc-800">
        <Link
          to="/"
          className="flex items-center gap-3 overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded-lg"
          aria-label="대시보드로 이동"
        >
          <img src="/icons/icon-192.png" alt="FIN" className="w-8 h-8 rounded-lg flex-shrink-0" />
          {isSidebarOpen && (
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-zinc-900 dark:text-zinc-100 truncate">FIN</span>
            </div>
          )}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4" aria-label="주 메뉴">
        <ul className="space-y-1 px-2" role="menubar">
          {/* Dashboard */}
          {renderStandaloneLink(standaloneTop)}

          {/* Divider */}
          <li role="separator" className="!my-3 mx-3 border-t border-zinc-200 dark:border-zinc-700" aria-hidden="true" />

          {/* Groups: 자산/가계부/구독 */}
          {navGroups.map(renderGroup)}

          {/* Divider */}
          <li role="separator" className="!my-3 mx-3 border-t border-zinc-200 dark:border-zinc-700" aria-hidden="true" />

          {/* Bottom standalone items */}
          {standaloneBottom.map(renderStandaloneLink)}
        </ul>
      </nav>

      {/* Collapse Toggle */}
      <div className="p-2 border-t border-zinc-200 dark:border-zinc-800">
        {!isSidebarOpen ? (
          <Tooltip content="사이드바 펼치기" placement="right">
            <button
              onClick={toggleSidebar}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 min-h-[44px] rounded-lg text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              aria-label="사이드바 펼치기"
              aria-expanded={false}
            >
              <ChevronRight className="w-5 h-5" aria-hidden="true" />
            </button>
          </Tooltip>
        ) : (
          <button
            onClick={toggleSidebar}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 min-h-[44px] rounded-lg text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            aria-label="사이드바 접기"
            aria-expanded={true}
          >
            <ChevronLeft className="w-5 h-5" aria-hidden="true" />
            <span className="text-sm">접기</span>
          </button>
        )}
      </div>
    </aside>
  )
}
