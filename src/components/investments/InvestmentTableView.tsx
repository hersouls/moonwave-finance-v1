import { useMemo, useState, type ReactNode } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { clsx } from 'clsx'
import { formatKRW, formatChange, formatPercent } from '@/utils/format'
import { formatDate } from '@/lib/dateUtils'
import type { InvestmentTrade, Dividend, AccountInterest } from '@/lib/types'

type Tab = 'trades' | 'dividends' | 'interests'
type SortDir = 'asc' | 'desc'

interface Props {
  activeTab: Tab
  trades: InvestmentTrade[]
  dividends: Dividend[]
  interests: AccountInterest[]
  memberMap: Map<string, string>
  onSelectTrade: (t: InvestmentTrade) => void
  onSelectDiv: (d: Dividend) => void
  onSelectInterest: (r: AccountInterest) => void
}

const marketLabel = (m: string) => (m === 'overseas' ? '해외' : '국내')

function Shell({ children, count, footer }: { children: ReactNode; count: number; footer?: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl ring-1 ring-[color:var(--border-default)]">
      <div className="max-h-[68vh] overflow-auto">
        <table className="data-table">{children}</table>
      </div>
      <div className="flex items-center justify-between border-t border-base bg-surface-secondary px-3 py-2 text-caption text-sub">
        <span>{count}건</span>
        {footer}
      </div>
    </div>
  )
}

function useSort<T extends string>(initial: T, initialDir: SortDir = 'desc') {
  const [sortKey, setSortKey] = useState<T>(initial)
  const [sortDir, setSortDir] = useState<SortDir>(initialDir)
  const toggle = (k: T, ascFirst = false) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir(ascFirst ? 'asc' : 'desc') }
  }
  return { sortKey, sortDir, toggle }
}

function HeaderButton({ label, active, dir, onClick }: { label: string; active: boolean; dir: SortDir; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 transition-colors hover:text-heading">
      {label}
      {active ? (dir === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />) : <ChevronsUpDown className="h-3.5 w-3.5 text-disabled" />}
    </button>
  )
}

const profitClass = (v: number) => (v >= 0 ? 'text-value-positive' : 'text-value-negative')

/** Desktop financial-expert table for investments (trades / dividends / interests). */
export function InvestmentTableView({ activeTab, trades, dividends, interests, memberMap, onSelectTrade, onSelectDiv, onSelectInterest }: Props) {
  if (activeTab === 'trades') {
    return <TradesTable rows={trades} memberMap={memberMap} onSelect={onSelectTrade} />
  }
  if (activeTab === 'dividends') {
    return <DividendsTable rows={dividends} memberMap={memberMap} onSelect={onSelectDiv} />
  }
  return <InterestsTable rows={interests} memberMap={memberMap} onSelect={onSelectInterest} />
}

// ─── Trades ───────────────────────────────────────────
function TradesTable({ rows, memberMap, onSelect }: { rows: InvestmentTrade[]; memberMap: Map<string, string>; onSelect: (t: InvestmentTrade) => void }) {
  const { sortKey, sortDir, toggle } = useSort<'date' | 'name' | 'profit' | 'rate' | 'sell'>('date')
  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      switch (sortKey) {
        case 'name': return (a.stockName || '').localeCompare(b.stockName || '', 'ko') * dir
        case 'profit': return (a.totalProfit - b.totalProfit) * dir
        case 'rate': return (a.profitRate - b.profitRate) * dir
        case 'sell': return (a.totalSellAmount - b.totalSellAmount) * dir
        default: return a.sellDate.localeCompare(b.sellDate) * dir
      }
    })
  }, [rows, sortKey, sortDir])
  const totalProfit = sorted.reduce((s, t) => s + t.totalProfit, 0)
  return (
    <Shell count={sorted.length} footer={<span className={clsx('tabular-nums font-semibold', profitClass(totalProfit))}>총 손익 {formatChange(totalProfit)}</span>}>
      <thead>
        <tr>
          <th><HeaderButton label="종목" active={sortKey === 'name'} dir={sortDir} onClick={() => toggle('name', true)} /></th>
          <th>시장</th>
          <th><HeaderButton label="매도일" active={sortKey === 'date'} dir={sortDir} onClick={() => toggle('date', true)} /></th>
          <th className="text-right"><HeaderButton label="매도금액" active={sortKey === 'sell'} dir={sortDir} onClick={() => toggle('sell')} /></th>
          <th className="text-right"><HeaderButton label="손익" active={sortKey === 'profit'} dir={sortDir} onClick={() => toggle('profit')} /></th>
          <th className="text-right"><HeaderButton label="수익률" active={sortKey === 'rate'} dir={sortDir} onClick={() => toggle('rate')} /></th>
          <th>구성원</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((t) => (
          <tr key={t.id} onClick={() => onSelect(t)} className="cursor-pointer">
            <td className="font-medium text-heading">{t.stockName}</td>
            <td className="text-sub">{marketLabel(t.market)}</td>
            <td className="whitespace-nowrap tabular-nums text-sub">{formatDate(t.sellDate)}</td>
            <td className="text-right tabular-nums text-sub">{formatKRW(t.totalSellAmount)}</td>
            <td className={clsx('text-right font-semibold tabular-nums', profitClass(t.totalProfit))}>{formatChange(t.totalProfit)}</td>
            <td className={clsx('text-right font-semibold tabular-nums', profitClass(t.profitRate))}>{t.profitRate >= 0 ? '+' : ''}{formatPercent(t.profitRate, 2)}</td>
            <td>{t.memberId != null && memberMap.get(t.memberId) ? <span className="text-sub">{memberMap.get(t.memberId)}</span> : <span className="text-disabled">—</span>}</td>
          </tr>
        ))}
      </tbody>
    </Shell>
  )
}

