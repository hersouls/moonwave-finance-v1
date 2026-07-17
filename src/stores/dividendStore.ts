import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { Dividend, InvestmentMarket } from '@/lib/types'
import * as db from '@/services/database'
import { useToastStore } from './toastStore'

interface DividendState {
  dividends: Dividend[]
  isLoading: boolean

  loadDividends: () => Promise<void>
  addDividend: (data: Omit<Dividend, 'id' | 'sortOrder' | 'createdAt' | 'updatedAt'>) => Promise<string>
  addDividendsFromParsed: (divs: Omit<Dividend, 'id' | 'sortOrder' | 'createdAt' | 'updatedAt'>[]) => Promise<{ added: number; skipped: number }>
  updateDividend: (id: string, updates: Partial<Dividend>) => Promise<void>
  deleteDividend: (id: string) => Promise<void>
  clearAll: () => Promise<void>

  getTotalDividend: () => number
  getTotalTax: () => number
  getNetDividend: () => number
  getByMarket: (market: InvestmentMarket) => Dividend[]
  getByMember: (memberId: string) => Dividend[]
  getMonthlyStats: () => { month: string; amount: number; tax: number; count: number }[]
  getTopStocks: (limit?: number) => { stockName: string; total: number; count: number }[]
}

export const useDividendStore = create<DividendState>()(
  devtools(
    (set, get) => ({
      dividends: [],
      isLoading: false,

      loadDividends: async () => {
        set({ isLoading: true })
        try {
          const dividends = await db.getAllDividends()
          set({ dividends, isLoading: false })
        } catch (err) {
          console.error('Failed to load dividends:', err)
          set({ isLoading: false })
        }
      },

      addDividend: async (data) => {
        const now = new Date().toISOString()
        const divs = get().dividends
        const maxOrder = divs.length > 0 ? Math.max(...divs.map(d => d.sortOrder)) : -1

        const dup = await db.findDuplicateDividend(data.paymentDate, data.stockName, data.quantity)
        if (dup) {
          useToastStore.getState().addToast(`이미 등록된 배당입니다: ${data.stockName} (${data.paymentDate})`, 'info')
          return dup.id
        }

        const newDiv = {
          ...data,
          sortOrder: maxOrder + 1,
          createdAt: now,
          updatedAt: now,
        }
        const id = await db.addDividend(newDiv)
        await get().loadDividends()
        useToastStore.getState().addToast('배당금이 등록되었습니다.', 'success')
        return id
      },

      addDividendsFromParsed: async (parsedDivs) => {
        const now = new Date().toISOString()
        const currentDivs = get().dividends
        let maxOrder = currentDivs.length > 0 ? Math.max(...currentDivs.map(d => d.sortOrder)) : -1
        let added = 0
        let skipped = 0

        for (const data of parsedDivs) {
          const dup = await db.findDuplicateDividend(data.paymentDate, data.stockName, data.quantity)
          if (dup) { skipped++; continue }
          maxOrder++
          await db.addDividend({
            ...data,
            sortOrder: maxOrder,
            createdAt: now,
            updatedAt: now,
          })
          added++
        }

        await get().loadDividends()

        if (added > 0 && skipped > 0) {
          useToastStore.getState().addToast(`${added}건 등록, ${skipped}건 중복 건너뜀`, 'success')
        } else if (added > 0) {
          useToastStore.getState().addToast(`${added}건 배당금이 등록되었습니다.`, 'success')
        } else {
          useToastStore.getState().addToast('모든 항목이 이미 등록되어 있습니다.', 'info')
        }

        return { added, skipped }
      },

      updateDividend: async (id, updates) => {
        await db.updateDividend(id, updates)
        await get().loadDividends()
        useToastStore.getState().addToast('배당금이 수정되었습니다.', 'success')
      },

      deleteDividend: async (id) => {
        await db.deleteDividend(id)
        await get().loadDividends()
        useToastStore.getState().addToast('배당금이 삭제되었습니다.', 'info')
      },

      clearAll: async () => {
        const all = await db.getAllDividends()
        for (const d of all) if (d.id != null) await db.deleteDividend(d.id)
        await get().loadDividends()
        useToastStore.getState().addToast('배당금이 초기화되었습니다.', 'info')
      },

      getTotalDividend: () => get().dividends.reduce((s, d) => s + d.dividendAmount, 0),
      getTotalTax: () => get().dividends.reduce((s, d) => s + d.tax, 0),
      getNetDividend: () => get().dividends.reduce((s, d) => s + d.dividendAmount - d.tax, 0),
      getByMarket: (market) => get().dividends.filter(d => d.market === market),
      getByMember: (memberId) => get().dividends.filter(d => d.memberId === memberId),

      getMonthlyStats: () => {
        const divs = get().dividends
        const map = new Map<string, { amount: number; tax: number; count: number }>()
        for (const d of divs) {
          const month = d.paymentDate.slice(0, 7)
          const entry = map.get(month) ?? { amount: 0, tax: 0, count: 0 }
          entry.amount += d.dividendAmount
          entry.tax += d.tax
          entry.count++
          map.set(month, entry)
        }
        return Array.from(map.entries())
          .map(([month, stats]) => ({ month, ...stats }))
          .sort((a, b) => b.month.localeCompare(a.month))
      },

      getTopStocks: (limit = 10) => {
        const divs = get().dividends
        const map = new Map<string, { total: number; count: number }>()
        for (const d of divs) {
          const entry = map.get(d.stockName) ?? { total: 0, count: 0 }
          entry.total += d.dividendAmount
          entry.count++
          map.set(d.stockName, entry)
        }
        return Array.from(map.entries())
          .map(([stockName, stats]) => ({ stockName, ...stats }))
          .sort((a, b) => b.total - a.total)
          .slice(0, limit)
      },
    }),
    { name: 'dividend-store' }
  )
)
