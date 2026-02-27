import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { FinancialGoal, GoalType } from '@/lib/types'
import * as db from '@/services/database'
import { useToastStore } from './toastStore'

interface GoalState {
  goals: FinancialGoal[]
  isLoading: boolean

  loadGoals: () => Promise<void>
  addGoal: (data: {
    name: string
    type: GoalType
    targetAmount: number
    currentAmount: number
    targetDate: string
    color: string
    icon?: string
    memo?: string
  }) => Promise<number>
  updateGoal: (id: number, updates: Partial<FinancialGoal>) => Promise<void>
  deleteGoal: (id: number) => Promise<void>
  getActiveGoals: () => FinancialGoal[]
  getCompletedGoals: () => FinancialGoal[]
}

export const useGoalStore = create<GoalState>()(
  devtools(
    (set, get) => ({
      goals: [],
      isLoading: false,

      loadGoals: async () => {
        set({ isLoading: true })
        try {
          const goals = await db.getAllGoals()
          set({ goals, isLoading: false })
        } catch {
          set({ isLoading: false })
        }
      },

      addGoal: async (data) => {
        const now = new Date().toISOString()
        const id = await db.addGoal({
          ...data,
          isCompleted: false,
          syncId: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
        })
        await get().loadGoals()
        useToastStore.getState().addToast('목표가 추가되었습니다.', 'success')
        return id
      },

      updateGoal: async (id, updates) => {
        await db.updateGoal(id, updates)
        await get().loadGoals()
      },

      deleteGoal: async (id) => {
        await db.deleteGoal(id)
        await get().loadGoals()
        useToastStore.getState().addToast('목표가 삭제되었습니다.', 'info')
      },

      getActiveGoals: () => get().goals.filter(g => !g.isCompleted),
      getCompletedGoals: () => get().goals.filter(g => g.isCompleted),
    }),
    { name: 'goal-store' }
  )
)
