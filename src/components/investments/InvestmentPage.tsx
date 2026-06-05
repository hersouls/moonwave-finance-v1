import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { clsx } from 'clsx'
import {
  TrendingUp,
  TrendingDown,
  Trophy,
  BarChart3,
  Trash2,
  X,
  Upload,
  Calendar,
  Search,
  ArrowUpRight,
  ArrowDownRight,
  Users,
  Globe,
  Home,
  AlertCircle,
  Banknote,
  Landmark,
  LayoutList,
  LayoutGrid,
  TableProperties,
  Table2,
  ChevronRight,
  Save,
  Plus,
  RotateCcw,
} from 'lucide-react'
import { useInvestmentStore } from '@/stores/investmentStore'
import { useDividendStore } from '@/stores/dividendStore'
import { useAccountInterestStore } from '@/stores/accountInterestStore'
import { useMemberStore } from '@/stores/memberStore'
import { useSyncListener } from '@/hooks/useSyncListener'
import { useCountUp } from '@/hooks/useCountUp'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { LiveRegion } from '@/components/ui/LiveRegion'
import { springSnappy } from '@/lib/motionConfig'
import { useInvestmentInsights, type InvestmentInsights } from '@/hooks/useInvestmentInsights'
import { CumulativeProfitChart, AssetTypeDonutChart, SeasonHeatmap, PeriodComparison } from './InvestmentCharts'
import { InvestmentFormSheet } from './InvestmentForm'
import { InvestmentTableView } from './InvestmentTableView'
import { useMediaQuery, BREAKPOINTS } from '@/hooks/useBreakpoint'
import { formatKRW, formatKoreanUnit, formatChange, formatPercent, formatShares, formatRatePercent, formatExchangeRate } from '@/utils/format'
import type { InvestmentTrade, Dividend, AccountInterest, InvestmentAssetType, InvestmentMarket, InterestCurrency } from '@/lib/types'

