import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { Budget } from '@/lib/types'
import * as db from '@/services/database'
import { useTransactionStore } from './transactionStore'
import { getCurrentMonthString } from '@/lib/dateUtils'

interface BudgetState {
  budgets: Budget[]
  isLoading: boolean
  selectedMonth: string

  loadBudgets: (month?: string) => Promise<void>
  setSelectedMonth: (month: string) => void
  setBudget: (categoryId: number, amount: number) => Promise<void>
  deleteBudget: (id: number) => Promise<void>
  getBudgetForCategory: (categoryId: number) => Budget | null
  getUsageForCategory: (categoryId: number) => number
  getTotalBudget: () => number
  getTotalUsed: () => number
}

export const useBudgetStore = create<BudgetState>()(
  devtools(
    (set, get) => ({
      budgets: [],
      isLoading: false,
      selectedMonth: getCurrentMonthString(),

      loadBudgets: async (month?: string) => {
        const targetMonth = month || get().selectedMonth
        set({ isLoading: true })
        try {
          const budgets = await db.getBudgetsByMonth(targetMonth)
          set({ budgets, isLoading: false })
        } catch {
          set({ isLoading: false })
        }
      },

      setSelectedMonth: (month: string) => {
        set({ selectedMonth: month })
        get().loadBudgets(month)
      },

      setBudget: async (categoryId: number, amount: number) => {
        await db.setBudget(categoryId, get().selectedMonth, amount)
        await get().loadBudgets()
      },

      deleteBudget: async (id: number) => {
        const budget = get().budgets.find(b => b.id === id)
        await db.deleteBudget(id)
        await get().loadBudgets()
        // Delete from Firestore
        if (budget?.syncId) {
          import('@/services/firestoreSync').then(({ deleteFromCloud }) => {
            import('./authStore').then(({ useAuthStore }) => {
              const user = useAuthStore.getState().user
              if (user) deleteFromCloud(user.uid, 'budgets', budget.syncId!)
            })
          }).catch(err => console.error('[budget] delete sync failed:', err))
        }
      },

      getBudgetForCategory: (categoryId: number) => {
        return get().budgets.find(b => b.categoryId === categoryId) || null
      },

      getUsageForCategory: (categoryId: number) => {
        const month = get().selectedMonth
        const transactions = useTransactionStore.getState().transactions
        return transactions
          .filter(t => t.type === 'expense' && t.categoryId === categoryId && t.date.startsWith(month))
          .reduce((sum, t) => sum + t.amount, 0)
      },

      getTotalBudget: () => {
        return get().budgets.reduce((sum, b) => sum + b.amount, 0)
      },

      getTotalUsed: () => {
        const month = get().selectedMonth
        const transactions = useTransactionStore.getState().transactions
        const budgetCatIds = new Set(get().budgets.map(b => b.categoryId))
        return transactions
          .filter(t => t.type === 'expense' && t.categoryId !== null && budgetCatIds.has(t.categoryId) && t.date.startsWith(month))
          .reduce((sum, t) => sum + t.amount, 0)
      },
    }),
    { name: 'budget-store' }
  )
)
