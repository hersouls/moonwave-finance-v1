import { useMemo } from 'react'
import type { InvestmentTrade, Dividend, AccountInterest } from '@/lib/types'

// ─── Types ───────────────────────────────────────
export interface TradeEfficiency {
  winRate: number
  avgWinProfit: number
  avgLossAmount: number
  profitFactor: number     // total wins / total losses
  avgHoldReturn: number    // avg return per trade
  bestTrade: InvestmentTrade | null
  worstTrade: InvestmentTrade | null
  maxConsecutiveWins: number
  maxConsecutiveLosses: number
}

export interface AssetTypePerf {
  assetType: string
  tradeCount: number
  totalProfit: number
  totalBuy: number
  roi: number
  winRate: number
}

export interface FeeAndTax {
  totalFees: number
  totalTradeTax: number
  totalDividendTax: number
  totalInterestTax: number
  totalTaxAll: number
  feeRateOfVolume: number   // fees / total sell volume %
  effectiveTaxRate: number  // total tax / total gross income %
}

export interface DividendInsight {
  annualizedRate: number    // projected annual
  topStockShare: number     // top stock % of total
  top3Share: number         // top 3 stocks %
  avgPerMonth: number       // avg monthly net
  uniqueStocks: number
  domesticShare: number
  overseasShare: number
}

export interface MonthlySeasonality {
  month: number   // 1-12
  avgProfit: number
  tradeCount: number
  winRate: number
}

export interface MemberPerf {
  memberId: number
  memberName: string
  tradeProfit: number
  tradeCount: number
  tradeWinRate: number
  dividendNet: number
  interestNet: number
  totalIncome: number
}

export interface ConcentrationRisk {
  top5Share: number         // top 5 stocks % of total profit
  top5Stocks: { name: string; profit: number }[]
  herfindahlIndex: number   // 0-1 higher = more concentrated
  riskLevel: 'low' | 'medium' | 'high'
}

export interface ProjectedIncome {
  monthlyAvg: number
  annualProjection: number
  monthsOfData: number
  trend: 'up' | 'down' | 'stable'
  trendPercent: number
}

export interface InvestmentInsights {
  tradeEfficiency: TradeEfficiency
  assetTypePerfs: AssetTypePerf[]
  feeAndTax: FeeAndTax
  dividendInsight: DividendInsight
  seasonality: MonthlySeasonality[]
  memberPerfs: MemberPerf[]
  concentration: ConcentrationRisk
  projectedIncome: ProjectedIncome
}

