import { useUIStore } from '@/stores/uiStore'
import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react'
import { clsx } from 'clsx'
import {
  Landmark,
  CreditCard,
  Receipt,
  Calendar,
  BarChart3,
  HelpCircle,
  Palette,
  Plus,
  Settings,
  X,
} from 'lucide-react'
import { Fragment, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export function MobileNav() {
  const navigate = useNavigate()

  const isMobileMenuOpen = useUIStore((state) => state.isMobileMenuOpen)
  const closeMobileMenu = useUIStore((state) => state.closeMobileMenu)
  const openSettingsModal = useUIStore((state) => state.openSettingsModal)
  const openFAQModal = useUIStore((state) => state.openFAQModal)
  const openAssetCreateModal = useUIStore((state) => state.openAssetCreateModal)
  const setCurrentView = useUIStore((state) => state.setCurrentView)

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

  const handleNavigate = (path: string, view: 'assets' | 'liabilities' | 'ledger' | 'calendar' | 'reports') => {
    closeMobileMenu()
    setCurrentView(view)
    navigate(path)
  }

  const handleThemeClick = () => {
    closeMobileMenu()
    openSettingsModal()
  }

  // Body scroll lock when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isMobileMenuOpen])

  const navLinks = [
    { label: '자산', icon: Landmark, path: '/assets', view: 'assets' as const },
    { label: '부채', icon: CreditCard, path: '/liabilities', view: 'liabilities' as const },
    { label: '가계부', icon: Receipt, path: '/ledger', view: 'ledger' as const },
    { label: '캘린더', icon: Calendar, path: '/calendar', view: 'calendar' as const },
    { label: '분석', icon: BarChart3, path: '/reports', view: 'reports' as const },
  ]

  return (
    <Transition show={isMobileMenuOpen} as={Fragment}>
      <Dialog onClose={closeMobileMenu} className="relative z-50 lg:hidden" id="mobile-nav">
        {/* Backdrop */}
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-zinc-900/50 backdrop-blur-sm" aria-hidden="true" />
        </TransitionChild>

        {/* Drawer */}
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
            className="fixed inset-y-0 left-0 w-full max-w-xs bg-white dark:bg-zinc-950 shadow-xl dark:shadow-zinc-900/50 flex flex-col"
            aria-labelledby="mobile-nav-title"
          >
            {/* Header */}
            <div className="flex items-center justify-between h-16 px-4 border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0">
              <div className="flex items-center gap-3">
                <img src="/icons/icon-192.png" alt="FIN" className="w-8 h-8 rounded-lg flex-shrink-0" />
                <div className="flex flex-col">
                  <span
                    id="mobile-nav-title"
                    className="font-bold text-zinc-900 dark:text-zinc-100"
                  >
                    FIN
                  </span>
                </div>
              </div>
              <button
                onClick={closeMobileMenu}
                className="p-2 -mr-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 min-w-[44px] min-h-[44px] flex items-center justify-center"
                aria-label="메뉴 닫기"
              >
                <X className="w-5 h-5 text-zinc-600 dark:text-zinc-400" aria-hidden="true" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto py-4">
              {/* Add Asset Button */}
              <div className="px-2 mb-4">
                <button
                  onClick={handleAddAsset}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 min-h-[44px]"
                  aria-label="자산 추가"
                >
                  <Plus className="w-5 h-5" aria-hidden="true" />
                  <span className="font-medium">자산 추가</span>
                </button>
              </div>

              {/* Menu Items */}
              <nav className="px-2" aria-label="모바일 메인 메뉴">
                <ul className="space-y-1" role="menu">
                  {/* Nav Links */}
                  {navLinks.map((link) => {
                    const Icon = link.icon
                    return (
                      <li key={link.path} role="none">
                        <button
                          onClick={() => handleNavigate(link.path, link.view)}
                          className={clsx(
                            'w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors',
                            'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800',
                            'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 min-h-[44px]'
                          )}
                          role="menuitem"
                        >
                          <Icon className="w-5 h-5" aria-hidden="true" />
                          <span className="font-medium">{link.label}</span>
                        </button>
                      </li>
                    )
                  })}

                  {/* Theme */}
                  <li role="none">
                    <button
                      onClick={handleThemeClick}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 min-h-[44px]"
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
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 min-h-[44px]"
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
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 min-h-[44px]"
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
