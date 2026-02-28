import type { Subscription } from '@/lib/types'
import { getDaysUntilBilling } from '@/lib/dateUtils'

const NOTIFICATION_CHECK_KEY = 'fin-subscription-notification-last-check'

interface BillingNotification {
  subscription: Subscription
  daysUntil: number
}

/**
 * Get subscriptions that need notification based on alert days config.
 */
export function getSubscriptionsNeedingNotification(
  subscriptions: Subscription[],
  alertDaysBefore: number[],
): BillingNotification[] {
  const results: BillingNotification[] = []

  for (const sub of subscriptions) {
    if (sub.status !== 'active') continue
    const daysUntil = getDaysUntilBilling(
      sub.billingDay, sub.cycle, sub.billingMonth,
      sub.startDate, sub.customCycleDays,
    )
    if (alertDaysBefore.includes(daysUntil)) {
      results.push({ subscription: sub, daysUntil })
    }
  }

  return results.sort((a, b) => a.daysUntil - b.daysUntil)
}

/**
 * Check if we should run notification check today (once per day).
 */
export function shouldCheckNotifications(): boolean {
  const today = new Date().toISOString().split('T')[0]
  const lastCheck = localStorage.getItem(NOTIFICATION_CHECK_KEY)
  return lastCheck !== today
}

/**
 * Mark that we've checked notifications today.
 */
export function markNotificationsChecked(): void {
  const today = new Date().toISOString().split('T')[0]
  localStorage.setItem(NOTIFICATION_CHECK_KEY, today)
}

/**
 * Show browser notifications for upcoming subscription billing.
 */
export async function showBillingNotifications(
  subscriptions: Subscription[],
  alertDaysBefore: number[],
): Promise<void> {
  if (!shouldCheckNotifications()) return
  if (typeof Notification === 'undefined') return
  if (Notification.permission !== 'granted') return

  const items = getSubscriptionsNeedingNotification(subscriptions, alertDaysBefore)
  if (items.length === 0) {
    markNotificationsChecked()
    return
  }

  for (const { subscription, daysUntil } of items) {
    const timeLabel = daysUntil === 0 ? '오늘' : `${daysUntil}일 후`
    const amountLabel = subscription.currency === 'KRW'
      ? `₩${subscription.amount.toLocaleString('ko-KR')}`
      : `$${subscription.amount.toFixed(2)}`

    new Notification(`구독 결제 예정: ${subscription.name}`, {
      body: `${timeLabel} ${amountLabel} 결제 예정`,
      tag: `sub-billing-${subscription.id}-${daysUntil}`,
      icon: '/icons/icon-192x192.png',
    })
  }

  markNotificationsChecked()
}
