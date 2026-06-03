import { useState, useEffect } from 'react'
import { Bell, BellOff, Clock, PiggyBank, CreditCard } from 'lucide-react'
import { clsx } from 'clsx'
import { ToggleSwitch } from './ToggleSwitch'
import { Button } from '@/components/ui/Button'
import { FormSectionLabel, SegmentedControl } from '@/components/ui/CreateFormPrimitives'
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
        <FormSectionLabel icon={Bell}>브라우저 알림</FormSectionLabel>
        <div className="p-4 bg-surface-secondary rounded-xl">
          {permission === 'granted' && (
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-status-success" />
              <span className="text-sm text-status-success font-medium">알림이 허용되었습니다</span>
            </div>
          )}
          {permission === 'denied' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <BellOff className="w-4 h-4 text-status-danger" />
                <span className="text-sm text-status-danger font-medium">알림이 차단되었습니다</span>
              </div>
              <p className="text-caption text-sub">
                브라우저 설정에서 알림 권한을 허용해주세요
              </p>
            </div>
          )}
          {permission === 'default' && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-body3 text-heading">푸시 알림 활성화</p>
                <p className="text-caption text-sub">알림을 받으려면 브라우저 권한이 필요합니다</p>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={handleRequestPermission}
                className="w-full sm:w-auto"
              >
                허용
              </Button>
            </div>
          )}
          {permission === 'unsupported' && (
            <div className="flex items-center gap-2">
              <BellOff className="w-4 h-4 text-disabled" />
              <span className="text-sm text-sub">이 브라우저에서는 알림을 지원하지 않습니다</span>
            </div>
          )}
        </div>
      </section>

      {/* Budget Alert */}
      <section>
        <FormSectionLabel icon={PiggyBank}>예산 알림</FormSectionLabel>
        <div className="space-y-3">
          <div className="p-4 bg-surface-secondary rounded-xl">
            <ToggleSwitch
              checked={draft.notifications.budgetAlert}
              onChange={(v) => updateNotification({ budgetAlert: v })}
              label="예산 초과 알림"
              description="설정한 예산 비율을 초과하면 알려줍니다"
            />
          </div>
          {draft.notifications.budgetAlert && (
            <div className="p-4 bg-surface-secondary rounded-xl">
              <p className="text-caption text-sub mb-2">알림 기준</p>
              <SegmentedControl
                size="sm"
                layoutId="budget-threshold-pill"
                ariaLabel="예산 알림 기준"
                value={String(draft.notifications.budgetThreshold)}
                onChange={(v) => updateNotification({ budgetThreshold: Number(v) })}
                options={THRESHOLD_OPTIONS.map((v) => ({ value: String(v), label: `${v}%` }))}
              />
            </div>
          )}
        </div>
      </section>

      {/* Transaction Reminder */}
      <section>
        <FormSectionLabel icon={Clock}>거래 기록 알림</FormSectionLabel>
        <div className="space-y-3">
          <div className="p-4 bg-surface-secondary rounded-xl">
            <ToggleSwitch
              checked={draft.notifications.transactionReminder}
              onChange={(v) => updateNotification({ transactionReminder: v })}
              label="거래 기록 리마인더"
              description="매일 설정한 시간에 지출을 기록하도록 알려줍니다"
            />
          </div>
          {draft.notifications.transactionReminder && (
            <div className="p-4 bg-surface-secondary rounded-xl">
              <p className="text-caption text-sub mb-2">알림 시간</p>
              <SegmentedControl
                size="sm"
                layoutId="reminder-time-pill"
                ariaLabel="알림 시간"
                value={draft.notifications.reminderTime}
                onChange={(t) => updateNotification({ reminderTime: t })}
                options={REMINDER_TIMES.map((t) => ({ value: t, label: t }))}
              />
            </div>
          )}
        </div>
      </section>

      {/* Subscription Billing Alert */}
      <section>
        <FormSectionLabel icon={CreditCard}>구독 결제일 알림</FormSectionLabel>
        <div className="space-y-3">
          <div className="p-4 bg-surface-secondary rounded-xl">
            <ToggleSwitch
              checked={draft.notifications.subscriptionBillingAlert ?? false}
              onChange={(v) => updateNotification({ subscriptionBillingAlert: v })}
              label="결제일 미리 알림"
              description="구독 결제일이 가까워지면 알려줍니다"
            />
          </div>
          {draft.notifications.subscriptionBillingAlert && (
            <div className="p-4 bg-surface-secondary rounded-xl">
              <p className="text-caption text-sub mb-2">알림 시점</p>
              <div className="chip-group-wrap">
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
                      aria-pressed={isSelected}
                      className={clsx('chip chip-sm', isSelected && 'chip-active')}
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
