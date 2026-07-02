import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { DailyValue, AssetValueProjection } from '@/lib/types'
import * as db from '@/services/database'
import { getCurrentMonthString, getTodayString } from '@/lib/dateUtils'
import { buildForward, buildBackfill, isFlatProjection, planValueSeries } from '@/services/valueProjection'
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
  setValue: (assetItemId: string, date: string, value: number) => Promise<void>
  bulkSetValues: (entries: { assetItemId: string; date: string; value: number; source?: 'manual' | 'projected' }[]) => Promise<void>
  getValueForItemDate: (assetItemId: string, date: string) => number | null
  getLatestValueForItem: (assetItemId: string) => DailyValue | null
  /**
   * 기준값/기준일/규칙으로 일자별 값 시리즈를 DB에 일괄 기록한다.
   * - 전방(기준일~(Y+1)-12-31): 규칙 적용, 변경분만 기록(멱등)
   * - 평탄 백필((Y-1)-01-01): 기준일 이전에 기존 앵커가 **없을 때만**(첫 기록) 추가.
   *   직전 앵커가 있으면 그 값이 forward-fill 로 공백을 덮으므로 백필하지 않는다(기존 값 보존).
   * 반환 = 기록(추가/변경)한 건수.
   */
  applyValueSeries: (assetItemId: string, baseValue: number, baseDate: string, projection?: AssetValueProjection) => Promise<number>
  /** 활성 항목 전체에 대해 오늘 기준 투영을 보장(일 1회, self-guard). carry-forward 대체. */
  ensureValueProjections: () => Promise<number>
  /**
   * 동기화로 받은 앵커(manual/레거시 source 미지정)만으로 파생(projected)
   * 시리즈를 로컬에서 dense 재구성한다 (Phase 2: projected 는 클라우드에 없음).
   * 다중앵커 복원 = 마지막 앵커 forward(미래) + 각 앵커 backfill(이전 앵커에서
   * 중단 → 그 앵커 앞 구간). 동일날짜 앵커는 id 로 결정적 선택(기기간 일치).
   * 평탄으로 바뀐 자산의 묵은 projected 는 정리. force=true 면 autoCarryForward
   * 설정·일일 가드를 무시한다(신규 기기 첫 동기화 직후 즉시 재생성용).
   */
  regenerateProjections: (force?: boolean) => Promise<number>
  /**
   * 레거시 복구: 기록이 전부 미래(>오늘 UTC)인 항목에 오늘 수동 앵커를 추가한다.
   * (구 부채 생성 모달이 로컬시간 날짜로 기록 → KST 새벽엔 UTC보다 하루 앞서 저장되어
   * forward-fill 이 오늘 0 을 반환하던 버그) "전부 미래" 는 정상 항목엔 없는 조건이라 안전.
   * 오늘 앵커가 생기면 더는 조건에 안 걸려 자동 멱등.
   */
  healLegacyFutureValues: () => Promise<number>
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

      setValue: async (assetItemId: string, date: string, value: number) => {
        await db.setDailyValue(assetItemId, date, value)
        // 단일 set 으로 합쳐 재렌더(깜빡임)를 최소화. 월/전체를 한 번에 다시 읽어 실제 DB id 보존.
        const month = get().selectedMonth
        const [values, allValues] = await Promise.all([
          db.getDailyValuesByMonth(month),
          db.getAllDailyValues(),
        ])
        set({ values, allValues })
      },

      bulkSetValues: async (entries) => {
        await db.bulkSetDailyValues(entries)
        // loadValues+loadAllValues 를 따로 호출하면 set 이 2회 발생해 화면이 두 번 갱신된다.
        // 월/전체를 병렬로 읽어 한 번의 set 으로 조용히 반영(isLoading 토글도 없음).
        const month = get().selectedMonth
        const [values, allValues] = await Promise.all([
          db.getDailyValuesByMonth(month),
          db.getAllDailyValues(),
        ])
        set({ values, allValues })
      },

      getValueForItemDate: (assetItemId: string, date: string) => {
        const val = get().values.find(
          v => v.assetItemId === assetItemId && v.date === date
        )
        return val ? val.value : null
      },

      getLatestValueForItem: (assetItemId: string) => {
        const itemValues = get().values
          .filter(v => v.assetItemId === assetItemId)
          .sort((a, b) => b.date.localeCompare(a.date))
        return itemValues[0] || null
      },

      applyValueSeries: async (assetItemId, baseValue, baseDate, projection) => {
        // forItem 은 정리 전 스냅샷 — planValueSeries 가 보는 "직전 앵커"는 정리에도 살아남는
        // 수동/레거시 기록뿐이라 정리 전후가 동일하다.
        const forItem = get().allValues.filter(v => v.assetItemId === assetItemId)

        if (isFlatProjection(projection)) {
          // 평탄 = 희소 저장: 기존 자동(projected) 정리. 미래/공백은 forward-fill 이 커버.
          await db.clearProjectedDailyValues(assetItemId)
        }

        const entries = planValueSeries(forItem, baseValue, baseDate, projection)
          .map(e => ({ assetItemId, ...e }))
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
        // 가드 포이즈닝 방지: 자산/값이 아직 비어 있으면(콜드스타트, 동기화 전)
        // CARRY_FORWARD_KEY 를 쓰지 않고 빠진다 — 빈 데이터에 today 를 박으면
        // 그날 내내 carry-forward 가 죽는다.
        if (items.length === 0 || get().allValues.length === 0) return 0
        const byItemRecs = new Map<string, DailyValue[]>()
        for (const v of get().allValues) {
          let a = byItemRecs.get(v.assetItemId)
          if (!a) { a = []; byItemRecs.set(v.assetItemId, a) }
          a.push(v)
        }

        const allEntries: { assetItemId: string; date: string; value: number; source: 'projected' }[] = []
        for (const item of items) {
          if (isFlatProjection(item.projection)) continue // 평탄은 forward-fill 이 미래 커버 → 저장 불필요
          const recs = byItemRecs.get(item.id)
          if (!recs || recs.length === 0) continue
          // 기준 앵커 = 최신 수동기록(없으면 최신 기록)
          const pool = recs.some(r => r.source === 'manual') ? recs.filter(r => r.source === 'manual') : recs
          let anchor = pool[0]
          for (const r of pool) if (r.date > anchor.date) anchor = r
          const existingVal = new Map(recs.map(r => [r.date, r.value] as const))
          for (const e of buildForward(anchor.value, anchor.date, item.projection)) {
            if (e.date === anchor.date) continue
            if (existingVal.get(e.date) !== e.value) allEntries.push({ assetItemId: item.id, date: e.date, value: e.value, source: 'projected' })
          }
        }

        if (allEntries.length > 0) await get().bulkSetValues(allEntries)
        try {
          if (typeof localStorage !== 'undefined') localStorage.setItem(CARRY_FORWARD_KEY, today)
        } catch { /* ignore */ }
        return allEntries.length
      },

      regenerateProjections: async (force = false) => {
        if (!force) {
          if (useSettingsStore.getState().settings.autoCarryForward === false) return 0
          const today = getTodayString()
          try {
            if (typeof localStorage !== 'undefined' && localStorage.getItem(CARRY_FORWARD_KEY) === today) return 0
          } catch { /* ignore */ }
        }

        // 동기화 직후엔 현재 월만 로드돼 있을 수 있다 — 자산/전체값을 먼저 새로고침.
        await useAssetStore.getState().loadAll()
        await get().loadAllValues()

        const items = useAssetStore.getState().items.filter(i => i.isActive && i.id != null)
        const allValues = get().allValues
        // 가드 포이즈닝 방지 (ensureValueProjections 와 동일).
        if (items.length === 0 || allValues.length === 0) return 0

        // 자산별 앵커(projected 아님) + 자산별 현재값 맵(멱등 비교용)
        const anchorsByItem = new Map<string, DailyValue[]>()
        const valuesByItem = new Map<string, Map<string, number>>()
        for (const v of allValues) {
          let vm = valuesByItem.get(v.assetItemId)
          if (!vm) { vm = new Map(); valuesByItem.set(v.assetItemId, vm) }
          vm.set(v.date, v.value)
          if (v.source === 'projected') continue
          let a = anchorsByItem.get(v.assetItemId)
          if (!a) { a = []; anchorsByItem.set(v.assetItemId, a) }
          a.push(v)
        }

        const allEntries: { assetItemId: string; date: string; value: number; source: 'projected' }[] = []
        const flatToClear: string[] = []

        for (const item of items) {
          if (isFlatProjection(item.projection)) {
            // 평탄으로 바뀐 자산: 남은 dense projected 정리 — projected 삭제는 더
            // 이상 클라우드로 전파되지 않으므로 각 기기가 로컬에서 청소해야 한다.
            flatToClear.push(item.id)
            continue
          }
          const anchors = anchorsByItem.get(item.id)
          if (!anchors || anchors.length === 0) continue // 앵커 없음 → 투영 불가

          // 동일 날짜 앵커는 id 로 결정적 선택 (sync race 중복 시 기기간 일치)
          const byDate = new Map<string, DailyValue>()
          for (const a of anchors) {
            const ex = byDate.get(a.date)
            if (!ex || a.id < ex.id) byDate.set(a.date, a)
          }
          const sorted = [...byDate.values()].sort((x, y) => x.date.localeCompare(y.date))
          const anchorDates = new Set(sorted.map(a => a.date))
          const isAnchor = (d: string) => anchorDates.has(d)
          const existingVal = valuesByItem.get(item.id) ?? new Map<string, number>()

          // 미래: 마지막(최신) 앵커에서 forward — (Y+1)-12-31 까지.
          const last = sorted[sorted.length - 1]
          for (const e of buildForward(last.value, last.date, item.projection)) {
            if (e.date === last.date) continue
            if (existingVal.get(e.date) !== e.value) allEntries.push({ assetItemId: item.id, date: e.date, value: e.value, source: 'projected' })
          }
          // 갭/과거: 각 앵커에서 backfill — 이전 앵커(또는 (Y-1)-01-01)에서 중단.
          // 갭 (a_{i-1}, a_i) 은 항상 더 늦은 앵커 a_i 의 역산이 채운다(원본 기기의
          // 증분 applyValueSeries 결과와 동일). 앵커 처리 순서와 무관하게 결정적.
          for (const a of sorted) {
            for (const e of buildBackfill(a.value, a.date, isAnchor, item.projection)) {
              if (existingVal.get(e.date) !== e.value) allEntries.push({ assetItemId: item.id, date: e.date, value: e.value, source: 'projected' })
            }
          }
        }

        for (const id of flatToClear) await db.clearProjectedDailyValues(id)
        if (allEntries.length > 0) {
          await get().bulkSetValues(allEntries) // 내부에서 values/allValues 재로딩
        } else if (flatToClear.length > 0) {
          const month = get().selectedMonth
          const [values, all] = await Promise.all([db.getDailyValuesByMonth(month), db.getAllDailyValues()])
          set({ values, allValues: all })
        }

        if (!force) {
          try {
            if (typeof localStorage !== 'undefined') localStorage.setItem(CARRY_FORWARD_KEY, getTodayString())
          } catch { /* ignore */ }
        }
        return allEntries.length
      },

      healLegacyFutureValues: async () => {
        const today = getTodayString()
        const items = useAssetStore.getState().items.filter(i => i.isActive && i.id != null)
        const byItem = new Map<string, DailyValue[]>()
        for (const v of get().allValues) {
          let a = byItem.get(v.assetItemId)
          if (!a) { a = []; byItem.set(v.assetItemId, a) }
          a.push(v)
        }
        const entries: { assetItemId: string; date: string; value: number; source: 'manual' }[] = []
        for (const item of items) {
          const recs = byItem.get(item.id)
          if (!recs || recs.length === 0) continue
          // 정상 항목은 항상 오늘 이하 기록이 있다. "전부 미래" = 레거시 미스데이트 버그.
          if (recs.every(r => r.date > today)) {
            let earliest = recs[0]
            for (const r of recs) if (r.date < earliest.date) earliest = r
            entries.push({ assetItemId: item.id, date: today, value: earliest.value, source: 'manual' })
          }
        }
        if (entries.length > 0) await get().bulkSetValues(entries)
        return entries.length
      },
    }),
    { name: 'daily-value-store' }
  )
)
