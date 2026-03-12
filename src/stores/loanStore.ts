import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { Loan, LoanRepaymentType } from '@/lib/types'
import * as db from '@/services/database'
import { useToastStore } from './toastStore'

interface LoanState {
  loans: Loan[]
  isLoading: boolean

  loadLoans: () => Promise<void>
  addLoan: (data: {
    name: string
    lender?: string
    loanDate: string
    maturityDate: string
    principalAmount: number
    currentBalance: number
    annualRate: number
    repaymentType: LoanRepaymentType
    paymentDay: number
    paymentAccount?: string
    linkedAssetItemId?: number
    memo?: string
  }) => Promise<number>
  updateLoan: (id: number, updates: Partial<Loan>) => Promise<void>
  deleteLoan: (id: number) => Promise<void>

  getActiveLoans: () => Loan[]
  getMonthlyInterest: (loan: Loan) => number
  getTotalMonthlyInterest: () => number
}

export const useLoanStore = create<LoanState>()(
  devtools(
    (set, get) => ({
      loans: [],
      isLoading: false,

      loadLoans: async () => {
        set({ isLoading: true })
        try {
          const loans = await db.getAllLoans()
          set({ loans, isLoading: false })
        } catch (err) {
          console.error('Failed to load loans:', err)
          set({ isLoading: false })
        }
      },

      addLoan: async (data) => {
        const now = new Date().toISOString()
        const loans = get().loans
        const maxOrder = loans.length > 0 ? Math.max(...loans.map(l => l.sortOrder)) : -1
        const newLoan = {
          ...data,
          isActive: true,
          sortOrder: maxOrder + 1,
          syncId: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
        }
        const id = await db.addLoan(newLoan)
        await get().loadLoans()
        useToastStore.getState().addToast('대출이 등록되었습니다.', 'success')
        return id
      },

      updateLoan: async (id, updates) => {
        await db.updateLoan(id, updates)
        await get().loadLoans()
        useToastStore.getState().addToast('대출 정보가 수정되었습니다.', 'success')
      },

      deleteLoan: async (id) => {
        await db.deleteLoan(id)
        await get().loadLoans()
        useToastStore.getState().addToast('대출이 삭제되었습니다.', 'info')
      },

      getActiveLoans: () => get().loans.filter(l => l.isActive),

      getMonthlyInterest: (loan) => {
        return Math.round(loan.currentBalance * loan.annualRate / 100 / 12)
      },

      getTotalMonthlyInterest: () => {
        return get().getActiveLoans().reduce((sum, loan) => {
          return sum + Math.round(loan.currentBalance * loan.annualRate / 100 / 12)
        }, 0)
      },
    }),
    { name: 'loan-store' }
  )
)
