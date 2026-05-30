import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { DailyValue, AssetValueProjection } from '@/lib/types'
import * as db from '@/services/database'
import { getCurrentMonthString, getTodayString } from '@/lib/dateUtils'
import { groupValuesByItem, valueAsOf } from '@/services/assetAnalytics'
import { buildForward, buildBackfill } from '@/services/valueProjection'
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
  /**
   * 기준값/기준일/규칙으로 일자별 값 시리즈를 DB에 일괄 기록한다.
   * - 전방(기준일~(Y+1)-12-31): 규칙 적용, 변경분만 기록(멱등)
   * - 백필((Y-1)-01-01~최초기록 직전): 평탄(기준값), 빈 날짜만
   * 반환 = 기록(추가/변경)한 건수.
   */
  applyValueSeries: (assetItemId: number, baseValue: number, baseDate: string, projection?: AssetValueProjection) => Promise<number>
  /** 활성 항목 전체에 대해 오늘 기준 투영을 보장(일 1회, self-guard). carry-forward 대체. */
  ensureValueProjections: () => Promise<number>
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

      applyValueSeries: async (assetItemId, baseValue, baseDate, projection) => {
        // 항목의 기존 값 맵
        const existing = new Map<string, number>()
        for (const v of get().allValues) if (v.assetItemId === assetItemId) existing.set(v.date, v.value)

        const entries: { assetItemId: number; date: string; value: number }[] = []
        // 전방(D ~ (Y+1)-12-31): 규칙대로 덮어쓰기. 변경분만 기록(결과는 동일, 멱등).
        for (const e of buildForward(baseValue, baseDate, projection)) {
          if (existing.get(e.date) !== e.value) entries.push({ assetItemId, date: e.date, value: e.value })
        }
        // 백필(D-1 ~ (Y-1)-01-01): 빈 날만, 값 있는 날 만나면 중단(기존 보존).
        for (const e of buildBackfill(baseValue, baseDate, (d) => existing.has(d))) {
          entries.push({ assetItemId, date: e.date, value: e.value })
        }

        if (entries.length > 0) await get().bulkSetValues(entries)
        return entries.length
      },

      ensureValueProjections: async () => {
        if (useSettingsStore.getState().settings.autoCarryForward === false) return 0
        const today = getTodayString()
        try {
          if (typeof localStorage !== 'undefined' && localStorage.getItem(CARRY_FORWARD_KEY) === today) return 0
        } catch { /* ignore */ }

        const items = useAssetStore.getState().items.filter(i => i.isActive && i.id != null)
        const allVals = get().allValues
        const byItem = groupValuesByItem(allVals)
        // 항목별 기존 날짜→값 맵 (한 번만 구성)
        const existingByItem = new Map<number, Map<string, number>>()
        for (const v of allVals) {
          let m = existingByItem.get(v.assetItemId)
          if (!m) { m = new Map(); existingByItem.set(v.assetItemId, m) }
          m.set(v.date, v.value)
        }

        const allEntries: { assetItemId: number; date: string; value: number }[] = []
        for (const item of items) {
          const series = byItem.get(item.id!)
          if (!series || series.length === 0) continue        // 값이 한 번도 없는 항목은 건드리지 않음
          const current = valueAsOf(series, today)
          if (current <= 0) continue
          const existing = existingByItem.get(item.id!) ?? new Map<string, number>()
          for (const e of buildForward(current, today, item.projection)) {
            if (existing.get(e.date) !== e.value) allEntries.push({ assetItemId: item.id!, date: e.date, value: e.value })
          }
          for (const e of buildBackfill(current, today, (d) => existing.has(d))) {
            allEntries.push({ assetItemId: item.id!, date: e.date, value: e.value })
          }
        }

        if (allEntries.length > 0) await get().bulkSetValues(allEntries) // 1회 쓰기 + 1회 재로딩
        try {
          if (typeof localStorage !== 'undefined') localStorage.setItem(CARRY_FORWARD_KEY, today)
        } catch { /* ignore */ }
        return allEntries.length
      },
    }),
    { name: 'daily-value-store' }
  )
)
