import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { InvestmentTrade, InvestmentAssetType, InvestmentMarket } from '@/lib/types'
import * as db from '@/services/database'
import { useToastStore } from './toastStore'

interface InvestmentState {
  trades: InvestmentTrade[]
  isLoading: boolean

  loadTrades: () => Promise<void>
  addTrade: (data: Omit<InvestmentTrade, 'id' | 'syncId' | 'sortOrder' | 'createdAt' | 'updatedAt'>) => Promise<number>
  addTradesFromParsed: (trades: Omit<InvestmentTrade, 'id' | 'syncId' | 'sortOrder' | 'createdAt' | 'updatedAt'>[]) => Promise<{ added: number; skipped: number }>
  updateTrade: (id: number, updates: Partial<InvestmentTrade>) => Promise<void>
  deleteTrade: (id: number) => Promise<void>
  clearAll: () => Promise<void>

  // Computed getters
  getByMarket: (market: InvestmentMarket) => InvestmentTrade[]
  getByAssetType: (type: InvestmentAssetType) => InvestmentTrade[]
  getByMember: (memberId: number) => InvestmentTrade[]
  getTotalProfit: () => number
  getTotalProfitRate: () => number
  getWinCount: () => number
  getLossCount: () => number
  getWinRate: () => number
  getByMonth: (month: string) => InvestmentTrade[]
  getMonthlyStats: () => { month: string; profit: number; count: number }[]
  getTopGainers: (limit?: number) => InvestmentTrade[]
  getTopLosers: (limit?: number) => InvestmentTrade[]
}

export const useInvestmentStore = create<InvestmentState>()(
  devtools(
    (set, get) => ({
      trades: [],
      isLoading: false,

      loadTrades: async () => {
        set({ isLoading: true })
        try {
          const trades = await db.getAllInvestmentTrades()
          set({ trades, isLoading: false })
        } catch (err) {
          console.error('Failed to load investment trades:', err)
          set({ isLoading: false })
        }
      },

      addTrade: async (data) => {
        const now = new Date().toISOString()
        const trades = get().trades
        const maxOrder = trades.length > 0 ? Math.max(...trades.map(t => t.sortOrder)) : -1

        // Duplicate check
        const dup = await db.findDuplicateInvestmentTrade(data.sellDate, data.stockName, data.sellQuantity)
        if (dup) {
          useToastStore.getState().addToast(`이미 등록된 거래입니다: ${data.stockName} (${data.sellDate})`, 'info')
          return dup.id!
        }

        const newTrade = {
          ...data,
          sortOrder: maxOrder + 1,
          syncId: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
        }
        const id = await db.addInvestmentTrade(newTrade)
        await get().loadTrades()
        useToastStore.getState().addToast('투자수익이 등록되었습니다.', 'success')
        return id
      },

      addTradesFromParsed: async (parsedTrades) => {
        const now = new Date().toISOString()
        let currentTrades = get().trades
        let maxOrder = currentTrades.length > 0 ? Math.max(...currentTrades.map(t => t.sortOrder)) : -1
        let added = 0
        let skipped = 0

        for (const data of parsedTrades) {
          const dup = await db.findDuplicateInvestmentTrade(data.sellDate, data.stockName, data.sellQuantity)
          if (dup) {
            skipped++
            continue
          }
          maxOrder++
          await db.addInvestmentTrade({
            ...data,
            sortOrder: maxOrder,
            syncId: crypto.randomUUID(),
            createdAt: now,
            updatedAt: now,
          })
          added++
        }

        await get().loadTrades()

        if (added > 0 && skipped > 0) {
          useToastStore.getState().addToast(`${added}건 등록, ${skipped}건 중복 건너뜀`, 'success')
        } else if (added > 0) {
          useToastStore.getState().addToast(`${added}건 투자수익이 등록되었습니다.`, 'success')
        } else {
          useToastStore.getState().addToast('모든 항목이 이미 등록되어 있습니다.', 'info')
        }

        return { added, skipped }
      },

      updateTrade: async (id, updates) => {
        await db.updateInvestmentTrade(id, updates)
        await get().loadTrades()
        useToastStore.getState().addToast('투자수익이 수정되었습니다.', 'success')
      },

      deleteTrade: async (id) => {
        await db.deleteInvestmentTrade(id)
        await get().loadTrades()
        useToastStore.getState().addToast('투자수익이 삭제되었습니다.', 'info')
      },

      clearAll: async () => {
        const all = await db.getAllInvestmentTrades()
        for (const t of all) if (t.id != null) await db.deleteInvestmentTrade(t.id)
        await get().loadTrades()
        useToastStore.getState().addToast('판매수익이 초기화되었습니다.', 'info')
      },

      // Computed
      getByMarket: (market) => get().trades.filter(t => t.market === market),
      getByAssetType: (type) => get().trades.filter(t => t.assetType === type),
      getByMember: (memberId) => get().trades.filter(t => t.memberId === memberId),

      getTotalProfit: () => get().trades.reduce((sum, t) => sum + t.totalProfit, 0),

      getTotalProfitRate: () => {
        const trades = get().trades
        const totalBuy = trades.reduce((sum, t) => sum + t.totalBuyAmount, 0)
        if (totalBuy === 0) return 0
        const totalProfit = trades.reduce((sum, t) => sum + t.totalProfit, 0)
        return (totalProfit / totalBuy) * 100
      },

      getWinCount: () => get().trades.filter(t => t.totalProfit > 0).length,
      getLossCount: () => get().trades.filter(t => t.totalProfit <= 0).length,

      getWinRate: () => {
        const trades = get().trades
        if (trades.length === 0) return 0
        return (trades.filter(t => t.totalProfit > 0).length / trades.length) * 100
      },

      getByMonth: (month) => get().trades.filter(t => t.sellDate.startsWith(month)),

      getMonthlyStats: () => {
        const trades = get().trades
        const map = new Map<string, { profit: number; count: number }>()
        for (const t of trades) {
          const month = t.sellDate.slice(0, 7)
          const entry = map.get(month) ?? { profit: 0, count: 0 }
          entry.profit += t.totalProfit
          entry.count++
          map.set(month, entry)
        }
        return Array.from(map.entries())
          .map(([month, stats]) => ({ month, ...stats }))
          .sort((a, b) => b.month.localeCompare(a.month))
      },

      getTopGainers: (limit = 5) =>
        [...get().trades].sort((a, b) => b.totalProfit - a.totalProfit).slice(0, limit),

      getTopLosers: (limit = 5) =>
        [...get().trades].sort((a, b) => a.totalProfit - b.totalProfit).slice(0, limit),
    }),
    { name: 'investment-store' }
  )
)