// ─── Hook ────────────────────────────────────────
export function useInvestmentInsights(
  trades: InvestmentTrade[],
  dividends: Dividend[],
  interests: AccountInterest[],
  memberMap: Map<number, string>,
): InvestmentInsights {
  return useMemo(() => {
    // ═══ Trade Efficiency ═══
    const winners = trades.filter(t => t.totalProfit > 0)
    const losers = trades.filter(t => t.totalProfit <= 0)
    const totalWinProfit = winners.reduce((s, t) => s + t.totalProfit, 0)
    const totalLossAmount = Math.abs(losers.reduce((s, t) => s + t.totalProfit, 0))
    const sortedByProfit = [...trades].sort((a, b) => b.totalProfit - a.totalProfit)

    let maxConsWins = 0, maxConsLosses = 0, curWins = 0, curLosses = 0
    const sorted = [...trades].sort((a, b) => a.sellDate.localeCompare(b.sellDate))
    for (const t of sorted) {
      if (t.totalProfit > 0) { curWins++; curLosses = 0; maxConsWins = Math.max(maxConsWins, curWins) }
      else { curLosses++; curWins = 0; maxConsLosses = Math.max(maxConsLosses, curLosses) }
    }

    const tradeEfficiency: TradeEfficiency = {
      winRate: trades.length > 0 ? (winners.length / trades.length) * 100 : 0,
      avgWinProfit: winners.length > 0 ? totalWinProfit / winners.length : 0,
      avgLossAmount: losers.length > 0 ? totalLossAmount / losers.length : 0,
      profitFactor: totalLossAmount > 0 ? totalWinProfit / totalLossAmount : totalWinProfit > 0 ? Infinity : 0,
      avgHoldReturn: trades.length > 0 ? trades.reduce((s, t) => s + t.profitRate, 0) / trades.length : 0,
      bestTrade: sortedByProfit[0] ?? null,
      worstTrade: sortedByProfit[sortedByProfit.length - 1] ?? null,
      maxConsecutiveWins: maxConsWins,
      maxConsecutiveLosses: maxConsLosses,
    }

    // ═══ Asset Type Performance ═══
    const atMap = new Map<string, { count: number; profit: number; buy: number; wins: number }>()
    for (const t of trades) {
      const e = atMap.get(t.assetType) ?? { count: 0, profit: 0, buy: 0, wins: 0 }
      e.count++
      e.profit += t.totalProfit
      e.buy += t.totalBuyAmount
      if (t.totalProfit > 0) e.wins++
      atMap.set(t.assetType, e)
    }
    const assetTypePerfs: AssetTypePerf[] = Array.from(atMap.entries())
      .map(([assetType, d]) => ({
        assetType,
        tradeCount: d.count,
        totalProfit: d.profit,
        totalBuy: d.buy,
        roi: d.buy > 0 ? (d.profit / d.buy) * 100 : 0,
        winRate: d.count > 0 ? (d.wins / d.count) * 100 : 0,
      }))
      .sort((a, b) => b.roi - a.roi)

    // ═══ Fee & Tax ═══
    const totalFees = trades.reduce((s, t) => s + t.fee, 0)
    const totalTradeTax = trades.reduce((s, t) => s + t.tax, 0)
    const totalDividendTax = dividends.reduce((s, d) => s + d.tax, 0)
    const totalInterestTax = interests.reduce((s, r) => s + r.tax, 0)
    const totalTaxAll = totalTradeTax + totalDividendTax + totalInterestTax
    const totalSellVolume = trades.reduce((s, t) => s + t.totalSellAmount, 0)
    const grossIncome = trades.reduce((s, t) => s + Math.max(t.totalProfit, 0), 0)
      + dividends.reduce((s, d) => s + d.dividendAmount, 0)
      + interests.reduce((s, r) => s + r.interestAmount, 0)

    const feeAndTax: FeeAndTax = {
      totalFees,
      totalTradeTax,
      totalDividendTax,
      totalInterestTax,
      totalTaxAll,
      feeRateOfVolume: totalSellVolume > 0 ? (totalFees / totalSellVolume) * 100 : 0,
      effectiveTaxRate: grossIncome > 0 ? (totalTaxAll / grossIncome) * 100 : 0,
    }

    // ═══ Dividend Insight ═══
    const divByStock = new Map<string, number>()
    for (const d of dividends) divByStock.set(d.stockName, (divByStock.get(d.stockName) ?? 0) + d.dividendAmount)
    const divStockRanked = Array.from(divByStock.entries()).sort(([, a], [, b]) => b - a)
    const totalDivAmount = dividends.reduce((s, d) => s + d.dividendAmount, 0)
    const netDivAmount = dividends.reduce((s, d) => s + d.dividendAmount - d.tax, 0)
    const divMonths = new Set(dividends.map(d => d.paymentDate.slice(0, 7)))
    const domesticDiv = dividends.filter(d => d.market === 'domestic').reduce((s, d) => s + d.dividendAmount, 0)

    const dividendInsight: DividendInsight = {
      annualizedRate: divMonths.size > 0 ? (netDivAmount / divMonths.size) * 12 : 0,
      topStockShare: totalDivAmount > 0 && divStockRanked[0] ? (divStockRanked[0][1] / totalDivAmount) * 100 : 0,
      top3Share: totalDivAmount > 0 ? (divStockRanked.slice(0, 3).reduce((s, [, v]) => s + v, 0) / totalDivAmount) * 100 : 0,
      avgPerMonth: divMonths.size > 0 ? netDivAmount / divMonths.size : 0,
      uniqueStocks: divByStock.size,
      domesticShare: totalDivAmount > 0 ? (domesticDiv / totalDivAmount) * 100 : 0,
      overseasShare: totalDivAmount > 0 ? ((totalDivAmount - domesticDiv) / totalDivAmount) * 100 : 0,
    }

    // ═══ Seasonality ═══
    const monthData = new Map<number, { profits: number[]; wins: number; total: number }>()
    for (const t of trades) {
      const m = parseInt(t.sellDate.split('-')[1])
      const e = monthData.get(m) ?? { profits: [], wins: 0, total: 0 }
      e.profits.push(t.totalProfit)
      e.total++
      if (t.totalProfit > 0) e.wins++
      monthData.set(m, e)
    }
    const seasonality: MonthlySeasonality[] = Array.from(monthData.entries())
      .map(([month, d]) => ({
        month,
        avgProfit: d.profits.length > 0 ? d.profits.reduce((s, v) => s + v, 0) / d.profits.length : 0,
        tradeCount: d.total,
        winRate: d.total > 0 ? (d.wins / d.total) * 100 : 0,
      }))
      .sort((a, b) => b.avgProfit - a.avgProfit)

    // ═══ Member Performance ═══
    const memMap = new Map<number, { tp: number; tc: number; tw: number; dn: number; in_: number }>()
    for (const t of trades) {
      if (t.memberId == null) continue
      const e = memMap.get(t.memberId) ?? { tp: 0, tc: 0, tw: 0, dn: 0, in_: 0 }
      e.tp += t.totalProfit; e.tc++; if (t.totalProfit > 0) e.tw++
      memMap.set(t.memberId, e)
    }
    for (const d of dividends) {
      if (d.memberId == null) continue
      const e = memMap.get(d.memberId) ?? { tp: 0, tc: 0, tw: 0, dn: 0, in_: 0 }
      e.dn += d.dividendAmount - d.tax
      memMap.set(d.memberId, e)
    }
    for (const r of interests) {
      if (r.memberId == null) continue
      const e = memMap.get(r.memberId) ?? { tp: 0, tc: 0, tw: 0, dn: 0, in_: 0 }
      e.in_ += r.interestAmount - r.tax
      memMap.set(r.memberId, e)
    }
    const memberPerfs: MemberPerf[] = Array.from(memMap.entries())
      .map(([memberId, d]) => ({
        memberId,
        memberName: memberMap.get(memberId) ?? '미지정',
        tradeProfit: d.tp,
        tradeCount: d.tc,
        tradeWinRate: d.tc > 0 ? (d.tw / d.tc) * 100 : 0,
        dividendNet: d.dn,
        interestNet: d.in_,
        totalIncome: d.tp + d.dn + d.in_,
      }))
      .sort((a, b) => b.totalIncome - a.totalIncome)

    // ═══ Concentration Risk ═══
    const stockProfit = new Map<string, number>()
    for (const t of trades) {
      if (t.totalProfit > 0) stockProfit.set(t.stockName, (stockProfit.get(t.stockName) ?? 0) + t.totalProfit)
    }
    const totalPositiveProfit = Array.from(stockProfit.values()).reduce((s, v) => s + v, 0)
    const stockRanked = Array.from(stockProfit.entries()).sort(([, a], [, b]) => b - a)
    const top5Profit = stockRanked.slice(0, 5).reduce((s, [, v]) => s + v, 0)
    const shares = totalPositiveProfit > 0
      ? Array.from(stockProfit.values()).map(v => v / totalPositiveProfit)
      : []
    const hhi = shares.reduce((s, p) => s + p * p, 0)

    const concentration: ConcentrationRisk = {
      top5Share: totalPositiveProfit > 0 ? (top5Profit / totalPositiveProfit) * 100 : 0,
      top5Stocks: stockRanked.slice(0, 5).map(([name, profit]) => ({ name, profit })),
      herfindahlIndex: hhi,
      riskLevel: hhi > 0.25 ? 'high' : hhi > 0.15 ? 'medium' : 'low',
    }

    // ═══ Projected Income ═══
    const allMonths = new Set<string>()
    trades.forEach(t => allMonths.add(t.sellDate.slice(0, 7)))
    dividends.forEach(d => allMonths.add(d.paymentDate.slice(0, 7)))
    interests.forEach(r => allMonths.add(r.depositDate.slice(0, 7)))
    const monthsSorted = Array.from(allMonths).sort()
    const monthsOfData = monthsSorted.length

    const monthlyTotals = new Map<string, number>()
    for (const t of trades) {
      const m = t.sellDate.slice(0, 7)
      monthlyTotals.set(m, (monthlyTotals.get(m) ?? 0) + t.totalProfit)
    }
    for (const d of dividends) {
      const m = d.paymentDate.slice(0, 7)
      monthlyTotals.set(m, (monthlyTotals.get(m) ?? 0) + d.dividendAmount - d.tax)
    }
    for (const r of interests) {
      const m = r.depositDate.slice(0, 7)
      monthlyTotals.set(m, (monthlyTotals.get(m) ?? 0) + r.interestAmount - r.tax)
    }

    const totalIncome = Array.from(monthlyTotals.values()).reduce((s, v) => s + v, 0)
    const monthlyAvg = monthsOfData > 0 ? totalIncome / monthsOfData : 0
    const recentMonths = monthsSorted.slice(-3)
    const olderMonths = monthsSorted.slice(-6, -3)
    const recentAvg = recentMonths.length > 0 ? recentMonths.reduce((s, m) => s + (monthlyTotals.get(m) ?? 0), 0) / recentMonths.length : 0
    const olderAvg = olderMonths.length > 0 ? olderMonths.reduce((s, m) => s + (monthlyTotals.get(m) ?? 0), 0) / olderMonths.length : 0
    const trendPercent = olderAvg !== 0 ? ((recentAvg - olderAvg) / Math.abs(olderAvg)) * 100 : 0

    const projectedIncome: ProjectedIncome = {
      monthlyAvg,
      annualProjection: monthlyAvg * 12,
      monthsOfData,
      trend: trendPercent > 10 ? 'up' : trendPercent < -10 ? 'down' : 'stable',
      trendPercent,
    }

    return {
      tradeEfficiency,
      assetTypePerfs,
      feeAndTax,
      dividendInsight,
      seasonality,
      memberPerfs,
      concentration,
      projectedIncome,
    }
  }, [trades, dividends, interests, memberMap])
}
