import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { Transaction, TransactionCategory, TransactionType, RepeatPattern, PaymentMethod, PaymentMethodItem } from '@/lib/types'
import * as db from '@/services/database'
import { processRecurringTransactions } from '@/services/recurringEngine'
import { useUndoStore } from './undoStore'
import { useToastStore } from './toastStore'
import { getCurrentMonthString } from '@/lib/dateUtils'

interface TransactionState {
  transactions: Transaction[]
  categories: TransactionCategory[]
  paymentMethodItems: PaymentMethodItem[]
  selectedMonth: string
  isLoading: boolean

  loadTransactions: (month?: string) => Promise<void>
  loadCategories: () => Promise<void>
  loadPaymentMethodItems: () => Promise<void>
  loadAll: () => Promise<void>
  setSelectedMonth: (month: string) => void

  addTransaction: (data: {
    memberId: number | null
    type: TransactionType
    amount: number
    categoryId: number | null
    date: string
    memo?: string
    paymentMethod?: PaymentMethod
    paymentMethodDetail?: string
    paymentMethodItemId?: number
    isRecurring?: boolean
    recurPattern?: RepeatPattern
  }) => Promise<number>
  processRecurring: () => Promise<void>
  updateTransaction: (id: number, updates: Partial<Transaction>) => Promise<void>
  deleteTransaction: (id: number) => Promise<void>

  getCategoriesByType: (type: TransactionType) => TransactionCategory[]

  // Category CRUD
  addCategory: (data: { name: string; type: TransactionType; color: string; icon?: string }) => Promise<number>
  updateCategory: (id: number, updates: Partial<TransactionCategory>) => Promise<void>
  deleteCategory: (id: number) => Promise<void>

  // PaymentMethodItem CRUD
  addPaymentMethodItem: (data: { type: PaymentMethod; name: string; memo?: string }) => Promise<number>
  updatePaymentMethodItem: (id: number, updates: Partial<PaymentMethodItem>) => Promise<void>
  deletePaymentMethodItem: (id: number) => Promise<void>
}