// ─── Text Paste Parsers ──────────────────────────────
function parseYY(raw: string): string {
  const m = raw.replace(/\s+/g, '').match(/^(\d{2})\.(\d{1,2})\.(\d{1,2})$/)
  if (!m) return ''
  return `20${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
}

function parseAmount(raw: string): number {
  const cleaned = raw.replace(/[^\d.,-]/g, '').replace(/,/g, '')
  return Math.round(Number(cleaned) || 0)
}

function parseRate(raw: string): number {
  const cleaned = raw.replace(/[^\d.,-]/g, '')
  return Number(cleaned) || 0
}

function parseExchangeRate(raw: string): number | null {
  if (!raw || raw === '-') return null
  const cleaned = raw.replace(/[^\d.,-]/g, '').replace(/,/g, '')
  const num = Number(cleaned)
  return num > 0 ? num : null
}

function parseQuantityFloat(raw: string): number {
  const cleaned = raw.replace(/[^\d.,]/g, '').replace(/,/g, '')
  return Number(cleaned) || 0
}

// 종목유형 문자열을 정확한 InvestmentAssetType + 마켓으로 해석.
// '국내ETF'/'해외ETF'/'채권'/'펀드' 등을 '주식'으로 뭉개지 않도록 보존한다.
const KNOWN_ASSET_TYPES: InvestmentAssetType[] = ['국내ETF', '해외ETF', '국내주식', '해외주식', '채권', '펀드', '기타']
function resolveAssetType(raw: string): { assetType: InvestmentAssetType; market: InvestmentMarket } {
  const match = KNOWN_ASSET_TYPES.find(k => raw.includes(k))
  const assetType = match ?? (raw.includes('해외') ? '해외주식' : '국내주식')
  const market: InvestmentMarket = assetType.includes('해외') ? 'overseas' : 'domestic'
  return { assetType, market }
}

interface ParsedTrade {
  sellDate: string; assetType: InvestmentAssetType; market: InvestmentMarket; stockName: string
  totalProfit: number; profitRate: number; totalSellAmount: number; totalBuyAmount: number
  sellQuantity: number; fee: number; tax: number; profitPerShare: number
  sellPricePerShare: number; buyPricePerShare: number
  fxGainLoss: number | null; sellExchangeRate: number | null; buyExchangeRate: number | null
}

interface ParsedDividend {
  paymentDate: string; exDividendDate: string; assetType: InvestmentAssetType; market: InvestmentMarket
  stockName: string; dividendAmount: number; quantity: number; tax: number
}

// Pre-process: fix common paste corruption (line breaks eaten between values)
function preProcessTradeText(text: string): string {
  let s = text
  // Remove header lines
  s = s.replace(/^(판매일|종목유형|종목명|총 판매수익|수익률|총 판매금액|총 구매금액|판매수량|수수료|제세금|1주당 수익|1주당 판매가격|1주당 구매가격|환차손익|판매 환율|구매 환율)\s*$/gm, '')
  // Remove trailing summary line "총 판매수익 ..."
  s = s.replace(/총\s*판매수익.*$/m, '')
  // "26.2.26국내주식" → "26.2.26\n국내주식"
  s = s.replace(/(\d{2}\.\d{1,2}\.\d{1,2})(국내주식|해외주식|국내ETF|해외ETF)/g, '$1\n$2')
  // "-26.2.9" (dash FX field glued to date) → "-\n26.2.9"
  s = s.replace(/^-(\d{2}\.\d{1,2}\.\d{1,2})/gm, '-\n$1')
  // "--" (double dash) → "-\n-"
  s = s.replace(/^--$/gm, '-\n-')
  // "logo경방" → "logo\n경방"
  s = s.replace(/logo([^\s\n])/g, 'logo\n$1')
  // "클래시스+262,764원" or "코리아에셋투자증권+2,251,767원" (Korean text glued to signed amount)
  s = s.replace(/([가-힣A-Za-z])([+-]\d[\d,]*원)/g, '$1\n$2')
  // "+370,416원7.1%" (amount glued to rate %)
  s = s.replace(/([\d,]+원)([\d.]+%)/g, '$1\n$2')
  // "+30,143원+70원" → "+30,143원\n+70원"  (amount glued to signed amount)
  s = s.replace(/([\d,]+원)([+-][\d,]+원)/g, '$1\n$2')
  // "973,000원894,000원" → "973,000원\n894,000원" (unsigned amount glued)
  s = s.replace(/([\d,]+원)(\d[\d,]+원)/g, '$1\n$2')
  // "284,000원1주" → "284,000원\n1주"
  s = s.replace(/([\d,]+원)(\d+주)/g, '$1\n$2')
  // "0원3,009원" → "0원\n3,009원" (run again for chained)
  s = s.replace(/([\d,]+원)(\d[\d,]+원)/g, '$1\n$2')
  // "국내주식logo" → "국내주식\nlogo"
  s = s.replace(/(국내주식|해외주식|국내ETF|해외ETF)(logo)/g, '$1\n$2')
  return s
}

// Detect format: "26.5.19" (detail view) vs "2026-05-28" (card view)
function detectTradeFormat(text: string): 'detail' | 'card' {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  for (const l of lines.slice(0, 10)) {
    if (l.match(/^\d{4}-\d{2}-\d{2}$/)) return 'card'
    if (l.match(/^\d{2}\.\d{1,2}\.\d{1,2}/)) return 'detail'
  }
  return 'detail'
}

// Card view parser: "종목명 / 국내주식 / 2026-05-28 / 187주 · 2,876,060원 / 대성 / +412,540원 / +16.7%"
function parseTradesCardView(text: string): ParsedTrade[] {
  const results: ParsedTrade[] = []
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  let i = 0

  while (i < lines.length) {
    // Find stock name: Korean text that is NOT a date, NOT a number, NOT an asset type, NOT a member name
    // Pattern: look for asset type line "국내주식" or "해외주식" then backtrack to stock name
    const assetTypeIdx = lines.findIndex((l, idx) => idx >= i && (l === '국내주식' || l === '해외주식' || l === '국내ETF' || l === '해외ETF'))
    if (assetTypeIdx < 0 || assetTypeIdx <= i) { i++; continue }

    // Stock name is the line before asset type
    const stockName = lines[assetTypeIdx - 1]
    // Skip if stockName looks like a date, amount, asset type keyword, or interest type
    if (!stockName || stockName.match(/^\d{4}-\d{2}-\d{2}$/) || stockName.match(/^[+-]?[\d,]+원$/)
      || stockName === '국내주식' || stockName === '해외주식' || stockName === '국내ETF' || stockName === '해외ETF'
      || stockName.includes('이자')) { i = assetTypeIdx + 1; continue }

    const { assetType, market } = resolveAssetType(lines[assetTypeIdx])

    let j = assetTypeIdx + 1

    // Next: date line "2026-05-28"
    if (j >= lines.length) { i = j; continue }
    let sellDate = ''
    const dateMatch = lines[j].match(/^(\d{4}-\d{2}-\d{2})$/)
    if (dateMatch) { sellDate = dateMatch[1]; j++ }
    else { i = assetTypeIdx + 1; continue }

    // Next: "187주 · 2,876,060원" or "187주 · 2,876,060원"
    if (j >= lines.length) { i = j; continue }
    const qtyAmtMatch = lines[j].match(/^([\d,.]+)주\s*·\s*([\d,]+)원$/)
    let sellQuantity = 0, totalSellAmount = 0
    if (qtyAmtMatch) {
      sellQuantity = parseQuantityFloat(qtyAmtMatch[1])
      totalSellAmount = Math.abs(parseAmount(qtyAmtMatch[2]))
      j++
    } else { i = assetTypeIdx + 1; continue }

    // Next: member name (skip)
    if (j < lines.length && !lines[j].match(/^[+-]/) && !lines[j].match(/^\d/)) j++

    // Next: profit "+412,540원" or "-2,645원"
    if (j >= lines.length) { i = j; continue }
    const totalProfit = parseAmount(lines[j]); j++

    // Next: profit rate "+16.7%" (might be on same or next line)
    let profitRate = 0
    if (j < lines.length && lines[j].match(/%/)) {
      profitRate = parseRate(lines[j]); j++
    }

    // Calculate derived fields
    const totalBuyAmount = totalSellAmount - totalProfit
    const profitPerShare = sellQuantity > 0 ? Math.round(totalProfit / sellQuantity) : 0
    const sellPricePerShare = sellQuantity > 0 ? Math.round(totalSellAmount / sellQuantity) : 0
    const buyPricePerShare = sellQuantity > 0 ? Math.round(totalBuyAmount / sellQuantity) : 0

    // Skip garbage: zero-profit entries with suspicious data, or stock named as asset type
    if ((totalProfit === 0 && profitRate === 0) || totalSellAmount < 100) { i = j; continue }

    results.push({
      sellDate, assetType, market, stockName,
      totalProfit, profitRate, totalSellAmount, totalBuyAmount,
      sellQuantity, fee: 0, tax: 0, profitPerShare,
      sellPricePerShare, buyPricePerShare,
      fxGainLoss: null, sellExchangeRate: null, buyExchangeRate: null,
    })

    i = j
  }
  return results
}

function parseTrades(text: string): ParsedTrade[] {
  const format = detectTradeFormat(text)
  if (format === 'card') return parseTradesCardView(text)

  // Detail view parser (original: "26.5.19" format)
  const cleaned = preProcessTradeText(text)
  const results: ParsedTrade[] = []
  const lines = cleaned.split('\n').map(l => l.trim()).filter(Boolean)
  let i = 0
  while (i < lines.length) {
    const dateMatch = lines[i].match(/^(\d{2}\.\d{1,2}\.\d{1,2})/)
    if (!dateMatch) { i++; continue }
    const sellDate = parseYY(dateMatch[1])
    if (!sellDate) { i++; continue }
    i++
    if (i >= lines.length) break
    const { assetType, market } = resolveAssetType(lines[i].trim())
    i++
    if (i < lines.length && lines[i].toLowerCase() === 'logo') i++
    if (i >= lines.length) break
    const stockName = lines[i].trim(); i++
    if (i >= lines.length) break
    const totalProfit = parseAmount(lines[i]); i++
    if (i >= lines.length) break
    const profitRate = parseRate(lines[i]); i++
    if (i >= lines.length) break
    const totalSellAmount = Math.abs(parseAmount(lines[i])); i++
    if (i >= lines.length) break
    const totalBuyAmount = Math.abs(parseAmount(lines[i])); i++
    if (i >= lines.length) break
    const sellQuantity = parseQuantityFloat(lines[i]) || 0; i++
    if (i >= lines.length) break
    const fee = Math.abs(parseAmount(lines[i])); i++
    if (i >= lines.length) break
    const tax = Math.abs(parseAmount(lines[i])); i++
    if (i >= lines.length) break
    const profitPerShare = parseAmount(lines[i]); i++
    if (i >= lines.length) break
    const sellPricePerShare = Math.abs(parseAmount(lines[i])); i++
    if (i >= lines.length) break
    const buyPricePerShare = Math.abs(parseAmount(lines[i])); i++
    let fxGainLoss: number | null = null, sellExchangeRate: number | null = null, buyExchangeRate: number | null = null
    const isNextDate = (idx: number) => idx < lines.length && /^\d{2}\.\d{1,2}\.\d{1,2}/.test(lines[idx])
    if (i < lines.length && !isNextDate(i)) { const v = lines[i].trim(); if (v === '-') { i++ } else if (v.match(/[+-]?\d/)) { fxGainLoss = parseAmount(v); i++ } }
    if (i < lines.length && !isNextDate(i)) { const v = lines[i].trim(); if (v === '-') { i++ } else { sellExchangeRate = parseExchangeRate(v); if (sellExchangeRate !== null) i++ } }
    if (i < lines.length && !isNextDate(i)) { const v = lines[i].trim(); if (v === '-') { i++ } else { buyExchangeRate = parseExchangeRate(v); if (buyExchangeRate !== null) i++ } }
    results.push({ sellDate, assetType, market, stockName, totalProfit, profitRate, totalSellAmount, totalBuyAmount, sellQuantity, fee, tax, profitPerShare, sellPricePerShare, buyPricePerShare, fxGainLoss, sellExchangeRate, buyExchangeRate })
  }
  return results
}

// Pre-process dividend raw text (fix glued lines)
function preProcessDividendText(text: string): string {
  let s = text
  // "176원26.4.15" → "176원\n26.4.15"
  s = s.replace(/([\d,]+원)(\d{2}\.\d)/g, '$1\n$2')
  // "+4,000원8주" → "+4,000원\n8주"
  s = s.replace(/([\d,]+원)(\d+[주])/g, '$1\n$2')
  // "3주173원" → "3주\n173원"
  s = s.replace(/([\d.]+주)([\d,]+원)/g, '$1\n$2')
  // "+41,389원19주" → "+41,389원\n19주"
  s = s.replace(/([\d,]+원)(\d+주)/g, '$1\n$2')
  // "26.2.26국내주식" etc
  s = s.replace(/(\d{2}\.\d{1,2}\.\d{1,2})(국내|해외)/g, '$1\n$2')
  // "비고26.4.17" → "\n26.4.17" (keep the date, strip header)
  s = s.replace(/비고(\d{2}\.\d)/g, '\n$1')
  // Remove leftover header lines
  s = s.replace(/^(지급일|배당락일|종목유형|종목명|배당금|기준 수량|제세금.*|비고)\s*$/gm, '')
  // "logo종목" → "logo\n종목"
  s = s.replace(/logo([^\s])/g, 'logo\n$1')
  return s
}

// Pre-process card-view dividend text
function preProcessDividendCardText(text: string): string {
  let s = text
  // "LG국내주식" → "LG\n국내주식"
  s = s.replace(/([가-힣A-Za-z0-9&\-]+)(국내주식|해외주식|국내ETF|해외ETF)/g, (_, name, type) => {
    if (name === '국내' || name === '해외') return `${name}${type}`
    return `${name}\n${type}`
  })
  // "국내주식2026-" → "국내주식\n2026-"
  s = s.replace(/(국내주식|해외주식|국내ETF|해외ETF)(\d{4}-)/g, '$1\n$2')
  // "2025-12-12대성" → "2025-12-12\n대성"
  s = s.replace(/(\d{4}-\d{2}-\d{2})([가-힣])/g, '$1\n$2')
  // "26-03-02대성" same
  s = s.replace(/(\d{2}-\d{2})([가-힣])/g, '$1\n$2')
  return s
}

// Card-view dividend parser
function parseDividendsCardView(text: string): ParsedDividend[] {
  const cleaned = preProcessDividendCardText(text)
  const results: ParsedDividend[] = []
  const lines = cleaned.split('\n').map(l => l.trim()).filter(Boolean)
  let i = 0

  while (i < lines.length) {
    // Find asset type line
    const atIdx = lines.findIndex((l, idx) => idx >= i && (l === '국내주식' || l === '해외주식' || l === '국내ETF' || l === '해외ETF'))
    if (atIdx < 0 || atIdx <= i) { i++; continue }

    const stockName = lines[atIdx - 1]
    if (!stockName || stockName.match(/^\d{4}-\d{2}-\d{2}$/) || stockName.match(/^[+-]?[\d,]+원$/)) { i = atIdx + 1; continue }

    const { assetType, market } = resolveAssetType(lines[atIdx])

    let j = atIdx + 1

    // Date "2026-04-16"
    if (j >= lines.length) { i = j; continue }
    let paymentDate = ''
    const dm = lines[j].match(/^(\d{4}-\d{2}-\d{2})$/)
    if (dm) { paymentDate = dm[1]; j++ } else { i = atIdx + 1; continue }

    // "3주 · 배당락 2026-03-31" or "16주 · 배당락 2025-12-29"
    if (j >= lines.length) { i = j; continue }
    let quantity = 0, exDividendDate = ''
    const qtyExMatch = lines[j].match(/^([\d,.]+)주\s*·\s*배당락\s*(\d{4}-\d{2}-\d{2})/)
    if (qtyExMatch) {
      quantity = parseQuantityFloat(qtyExMatch[1])
      exDividendDate = qtyExMatch[2]
      j++
    } else { i = atIdx + 1; continue }

    // Member name (skip)
    if (j < lines.length && !lines[j].match(/^[+-]/) && !lines[j].match(/^\d/) && !lines[j].match(/^세금/)) j++

    // Dividend amount "+3,200원"
    if (j >= lines.length) { i = j; continue }
    const dividendAmount = Math.abs(parseAmount(lines[j])); j++

    // Optional tax "세금 176원"
    let tax = 0
    if (j < lines.length && lines[j].match(/^세금/)) {
      tax = Math.abs(parseAmount(lines[j])); j++
    }

    results.push({ paymentDate, exDividendDate, assetType, market, stockName, dividendAmount, quantity, tax })
    i = j
  }
  return results
}

function parseDividends(text: string): ParsedDividend[] {
  // Auto-detect format
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const isCardView = lines.some(l => l.match(/^\d{4}-\d{2}-\d{2}$/)) && lines.some(l => l.includes('배당락'))
  if (isCardView) return parseDividendsCardView(text)

  // Detail view (raw): pre-process then parse
  const cleaned = preProcessDividendText(text)
  const results: ParsedDividend[] = []
  const clines = cleaned.split('\n').map(l => l.trim()).filter(Boolean)
  let i = 0
  while (i < clines.length) {
    // Payment date
    const dateMatch = clines[i].match(/^(\d{2}\.\d{1,2}\.\d{1,2})/)
    if (!dateMatch) { i++; continue }
    const paymentDate = parseYY(dateMatch[1])
    if (!paymentDate) { i++; continue }
    i++
    // Ex-dividend date
    if (i >= clines.length) break
    const exMatch = clines[i].match(/^(\d{2}\.\d{1,2}\.\d{1,2})/)
    if (!exMatch) { i++; continue }
    const exDividendDate = parseYY(exMatch[1])
    if (!exDividendDate) { i++; continue }
    i++
    // Asset type
    if (i >= clines.length) break
    const { assetType, market } = resolveAssetType(clines[i].trim())
    i++
    if (i < clines.length && clines[i].toLowerCase() === 'logo') i++
    // Stock name
    if (i >= clines.length) break
    const stockName = clines[i].trim(); i++
    // Dividend amount
    if (i >= clines.length) break
    const dividendAmount = Math.abs(parseAmount(clines[i])); i++
    // Quantity
    if (i >= clines.length) break
    const quantity = parseQuantityFloat(clines[i]); i++
    // Tax
    if (i >= clines.length) break
    const tax = Math.abs(parseAmount(clines[i])); i++
    results.push({ paymentDate, exDividendDate, assetType, market, stockName, dividendAmount, quantity, tax })
  }
  return results
}

interface ParsedInterest {
  depositDate: string; periodStart: string; periodEnd: string
  interestType: string; currency: InterestCurrency
  interestAmount: number; tax: number; interestRate: number
}

function parseInterests(text: string): ParsedInterest[] {
  const results: ParsedInterest[] = []
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  let i = 0
  while (i < lines.length) {
    // Deposit date
    const dateMatch = lines[i].match(/^(\d{2}\.\d{1,2}\.\d{1,2})/)
    if (!dateMatch) { i++; continue }
    const depositDate = parseYY(dateMatch[1])
    if (!depositDate) { i++; continue }
    i++
    // Period: "26.3.31 ~ 26.4.29" or "25.12.31 ~ 26.1.29"
    if (i >= lines.length) break
    const periodMatch = lines[i].match(/(\d{2}\.\d{1,2}\.\d{1,2})\s*~\s*(\d{2}\.\d{1,2}\.\d{1,2})/)
    if (!periodMatch) { i++; continue }
    const periodStart = parseYY(periodMatch[1])
    const periodEnd = parseYY(periodMatch[2])
    if (!periodStart || !periodEnd) { i++; continue }
    i++
    // Interest type
    if (i >= lines.length) break
    const interestType = lines[i].trim()
    const currency: InterestCurrency = interestType.includes('달러') ? 'USD' : 'KRW'
    i++
    // Interest amount
    if (i >= lines.length) break
    const interestAmount = Math.abs(parseAmount(lines[i])); i++
    // Tax
    if (i >= lines.length) break
    const tax = Math.abs(parseAmount(lines[i])); i++
    // Interest rate: "연 1.00%"
    if (i >= lines.length) break
    const rateMatch = lines[i].match(/([\d.]+)%/)
    const interestRate = rateMatch ? Number(rateMatch[1]) : 0
    i++
    results.push({ depositDate, periodStart, periodEnd, interestType, currency, interestAmount, tax, interestRate })
  }
  return results
}

// ─── ChipMetric (구독 페이지 패턴) ─────────────────
function ChipMetric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <span className="inline-flex items-baseline gap-1 px-2 py-0.5 rounded-full text-caption bg-surface-tertiary ring-1 ring-base tabular-nums">
      <span className="text-disabled font-medium">{label}</span>
      <span className="font-bold" style={{ color: color || 'var(--text-primary)' }}>{value}</span>
    </span>
  )
}

// ─── FIN-style Hero (구독 페이지 aurora 패턴) ────────
function InvestmentHeroSection({ label, children, aurora }: { label: string; children: React.ReactNode; aurora: string }) {
  return (
    <section
      className="relative overflow-hidden rounded-3xl bg-surface-primary"
      style={{
        boxShadow: 'inset 0 0 0 1px var(--border-default), inset 0 1px 0 0 var(--hero-soft-inset-highlight), var(--shadow-1)',
      }}
    >
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{ background: aurora }} />
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--hero-soft-inset-highlight) 100%, transparent) 50%, transparent)' }} />
      <div className="relative px-4 sm:px-6 py-5">
        <div className="flex items-center gap-1.5 mb-2">
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary-500) 70%, transparent)' }} />
          <p className="text-caption font-bold tracking-[0.14em] uppercase text-[color:var(--color-primary-600)] dark:text-[color:var(--color-primary-300)]">
            {label}
          </p>
        </div>
        {children}
      </div>
    </section>
  )
}

/* v4 "One Purple": 히어로 워시 3종을 전부 보라 단일 계열로 — 청록/금색/초록
 * 혼합 워시는 브랜드 정체성을 희석한다. 변형 간 차이는 밝기·채도·위치로만. */
const AURORA_DEFAULT = `radial-gradient(circle at 15% 10%, oklch(0.65 0.18 287 / 0.18), transparent 50%),
  radial-gradient(circle at 90% 20%, oklch(0.72 0.14 295 / 0.14), transparent 45%),
  radial-gradient(circle at 50% 110%, oklch(0.55 0.16 278 / 0.10), transparent 55%)`
const AURORA_WARM = `radial-gradient(circle at 15% 10%, oklch(0.70 0.16 300 / 0.16), transparent 50%),
  radial-gradient(circle at 90% 20%, oklch(0.76 0.12 290 / 0.14), transparent 45%),
  radial-gradient(circle at 50% 110%, oklch(0.62 0.15 285 / 0.10), transparent 55%)`
const AURORA_COOL = `radial-gradient(circle at 15% 10%, oklch(0.65 0.18 287 / 0.16), transparent 50%),
  radial-gradient(circle at 90% 20%, oklch(0.72 0.16 275 / 0.14), transparent 45%),
  radial-gradient(circle at 50% 110%, oklch(0.60 0.17 295 / 0.10), transparent 55%)`

// ─── Trade Hero ──────────────────────────────────
function TradeHero({ totalProfit, profitRate, totalSell, totalBuy, winRate, count, wins, losses }: {
  totalProfit: number; profitRate: number; totalSell: number; totalBuy: number
  winRate: number; count: number; wins: number; losses: number
}) {
  const animatedProfit = useCountUp(totalProfit)
  const animatedRate = useCountUp(Math.round(profitRate * 10))
  const pos = totalProfit >= 0
  return (
    <InvestmentHeroSection label="총 판매수익" aurora={AURORA_DEFAULT}>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-financial-fluid font-extrabold tracking-tight tabular-nums text-heading"
          style={{ textShadow: '0 1px 2px color-mix(in srgb, var(--color-primary-500) 16%, transparent)' }}>
          {pos ? '+' : ''}{animatedProfit.toLocaleString('ko-KR')}
        </span>
        <span className="text-title2 text-sub">원</span>
      </div>
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <span className={clsx(
          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-caption font-bold tabular-nums ring-1',
          pos ? 'bg-status-success-soft text-status-success ring-[color:var(--status-success)]/15'
            : 'bg-status-danger-soft text-status-danger ring-[color:var(--status-danger)]/15',
        )}>
          {pos ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {pos ? '+' : ''}{(animatedRate / 10).toFixed(1)}%
        </span>
        <ChipMetric label="판매" value={formatKRW(totalSell)} />
        <ChipMetric label="구매" value={formatKRW(totalBuy)} />
        <ChipMetric label="거래" value={`${count}건 (${wins}승 ${losses}패)`} />
        <ChipMetric label="승률" value={formatPercent(winRate, 1)} color="var(--color-primary-500)" />
      </div>
    </InvestmentHeroSection>
  )
}

// ─── Dividend Hero ───────────────────────────────
function DividendHero({ totalDiv, totalTax, netDiv, count, stockCount }: {
  totalDiv: number; totalTax: number; netDiv: number; count: number; stockCount: number
}) {
  const animatedNet = useCountUp(netDiv)
  return (
    <InvestmentHeroSection label="세후 배당금 합계" aurora={AURORA_WARM}>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-financial-fluid font-extrabold tracking-tight tabular-nums text-heading"
          style={{ textShadow: '0 1px 2px color-mix(in srgb, var(--color-primary-500) 16%, transparent)' }}>
          +{animatedNet.toLocaleString('ko-KR')}
        </span>
        <span className="text-title2 text-sub">원</span>
      </div>
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <ChipMetric label="총 배당" value={formatKRW(totalDiv)} />
        <ChipMetric label="세금" value={formatKRW(totalTax)} color="var(--value-negative)" />
        <ChipMetric label="횟수" value={`${count}건`} />
        <ChipMetric label="종목" value={`${stockCount}종`} color="var(--color-primary-500)" />
      </div>
    </InvestmentHeroSection>
  )
}

// ─── Interest Hero ───────────────────────────────
function InterestHero({ totalInterest, totalTax, netInterest, count }: {
  totalInterest: number; totalTax: number; netInterest: number; count: number
}) {
  const animatedNet = useCountUp(netInterest)
  return (
    <InvestmentHeroSection label="세후 이자 합계" aurora={AURORA_COOL}>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-financial-fluid font-extrabold tracking-tight tabular-nums text-heading"
          style={{ textShadow: '0 1px 2px color-mix(in srgb, var(--color-primary-500) 16%, transparent)' }}>
          +{animatedNet.toLocaleString('ko-KR')}
        </span>
        <span className="text-title2 text-sub">원</span>
      </div>
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <ChipMetric label="총 이자" value={formatKRW(totalInterest)} />
        <ChipMetric label="세금" value={formatKRW(totalTax)} color="var(--value-negative)" />
        <ChipMetric label="횟수" value={`${count}건`} />
      </div>
    </InvestmentHeroSection>
  )
}

// ─── Monthly Bar Chart ───────────────────────────
function MonthlyChart({ stats, valueKey, color }: {
  stats: { month: string; [k: string]: any }[]; valueKey: string; color: 'emerald' | 'amber'
}) {
  if (stats.length === 0) return null
  const maxAbs = Math.max(...stats.map(s => Math.abs(s[valueKey])), 1)
  const barColors = color === 'emerald'
    ? { pos: 'var(--color-primary-500)', neg: 'var(--value-negative)', textPos: 'text-[color:var(--color-primary-600)] dark:text-[color:var(--color-primary-300)]', textNeg: 'text-value-negative' }
    : { pos: 'var(--color-primary-500)', neg: 'var(--color-primary-500)', textPos: 'text-[color:var(--color-primary-600)] dark:text-[color:var(--color-primary-300)]', textNeg: 'text-[color:var(--color-primary-600)] dark:text-[color:var(--color-primary-300)]' }
  return (
    <div className="space-y-2">
      <h3 className="text-body3-semi text-primary flex items-center gap-1.5">
        <BarChart3 className="w-4 h-4 text-primary-500" />월별 현황
      </h3>
      <div className="space-y-1.5">
        {stats.slice(0, 6).map((s) => {
          const val = s[valueKey] as number
          const pos = val >= 0
          const w = Math.min((Math.abs(val) / maxAbs) * 100, 100)
          const [y, m] = s.month.split('-')
          return (
            <div key={s.month} className="flex items-center gap-2">
              <span className="text-micro font-medium text-sub w-14 shrink-0 financial-value">{y}.{m}</span>
              <div className="flex-1 h-6 relative bg-surface-secondary rounded-md overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: `${w}%` }} transition={{ duration: 0.6, ease: 'easeOut' }}
                  className="absolute inset-y-0 left-0 rounded-md"
                  style={{ background: `linear-gradient(90deg, ${pos ? barColors.pos : barColors.neg}, color-mix(in srgb, ${pos ? barColors.pos : barColors.neg} 60%, transparent))` }} />
                <span className={clsx('absolute inset-y-0 flex items-center px-2 text-caption font-bold tabular-nums',
                  w > 50 ? 'text-white left-0' : pos ? `${barColors.textPos} right-0` : `${barColors.textNeg} right-0`
                )}>
                  {formatChange(val)}
                </span>
              </div>
              <span className="text-micro text-muted w-8 text-right shrink-0">{s.count}건</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Trade Card ──────────────────────────────────
function TradeCard({ trade, memberName, onClick }: { trade: InvestmentTrade; memberName?: string; onClick: () => void }) {
  const pos = trade.totalProfit >= 0
  const marketColor = trade.market === 'overseas' ? 'var(--chart-series-6)' : 'var(--color-primary-500)'
  return (
    <motion.button layout onClick={onClick}
      whileTap={{ scale: 0.995 }}
      transition={{ type: 'spring', stiffness: 320, damping: 24 }}
      className="group relative w-full text-left rounded-2xl bg-surface-primary p-3.5 ring-1 ring-base hover:elevation-2 transition-all overflow-hidden">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-body3 text-heading font-bold truncate">{trade.stockName}</span>
            <span className="text-micro font-bold uppercase tracking-wider px-1.5 h-[14px] rounded-full inline-flex items-center"
              style={{ backgroundColor: `color-mix(in srgb, ${marketColor} 14%, transparent)`, color: marketColor, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${marketColor} 22%, transparent)` }}>
              {trade.market === 'overseas' ? <Globe className="w-2 h-2 mr-0.5" /> : <Home className="w-2 h-2 mr-0.5" />}{trade.assetType}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-micro text-sub tabular-nums">
            <span>{trade.sellDate}</span>
            <span>{formatShares(trade.sellQuantity)}주 · {formatKoreanUnit(trade.totalSellAmount)}원</span>
            {memberName && <span className="inline-flex items-center gap-0.5"><Users className="w-2.5 h-2.5" />{memberName}</span>}
          </div>
        </div>
        <div className="text-right flex-shrink-0 ml-1">
          <p className="text-body3 font-bold tabular-nums" style={{ color: pos ? 'var(--value-positive)' : 'var(--value-negative)' }}>
            {pos ? '+' : ''}{formatKoreanUnit(trade.totalProfit)}원
          </p>
          <p className="text-micro tabular-nums mt-0.5" style={{ color: pos ? 'var(--value-positive)' : 'var(--value-negative)', opacity: 0.7 }}>
            {pos ? '+' : ''}{trade.profitRate.toFixed(1)}%
          </p>
        </div>
      </div>
    </motion.button>
  )
}

