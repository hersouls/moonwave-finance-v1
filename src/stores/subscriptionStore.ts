import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { Subscription, SubscriptionCurrency, SubscriptionStatus, SubscriptionCategoryType, SubscriptionCycle, PauseHistoryEntry } from '@/lib/types'
import * as db from '@/services/database'
import { useToastStore } from './toastStore'
import { useSettingsStore } from './settingsStore'
import { getDaysUntilBilling } from '@/lib/dateUtils'

interface SubscriptionState {
  subscriptions: Subscription[]
  isLoading: boolean

  loadSubscriptions: () => Promise<void>
  addSubscription: (data: {
    name: string
    description?: string
    currency: SubscriptionCurrency
    amount: number
    cycle: SubscriptionCycle
    billingDay: number
    billingMonth?: number
    customCycleDays?: number
    category: SubscriptionCategoryType
    startDate: string
    icon?: string
    color: string
    url?: string
    memo?: string
  }) => Promise<number>
  updateSubscription: (id: number, updates: Partial<Subscription>) => Promise<void>
  deleteSubscription: (id: number) => Promise<void>
  changeStatus: (id: number, status: SubscriptionStatus) => Promise<void>

  getByStatus: (status: SubscriptionStatus) => Subscription[]
  getByCurrency: (currency: SubscriptionCurrency) => Subscription[]
  getActive: () => Subscription[]
  getMonthlyTotalKRW: () => number
  getMonthlyTotalUSD: () => number
  getMonthlyTotalCombinedKRW: () => number
  getYearlyTotalCombinedKRW: () => number
  getUpcomingBills: (daysAhead?: number) => Subscription[]
}

function monthlyAmount(sub: Subscription): number {
  switch (sub.cycle) {
    case 'weekly': return sub.amount * (52 / 12)
    case 'biweekly': return sub.amount * (26 / 12)
    case 'monthly': return sub.amount
    case 'quarterly': return sub.amount / 3
    case 'semi-annual': return sub.amount / 6
    case 'yearly': return sub.amount / 12
    case 'custom': return sub.customCycleDays
      ? sub.amount * (365 / sub.customCycleDays / 12)
      : sub.amount
    default: return sub.amount
  }
}

export const useSubscriptionStore = create<SubscriptionState>()(
  devtools(
    (set, get) => ({
      subscriptions: [],
      isLoading: false,

      loadSubscriptions: async () => {
        set({ isLoading: true })
        try {
          const subscriptions = await db.getAllSubscriptions()
          set({ subscriptions, isLoading: false })
        } catch (err) {
          console.error('Failed to load subscriptions:', err)
          set({ isLoading: false })
        }
      },

      addSubscription: async (data) => {
        const now = new Date().toISOString()
        const subs = get().subscriptions
        const maxOrder = subs.length > 0 ? Math.max(...subs.map(s => s.sortOrder)) : -1
        const id = await db.addSubscription({
          ...data,
          status: 'active',
          sortOrder: maxOrder + 1,
          syncId: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
        })
        await get().loadSubscriptions()
        useToastStore.getState().addToast('구독이 등록되었습니다.', 'success')
        return id
      },

      updateSubscription: async (id, updates) => {
        await db.updateSubscription(id, updates)
        await get().loadSubscriptions()
        useToastStore.getState().addToast('구독이 수정되었습니다.', 'success')
      },

      deleteSubscription: async (id) => {
        await db.deleteSubscription(id)
        await get().loadSubscriptions()
        useToastStore.getState().addToast('구독이 삭제되었습니다.', 'info')
      },

      changeStatus: async (id, status) => {
        const sub = get().subscriptions.find(s => s.id === id)
        if (!sub) return

        const today = new Date().toISOString().split('T')[0]
        const updates: Partial<Subscription> = { status }
        const history: PauseHistoryEntry[] = [...(sub.pauseHistory ?? [])]

        if (status === 'paused') {
          history.push({ pausedAt: today })
          updates.pauseHistory = history
        } else if (status === 'active' && sub.status === 'paused') {
          // Resume: close the last pause entry
          if (history.length > 0 && !history[history.length - 1].resumedAt) {
            history[history.length - 1] = { ...history[history.length - 1], resumedAt: today }
          }
          updates.pauseHistory = history
        } else if (status === 'cancelled') {
          // If currently paused, close the pause entry first
          if (sub.status === 'paused' && history.length > 0 && !history[history.length - 1].resumedAt) {
            history[history.length - 1] = { ...history[history.length - 1], resumedAt: today }
            updates.pauseHistory = history
          }
          updates.endDate = today
        }

        await db.updateSubscription(id, updates)
        await get().loadSubscriptions()
        const labels: Record<SubscriptionStatus, string> = {
          active: '구독이 재개되었습니다.',
          paused: '구독이 일시정지되었습니다.',
          cancelled: '구독이 해지되었습니다.',
        }
        useToastStore.getState().addToast(labels[status], 'info')
      },

      getByStatus: (status) => get().subscriptions.filter(s => s.status === status),
      getByCurrency: (currency) => get().subscriptions.filter(s => s.currency === currency),
      getActive: () => get().subscriptions.filter(s => s.status === 'active'),

      getMonthlyTotalKRW: () => {
        return get().getActive()
          .filter(s => s.currency === 'KRW')
          .reduce((sum, s) => sum + monthlyAmount(s), 0)
      },

      getMonthlyTotalUSD: () => {
        return get().getActive()
          .filter(s => s.currency === 'USD')
          .reduce((sum, s) => sum + monthlyAmount(s), 0)
      },

      getMonthlyTotalCombinedKRW: () => {
        const krw = get().getMonthlyTotalKRW()
        const usd = get().getMonthlyTotalUSD()
        const rate = useSettingsStore.getState().settings.exchangeRate?.usdToKrw ?? 1350
        return krw + Math.round(usd * rate)
      },

      getYearlyTotalCombinedKRW: () => {
        return get().getMonthlyTotalCombinedKRW() * 12
      },

      getUpcomingBills: (daysAhead = 7) => {
        return get().getActive()
          .filter(s => getDaysUntilBilling(s.billingDay, s.cycle, s.billingMonth, s.startDate, s.customCycleDays) <= daysAhead)
          .sort((a, b) =>
            getDaysUntilBilling(a.billingDay, a.cycle, a.billingMonth, a.startDate, a.customCycleDays) -
            getDaysUntilBilling(b.billingDay, b.cycle, b.billingMonth, b.startDate, b.customCycleDays)
          )
      },
    }),
    { name: 'subscription-store' }
  )
)
