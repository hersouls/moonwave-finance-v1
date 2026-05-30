import { useState, useRef, useCallback, useEffect } from 'react'
import { Settings, User, Database, Bell, Cog, Receipt, Landmark, X } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { useUIStore } from '@/stores/uiStore'
import { useSettingsModal } from '@/hooks/useSettingsModal'
import { useIsMobile } from '@/hooks/useBreakpoint'
import { clsx } from 'clsx'
import { GeneralTab } from './GeneralTab'
import { AccountTab } from './AccountTab'
import { DataTab } from './DataTab'
import { NotificationsTab } from './NotificationsTab'
import { SystemTab } from './SystemTab'
import { LedgerTab } from './LedgerTab'
import { LoanTab } from './LoanTab'

type SettingsTabId = 'general' | 'ledger' | 'loans' | 'account' | 'data' | 'notifications' | 'system'

const TABS: { id: SettingsTabId; label: string; Icon: typeof Settings }[] = [
  { id: 'general', label: '일반', Icon: Settings },
  { id: 'ledger', label: '가계부', Icon: Receipt },
  { id: 'loans', label: '대출', Icon: Landmark },
  { id: 'account', label: '계정', Icon: User },
  { id: 'data', label: '데이터', Icon: Database },
  { id: 'notifications', label: '알림', Icon: Bell },
  { id: 'system', label: '시스템', Icon: Cog },
]

export function SettingsModal() {
  const isOpen = useUIStore((s) => s.isSettingsModalOpen)
  const closeSettingsModal = useUIStore((s) => s.closeSettingsModal)
  const { draft, updateDraft, save, cancel, isDirty } = useSettingsModal(isOpen)

  const [activeTab, setActiveTab] = useState<SettingsTabId>('general')
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const tabListRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()

  useEffect(() => {
    if (!isOpen) return
    const idx = TABS.findIndex((t) => t.id === activeTab)
    const el = tabRefs.current[idx]
    if (!el) return
    if (!isMobile) return
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [activeTab, isOpen, isMobile])

  const handleClose = useCallback(() => {
    if (isDirty) cancel()
    closeSettingsModal()
  }, [isDirty, cancel, closeSettingsModal])

  const handleSave = useCallback(() => {
    save()
    closeSettingsModal()
  }, [save, closeSettingsModal])

  const handleCancel = useCallback(() => {
    cancel()
    closeSettingsModal()
  }, [cancel, closeSettingsModal])

  const handleTabKeyDown = useCallback((e: React.KeyboardEvent, index: number) => {
    let nextIndex: number | null = null

    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault()
      nextIndex = (index + 1) % TABS.length
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault()
      nextIndex = (index - 1 + TABS.length) % TABS.length
    } else if (e.key === 'Home') {
      e.preventDefault()
      nextIndex = 0
    } else if (e.key === 'End') {
      e.preventDefault()
      nextIndex = TABS.length - 1
    }

    if (nextIndex !== null) {
      setActiveTab(TABS[nextIndex].id)
      tabRefs.current[nextIndex]?.focus()
    }
  }, [])

  return (
    <Dialog open={isOpen} onClose={handleClose} size="4xl" noPadding>
      <div className="flex flex-col lg:flex-row lg:min-h-[560px] max-h-[85dvh]">
        {/* Left sidebar / top bar */}
        <nav
          aria-label="설정 탭"
          className="shrink-0 lg:w-52 lg:border-r border-base bg-surface-secondary"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 pt-3 pb-2 lg:p-5 lg:pb-4">
            <h2 id="settings-modal-title" className="text-title2 text-heading">설정</h2>
            <button
              onClick={handleClose}
              className="touch-target-icon text-sub hover:text-body hover:bg-[var(--hover-bg)] rounded-lg transition-colors"
              aria-label="닫기"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tab buttons — mobile: horizontal scroll pill rail; desktop: vertical stack */}
          <div
            ref={tabListRef}
            role="tablist"
            aria-orientation="vertical"
            className={clsx(
              'flex lg:flex-col overflow-x-auto lg:overflow-visible scrollbar-none',
              'gap-1.5 lg:gap-1 px-3 lg:px-3 pb-3 lg:pb-4',
              'snap-x snap-proximity lg:snap-none scroll-smooth',
              '[scroll-padding-inline:1rem]',
              'border-b border-base lg:border-b-0'
            )}
          >
            {TABS.map((tab, index) => {
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  ref={(el) => { tabRefs.current[index] = el }}
                  id={`settings-tab-${tab.id}`}
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`settings-tabpanel-${tab.id}`}
                  aria-label={tab.label}
                  title={tab.label}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => setActiveTab(tab.id)}
                  onKeyDown={(e) => handleTabKeyDown(e, index)}
                  className={clsx(
                    'group relative flex items-center justify-center lg:justify-start gap-2 shrink-0 snap-start',
                    'px-3 lg:px-3 py-2 lg:py-2.5 min-h-[40px] lg:min-h-0',
                    'rounded-lg text-body3 whitespace-nowrap transition-all',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
                    isActive
                      ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-medium elevation-1 lg:elevation-0'
                      : 'text-sub hover:bg-[var(--hover-bg)] active:bg-[var(--hover-bg)] lg:bg-transparent'
                  )}
                >
                  <tab.Icon
                    className={clsx(
                      'w-4 h-4 shrink-0 transition-transform',
                      isActive && 'lg:scale-100'
                    )}
                    aria-hidden="true"
                  />
                  <span className="fold:sr-only lg:not-sr-only">{tab.label}</span>
                </button>
              )
            })}
          </div>
        </nav>

        {/* Content area */}
        <div
          key={activeTab}
          id={`settings-tabpanel-${activeTab}`}
          className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8"
          role="tabpanel"
          aria-labelledby={`settings-tab-${activeTab}`}
          tabIndex={0}
        >
          <div className="max-w-2xl">
            {activeTab === 'general' && <GeneralTab draft={draft} onChange={updateDraft} />}
            {activeTab === 'ledger' && <LedgerTab />}
            {activeTab === 'loans' && <LoanTab />}
            {activeTab === 'account' && <AccountTab />}
            {activeTab === 'data' && <DataTab />}
            {activeTab === 'notifications' && <NotificationsTab draft={draft} onChange={updateDraft} />}
            {activeTab === 'system' && <SystemTab />}
          </div>
        </div>
      </div>

      {/* Footer - save bar */}
      {isDirty && (
        <div className="border-t border-base px-4 md:px-6 py-3 flex justify-end gap-3 bg-surface-primary rounded-b-xl">
          <Button variant="ghost" onClick={handleCancel}>취소</Button>
          <Button variant="primary" onClick={handleSave}>저장</Button>
        </div>
      )}
    </Dialog>
  )
}