// ─── Dividend Card ───────────────────────────────
function DividendCard({ div, memberName, onClick }: { div: Dividend; memberName?: string; onClick: () => void }) {
  const net = div.dividendAmount - div.tax
  const marketColor = div.market === 'overseas' ? 'var(--chart-series-6)' : 'var(--color-primary-500)'
  return (
    <motion.button layout onClick={onClick}
      whileTap={{ scale: 0.995 }}
      transition={{ type: 'spring', stiffness: 320, damping: 24 }}
      className="group relative w-full text-left rounded-2xl bg-surface-primary p-3.5 ring-1 ring-base hover:elevation-2 transition-all overflow-hidden">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-body3 text-heading font-bold truncate">{div.stockName}</span>
            <span className="text-micro font-bold uppercase tracking-wider px-1.5 h-[14px] rounded-full inline-flex items-center"
              style={{ backgroundColor: `color-mix(in srgb, ${marketColor} 14%, transparent)`, color: marketColor, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${marketColor} 22%, transparent)` }}>
              {div.market === 'overseas' ? <Globe className="w-2 h-2 mr-0.5" /> : <Home className="w-2 h-2 mr-0.5" />}{div.assetType}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-micro text-sub tabular-nums">
            <span>{div.paymentDate}</span>
            <span>{formatShares(div.quantity)}주 · 배당락 {div.exDividendDate}</span>
            {memberName && <span className="inline-flex items-center gap-0.5"><Users className="w-2.5 h-2.5" />{memberName}</span>}
          </div>
        </div>
        <div className="text-right flex-shrink-0 ml-1">
          <p className="text-body3 font-bold tabular-nums" style={{ color: 'var(--value-positive)' }}>+{formatKoreanUnit(net)}원</p>
          {div.tax > 0 && <p className="text-micro text-disabled tabular-nums mt-0.5">세금 {formatKRW(div.tax)}</p>}
        </div>
      </div>
    </motion.button>
  )
}

// ─── Trade Detail Sheet ──────────────────────────
function TradeDetailSheet({ trade, memberName, onClose, onDelete, onEdit }: {
  trade: InvestmentTrade | null; memberName?: string; onClose: () => void; onDelete: (id: number) => void; onEdit?: (t: InvestmentTrade) => void
}) {
  useEscapeKey(onClose, !!trade)
  if (!trade) return null
  const pos = trade.totalProfit >= 0
  const rows: { label: string; value: string; highlight?: boolean }[] = [
    { label: '판매일', value: trade.sellDate },
    { label: '종목유형', value: trade.assetType },
    { label: '구성원', value: memberName || '미지정' },
    { label: '총 판매수익', value: formatChange(trade.totalProfit), highlight: true },
    { label: '수익률', value: `${trade.profitRate >= 0 ? '+' : ''}${trade.profitRate.toFixed(1)}%`, highlight: true },
    { label: '총 판매금액', value: formatKRW(trade.totalSellAmount) },
    { label: '총 구매금액', value: formatKRW(trade.totalBuyAmount) },
    { label: '판매수량', value: `${formatShares(trade.sellQuantity)}주` },
    { label: '수수료', value: formatKRW(trade.fee) },
    { label: '제세금', value: formatKRW(trade.tax) },
    { label: '1주당 수익', value: formatChange(trade.profitPerShare) },
    { label: '1주당 판매가격', value: formatKRW(trade.sellPricePerShare) },
    { label: '1주당 구매가격', value: formatKRW(trade.buyPricePerShare) },
  ]
  if (trade.fxGainLoss !== null) rows.push({ label: '환차손익', value: formatChange(trade.fxGainLoss) })
  if (trade.sellExchangeRate !== null) rows.push({ label: '판매 환율', value: formatExchangeRate(trade.sellExchangeRate) })
  if (trade.buyExchangeRate !== null) rows.push({ label: '구매 환율', value: formatExchangeRate(trade.buyExchangeRate) })
  return (
    <AnimatePresence>
      <motion.div key="ov" aria-hidden="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="sheet-overlay" onClick={onClose} />
      <motion.div key="sh" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="sheet-container" role="dialog" aria-modal="true" aria-label="상세 정보">
        <div className="sheet-handle" />
        <div className="sheet-body">
          <div className="sheet-header mb-4">
            <div>
              <span className={clsx('chip chip-sm mb-1', trade.market === 'overseas' ? 'badge-primary' : 'badge-default')}>
                {trade.market === 'overseas' ? <Globe className="w-2.5 h-2.5" /> : <Home className="w-2.5 h-2.5" />}{trade.assetType}
              </span>
              <h2 className="text-title2 font-bold text-heading">{trade.stockName}</h2>
            </div>
            <button onClick={onClose} className="sheet-close"><X className="w-5 h-5" /></button>
          </div>
          <div className={clsx('card-fill rounded-xl p-4 mb-4', pos ? 'bg-value-positive-soft' : 'bg-value-negative-soft')}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-caption font-bold text-sub">판매수익</p>
                <p className={clsx('text-title1 font-extrabold financial-value', pos ? 'value-positive' : 'value-negative')}>{formatChange(trade.totalProfit)}</p>
              </div>
              <div className={clsx('flex items-center gap-1 text-body1 font-bold', pos ? 'value-positive' : 'value-negative')}>
                {pos ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}{trade.profitRate >= 0 ? '+' : ''}{trade.profitRate.toFixed(1)}%
              </div>
            </div>
          </div>
          {rows.map((row, idx) => (
            <div key={row.label} className={clsx('list-item', idx < rows.length - 1 && 'border-b border-subtle')}>
              <span className="list-item__label">{row.label}</span>
              <span className={clsx('list-item__value financial-value', row.highlight ? (pos ? 'value-positive' : 'value-negative') : '')}>{row.value}</span>
            </div>
          ))}
          <div className="flex gap-2 mt-5">
            {onEdit && <button onClick={() => onEdit(trade)}
              className="flex-1 inline-flex items-center justify-center gap-2 h-12 rounded-2xl text-label3 font-bold ring-1 ring-[color:var(--border-strong)] text-body hover:ring-[color:var(--color-primary-400)] transition-all bg-surface-primary">
              <Save className="w-4 h-4" />수정
            </button>}
            <button onClick={() => { if (trade.id != null) onDelete(trade.id) }}
              className="flex-1 btn-foundation btn-filled-danger">
              <Trash2 className="w-4 h-4" />삭제
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

// ─── Dividend Detail Sheet ───────────────────────
function DividendDetailSheet({ div, memberName, onClose, onDelete, onEdit }: {
  div: Dividend | null; memberName?: string; onClose: () => void; onDelete: (id: number) => void; onEdit?: (d: Dividend) => void
}) {
  useEscapeKey(onClose, !!div)
  if (!div) return null
  const net = div.dividendAmount - div.tax
  const rows = [
    { label: '지급일', value: div.paymentDate },
    { label: '배당락일', value: div.exDividendDate },
    { label: '종목유형', value: div.assetType },
    { label: '구성원', value: memberName || '미지정' },
    { label: '배당금', value: formatKRW(div.dividendAmount) },
    { label: '기준 수량', value: `${formatShares(div.quantity)}주` },
    { label: '제세금', value: formatKRW(div.tax) },
    { label: '세후 수령액', value: formatKRW(net) },
  ]
  return (
    <AnimatePresence>
      <motion.div key="ov" aria-hidden="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="sheet-overlay" onClick={onClose} />
      <motion.div key="sh" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="sheet-container" role="dialog" aria-modal="true" aria-label="상세 정보">
        <div className="sheet-handle" />
        <div className="sheet-body">
          <div className="sheet-header mb-4">
            <div>
              <span className={clsx('chip chip-sm mb-1', div.market === 'overseas' ? 'badge-primary' : 'badge-default')}>
                {div.market === 'overseas' ? <Globe className="w-2.5 h-2.5" /> : <Home className="w-2.5 h-2.5" />}{div.assetType}
              </span>
              <h2 className="text-title2 font-bold text-heading">{div.stockName}</h2>
            </div>
            <button onClick={onClose} className="sheet-close"><X className="w-5 h-5" /></button>
          </div>
          <div className="card-fill rounded-xl p-4 mb-4 bg-value-positive-soft">
            <p className="text-caption font-bold text-sub">세후 수령액</p>
            <p className="text-title1 font-extrabold financial-value value-positive">+{formatKoreanUnit(net)}원</p>
          </div>
          {rows.map((row, idx) => (
            <div key={row.label} className={clsx('list-item', idx < rows.length - 1 && 'border-b border-subtle')}>
              <span className="list-item__label">{row.label}</span>
              <span className="list-item__value financial-value">{row.value}</span>
            </div>
          ))}
          <div className="flex gap-2 mt-5">
            {onEdit && <button onClick={() => onEdit(div)}
              className="flex-1 inline-flex items-center justify-center gap-2 h-12 rounded-2xl text-label3 font-bold ring-1 ring-[color:var(--border-strong)] text-body hover:ring-[color:var(--color-primary-400)] transition-all bg-surface-primary">
              <Save className="w-4 h-4" />수정
            </button>}
            <button onClick={() => { if (div.id != null) onDelete(div.id) }}
              className="flex-1 btn-foundation btn-filled-danger">
              <Trash2 className="w-4 h-4" />삭제
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

// ─── Interest Card ───────────────────────────────
function InterestCard({ interest, memberName, onClick }: { interest: AccountInterest; memberName?: string; onClick: () => void }) {
  const net = interest.interestAmount - interest.tax
  const typeColor = interest.currency === 'USD' ? 'var(--chart-series-6)' : 'var(--color-primary-500)'
  return (
    <motion.button layout onClick={onClick}
      whileTap={{ scale: 0.995 }}
      transition={{ type: 'spring', stiffness: 320, damping: 24 }}
      className="group relative w-full text-left rounded-2xl bg-surface-primary p-3.5 ring-1 ring-base hover:elevation-2 transition-all overflow-hidden">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-body3 text-heading font-bold">{interest.interestType}</span>
            <span className="text-micro font-bold uppercase tracking-wider px-1.5 h-[14px] rounded-full inline-flex items-center"
              style={{ backgroundColor: `color-mix(in srgb, ${typeColor} 14%, transparent)`, color: typeColor, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${typeColor} 22%, transparent)` }}>
              연 {formatRatePercent(interest.interestRate)}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-micro text-sub tabular-nums">
            <span>{interest.depositDate}</span>
            <span>{interest.periodStart} ~ {interest.periodEnd}</span>
            {memberName && <span className="inline-flex items-center gap-0.5"><Users className="w-2.5 h-2.5" />{memberName}</span>}
          </div>
        </div>
        <div className="text-right flex-shrink-0 ml-1">
          <p className="text-body3 font-bold tabular-nums" style={{ color: 'var(--value-positive)' }}>+{formatKoreanUnit(net)}원</p>
          {interest.tax > 0 && <p className="text-micro text-disabled tabular-nums mt-0.5">세금 {formatKRW(interest.tax)}</p>}
        </div>
      </div>
    </motion.button>
  )
}

