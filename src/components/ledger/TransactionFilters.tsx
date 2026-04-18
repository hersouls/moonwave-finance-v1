import { useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion'
import {
  Search, SlidersHorizontal, RotateCcw, X, Check,
  Users, Wallet, Coins, Tag, ArrowUpDown, CalendarRange,
  CreditCard, Banknote, Landmark, Receipt, MoreHorizontal,
} from 'lucide-react'
import { clsx } from 'clsx'
import { PAYMENT_METHOD_OPTIONS, getPaymentMethodLabel } from '@/utils/paymentMethod'
import { getCategoryIcon } from '@/utils/categoryIcons'
import { formatKoreanUnit } from '@/utils/format'
import { springSnappy, easeOutExpo, durations } from '@/lib/motionConfig'
import type { TransactionType, PaymentMethod, Member, TransactionCategory } from '@/lib/types'
import type { TransactionSortBy, TransactionDateRange } from '@/hooks/useTransactionFilters'

// ─── Config ─────────────────────────────────────────

interface TypeTab {
  id: TransactionType | 'all'
  label: string
  dotClass?: string
}

const TYPE_TABS: TypeTab[] = [
  { id: 'all', label: '전체' },
  { id: 'expense', label: '지출', dotClass: 'bg-status-danger' },
  { id: 'income', label: '수입', dotClass: 'bg-status-success' },
]

const AMOUNT_PRESETS: { label: string; min: number | null; max: number | null }[] = [
  { label: '~1만', min: null, max: 10_000 },
  { label: '1만~5만', min: 10_000, max: 50_000 },
  { label: '5만~10만', min: 50_000, max: 100_000 },
  { label: '10만~50만', min: 100_000, max: 500_000 },
  { label: '50만+', min: 500_000, max: null },
]

const SORT_OPTIONS: { value: TransactionSortBy; label: string; ariaLabel: string }[] = [
  { value: 'date-desc', label: '최신순', ariaLabel: '최신순' },
  { value: 'date-asc', label: '오래된순', ariaLabel: '오래된순' },
  { value: 'amount-desc', label: '금액↓', ariaLabel: '금액 높은순' },
  { value: 'amount-asc', label: '금액↑', ariaLabel: '금액 낮은순' },
]

const DATE_RANGE_OPTIONS: { value: TransactionDateRange; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: '7d', label: '7일' },
  { value: '30d', label: '30일' },
  { value: '90d', label: '90일' },
]

const PAYMENT_METHOD_ICONS: Record<PaymentMethod, typeof Banknote> = {
  cash: Banknote,
  credit_card: CreditCard,
  debit_card: CreditCard,
  bank_transfer: Landmark,
  loan: Receipt,
  other: MoreHorizontal,
}

// ─── Props ──────────────────────────────────────────

interface TransactionFiltersProps {
  activeType: TransactionType | 'all'
  onTypeChange: (type: TransactionType | 'all') => void
  typeCounts?: { all: number; income: number; expense: number }
  searchQuery?: string
  onSearchChange?: (query: string) => void
  members?: Member[]
  categories?: TransactionCategory[]
  memberFilter?: number | null
  onMemberChange?: (id: number | null) => void
  categoryFilter?: number | null
  onCategoryChange?: (id: number | null) => void
  paymentMethodFilter?: PaymentMethod | null
  onPaymentMethodChange?: (pm: PaymentMethod | null) => void
  minAmount?: number | null
  maxAmount?: number | null
  onAmountRangeChange?: (min: number | null, max: number | null) => void
  sortBy?: TransactionSortBy
  onSortByChange?: (v: TransactionSortBy) => void
  dateRange?: TransactionDateRange
  onDateRangeChange?: (v: TransactionDateRange) => void
  activeFilterCount?: number
  onReset?: () => void
}

// ─── Motion ─────────────────────────────────────────

const panelVariants: Variants = {
  hidden: { opacity: 0, height: 0, y: -4 },
  visible: {
    opacity: 1,
    height: 'auto',
    y: 0,
    transition: { duration: durations.base, ease: easeOutExpo },
  },
  exit: {
    opacity: 0,
    height: 0,
    y: -4,
    transition: { duration: durations.fast, ease: easeOutExpo },
  },
}

const pillVariants: Variants = {
  hidden: { opacity: 0, scale: 0.85, y: -2 },
  visible: { opacity: 1, scale: 1, y: 0, transition: springSnappy },
  exit: { opacity: 0, scale: 0.85, y: -2, transition: { duration: durations.fast } },
}

