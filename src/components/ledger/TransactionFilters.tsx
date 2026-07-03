import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion'
import { useBreakpoint } from '@/hooks/useBreakpoint'
import {
  Search, SlidersHorizontal, RotateCcw, X, Check,
  Users, Wallet, Coins, Tag, ArrowUpDown, CalendarRange,
  CreditCard, Banknote, Landmark, Receipt, MoreHorizontal,
  Repeat, Tv, Laptop, Sparkles, Cloud, Music, Newspaper,
  GraduationCap, Heart, ShoppingBag, Smartphone, MinusCircle,
  type LucideIcon,
} from 'lucide-react'
import { clsx } from 'clsx'
import { PAYMENT_METHOD_OPTIONS, getPaymentMethodLabel } from '@/utils/paymentMethod'
import { getCategoryIcon } from '@/utils/categoryIcons'
import { formatKoreanUnit } from '@/utils/format'
import { SUBSCRIPTION_CATEGORIES } from '@/utils/constants'
import { springSnappy, easeOutExpo, durations } from '@/lib/motionConfig'
import type {
  TransactionType, PaymentMethod, Member, TransactionCategory,
  SubscriptionCategoryType,
} from '@/lib/types'
import type {
  TransactionSortBy, TransactionDateRange, SubscriptionCategoryFilter,
} from '@/hooks/useTransactionFilters'

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

const SUBSCRIPTION_CATEGORY_ICONS: Record<SubscriptionCategoryType, LucideIcon> = {
  entertainment: Tv,
  productivity: Laptop,
  ai: Sparkles,
  cloud: Cloud,
  music: Music,
  news: Newspaper,
  education: GraduationCap,
  health: Heart,
  shopping: ShoppingBag,
  finance: Landmark,
  telecom: Smartphone,
  other: MoreHorizontal,
}

function getSubscriptionCategoryMeta(value: SubscriptionCategoryType) {
  return SUBSCRIPTION_CATEGORIES.find(c => c.value === value)
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
  memberFilter?: string | null
  onMemberChange?: (id: string | null) => void
  categoryFilter?: string | null
  onCategoryChange?: (id: string | null) => void
  paymentMethodFilter?: PaymentMethod | null
  onPaymentMethodChange?: (pm: PaymentMethod | null) => void
  minAmount?: number | null
  maxAmount?: number | null
  onAmountRangeChange?: (min: number | null, max: number | null) => void
  sortBy?: TransactionSortBy
  onSortByChange?: (v: TransactionSortBy) => void
  dateRange?: TransactionDateRange
  onDateRangeChange?: (v: TransactionDateRange) => void
  subscriptionCategoryFilter?: SubscriptionCategoryFilter
  onSubscriptionCategoryChange?: (v: SubscriptionCategoryFilter) => void
  activeFilterCount?: number
  onReset?: () => void
}

