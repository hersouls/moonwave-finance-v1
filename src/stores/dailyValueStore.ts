import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { DailyValue } from '@/lib/types'
import * as db from '@/services/database'
import { getCurrentMonthString } from '@/lib/dateUtils'
import { useToastStore } from './toastStore'

interface DailyValueState {
  values: DailyValue[]
  selectedMonth: string
  isLoading: boolean

  loadValues: (month?: string) => Promise<void>
  setSelectedMonth: (month: string) => void
  setValue: (assetItemId: number, date: string, value: number) => Promise<void>
  bulkSetValues: (entries: { assetItemId: number; date: string; value: number }[]) => Promise<void>
  getValueForItemDate: (assetItemId: number, date: string) => number | null
  getLatestValueForItem: (assetItemId: number) => DailyValue | null
}

export const useDailyValueStore = create<DailyValueState>()(
  devtools(
    (set, get) => ({
      values: [],
      selectedMonth: getCurrentMonthString(),
      isLoading: false,

      loadValues: async (month?: string) => {
        const targetMonth = month || get().selectedMonth
        set({ isLoading: true })
        try {
          const values = await db.getDailyValuesByMonth(targetMonth)
          set({ values, isLoading: false })
        } catch (err) {
          console.error('Failed to load daily values:', err)
          useToastStore.getState().addToast('일별 가치 데이터를 불러오는데 실패했습니다.', 'error')
          set({ isLoading: false })
        }
      },

      setSelectedMonth: (month: string) => {
        set({ selectedMonth: month })
        get().loadValues(month)
      },

      setValue: async (assetItemId: number, date: string, value: number) => {
        await db.setDailyValue(assetItemId, date, value)
        // Reload values for the month of the changed date
        const month = date.substring(0, 7)
        if (month === get().selectedMonth) {
          await get().loadValues()
        }
      },

      bulkSetValues: async (entries) => {
        await db.bulkSetDailyValues(entries)
        await get().loadValues()
      },

      getValueForItemDate: (assetItemId: number, date: string) => {
        const val = get().values.find(
          v => v.assetItemId === assetItemId && v.date === date
        )
        return val ? val.value : null
      },

      getLatestValueForItem: (assetItemId: number) => {
        const itemValues = get().values
          .filter(v => v.assetItemId === assetItemId)
          .sort((a, b) => b.date.localeCompare(a.date))
        return itemValues[0] || null
      },
    }),
    { name: 'daily-value-store' }
  )
)
