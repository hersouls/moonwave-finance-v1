import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { Transaction, TransactionCategory, TransactionType, RepeatPattern, PaymentMethod } from '@/lib/types'
import * as db from '@/services/database'
import { processRecurringTransactions } from '@/services/recurringEngine'
import { useUndoStore } from './undoStore'
import { useToastStore } from './toastStore'
import { getCurrentMonthString } from '@/lib/dateUtils'

interface TransactionState {
  transactions: Transaction[]
  categories: TransactionCategory[]
  selectedMonth: string
  isLoading: boolean

  loadTransactions: (month?: string) => Promise<void>
  loadCategories: () => Promise<void>
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
    isRecurring?: boolean
    recurPattern?: RepeatPattern
  }) => Promise<number>
  processRecurring: () => Promise<void>
  updateTransaction: (id: number, updates: Partial<Transaction>) => Promise<void>
  deleteTransaction: (id: number) => Promise<void>

  getCategoriesByType: (type: TransactionType) => TransactionCategory[]
}

export const useTransactionStore = create<TransactionState>()(
  devtools(
    (set, get) => ({
      transactions: [],
      categories: [],
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

      loadAll: async () => {
        set({ isLoading: true })
        try {
          const [transactions, categories] = await Promise.all([
            db.getTransactionsByMonth(get().selectedMonth),
            db.getAllTransactionCategories(),
          ])
          set({ transactions, categories, isLoading: false })
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
    }),
    { name: 'transaction-store' }
  )
)
