import { useState } from 'react'
import { Search, Filter, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react'
import { Tabs } from '@/components/ui/Tabs'
import { PAYMENT_METHOD_OPTIONS } from '@/utils/paymentMethod'
import { clsx } from 'clsx'
import type { TransactionType, PaymentMethod, Member, TransactionCategory } from '@/lib/types'

interface TransactionFiltersProps {
  activeType: TransactionType | 'all'
  onTypeChange: (type: TransactionType | 'all') => void
  searchQuery?: string
  onSearchChange?: (query: string) => void
  members?: Member[]
  categories?: TransactionCategory[]
  memberFilter?: number | null
  onMemberChange?: (id: number | null) => void
  paymentMethodFilter?: PaymentMethod | null
  onPaymentMethodChange?: (pm: PaymentMethod | null) => void
  minAmount?: number | null
  maxAmount?: number | null
  onAmountRangeChange?: (min: number | null, max: number | null) => void
  activeFilterCount?: number
  onReset?: () => void
}

const typeTabs = [
  { id: 'all', label: '전체' },
  { id: 'expense', label: '지출' },
  { id: 'income', label: '수입' },
]

export function TransactionFilters({
  activeType, onTypeChange, searchQuery, onSearchChange,
  members, memberFilter, onMemberChange,
  paymentMethodFilter, onPaymentMethodChange,
  minAmount, maxAmount, onAmountRangeChange,
  activeFilterCount = 0, onReset,
}: TransactionFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const hasAdvanced = onMemberChange || onPaymentMethodChange || onAmountRangeChange

  return (
    <div className="space-y-3">
      {onSearchChange && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-disabled" />
          <input
            type="text"
            value={searchQuery || ''}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="거래 메모 검색..."
            className="input-base !pl-9"
          />
        </div>
      )}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <Tabs
            tabs={typeTabs}
            activeTab={activeType}
            onChange={(id) => onTypeChange(id as TransactionType | 'all')}
          />
        </div>
        {hasAdvanced && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-2 rounded-lg text-caption transition-colors',
              isExpanded || activeFilterCount > 0
                ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                : 'bg-surface-tertiary text-sub hover:bg-[var(--hover-bg)]'
            )}
          >
            <Filter className="w-3.5 h-3.5" />
            필터
            {activeFilterCount > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-primary-500 text-white text-[10px] font-bold leading-none">
                {activeFilterCount}
              </span>
            )}
            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}
      </div>

      {/* Advanced Filters Panel */}
      {isExpanded && hasAdvanced && (
        <div className="card-base space-y-4 bg-surface-secondary">
          {/* Member filter */}
          {onMemberChange && members && members.length > 0 && (
            <div>
              <label className="block text-caption text-sub mb-2">구성원</label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => onMemberChange(null)}
                  className={clsx(
                    'px-3 py-1.5 rounded-lg text-caption transition-colors',
                    memberFilter === null
                      ? 'bg-primary-500 text-white'
                      : 'bg-[var(--surface-tertiary)] text-sub hover:bg-[var(--hover-bg)]'
                  )}
                >
                  전체
                </button>
                {members.map(m => (
                  <button
                    key={m.id}
                    onClick={() => onMemberChange(memberFilter === m.id ? null : m.id!)}
                    className={clsx(
                      'px-3 py-1.5 rounded-lg text-caption transition-colors',
                      memberFilter === m.id
                        ? 'bg-primary-500 text-white'
                        : 'bg-[var(--surface-tertiary)] text-sub hover:bg-[var(--hover-bg)]'
                    )}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Payment method filter */}
          {onPaymentMethodChange && (
            <div>
              <label className="block text-caption text-sub mb-2">거래수단</label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => onPaymentMethodChange(null)}
                  className={clsx(
                    'px-3 py-1.5 rounded-lg text-caption transition-colors',
                    paymentMethodFilter === null
                      ? 'bg-primary-500 text-white'
                      : 'bg-[var(--surface-tertiary)] text-sub hover:bg-[var(--hover-bg)]'
                  )}
                >
                  전체
                </button>
                {PAYMENT_METHOD_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => onPaymentMethodChange(paymentMethodFilter === opt.value ? null : opt.value)}
                    className={clsx(
                      'px-3 py-1.5 rounded-lg text-caption transition-colors',
                      paymentMethodFilter === opt.value
                        ? 'bg-primary-500 text-white'
                        : 'bg-[var(--surface-tertiary)] text-sub hover:bg-[var(--hover-bg)]'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Amount range */}
          {onAmountRangeChange && (
            <div>
              <label className="block text-caption text-sub mb-2">금액 범위</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={minAmount ?? ''}
                  onChange={(e) => onAmountRangeChange(e.target.value ? Number(e.target.value) : null, maxAmount ?? null)}
                  placeholder="최소"
                  className="input-base flex-1 text-caption"
                />
                <span className="text-caption text-disabled">~</span>
                <input
                  type="number"
                  value={maxAmount ?? ''}
                  onChange={(e) => onAmountRangeChange(minAmount ?? null, e.target.value ? Number(e.target.value) : null)}
                  placeholder="최대"
                  className="input-base flex-1 text-caption"
                />
                <span className="text-caption text-disabled">원</span>
              </div>
            </div>
          )}

          {/* Reset button */}
          {onReset && activeFilterCount > 0 && (
            <button
              onClick={onReset}
              className="flex items-center gap-1.5 text-caption text-status-danger hover:text-red-600 dark:hover:text-red-300 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              필터 초기화
            </button>
          )}
        </div>
      )}
    </div>
  )
}
