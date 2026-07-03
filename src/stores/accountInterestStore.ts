import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { AccountInterest, InterestCurrency } from '@/lib/types'
import * as db from '@/services/database'
import { useToastStore } from './toastStore'

interface AccountInterestState {
  interests: AccountInterest[]
  isLoading: boolean

  loadInterests: () => Promise<void>
  addInterest: (data: Omit<AccountInterest, 'id' | 'sortOrder' | 'createdAt' | 'updatedAt'>) => Promise<string>
  addInterestsFromParsed: (items: Omit<AccountInterest, 'id' | 'sortOrder' | 'createdAt' | 'updatedAt'>[]) => Promise<{ added: number; skipped: number }>
  updateInterest: (id: string, updates: Partial<AccountInterest>) => Promise<void>
  deleteInterest: (id: string) => Promise<void>
  clearAll: () => Promise<void>

  getTotalInterest: () => number
  getTotalTax: () => number
  getNetInterest: () => number
  getByCurrency: (currency: InterestCurrency) => AccountInterest[]
  getMonthlyStats: () => { month: string; amount: number; tax: number; count: number }[]
}

export const useAccountInterestStore = create<AccountInterestState>()(
  devtools(
    (set, get) => ({
      interests: [],
      isLoading: false,

      loadInterests: async () => {
        set({ isLoading: true })
        try {
          const interests = await db.getAllAccountInterests()
          set({ interests, isLoading: false })
        } catch (err) {
          console.error('Failed to load account interests:', err)
          set({ isLoading: false })
        }
      },

      addInterest: async (data) => {
        const now = new Date().toISOString()
        const items = get().interests
        const maxOrder = items.length > 0 ? Math.max(...items.map(d => d.sortOrder)) : -1

        const dup = await db.findDuplicateAccountInterest(data.depositDate, data.periodStart, data.periodEnd, data.currency)
        if (dup) {
          useToastStore.getState().addToast(`이미 등록된 이자입니다: ${data.depositDate} ${data.interestType}`, 'info')
          return dup.id
        }

        const id = await db.addAccountInterest({
          ...data,
          sortOrder: maxOrder + 1,
          createdAt: now,
          updatedAt: now,
        })
        await get().loadInterests()
        useToastStore.getState().addToast('계좌이자가 등록되었습니다.', 'success')
        return id
      },

      addInterestsFromParsed: async (parsedItems) => {
        const now = new Date().toISOString()
        let maxOrder = get().interests.length > 0 ? Math.max(...get().interests.map(d => d.sortOrder)) : -1
        let added = 0
        let skipped = 0

        for (const data of parsedItems) {
          const dup = await db.findDuplicateAccountInterest(data.depositDate, data.periodStart, data.periodEnd, data.currency)
          if (dup) { skipped++; continue }
          maxOrder++
          await db.addAccountInterest({
            ...data,
            sortOrder: maxOrder,
            createdAt: now,
            updatedAt: now,
          })
          added++
        }

        await get().loadInterests()

        if (added > 0 && skipped > 0) {
          useToastStore.getState().addToast(`${added}건 등록, ${skipped}건 중복 건너뜀`, 'success')
        } else if (added > 0) {
          useToastStore.getState().addToast(`${added}건 계좌이자가 등록되었습니다.`, 'success')
        } else {
          useToastStore.getState().addToast('모든 항목이 이미 등록되어 있습니다.', 'info')
        }

        return { added, skipped }
      },

      updateInterest: async (id, updates) => {
        await db.updateAccountInterest(id, updates)
        await get().loadInterests()
        useToastStore.getState().addToast('계좌이자가 수정되었습니다.', 'success')
      },

      deleteInterest: async (id) => {
        await db.deleteAccountInterest(id)
        await get().loadInterests()
        useToastStore.getState().addToast('계좌이자가 삭제되었습니다.', 'info')
      },

      clearAll: async () => {
        const all = await db.getAllAccountInterests()
        for (const r of all) if (r.id != null) await db.deleteAccountInterest(r.id)
        await get().loadInterests()
        useToastStore.getState().addToast('계좌이자가 초기화되었습니다.', 'info')
      },

      getTotalInterest: () => get().interests.reduce((s, d) => s + d.interestAmount, 0),
      getTotalTax: () => get().interests.reduce((s, d) => s + d.tax, 0),
      getNetInterest: () => get().interests.reduce((s, d) => s + (d.interestAmount - d.tax), 0),
      getByCurrency: (currency) => get().interests.filter(d => d.currency === currency),

      getMonthlyStats: () => {
        const items = get().interests
        const map = new Map<string, { amount: number; tax: number; count: number }>()
        for (const d of items) {
          const month = d.depositDate.slice(0, 7)
          const entry = map.get(month) ?? { amount: 0, tax: 0, count: 0 }
          entry.amount += d.interestAmount
          entry.tax += d.tax
          entry.count++
          map.set(month, entry)
        }
        return Array.from(map.entries())
          .map(([month, stats]) => ({ month, ...stats }))
          .sort((a, b) => b.month.localeCompare(a.month))
      },
    }),
    { name: 'account-interest-store' }
  )
)
