import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { DailyValue } from '@/lib/types'
import * as db from '@/services/database'
import { getCurrentMonthString, getTodayString } from '@/lib/dateUtils'
import { groupValuesByItem, valueAsOf } from '@/services/assetAnalytics'
import { useToastStore } from './toastStore'
import { useAssetStore } from './assetStore'
import { useSettingsStore } from './settingsStore'

const CARRY_FORWARD_KEY = 'finance:lastCarryForward'

interface DailyValueState {
  values: DailyValue[]
  allValues: DailyValue[]
  selectedMonth: string
  isLoading: boolean

  loadValues: (month?: string) => Promise<void>
  loadAllValues: () => Promise<void>
  setSelectedMonth: (month: string) => void
  setValue: (assetItemId: number, date: string, value: number) => Promise<void>
  bulkSetValues: (entries: { assetItemId: number; date: string; value: number }[]) => Promise<void>
  getValueForItemDate: (assetItemId: number, date: string) => number | null
  getLatestValueForItem: (assetItemId: number) => DailyValue | null
  /** 오늘 값을 자동 이어쓰기(carry-forward). 하루 1회만 실행(self-guard). 반환=기록한 항목 수. */
  carryForwardToday: () => Promise<number>
}

export const useDailyValueStore = create<DailyValueState>()(
  devtools(
    (set, get) => ({
      values: [],
      allValues: [],
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

      loadAllValues: async () => {
        try {
          const allValues = await db.getAllDailyValues()
          set({ allValues })
        } catch (err) {
          console.error('Failed to load all daily values:', err)
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
        // 카드·통계·차트는 전체 이력(allValues)을 사용하므로 함께 갱신해야 일관성이 유지된다.
        await get().loadAllValues()
      },

      bulkSetValues: async (entries) => {
        await db.bulkSetDailyValues(entries)
        await get().loadValues()
        await get().loadAllValues()
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

      carryForwardToday: async () => {
        // 설정으로 끌 수 있음(기본 ON). 사용자가 별도 입력을 안 해도 어제 값이 오늘로 자동 저장된다.
        if (useSettingsStore.getState().settings.autoCarryForward === false) return 0
        const today = getTodayString()
        // 하루 1회만 — 같은 날 중복 실행 방지
        try {
          if (typeof localStorage !== 'undefined' && localStorage.getItem(CARRY_FORWARD_KEY) === today) return 0
        } catch { /* ignore */ }

        const items = useAssetStore.getState().items.filter(i => i.isActive && i.id != null)
        const byItem = groupValuesByItem(get().allValues)
        const entries: { assetItemId: number; date: string; value: number }[] = []
        for (const item of items) {
          const series = byItem.get(item.id!)
          if (!series || series.length === 0) continue          // 이전 값이 없으면 이어쓸 게 없음
          if (series.some(v => v.date === today)) continue       // 오늘 이미 기록됨(수기 입력 포함)
          const value = valueAsOf(series, today)                 // 마지막 알려진 값(forward-fill)
          if (value > 0) entries.push({ assetItemId: item.id!, date: today, value })
        }

        if (entries.length > 0) await get().bulkSetValues(entries)
        try {
          if (typeof localStorage !== 'undefined') localStorage.setItem(CARRY_FORWARD_KEY, today)
        } catch { /* ignore */ }
        return entries.length
      },
    }),
    { name: 'daily-value-store' }
  )
)
