import { db } from '@/services/database'
import { format, isAfter, isBefore, addDays, addMonths } from 'date-fns'
import type { Transaction, Subscription, PauseHistoryEntry } from '@/lib/types'

/**
 * Check if a date string falls within any pause period.
 */
function isDateInPausePeriod(dateStr: string, pauseHistory?: PauseHistoryEntry[]): boolean {
  if (!pauseHistory || pauseHistory.length === 0) return false
  for (const entry of pauseHistory) {
    if (dateStr >= entry.pausedAt) {
      if (!entry.resumedAt || dateStr < entry.resumedAt) {
        return true
      }
    }
  }
  return false
}

/**
 * Generate all billing dates for a subscription from startDate up to endDate.
 */
function generateBillingDates(sub: Subscription, upTo: Date): string[] {
  const startDate = new Date(sub.startDate)
  const dates: string[] = []

  switch (sub.cycle) {
    case 'weekly':
    case 'biweekly':
    case 'custom': {
      const intervalDays = sub.cycle === 'weekly' ? 7
        : sub.cycle === 'biweekly' ? 14
        : Math.max(1, Math.min(365, sub.customCycleDays ?? 30))
      let current = startDate
      while (!isAfter(current, upTo)) {
        if (!isBefore(current, startDate)) {
          dates.push(format(current, 'yyyy-MM-dd'))
        }
        current = addDays(current, intervalDays)
      }
      break
    }
    case 'monthly': {
      let current = startDate
      while (!isAfter(current, upTo)) {
        dates.push(format(current, 'yyyy-MM-dd'))
        current = addMonths(current, 1)
        // Clamp to billing day
        const maxDay = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate()
        current = new Date(current.getFullYear(), current.getMonth(), Math.min(sub.billingDay, maxDay))
      }
      break
    }
    case 'quarterly': {
      let current = startDate
      while (!isAfter(current, upTo)) {
        dates.push(format(current, 'yyyy-MM-dd'))
        current = addMonths(current, 3)
        const maxDay = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate()
        current = new Date(current.getFullYear(), current.getMonth(), Math.min(sub.billingDay, maxDay))
      }
      break
    }
    case 'semi-annual': {
      let current = startDate
      while (!isAfter(current, upTo)) {
        dates.push(format(current, 'yyyy-MM-dd'))
        current = addMonths(current, 6)
        const maxDay = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate()
        current = new Date(current.getFullYear(), current.getMonth(), Math.min(sub.billingDay, maxDay))
      }
      break
    }
    case 'yearly': {
      const bm = (sub.billingMonth ?? 1) - 1 // 0-indexed
      let year = startDate.getFullYear()
      const maxDayFirst = new Date(year, bm + 1, 0).getDate()
      let current = new Date(year, bm, Math.min(sub.billingDay, maxDayFirst))
      if (isBefore(current, startDate)) {
        year++
        const maxDay = new Date(year, bm + 1, 0).getDate()
        current = new Date(year, bm, Math.min(sub.billingDay, maxDay))
      }
      while (!isAfter(current, upTo)) {
        dates.push(format(current, 'yyyy-MM-dd'))
        year++
        const maxDay = new Date(year, bm + 1, 0).getDate()
        current = new Date(year, bm, Math.min(sub.billingDay, maxDay))
      }
      break
    }
  }

  return dates
}

/**
 * Generates expense transactions for active subscriptions.
 * For each active subscription, creates a transaction on each billing date
 * from the subscription start date up to today,
 * skipping pause periods and dates where a transaction already exists.
 */
export async function processSubscriptionTransactions(): Promise<number> {
  const today = new Date()

  const activeSubs = await db.subscriptions.where('status').equals('active').toArray()
  let created = 0

  for (const sub of activeSubs) {
    if (!sub.id) continue

    // Get existing transactions for this subscription
    const existing = await db.transactions
      .where('subscriptionId')
      .equals(sub.id)
      .toArray()
    const existingDates = new Set(existing.map((t) => t.date))

    const billingDates = generateBillingDates(sub, today)

    for (const dateStr of billingDates) {
      // Skip future dates
      if (dateStr > format(today, 'yyyy-MM-dd')) continue
      // Skip dates before subscription start
      if (dateStr < sub.startDate) continue
      // Skip if already created
      if (existingDates.has(dateStr)) continue
      // Skip if in pause period
      if (isDateInPausePeriod(dateStr, sub.pauseHistory)) continue

      const now = new Date().toISOString()
      await db.transactions.add({
        syncId: crypto.randomUUID(),
        memberId: null,
        type: 'expense',
        amount: sub.amount,
        categoryId: sub.linkedTransactionCategoryId ?? null,
        date: dateStr,
        memo: `${sub.name} 구독`,
        paymentMethod: undefined,
        paymentMethodItemId: sub.paymentMethodItemId,
        isRecurring: false,
        subscriptionId: sub.id,
        createdAt: now,
        updatedAt: now,
      } as Transaction)
      created++
    }
  }

  return created
}

export { generateBillingDates, isDateInPausePeriod }
