import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { DailyValue, AssetValueProjection } from '@/lib/types'
import * as db from '@/services/database'
import { getCurrentMonthString, getTodayString } from '@/lib/dateUtils'
import { buildForward, buildBackfill, backfillStart, isFlatProjection, nextDayYmd } from '@/services/valueProjection'
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
  bulkSetValues: (entries: { assetItemId: number; date: string; value: number; source?: 'manual' | 'projected' }[]) => Promise<void>
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
        const flat = isFlatProjection(projection)
        const forItem = get().allValues.filter(v => v.assetItemId === assetItemId)
        const manualDates = new Set(forItem.filter(v => v.source === 'manual').map(v => v.date))
        const existingVal = new Map(forItem.map(v => [v.date, v.value] as const))
        let prevManual: string | null = null
        for (const d of manualDates) if (d < baseDate && (prevManual === null || d > prevManual)) prevManual = d

        const base0 = Math.max(0, Math.round(baseValue))
        const entries: { assetItemId: number; date: string; value: number; source: 'manual' | 'projected' }[] = []
        // 입력일 = 수동 앵커
        entries.push({ assetItemId, date: baseDate, value: base0, source: 'manual' })

        if (flat) {
          // 평탄 = 희소 저장: 기존 자동(projected) 정리 + 소급/백필 앵커 1개. 미래는 forward-fill 이 커버.
          const removed = await db.clearProjectedDailyValues(assetItemId)
          if (removed.length > 0) {
            import('@/services/firestoreSync').then(({ deleteMultipleFromCloud }) =>
              import('./authStore').then(({ useAuthStore }) => {
                const user = useAuthStore.getState().user
                if (user) deleteMultipleFromCloud(user.uid, 'dailyValues', removed)
              })).catch(err => console.error('[projection] cloud cleanup failed:', err))
          }
          const soupStart = prevManual ? nextDayYmd(prevManual) : backfillStart(baseDate)
          if (soupStart < baseDate) entries.push({ assetItemId, date: soupStart, value: base0, source: 'projected' })
        } else {
          // 변동 규칙 = dense: 전방 덮어쓰기(변경분만) + 역산 백필(직전 수동기록에서 중단).
          for (const e of buildForward(baseValue, baseDate, projection)) {
            if (e.date === baseDate) continue
            if (existingVal.get(e.date) !== e.value) entries.push({ assetItemId, date: e.date, value: e.value, source: 'projected' })
          }
          for (const e of buildBackfill(baseValue, baseDate, (d) => manualDates.has(d), projection)) {
            entries.push({ assetItemId, date: e.date, value: e.value, source: 'projected' })
          }
        }

        await get().bulkSetValues(entries)
        return entries.length
      },

      ensureValueProjections: async () => {
        if (useSettingsStore.getState().settings.autoCarryForward === false) return 0
        const today = getTodayString()
        try {
          if (typeof localStorage !== 'undefined' && localStorage.getItem(CARRY_FORWARD_KEY) === today) return 0
        } catch { /* ignore */ }

        const items = useAssetStore.getState().items.filter(i => i.isActive && i.id != null)
        const byItemRecs = new Map<number, DailyValue[]>()
        for (const v of get().allValues) {
          let a = byItemRecs.get(v.assetItemId)
          if (!a) { a = []; byItemRecs.set(v.assetItemId, a) }
          a.push(v)
        }

        const allEntries: { assetItemId: number; date: string; value: number; source: 'projected' }[] = []
        for (const item of items) {
          if (isFlatProjection(item.projection)) continue // 평탄은 forward-fill 이 미래 커버 → 저장 불필요
          const recs = byItemRecs.get(item.id!)
          if (!recs || recs.length === 0) continue
          // 기준 앵커 = 최신 수동기록(없으면 최신 기록)
          const pool = recs.some(r => r.source === 'manual') ? recs.filter(r => r.source === 'manual') : recs
          let anchor = pool[0]
          for (const r of pool) if (r.date > anchor.date) anchor = r
          const existingVal = new Map(recs.map(r => [r.date, r.value] as const))
          for (const e of buildForward(anchor.value, anchor.date, item.projection)) {
            if (e.date === anchor.date) continue
            if (existingVal.get(e.date) !== e.value) allEntries.push({ assetItemId: item.id!, date: e.date, value: e.value, source: 'projected' })
          }
        }

        if (allEntries.length > 0) await get().bulkSetValues(allEntries)
        try {
          if (typeof localStorage !== 'undefined') localStorage.setItem(CARRY_FORWARD_KEY, today)
        } catch { /* ignore */ }
        return allEntries.length
      },
    }),
    { name: 'daily-value-store' }
  )
)
