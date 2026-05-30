import { clsx } from 'clsx'
import { motion } from 'framer-motion'
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
  const layoutGroupId = useId()
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
      className={clsx('nav-tabs', className)}
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
              'nav-tab relative',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500'
            )}
          >
            {isActive && (
              <motion.span
                layoutId={`tabIndicator-${layoutGroupId}`}
                className="absolute inset-0 rounded-md bg-surface-primary ring-1 ring-[color:var(--border-subtle)] elevation-1 z-0"
                transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              {tab.icon}
              {tab.label}
            </span>
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