// ─── Component ──────────────────────────────────────

export function TransactionFilters(props: TransactionFiltersProps) {
  const {
    activeType, onTypeChange, typeCounts,
    searchQuery, onSearchChange,
    members, categories,
    memberFilter, onMemberChange,
    categoryFilter, onCategoryChange,
    paymentMethodFilter, onPaymentMethodChange,
    minAmount, maxAmount, onAmountRangeChange,
    sortBy = 'date-desc', onSortByChange,
    dateRange = 'all', onDateRangeChange,
    activeFilterCount = 0, onReset,
  } = props

  const [isExpanded, setIsExpanded] = useState(false)
  const shouldReduceMotion = useReducedMotion()

  const hasAdvanced = Boolean(
    onMemberChange || onCategoryChange || onPaymentMethodChange ||
    onAmountRangeChange || onSortByChange || onDateRangeChange
  )

  const currentCategories = useMemo(() => {
    if (!categories) return []
    if (activeType === 'all') return categories
    return categories.filter(c => c.type === activeType)
  }, [categories, activeType])

  const selectedMember = memberFilter != null ? members?.find(m => m.id === memberFilter) : null
  const selectedCategory = categoryFilter != null ? categories?.find(c => c.id === categoryFilter) : null
  const selectedSort = SORT_OPTIONS.find(s => s.value === sortBy)
  const hasAmountRange = minAmount !== null || maxAmount !== null

  return (
    <div className="space-y-3">
      {/* ─── Row 1: Search + Filter button ──────────── */}
      <div className="flex items-center gap-2">
        {onSearchChange && (
          <div
            className={clsx(
              'relative flex-1 min-w-0 group',
              'rounded-2xl bg-surface-primary ring-1 ring-base transition-all',
              'shadow-[0_1px_3px_rgba(0,0,0,0.04)]',
              'focus-within:ring-[color:var(--color-primary-400)]',
              'focus-within:shadow-[0_0_0_4px_color-mix(in_oklch,var(--color-primary-500)_18%,transparent)]',
            )}
          >
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-disabled group-focus-within:text-[color:var(--color-primary-500)] transition-colors" />
            <input
              type="text"
              value={searchQuery || ''}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="메모·카테고리 검색..."
              className="w-full h-11 pl-10 pr-10 bg-transparent rounded-2xl text-body3 text-heading placeholder:text-disabled outline-none"
              aria-label="거래 검색"
            />
            <AnimatePresence>
              {searchQuery && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: durations.fast }}
                  type="button"
                  onClick={() => onSearchChange('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center text-sub hover:text-heading hover:bg-[var(--hover-bg)] transition-colors"
                  aria-label="검색어 지우기"
                >
                  <X className="w-3.5 h-3.5" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        )}

        {hasAdvanced && (
          <motion.button
            type="button"
            onClick={() => setIsExpanded(v => !v)}
            aria-expanded={isExpanded}
            aria-label="상세 필터 열기"
            className={clsx(
              'relative flex-shrink-0 h-11 px-3.5 rounded-2xl flex items-center gap-1.5 text-caption font-semibold transition-all ring-1',
              isExpanded || activeFilterCount > 0
                ? 'bg-[color:var(--color-primary-500)] text-white ring-transparent shadow-[0_4px_16px_color-mix(in_oklch,var(--color-primary-500)_28%,transparent)]'
                : 'bg-surface-primary text-body ring-base hover:ring-[color:var(--color-primary-300)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_14px_rgba(0,0,0,0.06)]'
            )}
            whileHover={shouldReduceMotion ? undefined : { y: -1 }}
            whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
            transition={springSnappy}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="hidden sm:inline">필터</span>
            {activeFilterCount > 0 && (
              <motion.span
                key={activeFilterCount}
                initial={{ scale: 0, rotate: -90 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={springSnappy}
                className="min-w-[18px] h-[18px] px-1 rounded-full bg-white/95 text-[10px] font-bold leading-none flex items-center justify-center"
                style={{ color: 'var(--color-primary-700)' }}
              >
                {activeFilterCount}
              </motion.span>
            )}
          </motion.button>
        )}
      </div>

      {/* ─── Row 2: Type segment (premium pill) ──────── */}
      <div
        role="tablist"
        aria-label="거래 타입"
        className="relative flex items-center p-1 rounded-2xl bg-surface-tertiary ring-1 ring-base shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
      >
        {TYPE_TABS.map(tab => {
          const isActive = activeType === tab.id
          const count = typeCounts
            ? (tab.id === 'all' ? typeCounts.all : tab.id === 'income' ? typeCounts.income : typeCounts.expense)
            : null
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => onTypeChange(tab.id)}
              className={clsx(
                'relative flex-1 h-10 rounded-xl flex items-center justify-center gap-1.5 text-caption font-semibold transition-colors z-[1]',
                isActive ? 'text-heading' : 'text-sub hover:text-body'
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="tx-type-indicator"
                  className="absolute inset-0 rounded-xl bg-surface-primary shadow-[0_2px_8px_rgba(0,0,0,0.08)]"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  aria-hidden="true"
                />
              )}
              <span className="relative z-[2] flex items-center gap-1.5">
                {tab.dotClass && (
                  <span className={clsx('w-1.5 h-1.5 rounded-full', tab.dotClass)} aria-hidden />
                )}
                {tab.label}
                {count !== null && (
                  <span
                    className={clsx(
                      'min-w-[20px] px-1.5 h-[18px] rounded-full text-[10px] font-bold tabular-nums flex items-center justify-center leading-none',
                      isActive
                        ? 'bg-[color:var(--color-primary-100)] text-[color:var(--color-primary-700)] dark:bg-[color:var(--color-primary-900)]/40 dark:text-[color:var(--color-primary-300)]'
                        : 'bg-surface-tertiary text-sub'
                    )}
                  >
                    {count}
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>

      {/* ─── Row 3: Active filter pills (sticky summary) */}
      <AnimatePresence initial={false}>
        {activeFilterCount > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: durations.fast, ease: easeOutExpo }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-none -mx-1 px-1 pb-1">
              <AnimatePresence initial={false} mode="popLayout">
                {selectedCategory && onCategoryChange && (
                  <ActivePill
                    key="cat"
                    icon={Tag}
                    label={selectedCategory.name}
                    color={selectedCategory.color}
                    onRemove={() => onCategoryChange(null)}
                  />
                )}
                {selectedMember && onMemberChange && (
                  <ActivePill
                    key="mem"
                    icon={Users}
                    label={selectedMember.name}
                    onRemove={() => onMemberChange(null)}
                  />
                )}
                {paymentMethodFilter && onPaymentMethodChange && (
                  <ActivePill
                    key="pm"
                    icon={PAYMENT_METHOD_ICONS[paymentMethodFilter] || Wallet}
                    label={getPaymentMethodLabel(paymentMethodFilter)}
                    onRemove={() => onPaymentMethodChange(null)}
                  />
                )}
                {hasAmountRange && onAmountRangeChange && (
                  <ActivePill
                    key="amt"
                    icon={Coins}
                    label={formatAmountRange(minAmount, maxAmount)}
                    onRemove={() => onAmountRangeChange(null, null)}
                  />
                )}
                {dateRange !== 'all' && onDateRangeChange && (
                  <ActivePill
                    key="dr"
                    icon={CalendarRange}
                    label={DATE_RANGE_OPTIONS.find(d => d.value === dateRange)?.label || '기간'}
                    onRemove={() => onDateRangeChange('all')}
                  />
                )}
                {onReset && activeFilterCount > 1 && (
                  <motion.button
                    key="reset"
                    variants={pillVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    layout
                    type="button"
                    onClick={onReset}
                    className="flex-shrink-0 flex items-center gap-1 px-3 h-7 rounded-full text-[11px] font-semibold text-status-danger hover:bg-status-danger-soft transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    전체 초기화
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Row 4: Expanded panel (KT-style high-end) */}
      <AnimatePresence initial={false}>
        {isExpanded && hasAdvanced && (
          <motion.div
            key="filter-panel"
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="overflow-hidden"
          >
            <div
              className={clsx(
                'rounded-2xl p-4 sm:p-5 space-y-5',
                'bg-surface-primary ring-1 ring-base',
                'shadow-[0_1px_3px_rgba(0,0,0,0.04)]',
              )}
            >
              {/* Sort + Date range row */}
              {(onSortByChange || onDateRangeChange) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {onSortByChange && (
                    <Section icon={ArrowUpDown} label="정렬">
                      <SegmentedChips
                        options={SORT_OPTIONS.map(o => ({ value: o.value, label: o.label, ariaLabel: o.ariaLabel }))}
                        value={sortBy}
                        onChange={(v) => onSortByChange(v as TransactionSortBy)}
                      />
                    </Section>
                  )}
                  {onDateRangeChange && (
                    <Section icon={CalendarRange} label="기간">
                      <SegmentedChips
                        options={DATE_RANGE_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
                        value={dateRange}
                        onChange={(v) => onDateRangeChange(v as TransactionDateRange)}
                      />
                    </Section>
                  )}
                </div>
              )}

              {/* Category filter */}
              {onCategoryChange && currentCategories.length > 0 && (
                <Section icon={Tag} label="카테고리" trailing={selectedSort ? null : null}>
                  <ChipScroller>
                    <AllChip
                      active={categoryFilter === null}
                      onClick={() => onCategoryChange(null)}
                    />
                    {currentCategories.map(c => {
                      const Icon = getCategoryIcon(c.icon)
                      const isActive = categoryFilter === c.id
                      return (
                        <motion.button
                          key={c.id}
                          type="button"
                          onClick={() => onCategoryChange(isActive ? null : c.id!)}
                          className={clsx(
                            'flex-shrink-0 flex items-center gap-2 pl-2.5 pr-3.5 h-9 rounded-2xl text-caption font-semibold transition-all',
                            isActive
                              ? 'text-white shadow-[0_4px_12px_rgba(0,0,0,0.12)]'
                              : 'bg-surface-primary text-body ring-1 ring-base hover:ring-[color:var(--color-primary-300)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_14px_rgba(0,0,0,0.06)]'
                          )}
                          style={isActive ? { backgroundColor: c.color } : undefined}
                          whileHover={shouldReduceMotion ? undefined : { y: -1 }}
                          whileTap={shouldReduceMotion ? undefined : { scale: 0.96 }}
                          transition={springSnappy}
                          aria-pressed={isActive}
                        >
                          <span
                            className="w-6 h-6 rounded-lg flex items-center justify-center"
                            style={{
                              backgroundColor: isActive ? 'rgba(255,255,255,0.22)' : `${c.color}1a`,
                            }}
                          >
                            <Icon
                              className="w-3.5 h-3.5"
                              style={{ color: isActive ? '#fff' : c.color }}
                            />
                          </span>
                          {c.name}
                        </motion.button>
                      )
                    })}
                  </ChipScroller>
                </Section>
              )}

              {/* Member filter */}
              {onMemberChange && members && members.length > 0 && (
                <Section icon={Users} label="구성원">
                  <ChipScroller>
                    <AllChip
                      active={memberFilter === null}
                      onClick={() => onMemberChange(null)}
                    />
                    {members.map(m => {
                      const isActive = memberFilter === m.id
                      const initial = m.name?.slice(0, 1) || '?'
                      return (
                        <motion.button
                          key={m.id}
                          type="button"
                          onClick={() => onMemberChange(isActive ? null : m.id!)}
                          className={clsx(
                            'flex-shrink-0 flex items-center gap-2 pl-1.5 pr-3.5 h-9 rounded-2xl text-caption font-semibold transition-all',
                            isActive
                              ? 'bg-[color:var(--color-primary-500)] text-white shadow-[0_4px_12px_color-mix(in_oklch,var(--color-primary-500)_28%,transparent)]'
                              : 'bg-surface-primary text-body ring-1 ring-base hover:ring-[color:var(--color-primary-300)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_14px_rgba(0,0,0,0.06)]'
                          )}
                          whileHover={shouldReduceMotion ? undefined : { y: -1 }}
                          whileTap={shouldReduceMotion ? undefined : { scale: 0.96 }}
                          transition={springSnappy}
                          aria-pressed={isActive}
                        >
                          <span
                            className={clsx(
                              'w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold',
                              isActive ? 'bg-white/22' : 'bg-[color:var(--color-primary-100)] text-[color:var(--color-primary-700)] dark:bg-[color:var(--color-primary-900)]/40 dark:text-[color:var(--color-primary-300)]'
                            )}
                            style={isActive ? { backgroundColor: 'rgba(255,255,255,0.22)' } : undefined}
                          >
                            {initial}
                          </span>
                          {m.name}
                        </motion.button>
                      )
                    })}
                  </ChipScroller>
                </Section>
              )}

              {/* Payment method filter */}
              {onPaymentMethodChange && (
                <Section icon={Wallet} label="결제수단">
                  <ChipScroller>
                    <AllChip
                      active={paymentMethodFilter === null}
                      onClick={() => onPaymentMethodChange(null)}
                    />
                    {PAYMENT_METHOD_OPTIONS.map(opt => {
                      const Icon = PAYMENT_METHOD_ICONS[opt.value]
                      const isActive = paymentMethodFilter === opt.value
                      return (
                        <motion.button
                          key={opt.value}
                          type="button"
                          onClick={() => onPaymentMethodChange(isActive ? null : opt.value)}
                          className={clsx(
                            'flex-shrink-0 flex items-center gap-1.5 pl-2.5 pr-3.5 h-9 rounded-2xl text-caption font-semibold transition-all',
                            isActive
                              ? 'bg-[color:var(--color-primary-500)] text-white shadow-[0_4px_12px_color-mix(in_oklch,var(--color-primary-500)_28%,transparent)]'
                              : 'bg-surface-primary text-body ring-1 ring-base hover:ring-[color:var(--color-primary-300)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_14px_rgba(0,0,0,0.06)]'
                          )}
                          whileHover={shouldReduceMotion ? undefined : { y: -1 }}
                          whileTap={shouldReduceMotion ? undefined : { scale: 0.96 }}
                          transition={springSnappy}
                          aria-pressed={isActive}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          {opt.label}
                        </motion.button>
                      )
                    })}
                  </ChipScroller>
                </Section>
              )}

              {/* Amount range */}
              {onAmountRangeChange && (
                <Section icon={Coins} label="금액 범위">
                  <div className="space-y-3">
                    {/* Presets */}
                    <ChipScroller>
                      {AMOUNT_PRESETS.map(preset => {
                        const isActive = minAmount === preset.min && maxAmount === preset.max
                        return (
                          <motion.button
                            key={preset.label}
                            type="button"
                            onClick={() => onAmountRangeChange(
                              isActive ? null : preset.min,
                              isActive ? null : preset.max,
                            )}
                            className={clsx(
                              'flex-shrink-0 flex items-center gap-1.5 px-3.5 h-8 rounded-full text-[12px] font-semibold tabular-nums transition-all',
                              isActive
                                ? 'bg-[color:var(--color-primary-500)] text-white shadow-[0_3px_10px_color-mix(in_oklch,var(--color-primary-500)_26%,transparent)]'
                                : 'bg-surface-primary text-body ring-1 ring-base hover:ring-[color:var(--color-primary-300)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_14px_rgba(0,0,0,0.06)]'
                            )}
                            whileHover={shouldReduceMotion ? undefined : { y: -1 }}
                            whileTap={shouldReduceMotion ? undefined : { scale: 0.96 }}
                            transition={springSnappy}
                            aria-pressed={isActive}
                          >
                            {isActive && <Check className="w-3 h-3" />}
                            {preset.label}
                          </motion.button>
                        )
                      })}
                    </ChipScroller>

                    {/* Manual inputs */}
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                      <AmountField
                        label="최소"
                        value={minAmount}
                        onChange={(v) => onAmountRangeChange(v, maxAmount ?? null)}
                      />
                      <span className="text-caption text-disabled">~</span>
                      <AmountField
                        label="최대"
                        value={maxAmount}
                        onChange={(v) => onAmountRangeChange(minAmount ?? null, v)}
                      />
                    </div>
                    {(minAmount !== null || maxAmount !== null) && (
                      <p className="text-[11px] text-sub tabular-nums">
                        {formatAmountRange(minAmount, maxAmount)} 범위의 거래를 표시합니다.
                      </p>
                    )}
                  </div>
                </Section>
              )}

              {/* Footer actions */}
              {onReset && (
                <div className="pt-3 -mx-4 sm:-mx-5 px-4 sm:px-5 border-t border-base flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={onReset}
                    disabled={activeFilterCount === 0}
                    className={clsx(
                      'flex items-center gap-1.5 text-caption font-semibold transition-colors',
                      activeFilterCount > 0
                        ? 'text-status-danger hover:text-red-700 dark:hover:text-red-300'
                        : 'text-disabled cursor-not-allowed'
                    )}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    필터 초기화
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsExpanded(false)}
                    className="px-4 h-9 rounded-xl bg-[color:var(--color-primary-500)] text-white text-caption font-semibold hover:bg-[color:var(--color-primary-600)] transition-colors shadow-[0_2px_8px_color-mix(in_oklch,var(--color-primary-500)_22%,transparent)]"
                  >
                    닫기
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Subcomponents ──────────────────────────────────

function Section({
  icon: Icon, label, trailing, children,
}: {
  icon: typeof Tag
  label: string
  trailing?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-sub">
          <Icon className="w-3.5 h-3.5 text-[color:var(--color-primary-500)]" />
          {label}
        </label>
        {trailing}
      </div>
      {children}
    </div>
  )
}

function ChipScroller({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-1 px-1 pb-1 snap-x">
      {children}
    </div>
  )
}

function AllChip({ active, onClick }: { active: boolean; onClick: () => void }) {
  const shouldReduceMotion = useReducedMotion()
  return (
    <motion.button
      type="button"
      onClick={onClick}
      className={clsx(
        'flex-shrink-0 flex items-center px-3.5 h-9 rounded-2xl text-caption font-semibold transition-all snap-start',
        active
          ? 'bg-[color:var(--color-primary-500)] text-white shadow-[0_4px_12px_color-mix(in_oklch,var(--color-primary-500)_28%,transparent)]'
          : 'bg-surface-primary text-body ring-1 ring-base hover:ring-[color:var(--color-primary-300)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_14px_rgba(0,0,0,0.06)]'
      )}
      whileHover={shouldReduceMotion ? undefined : { y: -1 }}
      whileTap={shouldReduceMotion ? undefined : { scale: 0.96 }}
      transition={springSnappy}
      aria-pressed={active}
    >
      전체
    </motion.button>
  )
}

function SegmentedChips<T extends string>({
  options, value, onChange,
}: {
  options: { value: T; label: string; ariaLabel?: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex gap-1 p-1 rounded-xl bg-surface-secondary ring-1 ring-base">
      {options.map(opt => {
        const isActive = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={clsx(
              'relative flex-1 min-w-0 h-8 px-1 rounded-lg text-[11px] xs:text-[12px] font-semibold transition-colors tabular-nums',
              isActive ? 'text-heading' : 'text-sub hover:text-body'
            )}
            aria-pressed={isActive}
            aria-label={opt.ariaLabel ?? opt.label}
          >
            {isActive && (
              <motion.span
                layoutId={`seg-${opt.value}`}
                className="absolute inset-0 rounded-lg bg-surface-primary ring-1 ring-base shadow-[0_1px_4px_rgba(0,0,0,0.06)]"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                aria-hidden
              />
            )}
            <span className="relative z-[1] block truncate whitespace-nowrap leading-8">{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function ActivePill({
  icon: Icon, label, color, onRemove,
}: {
  icon: typeof Tag
  label: string
  color?: string
  onRemove: () => void
}) {
  return (
    <motion.span
      variants={pillVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      layout
      className="flex-shrink-0 inline-flex items-center gap-1.5 pl-2.5 pr-1 h-7 rounded-full bg-[color:var(--color-primary-50)] dark:bg-[color:var(--color-primary-900)]/30 ring-1 ring-[color:var(--color-primary-200)] dark:ring-[color:var(--color-primary-800)] text-[11px] font-semibold text-[color:var(--color-primary-700)] dark:text-[color:var(--color-primary-200)]"
    >
      <Icon className="w-3 h-3" style={color ? { color } : undefined} />
      <span className="truncate max-w-[140px]">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        className="w-5 h-5 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
        aria-label={`${label} 필터 제거`}
      >
        <X className="w-3 h-3" />
      </button>
    </motion.span>
  )
}

function AmountField({
  label, value, onChange,
}: {
  label: string
  value: number | null | undefined
  onChange: (v: number | null) => void
}) {
  const display = value !== null && value !== undefined ? value.toLocaleString('ko-KR') : ''
  return (
    <div className="relative">
      <input
        type="text"
        inputMode="numeric"
        value={display}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^0-9]/g, '')
          onChange(raw ? Number(raw) : null)
        }}
        placeholder={label}
        aria-label={`${label} 금액`}
        className="w-full h-10 pl-3 pr-7 rounded-xl bg-surface-primary ring-1 ring-base focus:ring-[color:var(--color-primary-400)] outline-none text-body3 tabular-nums text-heading placeholder:text-disabled transition-colors shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
      />
      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-disabled pointer-events-none">원</span>
    </div>
  )
}

// ─── Utils ──────────────────────────────────────────

function formatAmountRange(min: number | null | undefined, max: number | null | undefined): string {
  if (min != null && max != null) return `${formatKoreanUnit(min)}~${formatKoreanUnit(max)}원`
  if (min != null) return `${formatKoreanUnit(min)}원 이상`
  if (max != null) return `${formatKoreanUnit(max)}원 이하`
  return ''
}
