import { useState, useRef, useCallback } from 'react'
import { Settings, User, Database, Bell, Cog, Receipt, X } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { useUIStore } from '@/stores/uiStore'
import { useSettingsModal } from '@/hooks/useSettingsModal'
import { clsx } from 'clsx'
import { GeneralTab } from './GeneralTab'
import { AccountTab } from './AccountTab'
import { DataTab } from './DataTab'
import { NotificationsTab } from './NotificationsTab'
import { SystemTab } from './SystemTab'
import { LedgerTab } from './LedgerTab'

type SettingsTabId = 'general' | 'ledger' | 'account' | 'data' | 'notifications' | 'system'

const TABS: { id: SettingsTabId; label: string; Icon: typeof Settings }[] = [
  { id: 'general', label: '일반', Icon: Settings },
  { id: 'ledger', label: '가계부', Icon: Receipt },
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
      <div className="flex flex-col md:flex-row md:min-h-[560px] max-h-[85dvh]">
        {/* Left sidebar / top bar */}
        <nav className="shrink-0 md:w-52 md:border-r border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/30 md:rounded-l-xl">
          {/* Header */}
          <div className="flex items-center justify-between p-4 pb-2 md:p-5 md:pb-4">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">설정</h2>
            <button
              onClick={handleClose}
              className="p-2 rounded-lg text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              aria-label="닫기"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tab buttons */}
          <div
            role="tablist"
            aria-orientation="vertical"
            className="flex md:flex-col overflow-x-auto scrollbar-none px-4 md:px-3 pb-3 md:pb-4 gap-1"
          >
            {TABS.map((tab, index) => (
              <button
                key={tab.id}
                ref={(el) => { tabRefs.current[index] = el }}
                role="tab"
                aria-selected={activeTab === tab.id}
                tabIndex={activeTab === tab.id ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(e) => handleTabKeyDown(e, index)}
                className={clsx(
                  'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
                  activeTab === tab.id
                    ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700/50'
                )}
              >
                <tab.Icon className="w-4 h-4 shrink-0" />
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </nav>

        {/* Content area */}
        <div
          className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8"
          role="tabpanel"
          aria-labelledby={`tab-${activeTab}`}
        >
          <div className="max-w-2xl">
            {activeTab === 'general' && <GeneralTab draft={draft} onChange={updateDraft} />}
            {activeTab === 'ledger' && <LedgerTab />}
            {activeTab === 'account' && <AccountTab />}
            {activeTab === 'data' && <DataTab />}
            {activeTab === 'notifications' && <NotificationsTab draft={draft} onChange={updateDraft} />}
            {activeTab === 'system' && <SystemTab />}
          </div>
        </div>
      </div>

      {/* Footer - save bar */}
      {isDirty && (
        <div className="border-t border-zinc-200 dark:border-zinc-700 px-4 md:px-6 py-3 flex justify-end gap-3 bg-white dark:bg-zinc-900 rounded-b-xl">
          <Button variant="ghost" onClick={handleCancel}>취소</Button>
          <Button variant="primary" onClick={handleSave}>저장</Button>
        </div>
      )}
    </Dialog>
  )
}
