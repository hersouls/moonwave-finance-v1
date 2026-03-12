import { useState, useEffect, useRef } from 'react'
import { Bell, CheckCheck, Trash2, X } from 'lucide-react'
import { useNotificationStore, type AppNotification } from '@/stores/notificationStore'
import { IconButton } from '@/components/ui/Button'
import { Tooltip } from '@/components/ui/Tooltip'
import { clsx } from 'clsx'

const typeLabels: Record<AppNotification['type'], string> = {
  budget_exceeded: '예산 초과',
  subscription_billing: '구독 결제',
  goal_achieved: '목표 달성',
  sync_error: '동기화',
  info: '알림',
}

const typeColors: Record<AppNotification['type'], string> = {
  budget_exceeded: 'bg-warning-500',
  subscription_billing: 'bg-primary-500',
  goal_achieved: 'bg-success-500',
  sync_error: 'bg-danger-500',
  info: 'bg-zinc-400',
}

export function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const { notifications, unreadCount, loadNotifications, markAsRead, markAllAsRead, clearAll } =
    useNotificationStore()

  useEffect(() => {
    loadNotifications()
  }, [])

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen])

  const formatTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return '방금'
    if (mins < 60) return `${mins}분 전`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}시간 전`
    const days = Math.floor(hours / 24)
    return `${days}일 전`
  }

  return (
    <div className="relative" ref={panelRef}>
      <Tooltip content="알림" placement="bottom">
        <IconButton
          plain
          color="secondary"
          onClick={() => setIsOpen(!isOpen)}
          aria-label={`알림 ${unreadCount > 0 ? `(${unreadCount}건)` : ''}`}
        >
          <div className="relative">
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-danger-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </div>
        </IconButton>
      </Tooltip>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-zinc-900 rounded-xl elevation-4 border border-zinc-200 dark:border-zinc-700 overflow-hidden z-[var(--z-overlay)] page-enter">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
            <h3 className="text-body3-semi text-zinc-900 dark:text-zinc-100">알림</h3>
            <div className="flex gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                  aria-label="모두 읽음"
                >
                  <CheckCheck className="w-4 h-4" />
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={clearAll}
                  className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                  aria-label="모두 삭제"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-zinc-400">
                알림이 없습니다
              </div>
            ) : (
              notifications.slice(0, 20).map((n) => (
                <button
                  key={n.id}
                  onClick={() => n.id && markAsRead(n.id)}
                  className={clsx(
                    'w-full text-left px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors border-b border-zinc-50 dark:border-zinc-800/50',
                    !n.read && 'bg-primary-50/50 dark:bg-primary-900/10'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={clsx('w-2 h-2 rounded-full mt-1.5 flex-shrink-0', typeColors[n.type])} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-caption text-zinc-400">{typeLabels[n.type]}</span>
                        <span className="text-caption text-zinc-400">{formatTime(n.createdAt)}</span>
                      </div>
                      <p className="text-sm text-zinc-900 dark:text-zinc-100 font-medium truncate">{n.title}</p>
                      <p className="text-caption text-zinc-500 dark:text-zinc-400 truncate">{n.body}</p>
                    </div>
                    {!n.read && (
                      <div className="w-2 h-2 rounded-full bg-primary-500 mt-1.5 flex-shrink-0" />
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
