import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { Subscription, SubscriptionCurrency, SubscriptionStatus, SubscriptionCategoryType } from '@/lib/types'
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
    cycle: 'monthly' | 'yearly'
    billingDay: number
    billingMonth?: number
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
  return sub.cycle === 'yearly' ? sub.amount / 12 : sub.amount
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
        const updates: Partial<Subscription> = { status }
        if (status === 'cancelled') {
          updates.endDate = new Date().toISOString().split('T')[0]
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
          .filter(s => getDaysUntilBilling(s.billingDay, s.cycle, s.billingMonth) <= daysAhead)
          .sort((a, b) =>
            getDaysUntilBilling(a.billingDay, a.cycle, a.billingMonth) -
            getDaysUntilBilling(b.billingDay, b.cycle, b.billingMonth)
          )
      },
    }),
    { name: 'subscription-store' }
  )
)
