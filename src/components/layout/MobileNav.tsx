import { useState } from 'react'
import { useUIStore } from '@/stores/uiStore'
import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react'
import { clsx } from 'clsx'
import {
  Landmark,
  Receipt,
  BarChart3,
  HelpCircle,
  Palette,
  Plus,
  Settings,
  X,
  Repeat,
  TrendingUp,
  ChevronDown,
} from 'lucide-react'
import { Fragment, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

interface NavChild {
  label: string
  path: string
}

interface NavGroup {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  children: NavChild[]
}

const navGroups: NavGroup[] = [
  {
    id: 'assets',
    label: '자산',
    icon: Landmark,
    children: [
      { label: '자본관리', path: '/assets' },
      { label: '부채관리', path: '/liabilities' },
      { label: '캘린더', path: '/assets/calendar' },
    ],
  },
  {
    id: 'ledger',
    label: '가계부',
    icon: Receipt,
    children: [
      { label: '지출관리', path: '/ledger/expense' },
      { label: '수입관리', path: '/ledger/income' },
      { label: '캘린더', path: '/ledger/calendar' },
    ],
  },
  {
    id: 'subscriptions',
    label: '구독',
    icon: Repeat,
    children: [
      { label: '구독 관리', path: '/subscriptions' },
    ],
  },
]

function getActiveGroupId(pathname: string): string | null {
  if (pathname.startsWith('/assets') || pathname.startsWith('/liabilities')) return 'assets'
  if (pathname.startsWith('/ledger')) return 'ledger'
  if (pathname.startsWith('/subscriptions')) return 'subscriptions'
  return null
}

export function MobileNav() {
  const navigate = useNavigate()
  const location = useLocation()

  const isMobileMenuOpen = useUIStore((state) => state.isMobileMenuOpen)
  const closeMobileMenu = useUIStore((state) => state.closeMobileMenu)
  const openSettingsModal = useUIStore((state) => state.openSettingsModal)
  const openFAQModal = useUIStore((state) => state.openFAQModal)
  const openAssetCreateModal = useUIStore((state) => state.openAssetCreateModal)

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

  const handleOpenSettings = () => {
    closeMobileMenu()
    openSettingsModal()
  }

  const handleOpenFAQ = () => {
    closeMobileMenu()
    openFAQModal()
  }

  const handleAddAsset = () => {
    closeMobileMenu()
    openAssetCreateModal()
  }

  const handleNavigate = (path: string) => {
    closeMobileMenu()
    navigate(path)
  }

  const handleThemeClick = () => {
    closeMobileMenu()
    openSettingsModal()
  }

  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isMobileMenuOpen])

  return (
    <Transition show={isMobileMenuOpen} as={Fragment}>
      <Dialog onClose={closeMobileMenu} className="relative z-50 lg:hidden" id="mobile-nav">
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" aria-hidden="true" />
        </TransitionChild>

        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="-translate-x-full"
          enterTo="translate-x-0"
          leave="ease-in duration-200"
          leaveFrom="translate-x-0"
          leaveTo="-translate-x-full"
        >
          <DialogPanel
            className="fixed inset-y-0 left-0 w-full max-w-xs bg-surface-primary elevation-4 flex flex-col"
            aria-labelledby="mobile-nav-title"
          >
            {/* Header */}
            <div className="flex items-center justify-between h-16 px-4 border-b border-base flex-shrink-0">
              <div className="flex items-center gap-3">
                <img src="/icons/icon-192.png" alt="FIN" className="w-8 h-8 rounded-lg flex-shrink-0" />
                <span id="mobile-nav-title" className="font-bold text-heading">FIN</span>
              </div>
              <button
                onClick={closeMobileMenu}
                className="touch-target-icon -mr-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                aria-label="메뉴 닫기"
              >
                <X className="w-5 h-5 text-sub" aria-hidden="true" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto py-4">
              {/* Add Asset Button */}
              <div className="px-2 mb-4">
                <button
                  onClick={handleAddAsset}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-accent-primary text-accent-primary hover:bg-accent-primary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 min-h-[44px]"
                  aria-label="자산 추가"
                >
                  <Plus className="w-5 h-5" aria-hidden="true" />
                  <span className="font-medium">자산 추가</span>
                </button>
              </div>

              <nav className="px-2" aria-label="모바일 메인 메뉴">
                <ul className="space-y-1" role="menu">
                  {/* Nav Groups */}
                  {navGroups.map((group) => {
                    const Icon = group.icon
                    const isExpanded = expandedGroups.has(group.id)
                    const isGroupActive = activeGroupId === group.id

                    return (
                      <li key={group.id} role="none">
                        <button
                          onClick={() => toggleGroup(group.id)}
                          className={clsx(
                            'w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors min-h-[44px]',
                            'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
                            isGroupActive
                              ? 'text-accent-primary'
                              : 'text-sub hover:bg-[var(--hover-bg)]'
                          )}
                          aria-expanded={isExpanded}
                          role="menuitem"
                        >
                          <Icon className="w-5 h-5" aria-hidden="true" />
                          <span className="font-medium flex-1 text-left">{group.label}</span>
                          <ChevronDown
                            className={clsx(
                              'w-4 h-4 transition-transform duration-200',
                              isExpanded && 'rotate-180'
                            )}
                            aria-hidden="true"
                          />
                        </button>
                        {isExpanded && (
                          <ul className="mt-1 ml-6 pl-4 border-l border-base space-y-0.5" role="menu">
                            {group.children.map((child) => {
                              const childActive = location.pathname === child.path
                              return (
                                <li key={child.path} role="none">
                                  <button
                                    onClick={() => handleNavigate(child.path)}
                                    className={clsx(
                                      'w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-colors min-h-[44px]',
                                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
                                      childActive
                                        ? 'bg-accent-primary text-accent-primary font-medium'
                                        : 'text-sub hover:bg-[var(--hover-bg)]'
                                    )}
                                    role="menuitem"
                                  >
                                    {child.label}
                                  </button>
                                </li>
                              )
                            })}
                          </ul>
                        )}
                      </li>
                    )
                  })}

                  {/* Investments (standalone) */}
                  <li role="none">
                    <button
                      onClick={() => handleNavigate('/investments')}
                      className={clsx(
                        'w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors min-h-[44px]',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
                        location.pathname.startsWith('/investments')
                          ? 'bg-accent-primary text-accent-primary font-medium'
                          : 'text-sub hover:bg-[var(--hover-bg)]'
                      )}
                      role="menuitem"
                    >
                      <TrendingUp className="w-5 h-5" aria-hidden="true" />
                      <span className="font-medium flex-1 text-left">투자수익</span>
                    </button>
                  </li>

                  {/* Divider */}
                  <li role="separator" className="nav-sidebar-divider" aria-hidden="true" />

                  {/* Reports */}
                  <li role="none">
                    <button
                      onClick={() => handleNavigate('/reports')}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-sub hover:bg-[var(--hover-bg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 min-h-[44px]"
                      role="menuitem"
                    >
                      <BarChart3 className="w-5 h-5" aria-hidden="true" />
                      <span className="font-medium">분석</span>
                    </button>
                  </li>

                  {/* Theme */}
                  <li role="none">
                    <button
                      onClick={handleThemeClick}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-sub hover:bg-[var(--hover-bg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 min-h-[44px]"
                      role="menuitem"
                    >
                      <Palette className="w-5 h-5" aria-hidden="true" />
                      <span className="font-medium">테마</span>
                    </button>
                  </li>

                  {/* FAQ */}
                  <li role="none">
                    <button
                      onClick={handleOpenFAQ}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-sub hover:bg-[var(--hover-bg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 min-h-[44px]"
                      role="menuitem"
                    >
                      <HelpCircle className="w-5 h-5" aria-hidden="true" />
                      <span className="font-medium">FAQ</span>
                    </button>
                  </li>

                  {/* Settings */}
                  <li role="none">
                    <button
                      onClick={handleOpenSettings}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-sub hover:bg-[var(--hover-bg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 min-h-[44px]"
                      role="menuitem"
                    >
                      <Settings className="w-5 h-5" aria-hidden="true" />
                      <span className="font-medium">설정</span>
                    </button>
                  </li>
                </ul>
              </nav>
            </div>
          </DialogPanel>
        </TransitionChild>
      </Dialog>
    </Transition>
  )
}
