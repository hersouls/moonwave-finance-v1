import { clsx } from 'clsx'
import { useId, useRef, type ReactNode, type KeyboardEvent } from 'react'

interface Tab {
  id: string
  label: string
  icon?: ReactNode
}

interface TabsProps {
  tabs: Tab[]
  activeTab: string
  onChange: (tabId: string) => void
  className?: string
}

export function Tabs({ tabs, activeTab, onChange, className }: TabsProps) {
  const baseId = useId()
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  const handleKeyDown = (e: KeyboardEvent, index: number) => {
    let nextIndex: number | null = null

    switch (e.key) {
      case 'ArrowRight':
        nextIndex = (index + 1) % tabs.length
        break
      case 'ArrowLeft':
        nextIndex = (index - 1 + tabs.length) % tabs.length
        break
      case 'Home':
        nextIndex = 0
        break
      case 'End':
        nextIndex = tabs.length - 1
        break
      default:
        return
    }

    e.preventDefault()
    const nextTab = tabs[nextIndex]
    onChange(nextTab.id)
    tabRefs.current[nextIndex]?.focus()
  }

  return (
    <div
      role="tablist"
      className={clsx('flex gap-1 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg', className)}
    >
      {tabs.map((tab, index) => {
        const isActive = activeTab === tab.id
        return (
          <button
            key={tab.id}
            ref={(el) => { tabRefs.current[index] = el }}
            role="tab"
            id={`${baseId}-tab-${tab.id}`}
            aria-selected={isActive}
            aria-controls={`${baseId}-panel-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
              isActive
                ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

interface TabPanelProps {
  children: ReactNode
  tabId?: string
  tabsId?: string
  className?: string
}

export function TabPanel({ children, tabId, tabsId, className }: TabPanelProps) {
  return (
    <div
      role={tabId ? 'tabpanel' : undefined}
      id={tabId && tabsId ? `${tabsId}-panel-${tabId}` : undefined}
      aria-labelledby={tabId && tabsId ? `${tabsId}-tab-${tabId}` : undefined}
      className={clsx('mt-4 animate-in fade-in duration-200', className)}
    >
      {children}
    </div>
  )
}