export const useTransactionStore = create<TransactionState>()(
  devtools(
    (set, get) => ({
      transactions: [],
      categories: [],
      paymentMethodItems: [],
      selectedMonth: getCurrentMonthString(),
      isLoading: false,

      loadTransactions: async (month?: string) => {
        const targetMonth = month || get().selectedMonth
        set({ isLoading: true })
        try {
          const transactions = await db.getTransactionsByMonth(targetMonth)
          set({ transactions, isLoading: false })
        } catch (err) {
          console.error('Failed to load transactions:', err)
          useToastStore.getState().addToast('거래 데이터를 불러오는데 실패했습니다.', 'error')
          set({ isLoading: false })
        }
      },

      loadCategories: async () => {
        const categories = await db.getAllTransactionCategories()
        set({ categories })
      },

      loadPaymentMethodItems: async () => {
        const paymentMethodItems = await db.getAllPaymentMethodItems()
        set({ paymentMethodItems })
      },

      loadAll: async () => {
        set({ isLoading: true })
        try {
          const [transactions, categories, paymentMethodItems] = await Promise.all([
            db.getTransactionsByMonth(get().selectedMonth),
            db.getAllTransactionCategories(),
            db.getAllPaymentMethodItems(),
          ])
          set({ transactions, categories, paymentMethodItems, isLoading: false })
          // Process recurring transactions silently in the background
          processRecurringTransactions().then((created) => {
            if (created > 0) get().loadTransactions()
          }).catch(() => {})
        } catch (err) {
          console.error('Failed to load ledger data:', err)
          useToastStore.getState().addToast('거래 데이터를 불러오는데 실패했습니다.', 'error')
          set({ isLoading: false })
        }
      },

      setSelectedMonth: (month: string) => {
        set({ selectedMonth: month })
        get().loadTransactions(month)
      },

      addTransaction: async (data) => {
        const now = new Date().toISOString()
        const id = await db.addTransaction({
          ...data,
          isRecurring: data.isRecurring ?? false,
          recurPattern: data.recurPattern,
          syncId: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
        })
        await get().loadTransactions()
        const typeLabel = data.type === 'income' ? '수입' : '지출'
        useToastStore.getState().addToast(`${typeLabel}이 기록되었습니다.`, 'success')
        return id
      },

      processRecurring: async () => {
        const created = await processRecurringTransactions()
        if (created > 0) {
          await get().loadTransactions()
        }
      },

      updateTransaction: async (id, updates) => {
        const prev = get().transactions.find(t => t.id === id)
        await db.updateTransaction(id, updates)
        await get().loadTransactions()

        if (prev) {
          useUndoStore.getState().pushAction({
            type: 'update',
            label: '거래 수정 취소',
            undo: async () => {
              await db.updateTransaction(id, {
                amount: prev.amount,
                categoryId: prev.categoryId,
                memo: prev.memo,
                date: prev.date,
                type: prev.type,
                paymentMethod: prev.paymentMethod,
                paymentMethodDetail: prev.paymentMethodDetail,
                paymentMethodItemId: prev.paymentMethodItemId,
              })
              await get().loadTransactions()
            },
            redo: async () => {
              await db.updateTransaction(id, updates)
              await get().loadTransactions()
            },
          })
        }
      },

      deleteTransaction: async (id) => {
        const prev = get().transactions.find(t => t.id === id)
        if (!prev) return
        await db.deleteTransaction(id)
        await get().loadTransactions()
        useToastStore.getState().addToast('거래가 삭제되었습니다.', 'info')
      },

      getCategoriesByType: (type) => get().categories.filter(c => c.type === type),

      // Category CRUD
      addCategory: async (data) => {
        const now = new Date().toISOString()
        const maxOrder = get().categories.filter(c => c.type === data.type).reduce((max, c) => Math.max(max, c.sortOrder), -1)
        const id = await db.addTransactionCategory({
          ...data,
          isDefault: false,
          sortOrder: maxOrder + 1,
          syncId: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
        })
        await get().loadCategories()
        useToastStore.getState().addToast('카테고리가 추가되었습니다.', 'success')
        return id
      },

      updateCategory: async (id, updates) => {
        await db.updateTransactionCategory(id, updates)
        await get().loadCategories()
        useToastStore.getState().addToast('카테고리가 수정되었습니다.', 'success')
      },

      deleteCategory: async (id) => {
        await db.deleteTransactionCategory(id)
        await get().loadCategories()
        await get().loadTransactions()
        useToastStore.getState().addToast('카테고리가 삭제되었습니다.', 'info')
      },

      // PaymentMethodItem CRUD
      addPaymentMethodItem: async (data) => {
        const now = new Date().toISOString()
        const items = get().paymentMethodItems.filter(i => i.type === data.type)
        const maxOrder = items.reduce((max, i) => Math.max(max, i.sortOrder), -1)
        const id = await db.addPaymentMethodItem({
          ...data,
          isActive: true,
          sortOrder: maxOrder + 1,
          syncId: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
        })
        await get().loadPaymentMethodItems()
        useToastStore.getState().addToast('거래수단이 추가되었습니다.', 'success')
        return id
      },

      updatePaymentMethodItem: async (id, updates) => {
        await db.updatePaymentMethodItem(id, updates)
        await get().loadPaymentMethodItems()
        useToastStore.getState().addToast('거래수단이 수정되었습니다.', 'success')
      },

      deletePaymentMethodItem: async (id) => {
        await db.deletePaymentMethodItem(id)
        await get().loadPaymentMethodItems()
        useToastStore.getState().addToast('거래수단이 삭제되었습니다.', 'info')
      },
    }),
    { name: 'transaction-store' }
  )
)
