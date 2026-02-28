import { useState, useEffect } from 'react'
import { Bell, BellOff, Clock, PiggyBank, CreditCard } from 'lucide-react'
import { clsx } from 'clsx'
import { ToggleSwitch } from './ToggleSwitch'
import type { Settings } from '@/lib/types'

interface NotificationsTabProps {
  draft: Settings
  onChange: (updates: Partial<Settings>) => void
}

type NotificationPermission = 'default' | 'granted' | 'denied' | 'unsupported'

const THRESHOLD_OPTIONS = [50, 60, 70, 80, 90, 100]
const REMINDER_TIMES = ['09:00', '12:00', '18:00', '21:00']
const ALERT_DAYS_OPTIONS = [
  { value: 0, label: '당일' },
  { value: 1, label: '1일 전' },
  { value: 3, label: '3일 전' },
  { value: 7, label: '7일 전' },
]

export function NotificationsTab({ draft, onChange }: NotificationsTabProps) {
  const [permission, setPermission] = useState<NotificationPermission>('default')

  useEffect(() => {
    if (typeof Notification === 'undefined') {
      setPermission('unsupported')
    } else {
      setPermission(Notification.permission as NotificationPermission)
    }
  }, [])

  const handleRequestPermission = async () => {
    if (typeof Notification === 'undefined') return
    const result = await Notification.requestPermission()
    setPermission(result as NotificationPermission)
  }

  const updateNotification = (updates: Partial<Settings['notifications']>) => {
    onChange({ notifications: { ...draft.notifications, ...updates } })
  }

  return (
    <div className="space-y-8">
      {/* Browser Notification Permission */}
      <section>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
          <Bell className="w-4 h-4" />
          브라우저 알림
        </h3>
        <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
          {permission === 'granted' && (
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-green-500" />
              <span className="text-sm text-green-700 dark:text-green-400 font-medium">알림이 허용되었습니다</span>
            </div>
          )}
          {permission === 'denied' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <BellOff className="w-4 h-4 text-red-500" />
                <span className="text-sm text-red-700 dark:text-red-400 font-medium">알림이 차단되었습니다</span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                브라우저 설정에서 알림 권한을 허용해주세요
              </p>
            </div>
          )}
          {permission === 'default' && (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">푸시 알림 활성화</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">알림을 받으려면 브라우저 권한이 필요합니다</p>
              </div>
              <button
                onClick={handleRequestPermission}
                className="px-3 py-1.5 text-sm font-medium text-primary-700 dark:text-primary-300 bg-primary-100 dark:bg-primary-900/30 rounded-lg hover:bg-primary-200 dark:hover:bg-primary-900/50 transition-colors"
              >
                허용
              </button>
            </div>
          )}
          {permission === 'unsupported' && (
            <div className="flex items-center gap-2">
              <BellOff className="w-4 h-4 text-zinc-400" />
              <span className="text-sm text-zinc-500 dark:text-zinc-400">이 브라우저에서는 알림을 지원하지 않습니다</span>
            </div>
          )}
        </div>
      </section>

      {/* Budget Alert */}
      <section>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
          <PiggyBank className="w-4 h-4" />
          예산 알림
        </h3>
        <div className="space-y-3">
          <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
            <ToggleSwitch
              checked={draft.notifications.budgetAlert}
              onChange={(v) => updateNotification({ budgetAlert: v })}
              label="예산 초과 알림"
              description="설정한 예산 비율을 초과하면 알려줍니다"
            />
          </div>
          {draft.notifications.budgetAlert && (
            <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">알림 기준</p>
              <div className="flex flex-wrap gap-2">
                {THRESHOLD_OPTIONS.map((v) => (
                  <button
                    key={v}
                    onClick={() => updateNotification({ budgetThreshold: v })}
                    className={clsx(
                      'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                      draft.notifications.budgetThreshold === v
                        ? 'bg-primary-500 text-white'
                        : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-300 dark:hover:bg-zinc-600'
                    )}
                  >
                    {v}%
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Transaction Reminder */}
      <section>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4" />
          거래 기록 알림
        </h3>
        <div className="space-y-3">
          <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
            <ToggleSwitch
              checked={draft.notifications.transactionReminder}
              onChange={(v) => updateNotification({ transactionReminder: v })}
              label="거래 기록 리마인더"
              description="매일 설정한 시간에 지출을 기록하도록 알려줍니다"
            />
          </div>
          {draft.notifications.transactionReminder && (
            <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">알림 시간</p>
              <div className="flex flex-wrap gap-2">
                {REMINDER_TIMES.map((t) => (
                  <button
                    key={t}
                    onClick={() => updateNotification({ reminderTime: t })}
                    className={clsx(
                      'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                      draft.notifications.reminderTime === t
                        ? 'bg-primary-500 text-white'
                        : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-300 dark:hover:bg-zinc-600'
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Subscription Billing Alert */}
      <section>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
          <CreditCard className="w-4 h-4" />
          구독 결제일 알림
        </h3>
        <div className="space-y-3">
          <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
            <ToggleSwitch
              checked={draft.notifications.subscriptionBillingAlert ?? false}
              onChange={(v) => updateNotification({ subscriptionBillingAlert: v })}
              label="결제일 미리 알림"
              description="구독 결제일이 가까워지면 알려줍니다"
            />
          </div>
          {draft.notifications.subscriptionBillingAlert && (
            <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">알림 시점</p>
              <div className="flex flex-wrap gap-2">
                {ALERT_DAYS_OPTIONS.map((opt) => {
                  const currentDays = draft.notifications.subscriptionAlertDaysBefore ?? [0, 1, 3]
                  const isSelected = currentDays.includes(opt.value)
                  return (
                    <button
                      key={opt.value}
                      onClick={() => {
                        const updated = isSelected
                          ? currentDays.filter((d) => d !== opt.value)
                          : [...currentDays, opt.value].sort((a, b) => a - b)
                        if (updated.length > 0) {
                          updateNotification({ subscriptionAlertDaysBefore: updated })
                        }
                      }}
                      className={clsx(
                        'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                        isSelected
                          ? 'bg-primary-500 text-white'
                          : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-300 dark:hover:bg-zinc-600'
                      )}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