// ─── Motion ─────────────────────────────────────────

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
    subscriptionCategoryFilter = null, onSubscriptionCategoryChange,
    activeFilterCount = 0, onReset,
  } = props

  const [isExpanded, setIsExpanded] = useState(false)
  const shouldReduceMotion = useReducedMotion()

  // Mobile bottom-sheet | desktop side-drawer split aligned to the canonical
  // lg (768px) MOBILE|PC boundary used by LedgerPage's lg:grid. The drawer's
  // max-w-[92vw] cap keeps the 480px panel within 768–1023px viewports.
  const { isMobile } = useBreakpoint()
  const isDesktop = !isMobile

  useEffect(() => {
    if (!isExpanded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsExpanded(false)
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [isExpanded])

  const hasAdvanced = Boolean(
    onMemberChange || onCategoryChange || onPaymentMethodChange ||
    onAmountRangeChange || onSortByChange || onDateRangeChange ||
    onSubscriptionCategoryChange
  )

  const currentCategories = useMemo(() => {
    if (!categories) return []
    if (activeType === 'all') return categories
    return categories.filter(c => c.type === activeType)
  }, [categories, activeType])

  const selectedMember = memberFilter != null ? members?.find(m => m.id === memberFilter) : null
  const selectedCategory = categoryFilter != null ? categories?.find(c => c.id === categoryFilter) : null
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
                  className="touch-target-inset absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center text-sub hover:text-heading hover:bg-[var(--hover-bg)] transition-colors"
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
              'relative flex-shrink-0 h-11 px-3.5 rounded-2xl flex items-center gap-1.5 text-label3-medium font-semibold transition-all ring-1',
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
                className="min-w-[18px] h-[18px] px-1 rounded-full bg-white/95 text-label4 leading-none font-bold flex items-center justify-center text-[color:var(--color-primary-700)]"
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
        className="relative flex items-center p-1.5 rounded-2xl bg-[color:var(--surface-muted)] ring-1 ring-[color:var(--border-strong)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]"
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
                'relative flex-1 h-10 rounded-xl flex items-center justify-center gap-1.5 text-label3-medium font-semibold transition-colors z-[1]',
                isActive ? 'text-heading' : 'text-sub hover:text-body'
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="tx-type-indicator"
                  className="absolute inset-0 rounded-xl bg-surface-primary ring-1 ring-[color:var(--border-subtle)] shadow-[0_2px_8px_rgba(0,0,0,0.08)]"
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
                      'min-w-[20px] px-1.5 h-[18px] rounded-full text-label4 font-bold tabular-nums flex items-center justify-center leading-none',
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
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-none -mx-1 px-1 -my-1 py-1">
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
                {subscriptionCategoryFilter !== null && onSubscriptionCategoryChange && (
                  <ActivePill
                    key="sub"
                    icon={
                      subscriptionCategoryFilter === 'none'
                        ? MinusCircle
                        : SUBSCRIPTION_CATEGORY_ICONS[subscriptionCategoryFilter] || Repeat
                    }
                    label={
                      subscriptionCategoryFilter === 'none'
                        ? '구독 외'
                        : getSubscriptionCategoryMeta(subscriptionCategoryFilter)?.label || '구독'
                    }
                    color={
                      subscriptionCategoryFilter === 'none'
                        ? undefined
                        : getSubscriptionCategoryMeta(subscriptionCategoryFilter)?.color
                    }
                    onRemove={() => onSubscriptionCategoryChange(null)}
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
                    className="flex-shrink-0 flex items-center gap-1 px-3 h-7 rounded-full text-label3-medium font-semibold text-status-danger hover:bg-status-danger-soft transition-colors"
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

      {/* ─── Row 4: Expanded panel → Adaptive Drawer (Mobile BottomSheet · Desktop SideDrawer) */}
      <AnimatePresence initial={false}>
        {isExpanded && hasAdvanced && (
          <>
            {/* Backdrop */}
            <motion.div
              key="filter-sheet-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setIsExpanded(false)}
              className="fixed inset-0 z-[var(--z-overlay)] scrim"
              aria-hidden="true"
            />
            {/* Drawer */}
            <motion.div
              key="filter-sheet"
              role="dialog"
              aria-modal="true"
              aria-labelledby="filter-sheet-title"
              initial={shouldReduceMotion ? { opacity: 0 } : isDesktop ? { x: '102%' } : { y: '100%' }}
              animate={shouldReduceMotion ? { opacity: 1 } : isDesktop ? { x: 0 } : { y: 0 }}
              exit={shouldReduceMotion ? { opacity: 0 } : isDesktop ? { x: '102%' } : { y: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 34 }}
              drag={shouldReduceMotion || isDesktop ? false : 'y'}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.5 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > 120 || info.velocity.y > 600) setIsExpanded(false)
              }}
              className={clsx(
                'fixed z-[var(--z-overlay)]',
                'bg-surface-primary el-dialog overflow-hidden flex flex-col',
                'ring-1 ring-[color:var(--border-default)]',
                isDesktop
                  // ── Desktop: right-side full-height drawer ──
                  ? 'top-0 right-0 bottom-0 w-[480px] xl:w-[540px] max-w-[92vw] h-screen rounded-l-3xl shadow-[-24px_0_56px_-12px_rgba(0,0,0,0.18)]'
                  // ── Mobile: bottom sheet (floating on sm+) ──
                  : clsx(
                      'bottom-0 left-0 right-0 rounded-t-3xl max-h-[85vh]',
                      'pb-[env(safe-area-inset-bottom,0px)]',
                      'sm:max-w-xl sm:mx-auto sm:left-1/2 sm:-translate-x-1/2 sm:right-auto sm:w-[calc(100%-2rem)] sm:mb-4 sm:rounded-3xl',
                    ),
              )}
            >
              {/* Drag handle — mobile only */}
              {!isDesktop && (
                <div className="sm:hidden sheet-handle w-full" aria-hidden="true" />
              )}

              {/* Header — premium gradient on desktop */}
              <div
                className={clsx(
                  'relative flex items-center justify-between px-5 lg:px-6 pt-2 sm:pt-5 lg:pt-6 pb-3 lg:pb-4',
                  'border-b border-[color:var(--border-subtle)]',
                )}
              >
                {/* Aurora accent on desktop */}
                {isDesktop && (
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background:
                        'radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--color-primary-500) 14%, transparent), transparent 60%)',
                    }}
                  />
                )}
                <div className="relative inline-flex items-center gap-2.5">
                  <span
                    className="inline-flex items-center justify-center w-9 h-9 rounded-2xl"
                    style={{
                      background:
                        'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-700))',
                      boxShadow:
                        '0 4px 14px color-mix(in srgb, var(--color-primary-500) 32%, transparent), inset 0 1px 0 0 rgba(255,255,255,0.28)',
                    }}
                  >
                    <SlidersHorizontal className="w-4 h-4 text-white" />
                  </span>
                  <div className="flex flex-col">
                    <h2 id="filter-sheet-title" className="text-title2 font-bold text-heading leading-tight">
                      필터
                    </h2>
                    <p className="text-body3 text-sub leading-tight">
                      {activeFilterCount > 0
                        ? `${activeFilterCount}개 조건 적용 중`
                        : '거래를 세밀하게 탐색해 보세요'}
                    </p>
                  </div>
                  {activeFilterCount > 0 && (
                    <span className="ml-1 text-caption leading-none font-bold px-2 py-0.5 rounded-full bg-[color:var(--color-primary-600)] text-white tabular-nums shadow-[0_2px_8px_color-mix(in_oklch,var(--color-primary-500)_30%,transparent)]">
                      {activeFilterCount}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setIsExpanded(false)}
                  className="relative w-9 h-9 rounded-full flex items-center justify-center text-sub hover:text-heading hover:bg-[var(--hover-bg)] ring-1 ring-transparent hover:ring-[color:var(--border-subtle)] transition-all"
                  aria-label="필터 닫기"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Scrollable content */}
              <div
                className={clsx(
                  'flex-1 overflow-y-auto fold:p-3 p-4 sm:p-5 lg:p-6 fold:space-y-4 space-y-5 lg:space-y-6',
                )}
              >
              {/* Sort + Date range row — 2열 (lg+) */}
              {(onSortByChange || onDateRangeChange) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                <Section icon={Tag} label="카테고리">
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
                          onClick={() => onCategoryChange(isActive ? null : c.id)}
                          className={clsx(
                            'flex-shrink-0 flex items-center gap-2 pl-2.5 pr-3.5 h-9 rounded-2xl text-label3-medium font-semibold transition-all',
                            isActive
                              ? 'text-white shadow-[0_4px_12px_rgba(0,0,0,0.12)]'
                              : 'bg-surface-primary text-body ring-1 ring-[color:var(--border-strong)] hover:ring-[color:var(--color-primary-400)] shadow-[0_1px_3px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_14px_rgba(0,0,0,0.08)]'
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
                              backgroundColor: isActive ? 'rgba(255,255,255,0.22)' : `color-mix(in srgb, ${c.color} 10%, transparent)`,
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
                          onClick={() => onMemberChange(isActive ? null : m.id)}
                          className={clsx(
                            'flex-shrink-0 flex items-center gap-2 pl-1.5 pr-3.5 h-9 rounded-2xl text-label3-medium font-semibold transition-all',
                            isActive
                              ? 'bg-[color:var(--color-primary-500)] text-white shadow-[0_4px_12px_color-mix(in_oklch,var(--color-primary-500)_28%,transparent)]'
                              : 'bg-surface-primary text-body ring-1 ring-[color:var(--border-strong)] hover:ring-[color:var(--color-primary-400)] shadow-[0_1px_3px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_14px_rgba(0,0,0,0.08)]'
                          )}
                          whileHover={shouldReduceMotion ? undefined : { y: -1 }}
                          whileTap={shouldReduceMotion ? undefined : { scale: 0.96 }}
                          transition={springSnappy}
                          aria-pressed={isActive}
                        >
                          <span
                            className={clsx(
                              'w-6 h-6 rounded-full flex items-center justify-center text-caption leading-none font-bold',
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
                            'flex-shrink-0 flex items-center gap-1.5 pl-2.5 pr-3.5 h-9 rounded-2xl text-label3-medium font-semibold transition-all',
                            isActive
                              ? 'bg-[color:var(--color-primary-500)] text-white shadow-[0_4px_12px_color-mix(in_oklch,var(--color-primary-500)_28%,transparent)]'
                              : 'bg-surface-primary text-body ring-1 ring-[color:var(--border-strong)] hover:ring-[color:var(--color-primary-400)] shadow-[0_1px_3px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_14px_rgba(0,0,0,0.08)]'
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

              {/* Subscription category filter */}
              {onSubscriptionCategoryChange && (
                <Section icon={Repeat} label="구독 분류">
                  <ChipScroller>
                    <AllChip
                      active={subscriptionCategoryFilter === null}
                      onClick={() => onSubscriptionCategoryChange(null)}
                    />
                    {/* 구독 외(일반 거래) */}
                    {(() => {
                      const isActive = subscriptionCategoryFilter === 'none'
                      return (
                        <motion.button
                          key="__none__"
                          type="button"
                          onClick={() => onSubscriptionCategoryChange(isActive ? null : 'none')}
                          className={clsx(
                            'flex-shrink-0 flex items-center gap-2 pl-2.5 pr-3.5 h-9 rounded-2xl text-label3-medium font-semibold transition-all',
                            isActive
                              ? 'bg-[color:var(--text-heading)] text-[color:var(--surface-primary)] elevation-2'
                              : 'bg-surface-primary text-body ring-1 ring-[color:var(--border-strong)] hover:ring-[color:var(--color-primary-400)] shadow-[0_1px_3px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_14px_rgba(0,0,0,0.08)]'
                          )}
                          whileHover={shouldReduceMotion ? undefined : { y: -1 }}
                          whileTap={shouldReduceMotion ? undefined : { scale: 0.96 }}
                          transition={springSnappy}
                          aria-pressed={isActive}
                        >
                          <span
                            className={clsx(
                              'w-6 h-6 rounded-lg flex items-center justify-center',
                              isActive ? 'bg-white/22' : 'bg-surface-tertiary',
                            )}
                            style={isActive ? { backgroundColor: 'rgba(255,255,255,0.22)' } : undefined}
                          >
                            <MinusCircle className="w-3.5 h-3.5" />
                          </span>
                          구독 외
                        </motion.button>
                      )
                    })()}
                    {SUBSCRIPTION_CATEGORIES.map(opt => {
                      const Icon = SUBSCRIPTION_CATEGORY_ICONS[opt.value] || Repeat
                      const isActive = subscriptionCategoryFilter === opt.value
                      return (
                        <motion.button
                          key={opt.value}
                          type="button"
                          onClick={() => onSubscriptionCategoryChange(isActive ? null : opt.value)}
                          className={clsx(
                            'flex-shrink-0 flex items-center gap-2 pl-2.5 pr-3.5 h-9 rounded-2xl text-label3-medium font-semibold transition-all',
                            isActive
                              ? 'text-white shadow-[0_4px_12px_rgba(0,0,0,0.12)]'
                              : 'bg-surface-primary text-body ring-1 ring-[color:var(--border-strong)] hover:ring-[color:var(--color-primary-400)] shadow-[0_1px_3px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_14px_rgba(0,0,0,0.08)]'
                          )}
                          style={isActive ? { backgroundColor: opt.color } : undefined}
                          whileHover={shouldReduceMotion ? undefined : { y: -1 }}
                          whileTap={shouldReduceMotion ? undefined : { scale: 0.96 }}
                          transition={springSnappy}
                          aria-pressed={isActive}
                        >
                          <span
                            className="w-6 h-6 rounded-lg flex items-center justify-center"
                            style={{
                              backgroundColor: isActive ? 'rgba(255,255,255,0.22)' : `color-mix(in srgb, ${opt.color} 10%, transparent)`,
                            }}
                          >
                            <Icon
                              className="w-3.5 h-3.5"
                              style={{ color: isActive ? '#fff' : opt.color }}
                            />
                          </span>
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
                              'flex-shrink-0 flex items-center gap-1.5 px-3.5 h-8 rounded-full text-label3 font-semibold tabular-nums transition-all',
                              isActive
                                ? 'bg-[color:var(--color-primary-500)] text-white shadow-[0_3px_10px_color-mix(in_oklch,var(--color-primary-500)_26%,transparent)]'
                                : 'bg-surface-primary text-body ring-1 ring-[color:var(--border-strong)] hover:ring-[color:var(--color-primary-400)] shadow-[0_1px_3px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_14px_rgba(0,0,0,0.08)]'
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

                    {/* Manual inputs — min-w-0 로 input 자체 최소폭 해제 + gap 확대 */}
                    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:gap-4">
                      <div className="min-w-0">
                        <AmountField
                          label="최소"
                          value={minAmount}
                          onChange={(v) => onAmountRangeChange(v, maxAmount ?? null)}
                        />
                      </div>
                      <span className="text-body3 text-sub font-bold select-none px-0.5" aria-hidden="true">~</span>
                      <div className="min-w-0">
                        <AmountField
                          label="최대"
                          value={maxAmount}
                          onChange={(v) => onAmountRangeChange(minAmount ?? null, v)}
                        />
                      </div>
                    </div>
                    {(minAmount !== null || maxAmount !== null) && (
                      <p className="text-caption text-sub tabular-nums">
                        {formatAmountRange(minAmount, maxAmount)} 범위의 거래를 표시합니다.
                      </p>
                    )}
                  </div>
                </Section>
              )}

              </div>

              {/* Footer actions — fixed bottom of drawer */}
              {onReset && (
                <div
                  className={clsx(
                    'flex-shrink-0 flex items-center justify-between gap-3',
                    'px-5 lg:px-6 py-3 lg:py-4',
                    'border-t border-[color:var(--border-default)]',
                    'bg-surface-primary/95 backdrop-blur-md',
                  )}
                >
                  <button
                    type="button"
                    onClick={onReset}
                    disabled={activeFilterCount === 0}
                    className={clsx(
                      'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-label3-medium font-semibold transition-all ring-1',
                      activeFilterCount > 0
                        ? 'text-status-danger ring-status-danger/30 hover:bg-status-danger-soft hover:ring-status-danger/50'
                        : 'text-disabled ring-transparent cursor-not-allowed',
                    )}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    초기화
                    {activeFilterCount > 0 && (
                      <span className="ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-status-danger/15 text-label4 leading-none font-bold tabular-nums flex items-center justify-center">
                        {activeFilterCount}
                      </span>
                    )}
                  </button>
                  <motion.button
                    type="button"
                    onClick={() => setIsExpanded(false)}
                    whileHover={shouldReduceMotion ? undefined : { y: -1 }}
                    whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
                    transition={springSnappy}
                    className="px-6 lg:px-7 py-2.5 rounded-full text-white text-label3 transition-colors"
                    style={{
                      background:
                        'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-700))',
                      boxShadow:
                        '0 6px 18px color-mix(in srgb, var(--color-primary-500) 32%, transparent), inset 0 1px 0 0 rgba(255,255,255,0.22)',
                    }}
                  >
                    적용하기
                  </motion.button>
                </div>
              )}
            </motion.div>
          </>
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
        <label className="flex items-center gap-1.5 text-caption font-semibold uppercase tracking-wider text-sub">
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
    <div
      className={clsx(
        'flex gap-2 -mx-1 px-1 -my-1 py-1',
        // Mobile/Tablet: horizontal scroll w/ snap
        'overflow-x-auto scrollbar-none snap-x',
        // Desktop: wrap chips to fully utilize drawer width
        'lg:flex-wrap lg:overflow-x-visible lg:snap-none',
      )}
    >
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
        'flex-shrink-0 flex items-center px-3.5 h-9 rounded-2xl text-label3-medium font-semibold transition-all snap-start',
        active
          ? 'bg-[color:var(--color-primary-500)] text-white shadow-[0_4px_12px_color-mix(in_oklch,var(--color-primary-500)_28%,transparent)]'
          : 'bg-surface-primary text-body ring-1 ring-[color:var(--border-strong)] hover:ring-[color:var(--color-primary-400)] shadow-[0_1px_3px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_14px_rgba(0,0,0,0.08)]'
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
    <div className="flex gap-1 p-1.5 rounded-xl bg-[color:var(--surface-muted)] ring-1 ring-[color:var(--border-strong)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]">
      {options.map(opt => {
        const isActive = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={clsx(
              'relative flex-1 min-w-0 h-8 px-1 rounded-lg text-label3-medium font-semibold transition-colors tabular-nums',
              isActive ? 'text-heading' : 'text-sub hover:text-body'
            )}
            aria-pressed={isActive}
            aria-label={opt.ariaLabel ?? opt.label}
          >
            {isActive && (
              <motion.span
                layoutId={`seg-${opt.value}`}
                className="absolute inset-0 rounded-lg bg-surface-primary ring-1 ring-[color:var(--border-subtle)] shadow-[0_1px_4px_rgba(0,0,0,0.06)]"
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
      className="flex-shrink-0 inline-flex items-center gap-1.5 pl-2.5 pr-1 h-7 rounded-full bg-[color:var(--color-primary-50)] dark:bg-[color:var(--color-primary-900)]/30 ring-1 ring-[color:var(--color-primary-200)] dark:ring-[color:var(--color-primary-800)] text-caption font-semibold text-[color:var(--color-primary-700)] dark:text-[color:var(--color-primary-200)]"
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
        className="w-full h-11 pl-3.5 pr-10 rounded-xl bg-surface-primary ring-1 ring-[color:var(--border-strong)] focus:ring-[color:var(--color-primary-400)] outline-none text-body3 tabular-nums text-heading placeholder:text-disabled transition-colors shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
      />
      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-caption text-sub font-medium pointer-events-none">원</span>
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