// ─── Interest Detail Sheet ───────────────────────
function InterestDetailSheet({ interest, memberName, onClose, onDelete, onEdit }: {
  interest: AccountInterest | null; memberName?: string; onClose: () => void; onDelete: (id: number) => void; onEdit?: (r: AccountInterest) => void
}) {
  useEscapeKey(onClose, !!interest)
  if (!interest) return null
  const net = interest.interestAmount - interest.tax
  const rows = [
    { label: '입금일', value: interest.depositDate },
    { label: '쌓인 기간', value: `${interest.periodStart} ~ ${interest.periodEnd}` },
    { label: '유형', value: interest.interestType },
    { label: '구성원', value: memberName || '미지정' },
    { label: '이자', value: formatKRW(interest.interestAmount) },
    { label: '제세금', value: formatKRW(interest.tax) },
    { label: '세후 수령액', value: formatKRW(net) },
    { label: '이자율', value: `연 ${formatRatePercent(interest.interestRate)}` },
  ]
  return (
    <AnimatePresence>
      <motion.div key="ov" aria-hidden="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="sheet-overlay" onClick={onClose} />
      <motion.div key="sh" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="sheet-container" role="dialog" aria-modal="true" aria-label="상세 정보">
        <div className="sheet-handle" />
        <div className="sheet-body">
          <div className="sheet-header mb-4">
            <div>
              <span className={clsx('chip chip-sm mb-1', interest.currency === 'USD' ? 'badge-primary' : 'badge-default')}>
                {interest.interestType}
              </span>
              <h2 className="text-title2 font-bold text-heading">{interest.periodStart} ~ {interest.periodEnd}</h2>
            </div>
            <button onClick={onClose} className="sheet-close"><X className="w-5 h-5" /></button>
          </div>
          <div className="card-fill rounded-xl p-4 mb-4 bg-value-positive-soft">
            <p className="text-caption font-bold text-sub">세후 수령액</p>
            <p className="text-title1 font-extrabold financial-value value-positive">+{formatKoreanUnit(net)}원</p>
          </div>
          {rows.map((row, idx) => (
            <div key={row.label} className={clsx('list-item', idx < rows.length - 1 && 'border-b border-subtle')}>
              <span className="list-item__label">{row.label}</span>
              <span className="list-item__value financial-value">{row.value}</span>
            </div>
          ))}
          <div className="flex gap-2 mt-5">
            {onEdit && <button onClick={() => onEdit(interest)}
              className="flex-1 inline-flex items-center justify-center gap-2 h-12 rounded-2xl text-label3 font-bold ring-1 ring-[color:var(--border-strong)] text-body hover:ring-[color:var(--color-primary-400)] transition-all bg-surface-primary">
              <Save className="w-4 h-4" />수정
            </button>}
            <button onClick={() => { if (interest.id != null) onDelete(interest.id) }}
              className="flex-1 btn-foundation btn-filled-danger">
              <Trash2 className="w-4 h-4" />삭제
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

// ─── Paste Import Modal ──────────────────────────
function PasteImportModal({ isOpen, onClose, onImportTrades, onImportDividends, onImportInterests, members }: {
  isOpen: boolean; onClose: () => void
  onImportTrades: (trades: ParsedTrade[], memberId: number | null) => void
  onImportDividends: (divs: ParsedDividend[], memberId: number | null) => void
  onImportInterests: (items: ParsedInterest[], memberId: number | null) => void
  members: { id: number; name: string }[]
}) {
  const [text, setText] = useState('')
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(members[0]?.id ?? null)
  const [importType, setImportType] = useState<'trades' | 'dividends' | 'interests'>('trades')
  const [parsedTrades, setParsedTrades] = useState<ParsedTrade[]>([])
  const [parsedDivs, setParsedDivs] = useState<ParsedDividend[]>([])
  const [parsedInterests, setParsedInterests] = useState<ParsedInterest[]>([])
  const [step, setStep] = useState<'input' | 'preview'>('input')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (isOpen) { setText(''); setParsedTrades([]); setParsedDivs([]); setParsedInterests([]); setStep('input'); setSelectedMemberId(members[0]?.id ?? null); setTimeout(() => textareaRef.current?.focus(), 100) }
  }, [isOpen, members])

  useEscapeKey(onClose, isOpen)

  const handleParse = () => {
    if (importType === 'trades') setParsedTrades(parseTrades(text))
    else if (importType === 'dividends') setParsedDivs(parseDividends(text))
    else setParsedInterests(parseInterests(text))
    setStep('preview')
  }

  const parsedCount = importType === 'trades' ? parsedTrades.length : importType === 'dividends' ? parsedDivs.length : parsedInterests.length
  const typeLabels = { trades: '판매수익', dividends: '배당금', interests: '계좌이자' }
  const placeholders = {
    trades: "26.5.19\n국내주식\nlogo\n경방\n+3,364원\n...",
    dividends: "26.4.17\n25.12.29\n국내주식\nlogo\n셀트리온제약\n+3,200원\n16주\n0원",
    interests: "26.4.30\n26.3.31 ~ 26.4.29\n원화 이자\n+455원\n70원\n연 1.00%",
  }
  const descriptions = {
    trades: '증권사 앱에서 판매내역을 복사하여 아래에 붙여넣기 하세요.',
    dividends: '증권사 앱에서 배당금 내역을 복사하여 아래에 붙여넣기 하세요.',
    interests: '증권사 앱에서 계좌이자 내역을 복사하여 아래에 붙여넣기 하세요.',
  }


  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div key="paste-ov" aria-hidden="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="sheet-overlay" onClick={onClose} />
      <motion.div key="paste-sh" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="sheet-container max-h-[90vh]" role="dialog" aria-modal="true" aria-label="데이터 가져오기">
        <div className="sheet-handle" />
        <div className="sheet-body">
          <div className="sheet-header mb-4">
            <h2 className="sheet-title flex items-center gap-2"><Upload className="w-5 h-5 text-accent-primary" />데이터 가져오기</h2>
            <button onClick={onClose} className="sheet-close"><X className="w-5 h-5" /></button>
          </div>

          {/* Import type selector */}
          <div className="tab-bar tab-bar--segment tab-bar--3col mb-4">
            {(['trades', 'dividends', 'interests'] as const).map(t => (
              <button key={t} onClick={() => { setImportType(t); setStep('input') }}
                className={clsx('tab-item', importType === t && 'tab-item--selected')}>
                {typeLabels[t]}
              </button>
            ))}
          </div>

          {/* Member selector */}
          <div className="mb-4">
            <label className="text-label2 text-sub block mb-1.5">구성원 선택</label>
            <div className="chip-group-wrap">
              {members.map(m => (
                <button key={m.id} onClick={() => setSelectedMemberId(m.id)}
                  className={clsx('chip chip-sm', selectedMemberId === m.id && 'chip-selected')}>
                  {m.name}
                </button>
              ))}
            </div>
          </div>

          {step === 'input' ? (
            <>
              <p className="text-body3 text-sub mb-2">{descriptions[importType]}</p>
              <div className="textarea-field h-48">
                <textarea ref={textareaRef} value={text} onChange={e => setText(e.target.value)}
                  placeholder={placeholders[importType]}
                  className="textarea-value font-mono" />
              </div>
              <button onClick={handleParse} disabled={!text.trim()}
                className="btn-foundation btn-filled-primary btn-flexible btn-md mt-3">
                파싱하기
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <p className="text-body3-bold text-heading">{parsedCount}건 인식됨</p>
                <button onClick={() => setStep('input')} className="btn-foundation btn-ghost btn-sm">다시 입력</button>
              </div>
              {parsedCount === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-secondary">
                  <AlertCircle className="w-10 h-10 mb-2 opacity-40" /><p className="text-body3">인식된 데이터가 없습니다.</p>
                </div>
              ) : (
                <div className="space-y-1 max-h-60 overflow-y-auto mb-4">
                  {importType === 'trades' ? parsedTrades.map((t, i) => (
                    <div key={i} className="list-item card-fill rounded-lg">
                      <div><p className="text-body3-bold text-heading">{t.stockName}</p><p className="text-label3-medium text-sub">{t.sellDate} · {formatShares(t.sellQuantity)}주</p></div>
                      <span className={clsx('text-body3-bold financial-value', t.totalProfit >= 0 ? 'value-positive' : 'value-negative')}>{formatChange(t.totalProfit)}</span>
                    </div>
                  )) : importType === 'dividends' ? parsedDivs.map((d, i) => (
                    <div key={i} className="list-item card-fill rounded-lg">
                      <div><p className="text-body3-bold text-heading">{d.stockName}</p><p className="text-label3-medium text-sub">{d.paymentDate} · {formatShares(d.quantity)}주</p></div>
                      <span className="text-body3-bold financial-value value-positive">+{formatKoreanUnit(d.dividendAmount)}원</span>
                    </div>
                  )) : parsedInterests.map((r, i) => (
                    <div key={i} className="list-item card-fill rounded-lg">
                      <div><p className="text-body3-bold text-heading">{r.interestType}</p><p className="text-label3-medium text-sub">{r.depositDate} · 연 {r.interestRate}%</p></div>
                      <span className="text-body3-bold financial-value value-positive">+{formatKoreanUnit(r.interestAmount)}원</span>
                    </div>
                  ))}
                </div>
              )}
              {parsedCount > 0 && (
                <button onClick={() => {
                  if (importType === 'trades') onImportTrades(parsedTrades, selectedMemberId)
                  else if (importType === 'dividends') onImportDividends(parsedDivs, selectedMemberId)
                  else onImportInterests(parsedInterests, selectedMemberId)
                  onClose()
                }}
                  className="btn-foundation btn-filled-primary btn-flexible btn-md">
                  {parsedCount}건 등록하기
                </button>
              )}
            </>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

// ─── Top Stocks (Trades) ─────────────────────────
function TopStocksSection({ gainers, losers }: { gainers: InvestmentTrade[]; losers: InvestmentTrade[] }) {
  const [tab, setTab] = useState<'gainers' | 'losers'>('gainers')
  const list = tab === 'gainers' ? gainers : losers
  return (
    <div className="space-y-2">
      <div className="chip-group">
        <button onClick={() => setTab('gainers')} className={clsx('chip chip-sm', tab === 'gainers' ? 'chip-active badge-success' : '')}>
          <TrendingUp className="chip-icon" />수익 TOP
        </button>
        <button onClick={() => setTab('losers')} className={clsx('chip chip-sm', tab === 'losers' ? 'chip-active badge-danger' : '')}>
          <TrendingDown className="chip-icon" />손실 TOP
        </button>
      </div>
      <div className="space-y-0">
        {list.slice(0, 5).map((t, i) => {
          const pos = t.totalProfit >= 0
          return (
            <div key={t.id ?? i} className="list-item">
              <span className={clsx('w-5 h-5 flex items-center justify-center rounded-full text-micro font-bold shrink-0', i === 0 ? 'bg-status-warning-soft text-status-warning' : 'bg-surface-secondary text-sub')}>{i + 1}</span>
              <span className="flex-1 text-body3 text-heading truncate">{t.stockName}</span>
              <span className={clsx('text-caption font-bold financial-value', pos ? 'value-positive' : 'value-negative')}>{formatChange(t.totalProfit)}</span>
              <span className={clsx('text-micro financial-value w-12 text-right', pos ? 'value-positive opacity-70' : 'value-negative opacity-70')}>
                {t.profitRate >= 0 ? '+' : ''}{t.profitRate.toFixed(1)}%
              </span>
            </div>
          )
        })}
        {list.length === 0 && <p className="text-body3 text-muted py-3 text-center">데이터가 없습니다</p>}
      </div>
    </div>
  )
}

// ─── Top Dividend Stocks ─────────────────────────
function TopDividendStocks({ stocks }: { stocks: { stockName: string; total: number; count: number }[] }) {
  if (stocks.length === 0) return null
  return (
    <div className="space-y-2">
      <h3 className="text-body3 font-bold text-heading flex items-center gap-1.5">
        <Trophy className="w-4 h-4 text-status-warning" />배당 TOP 종목
      </h3>
      <div className="space-y-0">
        {stocks.map((s, i) => (
          <div key={s.stockName} className="list-item">
            <span className={clsx('w-5 h-5 flex items-center justify-center rounded-full text-micro font-bold shrink-0', i === 0 ? 'bg-status-warning-soft text-status-warning' : 'bg-surface-tertiary text-sub')}>{i + 1}</span>
            <span className="flex-1 text-body3 text-heading truncate">{s.stockName}</span>
            <span className="text-caption font-bold financial-value value-positive">{formatKRW(s.total)}</span>
            <span className="text-micro text-muted w-8 text-right">{s.count}회</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Unified Dashboard View ──────────────────────
function InvestmentDashboard({
  tradeProfit, tradeRate, tradeCount,
  divNet, divCount,
  interestNet, interestCount,
  monthlyTrades, monthlyDivs, monthlyInterests,
  topGainers, topDivStocks,
  onTabChange, insights,
  trades, dividends, interests,
}: {
  tradeProfit: number; tradeRate: number; tradeCount: number
  divNet: number; divCount: number
  interestNet: number; interestCount: number
  monthlyTrades: { month: string; profit: number; count: number }[]
  monthlyDivs: { month: string; amount: number; tax: number; count: number }[]
  monthlyInterests: { month: string; amount: number; tax: number; count: number }[]
  topGainers: InvestmentTrade[]
  topDivStocks: { stockName: string; total: number; count: number }[]
  onTabChange: (tab: 'trades' | 'dividends' | 'interests') => void
  insights: InvestmentInsights
  trades: InvestmentTrade[]
  dividends: Dividend[]
  interests: AccountInterest[]
}) {
  const totalIncome = tradeProfit + divNet + interestNet
  const animatedTotal = useCountUp(totalIncome)
  const isPositive = totalIncome >= 0

  // Merge monthly data
  const mergedMonthly = useMemo(() => {
    const map = new Map<string, { trade: number; div: number; interest: number; total: number }>()
    for (const s of monthlyTrades) {
      const e = map.get(s.month) ?? { trade: 0, div: 0, interest: 0, total: 0 }
      e.trade += s.profit; e.total += s.profit; map.set(s.month, e)
    }
    for (const s of monthlyDivs) {
      const net = s.amount - s.tax
      const e = map.get(s.month) ?? { trade: 0, div: 0, interest: 0, total: 0 }
      e.div += net; e.total += net; map.set(s.month, e)
    }
    for (const s of monthlyInterests) {
      const net = s.amount - s.tax
      const e = map.get(s.month) ?? { trade: 0, div: 0, interest: 0, total: 0 }
      e.interest += net; e.total += net; map.set(s.month, e)
    }
    return Array.from(map.entries())
      .map(([month, v]) => ({ month, ...v }))
      .sort((a, b) => b.month.localeCompare(a.month))
  }, [monthlyTrades, monthlyDivs, monthlyInterests])

  return (
    <div className="space-y-5">
      {/* Total Hero */}
      <InvestmentHeroSection label="총 투자수익 합계" aurora={AURORA_DEFAULT}>
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span aria-hidden="true"
              className={clsx('text-financial-fluid font-extrabold tracking-tight tabular-nums', isPositive ? 'text-heading' : 'value-negative')}
              style={isPositive ? { textShadow: '0 1px 2px color-mix(in srgb, var(--color-primary-500) 16%, transparent)' } : undefined}>
              {isPositive ? '+' : ''}{animatedTotal.toLocaleString('ko-KR')}
            </span>
            <span aria-hidden="true" className="text-title2 text-sub">원</span>
            <span className="sr-only">총 투자수익 합계 {formatChange(totalIncome)}</span>
          </div>
          {(tradeCount + divCount + interestCount) > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 h-6 rounded-full text-micro font-bold text-sub bg-surface-tertiary ring-1 ring-base tabular-nums">
              총 {tradeCount + divCount + interestCount}건
            </span>
          )}
        </div>

          {/* 3-column breakdown */}
          <div className="grid grid-cols-3 gap-2.5 mt-5">
            {[
              { key: 'trades' as const, label: '판매수익', icon: TrendingUp, value: tradeProfit, count: tradeCount, rate: tradeRate, color: 'var(--value-positive)' },
              { key: 'dividends' as const, label: '배당금', icon: Banknote, value: divNet, count: divCount, color: 'var(--chart-series-3)' },
              { key: 'interests' as const, label: '계좌이자', icon: Landmark, value: interestNet, count: interestCount, color: 'var(--color-primary-500)' },
            ].map(item => {
              const Icon = item.icon
              const valPos = item.value >= 0
              return (
                <button key={item.key} onClick={() => onTabChange(item.key)}
                  aria-label={`${item.label} ${formatChange(item.value)}, ${item.count}건 — 자세히 보기`}
                  className="group relative rounded-2xl p-3 text-left transition-all hover:-translate-y-0.5 active:translate-y-0 ring-1 ring-base bg-surface-primary hover:elevation-2 overflow-hidden">
                  <div className="flex items-center justify-between mb-2">
                    <span aria-hidden="true" className="inline-flex items-center justify-center w-7 h-7 rounded-xl"
                      style={{
                        background: `linear-gradient(135deg, color-mix(in srgb, ${item.color} 22%, transparent), color-mix(in srgb, ${item.color} 7%, transparent))`,
                        color: item.color,
                        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${item.color} 30%, transparent), inset 0 1px 0 0 var(--hero-soft-icon-inset-highlight)`,
                      }}>
                      <Icon className="w-3.5 h-3.5" />
                    </span>
                    <ChevronRight aria-hidden="true" className="w-3.5 h-3.5 text-disabled opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                  </div>
                  <span className="block text-micro font-bold tracking-[0.12em] uppercase mb-0.5" style={{ color: item.color }}>{item.label}</span>
                  <p className="text-body3 font-bold tabular-nums" style={{ color: valPos ? 'var(--text-primary)' : 'var(--value-negative)' }}>
                    {valPos ? '+' : '−'}{formatKoreanUnit(Math.abs(item.value))}<span className="text-micro font-medium text-sub">원</span>
                  </p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-micro text-sub tabular-nums">{item.count}건</span>
                    {'rate' in item && item.rate != null && item.rate !== 0 && (
                      <span className={clsx(
                        'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-micro font-bold tabular-nums ring-1',
                        item.rate >= 0
                          ? 'bg-status-success-soft text-status-success ring-[color:var(--status-success)]/15'
                          : 'bg-status-danger-soft text-status-danger ring-[color:var(--status-danger)]/15',
                      )}>
                        {item.rate >= 0 ? '+' : ''}{item.rate.toFixed(1)}%
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Composition bar — 수익 구성(양의 기여분 기준, 합 100%) */}
          {(() => {
            const posTrade = Math.max(tradeProfit, 0)
            const posDiv = Math.max(divNet, 0)
            const posInt = Math.max(interestNet, 0)
            const posSum = posTrade + posDiv + posInt
            if (posSum <= 0) return null
            const seg = [
              { label: '판매', v: posTrade, color: 'var(--value-positive)' },
              { label: '배당', v: posDiv, color: 'var(--chart-series-3)' },
              { label: '이자', v: posInt, color: 'var(--color-primary-500)' },
            ].filter(s => s.v > 0)
            return (
              <div className="mt-4">
                <div className="flex h-2 rounded-full overflow-hidden bg-surface-secondary gap-px" role="presentation">
                  {seg.map(s => <div key={s.label} style={{ width: `${(s.v / posSum) * 100}%`, backgroundColor: s.color }} />)}
                </div>
                <div className="flex items-center justify-center flex-wrap gap-x-4 gap-y-1 mt-2">
                  {seg.map(s => (
                    <span key={s.label} className="flex items-center gap-1 text-micro text-sub">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />{s.label} {formatPercent((s.v / posSum) * 100, 0)}
                    </span>
                  ))}
                </div>
              </div>
            )
          })()}
      </InvestmentHeroSection>

      {/* Monthly stacked chart */}
      {mergedMonthly.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-body3 font-bold text-heading flex items-center gap-1.5">
            <BarChart3 className="w-4 h-4" style={{ color: 'var(--color-primary-500)' }} />월별 통합 수익
          </h3>
          <div className="space-y-1.5">
            {mergedMonthly.slice(0, 6).map(s => {
              const maxVal = Math.max(...mergedMonthly.slice(0, 6).map(m => Math.abs(m.total)), 1)
              const w = Math.min((Math.abs(s.total) / maxVal) * 100, 100)
              const [y, m] = s.month.split('-')
              // 월별 막대 내부는 "양의 기여분 구성"으로 채워 합이 100%를 넘지 않도록 한다.
              const posParts = [
                { v: Math.max(s.trade, 0), color: 'var(--value-positive)', op: 0.78, delay: 0 },
                { v: Math.max(s.div, 0), color: 'var(--chart-series-3)', op: 0.7, delay: 0.08 },
                { v: Math.max(s.interest, 0), color: 'var(--color-primary-500)', op: 0.62, delay: 0.16 },
              ]
              const posSum = posParts.reduce((a, p) => a + p.v, 0)
              return (
                <div key={s.month} className="flex items-center gap-2">
                  <span className="text-micro font-medium text-sub w-14 shrink-0 financial-value">{y}.{m}</span>
                  <div className="flex-1 h-7 relative bg-surface-secondary rounded-md overflow-hidden">
                    <div className="absolute inset-y-0 left-0 flex" style={{ width: `${w}%` }}>
                      {s.total >= 0 && posSum > 0 ? (
                        posParts.filter(p => p.v > 0).map((p, idx) => (
                          <motion.div key={idx} initial={{ width: 0 }} animate={{ width: `${(p.v / posSum) * 100}%` }}
                            transition={{ duration: 0.6, ease: 'easeOut', delay: p.delay }}
                            className="h-full" style={{ backgroundColor: p.color, opacity: p.op }} />
                        ))
                      ) : (
                        <motion.div initial={{ width: 0 }} animate={{ width: '100%' }}
                          transition={{ duration: 0.6, ease: 'easeOut' }}
                          className="h-full" style={{ backgroundColor: 'var(--value-negative)', opacity: 0.78 }} />
                      )}
                    </div>
                    <span className={clsx('absolute inset-y-0 flex items-center px-2 text-caption font-bold financial-value',
                      w > 45 ? 'text-inverse left-0' : s.total >= 0 ? 'value-positive right-0' : 'value-negative right-0'
                    )}>
                      {formatChange(s.total)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Chart.js Charts: 2x2 grid */}
      {(tradeCount + divCount + interestCount) > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" role="region" aria-label="투자 차트">
          <CumulativeProfitChart trades={trades} dividends={dividends} interests={interests} />
          <AssetTypeDonutChart trades={trades} />
          <SeasonHeatmap seasonality={insights.seasonality} />
          <PeriodComparison trades={trades} dividends={dividends} interests={interests} />
        </div>
      )}

      {/* Two-column: Top Gainers + Top Dividends */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {topGainers.length > 0 && (
          <div className="card-foundation">
            <h3 className="text-body3 font-bold text-heading flex items-center gap-1.5 mb-3">
              <TrendingUp className="w-4 h-4 text-status-success" />수익 TOP 종목
            </h3>
            <div className="space-y-2">
              {topGainers.slice(0, 5).map((t, i) => (
                <div key={t.id ?? i} className="list-item">
                  <span className={clsx('w-5 h-5 flex items-center justify-center rounded-full text-micro font-bold shrink-0', i === 0 ? 'bg-status-warning-soft text-status-warning' : 'bg-surface-secondary text-sub')}>{i + 1}</span>
                  <span className="flex-1 text-body3 text-heading truncate">{t.stockName}</span>
                  <span className="text-caption font-bold financial-value value-positive shrink-0">{formatChange(t.totalProfit)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {topDivStocks.length > 0 && (
          <div className="card-foundation">
            <h3 className="text-body3 font-bold text-heading flex items-center gap-1.5 mb-3">
              <Banknote className="w-4 h-4 text-status-warning" />배당 TOP 종목
            </h3>
            <div className="space-y-2">
              {topDivStocks.slice(0, 5).map((s, i) => (
                <div key={s.stockName} className="list-item">
                  <span className={clsx('w-5 h-5 flex items-center justify-center rounded-full text-micro font-bold shrink-0', i === 0 ? 'bg-status-warning-soft text-status-warning' : 'bg-surface-secondary text-sub')}>{i + 1}</span>
                  <span className="flex-1 text-body3 text-heading truncate">{s.stockName}</span>
                  <span className="text-caption font-bold financial-value value-positive shrink-0">{formatKRW(s.total)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ─── Premium Insight Cards ─── */}
      {(tradeCount + divCount + interestCount) > 0 && (
        <div className="space-y-4" role="region" aria-label="투자 인사이트">
          {/* Section title */}
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--color-primary-500)' }} />
            <h3 className="text-caption font-bold tracking-[0.14em] uppercase text-[color:var(--color-primary-600)] dark:text-[color:var(--color-primary-300)]">
              투자 인사이트
            </h3>
          </div>

          {/* Row 1: Trade Efficiency + Projected Income */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Trade Efficiency */}
            {tradeCount > 0 && (
              <div className="rounded-2xl bg-surface-primary p-4 ring-1 ring-base">
                <h3 className="text-body3-semi text-heading flex items-center gap-1.5 mb-3">
                  <TrendingUp className="w-4 h-4" style={{ color: 'var(--value-positive)' }} />매매 효율
                </h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <div>
                    <p className="text-label3-medium text-disabled">평균 수익 (승)</p>
                    <p className="text-body3 font-bold tabular-nums" style={{ color: 'var(--value-positive)' }}>
                      +{formatKoreanUnit(Math.round(insights.tradeEfficiency.avgWinProfit))}원
                    </p>
                  </div>
                  <div>
                    <p className="text-label3-medium text-disabled">평균 손실 (패)</p>
                    <p className="text-body3 font-bold tabular-nums" style={{ color: 'var(--value-negative)' }}>
                      −{formatKoreanUnit(Math.round(insights.tradeEfficiency.avgLossAmount))}원
                    </p>
                  </div>
                  <div>
                    <p className="text-label3-medium text-disabled">손익비</p>
                    <p className="text-body3 font-bold tabular-nums text-heading">
                      {insights.tradeEfficiency.profitFactor === Infinity ? '∞' : insights.tradeEfficiency.profitFactor.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-label3-medium text-disabled">평균 수익률</p>
                    <p className="text-body3 font-bold tabular-nums text-heading">
                      {insights.tradeEfficiency.avgHoldReturn >= 0 ? '+' : ''}{insights.tradeEfficiency.avgHoldReturn.toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-label3-medium text-disabled">최대 연승</p>
                    <p className="text-body3 font-bold tabular-nums" style={{ color: 'var(--value-positive)' }}>
                      {insights.tradeEfficiency.maxConsecutiveWins}연승
                    </p>
                  </div>
                  <div>
                    <p className="text-label3-medium text-disabled">최대 연패</p>
                    <p className="text-body3 font-bold tabular-nums" style={{ color: 'var(--value-negative)' }}>
                      {insights.tradeEfficiency.maxConsecutiveLosses}연패
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Projected Income */}
            {insights.projectedIncome.monthsOfData > 0 && (
              <div className="rounded-2xl bg-surface-primary p-4 ring-1 ring-base">
                <h3 className="text-body3-semi text-heading flex items-center gap-1.5 mb-3">
                  <BarChart3 className="w-4 h-4" style={{ color: 'var(--color-primary-500)' }} />수익 전망
                </h3>
                <div>
                  <p className="text-label3-medium text-disabled">월 평균 수익</p>
                  <p className="text-body3 font-bold tabular-nums text-heading">{formatKRW(Math.round(insights.projectedIncome.monthlyAvg))}</p>
                </div>
                <div className="mt-2">
                  <p className="text-label3-medium text-disabled">연간 예상</p>
                  <p className="text-title2 font-extrabold tabular-nums text-heading">
                    {formatKoreanUnit(Math.round(insights.projectedIncome.annualProjection))}원
                  </p>
                </div>
                <div className="mt-2 flex items-center gap-1.5">
                  <span className={clsx(
                    'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-micro font-bold tabular-nums ring-1',
                    insights.projectedIncome.trend === 'up' && 'bg-status-success-soft text-status-success ring-[color:var(--status-success)]/15',
                    insights.projectedIncome.trend === 'down' && 'bg-status-danger-soft text-status-danger ring-[color:var(--status-danger)]/15',
                    insights.projectedIncome.trend === 'stable' && 'bg-surface-tertiary text-sub ring-base',
                  )}>
                    {insights.projectedIncome.trend === 'up' ? <TrendingUp className="w-2.5 h-2.5" /> : insights.projectedIncome.trend === 'down' ? <TrendingDown className="w-2.5 h-2.5" /> : null}
                    {insights.projectedIncome.trend === 'up' ? '상승' : insights.projectedIncome.trend === 'down' ? '하락' : '보합'}
                    {Math.abs(insights.projectedIncome.trendPercent) > 0 && ` ${Math.abs(insights.projectedIncome.trendPercent).toFixed(0)}%`}
                  </span>
                  <span className="text-micro text-disabled">{insights.projectedIncome.monthsOfData}개월 데이터 기준</span>
                </div>
              </div>
            )}
          </div>

          {/* Row 2: Asset Performance + Concentration */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Asset Type Scorecard */}
            {insights.assetTypePerfs.length > 0 && (
              <div className="rounded-2xl bg-surface-primary p-4 ring-1 ring-base">
                <h3 className="text-body3-semi text-heading flex items-center gap-1.5 mb-3">
                  <Landmark className="w-4 h-4" style={{ color: 'var(--chart-series-5)' }} />자산유형별 성과
                </h3>
                <div className="space-y-2">
                  {insights.assetTypePerfs.slice(0, 4).map((a, i) => (
                    <div key={a.assetType} className="flex items-center gap-2">
                      <span className={clsx('w-4 h-4 flex items-center justify-center rounded text-micro font-bold',
                        i === 0 ? 'bg-status-warning-soft text-status-warning' : 'bg-surface-tertiary text-sub')}>{i + 1}</span>
                      <span className="flex-1 text-caption font-bold text-heading truncate">{a.assetType}</span>
                      <span className="text-micro font-bold tabular-nums" style={{ color: a.roi >= 0 ? 'var(--value-positive)' : 'var(--value-negative)' }}>
                        {a.roi >= 0 ? '+' : ''}{a.roi.toFixed(1)}%
                      </span>
                      <span className="text-micro text-disabled tabular-nums w-10 text-right">
                        승률 {a.winRate.toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Concentration Risk */}
            {insights.concentration.top5Stocks.length > 0 && (
              <div className="rounded-2xl bg-surface-primary p-4 ring-1 ring-base">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-body3-semi text-heading flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4" style={{ color: insights.concentration.riskLevel === 'high' ? 'var(--status-danger-text)' : insights.concentration.riskLevel === 'medium' ? 'var(--status-warning-text)' : 'var(--value-positive)' }} />집중도 리스크
                  </h3>
                  <span className={clsx(
                    'inline-flex items-center px-1.5 py-0.5 rounded-full text-micro font-bold ring-1',
                    insights.concentration.riskLevel === 'high' && 'bg-status-danger-soft text-status-danger ring-[color:var(--status-danger)]/15',
                    insights.concentration.riskLevel === 'medium' && 'bg-status-warning-soft text-status-warning ring-[color:var(--status-warning)]/15',
                    insights.concentration.riskLevel === 'low' && 'bg-status-success-soft text-status-success ring-[color:var(--status-success)]/15',
                  )}>
                    {insights.concentration.riskLevel === 'high' ? '높음' : insights.concentration.riskLevel === 'medium' ? '보통' : '낮음'}
                  </span>
                </div>
                <p className="text-body3 text-disabled mb-2">상위 5종목이 수익의 <span className="font-bold text-heading">{insights.concentration.top5Share.toFixed(0)}%</span>를 차지</p>
                <div className="flex h-2 rounded-full overflow-hidden bg-surface-tertiary mb-2">
                  {insights.concentration.top5Stocks.map((s, i) => {
                    const totalP = insights.concentration.top5Stocks.reduce((sum, x) => sum + x.profit, 0)
                    const w = totalP > 0 ? (s.profit / totalP) * (insights.concentration.top5Share) : 0
                    return <div key={s.name} className="h-full" style={{ width: `${w}%`, backgroundColor: `oklch(0.65 0.18 ${287 + i * 22})`, opacity: 1 - i * 0.12 }} />
                  })}
                </div>
                <div className="space-y-1">
                  {insights.concentration.top5Stocks.map(s => (
                    <div key={s.name} className="flex items-center justify-between">
                      <span className="text-label3-medium text-sub truncate flex-1">{s.name}</span>
                      <span className="text-label3 tabular-nums" style={{ color: 'var(--value-positive)' }}>{formatKRW(s.profit)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Row 3: Fee/Tax + Dividend + Seasonality */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Fee & Tax */}
            {insights.feeAndTax.totalTaxAll > 0 && (
              <div className="rounded-2xl bg-surface-primary p-4 ring-1 ring-base">
                <h3 className="text-body3-semi text-heading flex items-center gap-1.5 mb-3">
                  <Landmark className="w-4 h-4" style={{ color: 'var(--value-negative)' }} />수수료·세금
                </h3>
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-label3-medium text-disabled">수수료</span>
                    <span className="text-body3 font-bold tabular-nums text-heading">{formatKRW(insights.feeAndTax.totalFees)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-label3-medium text-disabled">세금 합계</span>
                    <span className="text-body3 font-bold tabular-nums text-heading">{formatKRW(insights.feeAndTax.totalTaxAll)}</span>
                  </div>
                  <div className="pt-1.5 border-t border-[color:var(--border-subtle)]">
                    <div className="flex justify-between">
                      <span className="text-label3-medium text-disabled">실효 세율</span>
                      <span className="text-body3 font-bold tabular-nums" style={{ color: 'var(--value-negative)' }}>{insights.feeAndTax.effectiveTaxRate.toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Dividend Summary */}
            {divCount > 0 && (
              <div className="rounded-2xl bg-surface-primary p-4 ring-1 ring-base">
                <h3 className="text-body3-semi text-heading flex items-center gap-1.5 mb-3">
                  <Banknote className="w-4 h-4" style={{ color: 'var(--chart-series-3)' }} />배당 분석
                </h3>
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-label3-medium text-disabled">연간 예상</span>
                    <span className="text-body3 font-bold tabular-nums" style={{ color: 'var(--value-positive)' }}>{formatKRW(Math.round(insights.dividendInsight.annualizedRate))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-label3-medium text-disabled">종목 수</span>
                    <span className="text-body3 font-bold tabular-nums text-heading">{insights.dividendInsight.uniqueStocks}종</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-label3-medium text-disabled">TOP1 비중</span>
                    <span className={clsx('text-body3 font-bold tabular-nums', insights.dividendInsight.topStockShare > 50 ? 'text-status-warning' : 'text-heading')}>
                      {insights.dividendInsight.topStockShare.toFixed(0)}%
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Seasonality */}
            {insights.seasonality.length >= 2 && (
              <div className="rounded-2xl bg-surface-primary p-4 ring-1 ring-base">
                <h3 className="text-body3-semi text-heading flex items-center gap-1.5 mb-3">
                  <Calendar className="w-4 h-4" style={{ color: 'var(--color-primary-500)' }} />시즌 패턴
                </h3>
                <div className="space-y-1.5">
                  <div>
                    <p className="text-micro text-disabled">최고 수익 월</p>
                    <p className="text-body3 font-bold tabular-nums" style={{ color: 'var(--value-positive)' }}>
                      {insights.seasonality[0].month}월 <span className="text-micro font-medium text-sub">평균 +{formatKoreanUnit(Math.round(insights.seasonality[0].avgProfit))}원</span>
                    </p>
                  </div>
                  {insights.seasonality.length >= 2 && insights.seasonality[insights.seasonality.length - 1].avgProfit < 0 && (
                    <div>
                      <p className="text-micro text-disabled">최저 수익 월</p>
                      <p className="text-body3 font-bold tabular-nums" style={{ color: 'var(--value-negative)' }}>
                        {insights.seasonality[insights.seasonality.length - 1].month}월 <span className="text-micro font-medium text-sub">평균 {formatKoreanUnit(Math.round(insights.seasonality[insights.seasonality.length - 1].avgProfit))}원</span>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Row 4: Member Leaderboard */}
          {insights.memberPerfs.length > 1 && (
            <div className="rounded-2xl bg-surface-primary p-4 ring-1 ring-base">
              <h3 className="text-body3-semi text-heading flex items-center gap-1.5 mb-3">
                <Users className="w-4 h-4" style={{ color: 'var(--color-primary-500)' }} />구성원별 성과
              </h3>
              <div className="space-y-2">
                {insights.memberPerfs.map((m, i) => (
                  <div key={m.memberId} className="flex items-center gap-3 py-1">
                    <span className={clsx('w-5 h-5 flex items-center justify-center rounded-full text-micro font-bold shrink-0',
                      i === 0 ? 'bg-status-warning-soft text-status-warning' : 'bg-surface-tertiary text-sub')}>{i + 1}</span>
                    <span className="text-caption font-bold text-heading flex-shrink-0 w-16 truncate">{m.memberName}</span>
                    <div className="flex-1 flex items-center gap-3">
                      <ChipMetric label="판매" value={`${m.tradeProfit >= 0 ? '+' : ''}${formatKoreanUnit(m.tradeProfit)}원`} color={m.tradeProfit >= 0 ? 'var(--value-positive)' : 'var(--value-negative)'} />
                      {m.dividendNet > 0 && <ChipMetric label="배당" value={`+${formatKoreanUnit(m.dividendNet)}원`} color="var(--value-positive)" />}
                      <ChipMetric label="승률" value={`${m.tradeWinRate.toFixed(0)}%`} color="var(--color-primary-500)" />
                    </div>
                    <span className="text-body3 font-bold tabular-nums text-heading shrink-0">
                      {m.totalIncome >= 0 ? '+' : ''}{formatKoreanUnit(m.totalIncome)}원
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {(tradeCount + divCount + interestCount) === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-body">
          <BarChart3 className="w-12 h-12 mb-3 opacity-20" />
          <p className="text-body3">등록된 데이터가 없습니다</p>
          <p className="text-body3 text-muted mt-1">상단의 "가져오기" 버튼으로 증권사 데이터를 붙여넣기 하세요</p>
        </div>
      )}
    </div>
  )
}

// ─── View Mode Toggle ────────────────────────────
type InvViewMode = 'list' | 'grid' | 'compact' | 'table'
const VIEW_MODES: { key: InvViewMode; icon: typeof LayoutList; label: string; desktopOnly?: boolean }[] = [
  { key: 'list', icon: LayoutList, label: '리스트' },
  { key: 'grid', icon: LayoutGrid, label: '그리드' },
  { key: 'compact', icon: TableProperties, label: '컴팩트' },
  { key: 'table', icon: Table2, label: '표', desktopOnly: true },
]

function ViewModeToggle({ value, onChange, isDesktop }: { value: InvViewMode; onChange: (v: InvViewMode) => void; isDesktop: boolean }) {
  const modes = VIEW_MODES.filter(m => !m.desktopOnly || isDesktop)
  return (
    <div className="inline-flex items-center rounded-xl ring-1 ring-base overflow-hidden bg-surface-primary">
      {modes.map(m => {
        const Icon = m.icon
        const isActive = value === m.key
        return (
          <button key={m.key} type="button" onClick={() => onChange(m.key)}
            aria-label={m.label} aria-pressed={isActive}
            className={clsx(
              'flex items-center justify-center w-8 h-8 transition-all',
              isActive
                ? 'text-white'
                : 'text-sub hover:text-heading hover:bg-[var(--hover-bg)]',
            )}
            style={isActive ? { background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-700))' } : undefined}
          >
            <Icon className="w-3.5 h-3.5" />
          </button>
        )
      })}
    </div>
  )
}

// ─── Grid Trade Card ─────────────────────────────
function TradeGridCard({ trade, memberName, onClick }: { trade: InvestmentTrade; memberName?: string; onClick: () => void }) {
  const pos = trade.totalProfit >= 0
  return (
    <motion.button onClick={onClick}
      whileTap={{ scale: 0.97 }} transition={springSnappy}
      className="w-full text-left rounded-2xl bg-surface-primary p-3 ring-1 ring-base hover:elevation-2 transition-all overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <span className="text-micro font-bold tracking-wider px-1.5 h-[14px] rounded-full inline-flex items-center"
          style={{
            backgroundColor: `color-mix(in srgb, var(--color-primary-500) 14%, transparent)`,
            color: 'var(--color-primary-500)',
            boxShadow: `inset 0 0 0 1px color-mix(in srgb, var(--color-primary-500) 22%, transparent)`,
          }}>
          {trade.assetType}
        </span>
        <span className="text-micro text-disabled tabular-nums">{trade.sellDate}</span>
      </div>
      <p className="text-label3 font-bold text-heading truncate mb-1">{trade.stockName}</p>
      <p className="text-title2 font-extrabold tabular-nums tracking-tight" style={{ color: pos ? 'var(--value-positive)' : 'var(--value-negative)' }}>
        {pos ? '+' : ''}{formatKoreanUnit(trade.totalProfit)}<span className="text-caption">원</span>
      </p>
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-micro text-sub tabular-nums">{formatShares(trade.sellQuantity)}주</span>
        <span className={clsx('inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-micro font-bold tabular-nums ring-1',
          pos ? 'bg-status-success-soft text-status-success ring-[color:var(--status-success)]/15'
            : 'bg-status-danger-soft text-status-danger ring-[color:var(--status-danger)]/15',
        )}>
          {pos ? '+' : ''}{trade.profitRate.toFixed(1)}%
        </span>
      </div>
      {memberName && <p className="text-micro text-disabled mt-1 truncate">{memberName}</p>}
    </motion.button>
  )
}

// ─── Grid Dividend Card ──────────────────────────
function DividendGridCard({ div, onClick }: { div: Dividend; memberName?: string; onClick: () => void }) {
  const net = div.dividendAmount - div.tax
  return (
    <motion.button onClick={onClick}
      whileTap={{ scale: 0.97 }} transition={springSnappy}
      className="w-full text-left rounded-2xl bg-surface-primary p-3 ring-1 ring-base hover:elevation-2 transition-all overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <span className="text-micro font-bold tracking-wider px-1.5 h-[14px] rounded-full inline-flex items-center"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--chart-series-3) 14%, transparent)',
            color: 'var(--chart-series-3)',
            boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--chart-series-3) 22%, transparent)',
          }}>
          배당
        </span>
        <span className="text-micro text-disabled tabular-nums">{div.paymentDate}</span>
      </div>
      <p className="text-label3 font-bold text-heading truncate mb-1">{div.stockName}</p>
      <p className="text-title2 font-extrabold tabular-nums tracking-tight" style={{ color: 'var(--value-positive)' }}>
        +{formatKoreanUnit(net)}<span className="text-caption">원</span>
      </p>
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-micro text-sub tabular-nums">{formatShares(div.quantity)}주</span>
        {div.tax > 0 && <span className="text-micro text-disabled tabular-nums">세금 {formatKRW(div.tax)}</span>}
      </div>
    </motion.button>
  )
}

// ─── Grid Interest Card ──────────────────────────
function InterestGridCard({ interest, onClick }: { interest: AccountInterest; memberName?: string; onClick: () => void }) {
  const net = interest.interestAmount - interest.tax
  return (
    <motion.button onClick={onClick}
      whileTap={{ scale: 0.97 }} transition={springSnappy}
      className="w-full text-left rounded-2xl bg-surface-primary p-3 ring-1 ring-base hover:elevation-2 transition-all overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <span className="text-micro font-bold tracking-wider px-1.5 h-[14px] rounded-full inline-flex items-center"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--color-primary-500) 14%, transparent)',
            color: 'var(--color-primary-500)',
            boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--color-primary-500) 22%, transparent)',
          }}>
          연 {formatRatePercent(interest.interestRate)}
        </span>
        <span className="text-micro text-disabled tabular-nums">{interest.depositDate}</span>
      </div>
      <p className="text-label3 font-bold text-heading truncate mb-1">{interest.interestType}</p>
      <p className="text-title2 font-extrabold tabular-nums tracking-tight" style={{ color: 'var(--value-positive)' }}>
        +{formatKoreanUnit(net)}<span className="text-caption">원</span>
      </p>
      <div className="text-micro text-sub mt-1.5 tabular-nums">{interest.periodStart} ~ {interest.periodEnd}</div>
    </motion.button>
  )
}

// ─── Compact Table Row ───────────────────────────
function CompactTradeRow({ trade, onClick }: { trade: InvestmentTrade; onClick: () => void }) {
  const pos = trade.totalProfit >= 0
  return (
    <button onClick={onClick}
      className="group w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--hover-bg)] transition-colors border-b border-[color:var(--border-subtle)]">
      <span className="text-micro text-sub tabular-nums w-[70px] shrink-0">{trade.sellDate}</span>
      <span className="text-caption font-bold text-heading flex-1 truncate">{trade.stockName}</span>
      <span className="text-micro text-sub tabular-nums w-10 text-right shrink-0">{formatShares(trade.sellQuantity)}주</span>
      <span className="text-caption font-bold tabular-nums w-24 text-right shrink-0" style={{ color: pos ? 'var(--value-positive)' : 'var(--value-negative)' }}>
        {pos ? '+' : ''}{formatKoreanUnit(trade.totalProfit)}
      </span>
      <span className={clsx('text-micro font-bold tabular-nums w-14 text-right shrink-0', pos ? 'value-positive' : 'value-negative')}>
        {pos ? '+' : ''}{trade.profitRate.toFixed(1)}%
      </span>
      <ChevronRight className="w-3.5 h-3.5 text-disabled opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </button>
  )
}

function CompactDividendRow({ div, onClick }: { div: Dividend; onClick: () => void }) {
  const net = div.dividendAmount - div.tax
  return (
    <button onClick={onClick}
      className="group w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--hover-bg)] transition-colors border-b border-[color:var(--border-subtle)]">
      <span className="text-micro text-sub tabular-nums w-[70px] shrink-0">{div.paymentDate}</span>
      <span className="text-caption font-bold text-heading flex-1 truncate">{div.stockName}</span>
      <span className="text-micro text-sub tabular-nums w-10 text-right shrink-0">{formatShares(div.quantity)}주</span>
      <span className="text-caption font-bold tabular-nums w-24 text-right shrink-0" style={{ color: 'var(--value-positive)' }}>
        +{formatKoreanUnit(net)}
      </span>
      <span className="text-micro text-sub tabular-nums w-14 text-right shrink-0">세금 {formatKRW(div.tax)}</span>
      <ChevronRight className="w-3.5 h-3.5 text-disabled opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </button>
  )
}

function CompactInterestRow({ interest, onClick }: { interest: AccountInterest; onClick: () => void }) {
  const net = interest.interestAmount - interest.tax
  return (
    <button onClick={onClick}
      className="group w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--hover-bg)] transition-colors border-b border-[color:var(--border-subtle)]">
      <span className="text-micro text-sub tabular-nums w-[70px] shrink-0">{interest.depositDate}</span>
      <span className="text-caption font-bold text-heading flex-1 truncate">{interest.interestType}</span>
      <span className="text-micro text-sub tabular-nums w-14 text-right shrink-0">연 {formatRatePercent(interest.interestRate)}</span>
      <span className="text-caption font-bold tabular-nums w-24 text-right shrink-0" style={{ color: 'var(--value-positive)' }}>
        +{formatKoreanUnit(net)}
      </span>
      <ChevronRight className="w-3.5 h-3.5 text-disabled opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </button>
  )
}

// ─── Compact Table Header ────────────────────────
function CompactHeader({ type }: { type: 'trades' | 'dividends' | 'interests' }) {
  if (type === 'trades') return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-micro font-bold uppercase tracking-[0.12em] text-disabled border-b border-[color:var(--border-default)] bg-surface-tertiary rounded-t-xl sticky top-0 z-10">
      <span className="w-[70px] shrink-0">날짜</span>
      <span className="flex-1">종목</span>
      <span className="w-10 text-right shrink-0">수량</span>
      <span className="w-24 text-right shrink-0">수익</span>
      <span className="w-14 text-right shrink-0">수익률</span>
      <span className="w-3.5 shrink-0" />
    </div>
  )
  if (type === 'dividends') return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-micro font-bold uppercase tracking-[0.12em] text-disabled border-b border-[color:var(--border-default)] bg-surface-tertiary rounded-t-xl sticky top-0 z-10">
      <span className="w-[70px] shrink-0">지급일</span>
      <span className="flex-1">종목</span>
      <span className="w-10 text-right shrink-0">수량</span>
      <span className="w-24 text-right shrink-0">세후</span>
      <span className="w-14 text-right shrink-0">세금</span>
      <span className="w-3.5 shrink-0" />
    </div>
  )
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-micro font-bold uppercase tracking-[0.12em] text-disabled border-b border-[color:var(--border-default)] bg-surface-tertiary rounded-t-xl sticky top-0 z-10">
      <span className="w-[70px] shrink-0">입금일</span>
      <span className="flex-1">유형</span>
      <span className="w-14 text-right shrink-0">이자율</span>
      <span className="w-24 text-right shrink-0">세후</span>
      <span className="w-3.5 shrink-0" />
    </div>
  )
}

// ─── Market Filter Chips (CycleFilter 패턴) ──────
const MARKET_LABELS: Record<'all' | InvestmentMarket, string> = { all: '전체', domestic: '국내', overseas: '해외' }

function MarketFilterChips({ value, onChange, trades, dividends }: {
  value: 'all' | InvestmentMarket; onChange: (v: 'all' | InvestmentMarket) => void
  trades: InvestmentTrade[]; dividends: Dividend[]
}) {
  const shouldReduceMotion = useReducedMotion()
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: trades.length + dividends.length }
    for (const t of trades) c[t.market] = (c[t.market] ?? 0) + 1
    for (const d of dividends) c[d.market] = (c[d.market] ?? 0) + 1
    return c
  }, [trades, dividends])

  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-1 px-1 -my-1 py-1">
      {(['all', 'domestic', 'overseas'] as const).map(m => {
        const count = counts[m] ?? 0
        const isActive = value === m
        return (
          <motion.button key={m} type="button" onClick={() => onChange(m)}
            aria-pressed={isActive} aria-label={`${MARKET_LABELS[m]} ${count}건`}
            whileTap={shouldReduceMotion ? undefined : { scale: 0.95 }}
            transition={springSnappy}
            className={clsx(
              'flex-shrink-0 inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-label3 transition-all',
              isActive
                ? 'text-white shadow-[0_4px_14px_color-mix(in_oklch,var(--color-primary-500)_30%,transparent)]'
                : 'bg-surface-primary text-sub ring-1 ring-base hover:bg-[var(--hover-bg)]',
            )}
            style={isActive ? { background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-700))' } : undefined}
          >
            {MARKET_LABELS[m]}
            <span className={clsx(
              'min-w-[18px] px-1 h-[16px] rounded-full text-micro-bold tabular-nums flex items-center justify-center',
              isActive ? 'bg-white/22 text-white' : 'bg-surface-tertiary text-sub',
            )}>{count}</span>
          </motion.button>
        )
      })}
    </div>
  )
}

// ─── Month Filter Chips (MonthSelector 패턴) ─────
function MonthFilterChips({ value, onChange, months }: {
  value: string; onChange: (v: string) => void; months: string[]
}) {
  const shouldReduceMotion = useReducedMotion()
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const options = [
    { id: 'all', label: '전체' },
    ...months.slice(0, 12).map(m => ({
      id: m,
      label: m === currentMonth ? '이번 달' : `${m.split('-')[0].slice(2)}.${m.split('-')[1]}`,
    })),
  ]

  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-1 px-1 -my-1 py-1 flex-1 min-w-0">
      {options.map(opt => {
        const isActive = value === opt.id
        return (
          <motion.button key={opt.id} type="button" onClick={() => onChange(opt.id)}
            whileTap={shouldReduceMotion ? undefined : { scale: 0.95 }}
            transition={springSnappy}
            aria-pressed={isActive}
            className={clsx(
              'flex-shrink-0 inline-flex items-center gap-1 px-3 h-8 rounded-full text-label3 transition-all tabular-nums',
              isActive
                ? 'bg-[color:var(--color-primary-500)] text-white shadow-[0_4px_14px_color-mix(in_oklch,var(--color-primary-500)_30%,transparent)]'
                : 'bg-surface-primary text-sub ring-1 ring-base hover:bg-[var(--hover-bg)]',
            )}
          >
            {opt.label}
          </motion.button>
        )
      })}
    </div>
  )
}

// ─── Member Filter Chips ─────────────────────────
function MemberFilterChips({ value, onChange, members }: {
  value: number | 'all'; onChange: (v: number | 'all') => void; members: { id: number; name: string; color?: string }[]
}) {
  const shouldReduceMotion = useReducedMotion()
  if (members.length <= 1) return null

  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-1 px-1 -my-1 py-1">
      <motion.button type="button" onClick={() => onChange('all')}
        aria-pressed={value === 'all'}
        whileTap={shouldReduceMotion ? undefined : { scale: 0.95 }}
        transition={springSnappy}
        className={clsx(
          'flex-shrink-0 inline-flex items-center gap-1 px-3 h-8 rounded-full text-label3 transition-all',
          value === 'all'
            ? 'bg-[color:var(--color-primary-500)] text-white shadow-[0_4px_14px_color-mix(in_oklch,var(--color-primary-500)_30%,transparent)]'
            : 'bg-surface-primary text-sub ring-1 ring-base hover:bg-[var(--hover-bg)]',
        )}
      >
        <Users className="w-3 h-3" />전체
      </motion.button>
      {members.map(m => {
        const isActive = value === m.id
        return (
          <motion.button key={m.id} type="button" onClick={() => onChange(m.id)}
            aria-pressed={isActive}
            whileTap={shouldReduceMotion ? undefined : { scale: 0.95 }}
            transition={springSnappy}
            className={clsx(
              'flex-shrink-0 inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-label3 transition-all',
              isActive
                ? 'bg-[color:var(--color-primary-500)] text-white shadow-[0_4px_14px_color-mix(in_oklch,var(--color-primary-500)_30%,transparent)]'
                : 'bg-surface-primary text-sub ring-1 ring-base hover:bg-[var(--hover-bg)]',
            )}
          >
            {m.name}
          </motion.button>
        )
      })}
    </div>
  )
}

// ─── Sort Chips ──────────────────────────────────
const SORT_OPTIONS: { key: 'date' | 'profit' | 'rate'; label: string }[] = [
  { key: 'date', label: '날짜순' },
  { key: 'profit', label: '수익순' },
  { key: 'rate', label: '수익률순' },
]

function SortChips({ value, onChange }: { value: string; onChange: (v: 'date' | 'profit' | 'rate') => void }) {
  const shouldReduceMotion = useReducedMotion()
  return (
    <div className="flex gap-1.5">
      {SORT_OPTIONS.map(opt => {
        const isActive = value === opt.key
        return (
          <motion.button key={opt.key} type="button" onClick={() => onChange(opt.key)}
            aria-pressed={isActive} aria-label={`${opt.label} 정렬`}
            whileTap={shouldReduceMotion ? undefined : { scale: 0.95 }}
            transition={springSnappy}
            className={clsx(
              'flex-shrink-0 inline-flex items-center px-2.5 h-7 rounded-full text-label3 transition-all',
              isActive
                ? 'bg-[color:var(--color-primary-500)] text-white'
                : 'bg-surface-tertiary text-sub hover:bg-[var(--hover-bg)]',
            )}
          >
            {opt.label}
          </motion.button>
        )
      })}
    </div>
  )
}

// ─── Pure stat computations (shared by dashboard=전체 & 탭=필터) ──
function computeTradeStats(list: InvestmentTrade[]) {
  const totalSell = list.reduce((s, t) => s + t.totalSellAmount, 0)
  const totalBuy = list.reduce((s, t) => s + t.totalBuyAmount, 0)
  const totalProfit = list.reduce((s, t) => s + t.totalProfit, 0)
  const profitRate = totalBuy > 0 ? (totalProfit / totalBuy) * 100 : 0
  const wins = list.filter(t => t.totalProfit > 0).length
  const losses = list.filter(t => t.totalProfit <= 0).length
  const winRate = list.length > 0 ? (wins / list.length) * 100 : 0
  return { totalSell, totalBuy, totalProfit, profitRate, wins, losses, winRate, count: list.length }
}

function computeDivStats(list: Dividend[]) {
  const totalDiv = list.reduce((s, d) => s + d.dividendAmount, 0)
  const totalTax = list.reduce((s, d) => s + d.tax, 0)
  return { totalDiv, totalTax, netDiv: totalDiv - totalTax, count: list.length, stockCount: new Set(list.map(d => d.stockName)).size }
}

function computeInterestStats(list: AccountInterest[]) {
  const totalInterest = list.reduce((s, r) => s + r.interestAmount, 0)
  const totalTax = list.reduce((s, r) => s + r.tax, 0)
  return { totalInterest, totalTax, netInterest: totalInterest - totalTax, count: list.length }
}

// ═══════════════════════════════════════════════════
// ─── Main Page ───────────────────────────────────
// ═══════════════════════════════════════════════════
export function InvestmentPage() {
  // --- Stores ---
  const trades = useInvestmentStore(s => s.trades)
  const isLoadingTrades = useInvestmentStore(s => s.isLoading)
  const loadTrades = useInvestmentStore(s => s.loadTrades)
  const addTradesFromParsed = useInvestmentStore(s => s.addTradesFromParsed)
  const deleteTradeAction = useInvestmentStore(s => s.deleteTrade)
  const clearAllTrades = useInvestmentStore(s => s.clearAll)
  const getMonthlyTradeStats = useInvestmentStore(s => s.getMonthlyStats)
  const getTopGainers = useInvestmentStore(s => s.getTopGainers)
  const getTopLosers = useInvestmentStore(s => s.getTopLosers)

  const dividends = useDividendStore(s => s.dividends)
  const isLoadingDivs = useDividendStore(s => s.isLoading)
  const loadDividends = useDividendStore(s => s.loadDividends)
  const addDividendsFromParsed = useDividendStore(s => s.addDividendsFromParsed)
  const deleteDividendAction = useDividendStore(s => s.deleteDividend)
  const clearAllDividends = useDividendStore(s => s.clearAll)
  const getMonthlyDivStats = useDividendStore(s => s.getMonthlyStats)
  const getTopDivStocks = useDividendStore(s => s.getTopStocks)

  const interests = useAccountInterestStore(s => s.interests)
  const isLoadingInterests = useAccountInterestStore(s => s.isLoading)
  const loadInterests = useAccountInterestStore(s => s.loadInterests)
  const addInterestsFromParsed = useAccountInterestStore(s => s.addInterestsFromParsed)
  const deleteInterestAction = useAccountInterestStore(s => s.deleteInterest)
  const clearAllInterests = useAccountInterestStore(s => s.clearAll)
  const getMonthlyInterestStats = useAccountInterestStore(s => s.getMonthlyStats)

  const members = useMemberStore(s => s.members)
  const loadMembers = useMemberStore(s => s.loadMembers)

  // --- UI State ---
  const [activeTab, setActiveTab] = useState<'dashboard' | 'trades' | 'dividends' | 'interests'>('dashboard')
  const [selectedTrade, setSelectedTrade] = useState<InvestmentTrade | null>(null)
  const [selectedDiv, setSelectedDiv] = useState<Dividend | null>(null)
  const [selectedInterest, setSelectedInterest] = useState<AccountInterest | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingTrade, setEditingTrade] = useState<InvestmentTrade | null>(null)
  const [editingDiv, setEditingDiv] = useState<Dividend | null>(null)
  const [editingInterest, setEditingInterest] = useState<AccountInterest | null>(null)
  const [viewMode, setViewMode] = useState<InvViewMode>('list')
  const isDesktop = useMediaQuery(`(min-width: ${BREAKPOINTS.xl}px)`)
  const [marketFilter, setMarketFilter] = useState<'all' | InvestmentMarket>('all')
  const [monthFilter, setMonthFilter] = useState('all')
  const [memberFilter, setMemberFilter] = useState<number | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'date' | 'profit' | 'rate'>('date')

  useEffect(() => { loadTrades(); loadDividends(); loadInterests(); loadMembers() }, [loadTrades, loadDividends, loadInterests, loadMembers])
  useSyncListener(() => { loadTrades(); loadDividends(); loadInterests(); loadMembers() }, ['investmentTrades', 'dividends', 'accountInterests', 'members'])

  const memberMap = useMemo(() => {
    const map = new Map<number, string>()
    for (const m of members) if (m.id != null) map.set(m.id, m.name)
    return map
  }, [members])

  const membersList = useMemo(() => members.filter(m => m.id != null).map(m => ({ id: m.id!, name: m.name })), [members])

  const insights = useInvestmentInsights(trades, dividends, interests, memberMap)

  // --- Filtered trades ---
  const filteredTrades = useMemo(() => {
    let result = [...trades]
    if (marketFilter !== 'all') result = result.filter(t => t.market === marketFilter)
    if (monthFilter !== 'all') result = result.filter(t => t.sellDate.startsWith(monthFilter))
    if (memberFilter !== 'all') result = result.filter(t => t.memberId === memberFilter)
    if (searchQuery) { const q = searchQuery.toLowerCase(); result = result.filter(t => t.stockName.toLowerCase().includes(q)) }
    switch (sortBy) {
      case 'date': result.sort((a, b) => b.sellDate.localeCompare(a.sellDate)); break
      case 'profit': result.sort((a, b) => b.totalProfit - a.totalProfit); break
      case 'rate': result.sort((a, b) => b.profitRate - a.profitRate); break
    }
    return result
  }, [trades, marketFilter, monthFilter, memberFilter, searchQuery, sortBy])

  // --- Filtered dividends ---
  const filteredDivs = useMemo(() => {
    let result = [...dividends]
    if (marketFilter !== 'all') result = result.filter(d => d.market === marketFilter)
    if (monthFilter !== 'all') result = result.filter(d => d.paymentDate.startsWith(monthFilter))
    if (memberFilter !== 'all') result = result.filter(d => d.memberId === memberFilter)
    if (searchQuery) { const q = searchQuery.toLowerCase(); result = result.filter(d => d.stockName.toLowerCase().includes(q)) }
    result.sort((a, b) => b.paymentDate.localeCompare(a.paymentDate))
    return result
  }, [dividends, marketFilter, monthFilter, memberFilter, searchQuery])

  // --- Filtered interests ---
  const filteredInterests = useMemo(() => {
    let result = [...interests]
    if (monthFilter !== 'all') result = result.filter(r => r.depositDate.startsWith(monthFilter))
    if (memberFilter !== 'all') result = result.filter(r => r.memberId === memberFilter)
    result.sort((a, b) => b.depositDate.localeCompare(a.depositDate))
    return result
  }, [interests, monthFilter, memberFilter])

  // --- Computed stats ---
  // 탭(필터 적용) 통계 — 판매/배당/이자 탭의 히어로·리스트에 사용
  const tradeStats = useMemo(() => computeTradeStats(filteredTrades), [filteredTrades])
  const divStats = useMemo(() => computeDivStats(filteredDivs), [filteredDivs])
  const interestStats = useMemo(() => computeInterestStats(filteredInterests), [filteredInterests])

  // 대시보드(전체 데이터) 통계 — 대시보드는 필터 UI가 없으므로 항상 전체를 집계.
  // 차트·인사이트(이미 전체 데이터 사용)와 합계를 일관되게 맞춘다.
  const allTradeStats = useMemo(() => computeTradeStats(trades), [trades])
  const allDivStats = useMemo(() => computeDivStats(dividends), [dividends])
  const allInterestStats = useMemo(() => computeInterestStats(interests), [interests])

  const availableMonths = useMemo(() => {
    const months = new Set([
      ...trades.map(t => t.sellDate.slice(0, 7)),
      ...dividends.map(d => d.paymentDate.slice(0, 7)),
      ...interests.map(r => r.depositDate.slice(0, 7)),
    ])
    return Array.from(months).sort((a, b) => b.localeCompare(a))
  }, [trades, dividends, interests])

  // --- Handlers ---
  const handleImportTrades = useCallback(async (parsed: ParsedTrade[], memberId: number | null) => {
    await addTradesFromParsed(parsed.map(t => ({ memberId, ...t, memo: undefined })))
  }, [addTradesFromParsed])

  const handleImportDividends = useCallback(async (parsed: ParsedDividend[], memberId: number | null) => {
    await addDividendsFromParsed(parsed.map(d => ({ memberId, ...d, memo: undefined })))
  }, [addDividendsFromParsed])

  const handleImportInterests = useCallback(async (parsed: ParsedInterest[], memberId: number | null) => {
    await addInterestsFromParsed(parsed.map(r => ({ memberId, ...r, memo: undefined })))
  }, [addInterestsFromParsed])

  const handleDeleteTrade = useCallback(async (id: number) => { await deleteTradeAction(id); setSelectedTrade(null) }, [deleteTradeAction])
  const handleDeleteDiv = useCallback(async (id: number) => { await deleteDividendAction(id); setSelectedDiv(null) }, [deleteDividendAction])
  const handleDeleteInterest = useCallback(async (id: number) => { await deleteInterestAction(id); setSelectedInterest(null) }, [deleteInterestAction])

  const handleReset = async () => {
    if (activeTab === 'trades') await clearAllTrades()
    else if (activeTab === 'dividends') await clearAllDividends()
    else if (activeTab === 'interests') await clearAllInterests()
    setShowResetConfirm(false)
  }

  const openEditTrade = (t: InvestmentTrade) => { setSelectedTrade(null); setEditingTrade(t); setShowForm(true) }
  const openEditDiv = (d: Dividend) => { setSelectedDiv(null); setEditingDiv(d); setShowForm(true) }
  const openEditInterest = (r: AccountInterest) => { setSelectedInterest(null); setEditingInterest(r); setShowForm(true) }
  const openNewForm = () => { setEditingTrade(null); setEditingDiv(null); setEditingInterest(null); setShowForm(true) }
  const closeForm = () => { setShowForm(false); setEditingTrade(null); setEditingDiv(null); setEditingInterest(null) }
  const formType = editingTrade ? 'trade' as const : editingDiv ? 'dividend' as const : editingInterest ? 'interest' as const : (activeTab === 'trades' ? 'trade' as const : activeTab === 'dividends' ? 'dividend' as const : 'interest' as const)

  // --- Grouped lists ---
  const groupedTrades = useMemo(() => {
    const map = new Map<string, InvestmentTrade[]>()
    for (const t of filteredTrades) { const g = map.get(t.sellDate) ?? []; g.push(t); map.set(t.sellDate, g) }
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a))
  }, [filteredTrades])

  const groupedDivs = useMemo(() => {
    const map = new Map<string, Dividend[]>()
    for (const d of filteredDivs) { const g = map.get(d.paymentDate) ?? []; g.push(d); map.set(d.paymentDate, g) }
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a))
  }, [filteredDivs])

  const groupedInterests = useMemo(() => {
    const map = new Map<string, AccountInterest[]>()
    for (const r of filteredInterests) { const g = map.get(r.depositDate) ?? []; g.push(r); map.set(r.depositDate, g) }
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a))
  }, [filteredInterests])

  const isLoading = activeTab === 'dashboard' ? (isLoadingTrades || isLoadingDivs || isLoadingInterests) : activeTab === 'trades' ? isLoadingTrades : activeTab === 'dividends' ? isLoadingDivs : isLoadingInterests
  const hasData = activeTab === 'dashboard' ? (trades.length + dividends.length + interests.length) > 0 : activeTab === 'trades' ? trades.length > 0 : activeTab === 'dividends' ? dividends.length > 0 : interests.length > 0
  const filteredCount = activeTab === 'trades' ? filteredTrades.length : activeTab === 'dividends' ? filteredDivs.length : filteredInterests.length

  return (
    <div className="fold:p-3 p-4 lg:p-6 space-y-5 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-heading text-title2 flex items-center gap-2 min-w-0">
          <TrendingUp className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--color-primary-500)' }} />투자수익
        </h1>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {activeTab !== 'dashboard' && hasData && (
            <button onClick={() => setShowResetConfirm(true)}
              className="inline-flex items-center gap-1 h-9 px-3 rounded-2xl text-label3 ring-1 transition-all"
              style={{ color: 'var(--status-danger-text)', borderColor: 'color-mix(in srgb, var(--status-danger-text) 30%, transparent)', backgroundColor: 'var(--status-danger-bg)' }}>
              <RotateCcw className="w-3.5 h-3.5" />초기화
            </button>
          )}
          {activeTab !== 'dashboard' && (
            <button onClick={openNewForm}
              className="inline-flex items-center gap-1 h-9 px-3 rounded-2xl text-label3 text-body ring-1 ring-[color:var(--border-strong)] hover:ring-[color:var(--color-primary-400)] bg-surface-primary transition-all">
              <Plus className="w-4 h-4" />등록
            </button>
          )}
          <button onClick={() => setShowImport(true)}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-2xl text-label3 text-white shadow-[0_4px_14px_color-mix(in_oklch,var(--color-primary-500)_30%,transparent)]"
            style={{ background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-700))' }}>
            <Upload className="w-4 h-4" />가져오기
          </button>
        </div>
      </div>

      {/* Tab selector */}
      <div className="tab-bar tab-bar--fixed tab-bar--4col" role="tablist" aria-label="투자수익 보기 전환">
        {([
          { key: 'dashboard' as const, label: '대시보드' },
          { key: 'trades' as const, label: `판매 (${trades.length})` },
          { key: 'dividends' as const, label: `배당 (${dividends.length})` },
          { key: 'interests' as const, label: `이자 (${interests.length})` },
        ]).map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            role="tab" aria-selected={activeTab === t.key}
            className={clsx('tab-item', activeTab === t.key && 'tab-item--selected')}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Dashboard View */}
      {activeTab === 'dashboard' ? (
        <InvestmentDashboard
          tradeProfit={allTradeStats.totalProfit} tradeRate={allTradeStats.profitRate} tradeCount={allTradeStats.count}
          divNet={allDivStats.netDiv} divCount={allDivStats.count}
          interestNet={allInterestStats.netInterest} interestCount={allInterestStats.count}
          monthlyTrades={getMonthlyTradeStats()} monthlyDivs={getMonthlyDivStats()} monthlyInterests={getMonthlyInterestStats()}
          topGainers={getTopGainers(5)} topDivStocks={getTopDivStocks(5)}
          onTabChange={setActiveTab} insights={insights}
          trades={trades} dividends={dividends} interests={interests}
        />
      ) : null}

      {/* Hero — non-dashboard tabs */}
      {activeTab === 'trades' ? (
        <TradeHero totalProfit={tradeStats.totalProfit} profitRate={tradeStats.profitRate}
          totalSell={tradeStats.totalSell} totalBuy={tradeStats.totalBuy}
          winRate={tradeStats.winRate} count={tradeStats.count} wins={tradeStats.wins} losses={tradeStats.losses} />
      ) : activeTab === 'dividends' ? (
        <DividendHero totalDiv={divStats.totalDiv} totalTax={divStats.totalTax} netDiv={divStats.netDiv}
          count={divStats.count} stockCount={divStats.stockCount} />
      ) : activeTab === 'interests' ? (
        <InterestHero totalInterest={interestStats.totalInterest} totalTax={interestStats.totalTax}
          netInterest={interestStats.netInterest} count={interestStats.count} />
      ) : null}

      {/* Filters — non-dashboard tabs */}
      {activeTab !== 'dashboard' && (
        <div className="space-y-3">
          {/* Row 1: Market + Month */}
          <div className="space-y-2">
            {activeTab !== 'interests' && (
              <MarketFilterChips value={marketFilter} onChange={setMarketFilter} trades={trades} dividends={dividends} />
            )}
            <div className="flex items-center gap-2">
              <MonthFilterChips value={monthFilter} onChange={setMonthFilter} months={availableMonths} />
            </div>
          </div>

          {/* Row 2: Member + Sort */}
          <div className="flex items-center justify-between gap-3">
            <MemberFilterChips value={memberFilter} onChange={setMemberFilter}
              members={members.filter(m => m.id != null).map(m => ({ id: m.id!, name: m.name }))} />
            {activeTab === 'trades' && <SortChips value={sortBy} onChange={setSortBy} />}
          </div>

          {/* Search + View Toggle */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-disabled pointer-events-none" />
              <input type="text" aria-label="종목명 검색" placeholder="종목명 검색..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 h-10 rounded-2xl bg-surface-primary text-heading text-label3 ring-1 ring-base placeholder:text-disabled focus:outline-none focus:ring-[color:var(--color-primary-400)] transition-all" />
            </div>
            <ViewModeToggle value={viewMode} onChange={setViewMode} isDesktop={isDesktop} />
          </div>
        </div>
      )}

      {/* Charts & Rankings */}
      {activeTab !== 'dashboard' && hasData && (
        activeTab === 'trades' ? (
          <>
            <MonthlyChart stats={getMonthlyTradeStats().map(s => ({ ...s, value: s.profit }))} valueKey="profit" color="emerald" />
            <TopStocksSection gainers={getTopGainers(5)} losers={getTopLosers(5)} />
          </>
        ) : activeTab === 'dividends' ? (
          <>
            <MonthlyChart stats={getMonthlyDivStats().map(s => ({ ...s, value: s.amount - s.tax }))} valueKey="value" color="amber" />
            <TopDividendStocks stocks={getTopDivStocks(5)} />
          </>
        ) : (
          <MonthlyChart stats={getMonthlyInterestStats().map(s => ({ ...s, value: s.amount - s.tax }))} valueKey="value" color="amber" />
        )
      )}

      {/* 필터 결과 수 — 스크린리더 알림 */}
      {activeTab !== 'dashboard' && !isLoading && (
        <LiveRegion politeness="polite">
          {filteredCount > 0 ? `${filteredCount}건 표시 중` : (hasData ? '검색 결과가 없습니다' : '표시할 항목이 없습니다')}
        </LiveRegion>
      )}

      {/* Data View — non-dashboard tabs */}
      {activeTab !== 'dashboard' && (isLoading ? (
        <div className={clsx(viewMode === 'grid' ? 'grid grid-cols-2 gap-3' : 'space-y-3')}>
          {[1, 2, 3, 4].map(i => <div key={i} className={clsx('rounded-xl bg-surface-secondary skeleton-wave', viewMode === 'compact' ? 'h-10' : 'h-20')} />)}
        </div>
      ) : filteredCount === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-body">
          {activeTab === 'trades' ? <TrendingUp className="w-12 h-12 mb-3 opacity-20" /> : <Banknote className="w-12 h-12 mb-3 opacity-20" />}
          <p className="text-body3">{!hasData ? (activeTab === 'trades' ? '등록된 투자수익이 없습니다' : activeTab === 'dividends' ? '등록된 배당금이 없습니다' : '등록된 계좌이자가 없습니다') : '검색 결과가 없습니다'}</p>
          {!hasData && <p className="text-body3 text-muted mt-1">상단의 "가져오기" 버튼으로 증권사 데이터를 붙여넣기 하세요</p>}
        </div>
      ) : isDesktop && viewMode === 'table' ? (
        /* ═══ DESKTOP TABLE VIEW ═══ */
        <InvestmentTableView
          activeTab={activeTab as 'trades' | 'dividends' | 'interests'}
          trades={filteredTrades}
          dividends={filteredDivs}
          interests={filteredInterests}
          memberMap={memberMap}
          onSelectTrade={setSelectedTrade}
          onSelectDiv={setSelectedDiv}
          onSelectInterest={setSelectedInterest}
        />
      ) : viewMode === 'grid' ? (
        /* ═══ GRID VIEW ═══ */
        <div className="grid grid-cols-2 gap-3">
          {activeTab === 'trades' && filteredTrades.map(t => (
            <TradeGridCard key={t.id} trade={t} memberName={t.memberId != null ? memberMap.get(t.memberId) : undefined} onClick={() => setSelectedTrade(t)} />
          ))}
          {activeTab === 'dividends' && filteredDivs.map(d => (
            <DividendGridCard key={d.id} div={d} memberName={d.memberId != null ? memberMap.get(d.memberId) : undefined} onClick={() => setSelectedDiv(d)} />
          ))}
          {activeTab === 'interests' && filteredInterests.map(r => (
            <InterestGridCard key={r.id} interest={r} memberName={r.memberId != null ? memberMap.get(r.memberId) : undefined} onClick={() => setSelectedInterest(r)} />
          ))}
        </div>
      ) : viewMode === 'compact' ? (
        /* ═══ COMPACT VIEW ═══ */
        <div className="rounded-xl ring-1 ring-base overflow-hidden bg-surface-primary">
          {/* 좁은 화면(≤360/320)에서 고정폭 컬럼 합이 화면을 넘으면 가로 스크롤 (클립 대신) */}
          <div className="overflow-x-auto scrollbar-none">
            <div className="min-w-[340px]">
              <CompactHeader type={activeTab as 'trades' | 'dividends' | 'interests'} />
              <div className="max-h-[60vh] overflow-y-auto scrollbar-none">
                {activeTab === 'trades' && filteredTrades.map(t => (
                  <CompactTradeRow key={t.id} trade={t} onClick={() => setSelectedTrade(t)} />
                ))}
                {activeTab === 'dividends' && filteredDivs.map(d => (
                  <CompactDividendRow key={d.id} div={d} onClick={() => setSelectedDiv(d)} />
                ))}
                {activeTab === 'interests' && filteredInterests.map(r => (
                  <CompactInterestRow key={r.id} interest={r} onClick={() => setSelectedInterest(r)} />
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ═══ LIST VIEW (default) ═══ */
        activeTab === 'trades' ? (
          <div className="space-y-4">
            {groupedTrades.map(([date, dateTrades]) => {
              const dayProfit = dateTrades.reduce((s, t) => s + t.totalProfit, 0)
              return (
                <div key={date}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-micro font-bold text-sub flex items-center gap-1"><Calendar className="w-3 h-3" />{date}</span>
                    <span className="text-micro font-bold tabular-nums" style={{ color: dayProfit >= 0 ? 'var(--value-positive)' : 'var(--value-negative)' }}>{formatChange(dayProfit)}</span>
                  </div>
                  <div className="space-y-2">
                    {dateTrades.map(t => <TradeCard key={t.id} trade={t} memberName={t.memberId != null ? memberMap.get(t.memberId) : undefined} onClick={() => setSelectedTrade(t)} />)}
                  </div>
                </div>
              )
            })}
          </div>
        ) : activeTab === 'dividends' ? (
          <div className="space-y-4">
            {groupedDivs.map(([date, dateDivs]) => {
              const dayTotal = dateDivs.reduce((s, d) => s + d.dividendAmount - d.tax, 0)
              return (
                <div key={date}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-micro font-bold text-sub flex items-center gap-1"><Calendar className="w-3 h-3" />{date}</span>
                    <span className="text-micro font-bold tabular-nums" style={{ color: 'var(--value-positive)' }}>+{formatKoreanUnit(dayTotal)}원</span>
                  </div>
                  <div className="space-y-2">
                    {dateDivs.map(d => <DividendCard key={d.id} div={d} memberName={d.memberId != null ? memberMap.get(d.memberId) : undefined} onClick={() => setSelectedDiv(d)} />)}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="space-y-4">
            {groupedInterests.map(([date, dateInterests]) => {
              const dayTotal = dateInterests.reduce((s, r) => s + r.interestAmount - r.tax, 0)
              return (
                <div key={date}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-micro font-bold text-sub flex items-center gap-1"><Calendar className="w-3 h-3" />{date}</span>
                    <span className="text-micro font-bold tabular-nums" style={{ color: 'var(--value-positive)' }}>+{formatKoreanUnit(dayTotal)}원</span>
                  </div>
                  <div className="space-y-2">
                    {dateInterests.map(r => <InterestCard key={r.id} interest={r} memberName={r.memberId != null ? memberMap.get(r.memberId) : undefined} onClick={() => setSelectedInterest(r)} />)}
                  </div>
                </div>
              )
            })}
          </div>
        )
      ))}

      {/* Detail Sheets */}
      {selectedTrade && <TradeDetailSheet trade={selectedTrade} memberName={selectedTrade.memberId != null ? memberMap.get(selectedTrade.memberId) : undefined} onClose={() => setSelectedTrade(null)} onDelete={handleDeleteTrade} onEdit={openEditTrade} />}
      {selectedDiv && <DividendDetailSheet div={selectedDiv} memberName={selectedDiv.memberId != null ? memberMap.get(selectedDiv.memberId) : undefined} onClose={() => setSelectedDiv(null)} onDelete={handleDeleteDiv} onEdit={openEditDiv} />}
      {selectedInterest && <InterestDetailSheet interest={selectedInterest} memberName={selectedInterest.memberId != null ? memberMap.get(selectedInterest.memberId) : undefined} onClose={() => setSelectedInterest(null)} onDelete={handleDeleteInterest} onEdit={openEditInterest} />}

      {/* Reset Confirm Dialog */}
      {showResetConfirm && (
        <AnimatePresence>
          <motion.div key="reset-ov" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[var(--z-overlay)] scrim"
            onClick={() => setShowResetConfirm(false)} />
          <motion.div key="reset-dlg" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 360, damping: 30 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[calc(var(--z-overlay)+1)] w-[calc(100%-2rem)] max-w-sm rounded-3xl bg-surface-primary ring-1 ring-[color:var(--border-default)] p-6 text-center"
            onClick={e => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center"
              style={{ backgroundColor: 'var(--status-danger-bg)' }}>
              <RotateCcw className="w-6 h-6" style={{ color: 'var(--status-danger-text)' }} />
            </div>
            <h3 className="text-body3-semi text-heading mb-1">
              {activeTab === 'trades' ? '판매수익' : activeTab === 'dividends' ? '배당금' : '계좌이자'} 초기화
            </h3>
            <p className="text-body3 text-sub mb-5">
              등록된 모든 {activeTab === 'trades' ? '판매수익' : activeTab === 'dividends' ? '배당금' : '계좌이자'} 데이터가 삭제됩니다.<br />이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setShowResetConfirm(false)}
                className="flex-1 h-11 rounded-2xl text-label3 font-bold text-body ring-1 ring-[color:var(--border-strong)] bg-surface-primary hover:bg-[var(--hover-bg)] transition-all">
                취소
              </button>
              <button onClick={handleReset}
                className="flex-1 h-11 rounded-2xl text-label3 font-bold text-white transition-all"
                style={{ backgroundColor: 'var(--status-danger-text)' }}>
                초기화
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      )}

      {/* Import Modal */}
      <PasteImportModal isOpen={showImport} onClose={() => setShowImport(false)}
        onImportTrades={handleImportTrades} onImportDividends={handleImportDividends} onImportInterests={handleImportInterests} members={membersList} />

      {/* Form Sheet (New / Edit) */}
      <InvestmentFormSheet isOpen={showForm} onClose={closeForm} formType={formType}
        editTrade={editingTrade} editDividend={editingDiv} editInterest={editingInterest} />
    </div>
  )
}

export default InvestmentPage
