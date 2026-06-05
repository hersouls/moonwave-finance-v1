import { useMemo, useRef, useState, useEffect } from 'react'
import { clsx } from 'clsx'
import { Filter, X, Check, RefreshCw, Users, Tag } from 'lucide-react'
import type { TransactionCategory, Member } from '@/lib/types'
import { SegmentedControl } from '@/components/ui/CreateFormPrimitives'

export type CalendarTypeFilter = 'all' | 'income' | 'expense'

export interface CalendarFilters {
  type: CalendarTypeFilter
  memberIds: number[] // empty = all
  categoryIds: number[] // empty = all
  recurringOnly: boolean
}

export const DEFAULT_CALENDAR_FILTERS: CalendarFilters = {
  type: 'all',
  memberIds: [],
  categoryIds: [],
  recurringOnly: false,
}

interface CalendarFilterBarProps {
  filters: CalendarFilters
  members: Member[]
  categories: TransactionCategory[]
  onChange: (filters: CalendarFilters) => void
  className?: string
}

export function CalendarFilterBar({
  filters,
  members,
  categories,
  onChange,
  className,
}: CalendarFilterBarProps) {
  const [categoryOpen, setCategoryOpen] = useState(false)
  const categoryMenuRef = useRef<HTMLDivElement>(null)

  const activeCount = useMemo(() => {
    let n = 0
    if (filters.type !== 'all') n++
    if (filters.memberIds.length > 0) n++
    if (filters.categoryIds.length > 0) n++
    if (filters.recurringOnly) n++
    return n
  }, [filters])

  const filteredCategories = useMemo(() => {
    if (filters.type === 'all') return categories
    return categories.filter((c) => c.type === filters.type)
  }, [categories, filters.type])

  // Close category dropdown on outside click / Esc
  useEffect(() => {
    if (!categoryOpen) return
    const handlePointer = (e: MouseEvent) => {
      if (categoryMenuRef.current && !categoryMenuRef.current.contains(e.target as Node)) {
        setCategoryOpen(false)
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCategoryOpen(false)
    }
    document.addEventListener('mousedown', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [categoryOpen])

  const toggleMember = (id: number) => {
    const next = filters.memberIds.includes(id)
      ? filters.memberIds.filter((m) => m !== id)
      : [...filters.memberIds, id]
    onChange({ ...filters, memberIds: next })
  }

  const toggleCategory = (id: number) => {
    const next = filters.categoryIds.includes(id)
      ? filters.categoryIds.filter((c) => c !== id)
      : [...filters.categoryIds, id]
    onChange({ ...filters, categoryIds: next })
  }

  const reset = () => onChange(DEFAULT_CALENDAR_FILTERS)

  return (
    <div
      className={clsx(
        'flex flex-wrap items-center gap-2 rounded-xl bg-surface-primary px-2 py-2 ring-1 ring-[color:var(--border-subtle)]',
        className,
      )}
      role="toolbar"
      aria-label="캘린더 필터"
    >
      <span className="flex items-center gap-1 text-caption text-sub pl-1.5 shrink-0">
        <Filter className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">필터</span>
      </span>

      {/* Type segmented */}
      <SegmentedControl<CalendarTypeFilter>
        size="sm"
        layoutId="cal-filter-type"
        ariaLabel="거래 유형"
        value={filters.type}
        onChange={(type) => onChange({ ...filters, type, categoryIds: [] })}
        options={[
          { value: 'all', label: '전체' },
          { value: 'income', label: '수입' },
          { value: 'expense', label: '지출' },
        ]}
      />

      {/* Members */}
      {members.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          <Users className="w-3.5 h-3.5 text-sub hidden md:inline" />
          {members.map((m) => {
            const active = filters.memberIds.includes(m.id!)
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => toggleMember(m.id!)}
                aria-pressed={active}
                className={clsx(
                  'inline-flex items-center gap-1 px-2 py-1 rounded-full text-label3-medium transition-all',
                  'ring-1',
                  active
                    ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 ring-primary-400 dark:ring-primary-600'
                    : 'ring-[color:var(--border-subtle)] text-sub hover:text-heading hover:bg-[var(--hover-bg)]',
                )}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: m.color }} />
                {m.name}
              </button>
            )
          })}
        </div>
      )}

      {/* Category selector */}
      <div className="relative" ref={categoryMenuRef}>
        <button
          type="button"
          onClick={() => setCategoryOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={categoryOpen}
          className={clsx(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-label3-medium transition-all ring-1',
            filters.categoryIds.length > 0
              ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 ring-primary-400 dark:ring-primary-600'
              : 'ring-[color:var(--border-subtle)] text-sub hover:text-heading hover:bg-[var(--hover-bg)]',
          )}
        >
          <Tag className="w-3.5 h-3.5" />
          카테고리
          {filters.categoryIds.length > 0 && (
            <span className="tabular-nums text-label4 bg-primary-500 text-[color:var(--text-on-accent)] rounded-full px-1.5 leading-none">
              {filters.categoryIds.length}
            </span>
          )}
        </button>
        {categoryOpen && (
          <div
            className="absolute top-full left-0 mt-1 w-64 max-h-72 overflow-y-auto rounded-lg bg-surface-primary elevation-2 ring-1 ring-[color:var(--border-subtle)] z-20 p-1"
            role="listbox"
            aria-multiselectable="true"
          >
            {filteredCategories.length === 0 && (
              <p className="text-body3 text-sub p-3 text-center">카테고리가 없습니다</p>
            )}
            {filteredCategories.map((c) => {
              const active = filters.categoryIds.includes(c.id!)
              return (
                <button
                  key={c.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => toggleCategory(c.id!)}
                  className={clsx(
                    'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-body2 transition-colors',
                    active
                      ? 'bg-primary-50 dark:bg-primary-900/40 text-heading'
                      : 'hover:bg-[var(--hover-bg)] text-heading',
                  )}
                >
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                  <span className="flex-1 truncate">{c.name}</span>
                  <span
                    className={clsx(
                      'text-label4 px-1.5 rounded-full',
                      c.type === 'income'
                        ? 'text-status-success bg-status-success'
                        : 'text-status-danger bg-status-danger',
                    )}
                  >
                    {c.type === 'income' ? '수입' : '지출'}
                  </span>
                  {active && <Check className="w-3.5 h-3.5 text-primary-500" />}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Recurring toggle */}
      <button
        type="button"
        onClick={() => onChange({ ...filters, recurringOnly: !filters.recurringOnly })}
        aria-pressed={filters.recurringOnly}
        className={clsx(
          'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-label3-medium transition-all ring-1',
          filters.recurringOnly
            ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 ring-primary-400 dark:ring-primary-600'
            : 'ring-[color:var(--border-subtle)] text-sub hover:text-heading hover:bg-[var(--hover-bg)]',
        )}
      >
        <RefreshCw className="w-3.5 h-3.5" />
        반복만
      </button>

      {/* Reset */}
      {activeCount > 0 && (
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-label3-medium text-sub hover:text-heading hover:bg-[var(--hover-bg)] transition-colors ml-auto"
          aria-label="필터 초기화"
        >
          <X className="w-3 h-3" />
          초기화 ({activeCount})
        </button>
      )}
    </div>
  )
}