// ─── Dividends ────────────────────────────────────────
function DividendsTable({ rows, memberMap, onSelect }: { rows: Dividend[]; memberMap: Map<string, string>; onSelect: (d: Dividend) => void }) {
  const { sortKey, sortDir, toggle } = useSort<'date' | 'name' | 'amount'>('date')
  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      switch (sortKey) {
        case 'name': return (a.stockName || '').localeCompare(b.stockName || '', 'ko') * dir
        case 'amount': return (a.dividendAmount - b.dividendAmount) * dir
        default: return a.paymentDate.localeCompare(b.paymentDate) * dir
      }
    })
  }, [rows, sortKey, sortDir])
  const net = sorted.reduce((s, d) => s + (d.dividendAmount - d.tax), 0)
  return (
    <Shell count={sorted.length} footer={<span className="tabular-nums font-semibold text-value-positive">실수령 {formatKRW(net)}</span>}>
      <thead>
        <tr>
          <th><HeaderButton label="종목" active={sortKey === 'name'} dir={sortDir} onClick={() => toggle('name', true)} /></th>
          <th>시장</th>
          <th><HeaderButton label="지급일" active={sortKey === 'date'} dir={sortDir} onClick={() => toggle('date', true)} /></th>
          <th className="text-right"><HeaderButton label="배당금" active={sortKey === 'amount'} dir={sortDir} onClick={() => toggle('amount')} /></th>
          <th className="text-right">세금</th>
          <th className="text-right">실수령</th>
          <th>구성원</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((d) => (
          <tr key={d.id} onClick={() => onSelect(d)} className="cursor-pointer">
            <td className="font-medium text-heading">{d.stockName}</td>
            <td className="text-sub">{marketLabel(d.market)}</td>
            <td className="whitespace-nowrap tabular-nums text-sub">{formatDate(d.paymentDate)}</td>
            <td className="text-right font-semibold tabular-nums text-value-positive">{formatKRW(d.dividendAmount)}</td>
            <td className="text-right tabular-nums text-sub">{formatKRW(d.tax)}</td>
            <td className="text-right tabular-nums text-heading">{formatKRW(d.dividendAmount - d.tax)}</td>
            <td>{d.memberId != null && memberMap.get(d.memberId) ? <span className="text-sub">{memberMap.get(d.memberId)}</span> : <span className="text-disabled">—</span>}</td>
          </tr>
        ))}
      </tbody>
    </Shell>
  )
}

// ─── Interests ────────────────────────────────────────
function InterestsTable({ rows, memberMap, onSelect }: { rows: AccountInterest[]; memberMap: Map<string, string>; onSelect: (r: AccountInterest) => void }) {
  const { sortKey, sortDir, toggle } = useSort<'date' | 'amount'>('date')
  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => (sortKey === 'amount' ? (a.interestAmount - b.interestAmount) : a.depositDate.localeCompare(b.depositDate)) * dir)
  }, [rows, sortKey, sortDir])
  const net = sorted.reduce((s, r) => s + (r.interestAmount - r.tax), 0)
  return (
    <Shell count={sorted.length} footer={<span className="tabular-nums font-semibold text-value-positive">실수령 {formatKRW(net)}</span>}>
      <thead>
        <tr>
          <th>종류</th>
          <th>통화</th>
          <th><HeaderButton label="입금일" active={sortKey === 'date'} dir={sortDir} onClick={() => toggle('date', true)} /></th>
          <th className="text-right"><HeaderButton label="이자" active={sortKey === 'amount'} dir={sortDir} onClick={() => toggle('amount')} /></th>
          <th className="text-right">세금</th>
          <th className="text-right">실수령</th>
          <th>구성원</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((r) => (
          <tr key={r.id} onClick={() => onSelect(r)} className="cursor-pointer">
            <td className="font-medium text-heading">{r.interestType}</td>
            <td className="text-sub">{r.currency}</td>
            <td className="whitespace-nowrap tabular-nums text-sub">{formatDate(r.depositDate)}</td>
            <td className="text-right font-semibold tabular-nums text-value-positive">{formatKRW(r.interestAmount)}</td>
            <td className="text-right tabular-nums text-sub">{formatKRW(r.tax)}</td>
            <td className="text-right tabular-nums text-heading">{formatKRW(r.interestAmount - r.tax)}</td>
            <td>{r.memberId != null && memberMap.get(r.memberId) ? <span className="text-sub">{memberMap.get(r.memberId)}</span> : <span className="text-disabled">—</span>}</td>
          </tr>
        ))}
      </tbody>
    </Shell>
  )
}
