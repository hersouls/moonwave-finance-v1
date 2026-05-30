import { useMemo, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { clsx } from 'clsx'
import { RefreshCw } from 'lucide-react'
import { formatKoreanUnit } from '@/utils/format'
import { getCategoryColor, getCategoryName, type DaySummary } from '@/lib/calendarUtils'
import { getCalendarFallbackColors } from '@/lib/chartConfig'
import type { Transaction, TransactionCategory } from '@/lib/types'

interface DayPreviewPopoverProps {
  dateStr: string
  anchorRect: DOMRect
  summary: DaySummary
  transactions: Transaction[]
  categories: TransactionCategory[]
}

export function DayPreviewPopover({
  dateStr,
  anchorRect,
  summary,
  transactions,
  categories,
}: DayPreviewPopoverProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  const { top, left, placement } = useMemo(() => {
    const POPOVER_WIDTH = 300
    const POPOVER_HEIGHT = 260
    const GAP = 8
    const viewportW = window.innerWidth
    const viewportH = window.innerHeight

    // Default: right of the cell
    let left = anchorRect.right + GAP
    let placement: 'right' | 'left' | 'bottom' = 'right'
    if (left + POPOVER_WIDTH > viewportW - 8) {
      left = anchorRect.left - GAP - POPOVER_WIDTH
      placement = 'left'
      if (left < 8) {
        left = Math.max(8, Math.min(anchorRect.left, viewportW - POPOVER_WIDTH - 8))
        placement = 'bottom'
      }
    }

    let top = placement === 'bottom' ? anchorRect.bottom + GAP : anchorRect.top
    if (top + POPOVER_HEIGHT > viewportH - 8) {
      top = Math.max(8, viewportH - POPOVER_HEIGHT - 8)
    }
    return { top, left, placement }
  }, [anchorRect])

  const dayTxns = useMemo(
    () => transactions.filter((t) => t.date === dateStr).slice(0, 5),
    [transactions, dateStr],
  )
  const hiddenCount = Math.max(
    0,
    transactions.filter((t) => t.date === dateStr).length - dayTxns.length,
  )

  if (!mounted || typeof document === 'undefined') return null

  const calFallback = getCalendarFallbackColors()
  const dateObj = new Date(dateStr)
  const labelDate = `${dateObj.getMonth() + 1}월 ${dateObj.getDate()}일`

  return createPortal(
    <div
      role="tooltip"
      className={clsx(
        'fixed z-50 w-[300px] rounded-xl bg-surface-primary elevation-3 ring-1 ring-[color:var(--border-subtle)] p-3',
        'pointer-events-none',
        'animate-in fade-in-0 zoom-in-95 duration-150',
      )}
      style={{ top, left }}
      data-placement={placement}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <p className="text-body3-semi text-heading">{labelDate}</p>
          {summary.hasRecurring && (
            <RefreshCw className="w-3.5 h-3.5 text-primary-500" aria-hidden />
          )}
        </div>
        <span className="text-caption text-sub tabular-nums">
          {summary.count}건
        </span>
      </div>

      {/* Totals strip */}
      <div className="grid grid-cols-3 gap-1 mb-2 rounded-lg bg-[var(--surface-tertiary)]/70 p-2">
        <Stat label="수입" value={summary.income} tone="success" />
        <Stat label="지출" value={summary.expense} tone="danger" />
        <Stat label="순" value={summary.net} tone={summary.net >= 0 ? 'success' : 'danger'} signed />
      </div>

      {/* Top categories for the day */}
      {summary.expense > 0 && summary.expenseCategories.length > 0 && (
        <div className="mb-2">
          <p className="text-label4 text-sub uppercase tracking-wide mb-1">지출 카테고리</p>
          <div className="space-y-1">
            {summary.expenseCategories.slice(0, 3).map((c, i) => {
              const color = getCategoryColor(c.categoryId, categories, calFallback.expense)
              const name = getCategoryName(c.categoryId, categories)
              const pct = summary.expense > 0 ? (c.amount / summary.expense) * 100 : 0
              return (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="flex-1 truncate text-heading">{name}</span>
                  <div className="w-10 h-1 rounded-full bg-[var(--surface-tertiary)] overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, backgroundColor: color }}
                    />
                  </div>
                  <span className="tabular-nums text-sub w-16 text-right">
                    {formatKoreanUnit(c.amount)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Transactions preview */}
      {dayTxns.length > 0 && (
        <div className="pt-2 border-t border-[var(--border-subtle)]">
          <p className="text-label4 text-sub uppercase tracking-wide mb-1">최근 거래</p>
          <div className="space-y-0.5">
            {dayTxns.map((t) => {
              const isIncome = t.type === 'income'
              return (
                <div key={t.id} className="flex items-center gap-2 text-xs">
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{
                      backgroundColor: getCategoryColor(
                        t.categoryId,
                        categories,
                        isIncome ? calFallback.income : calFallback.expense,
                      ),
                    }}
                  />
                  <span className="flex-1 truncate text-heading">
                    {t.memo || getCategoryName(t.categoryId, categories)}
                  </span>
                  <span
                    className={clsx(
                      'tabular-nums',
                      isIncome ? 'text-status-success' : 'text-status-danger',
                    )}
                  >
                    {isIncome ? '+' : '-'}
                    {formatKoreanUnit(t.amount)}
                  </span>
                </div>
              )
            })}
            {hiddenCount > 0 && (
              <p className="text-label4 text-sub text-center pt-1">
                외 {hiddenCount}건 더보기
              </p>
            )}
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}

interface StatProps {
  label: string
  value: number
  tone: 'success' | 'danger'
  signed?: boolean
}
function Stat({ label, value, tone, signed }: StatProps) {
  const toneClass = tone === 'success' ? 'text-status-success' : 'text-status-danger'
  const prefix = signed && value > 0 ? '+' : ''
  return (
    <div className="text-center">
      <p className="text-label4 text-sub">{label}</p>
      <p className={clsx('text-xs font-semibold tabular-nums', toneClass)}>
        {value === 0 ? '—' : `${prefix}${formatKoreanUnit(value)}`}
      </p>
    </div>
  )
}
