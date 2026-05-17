import { useState, useEffect, useMemo, useRef } from 'react'
import { Dialog, DialogBody, DialogFooter } from '@/components/ui/Dialog'
import { useTransactionStore } from '@/stores/transactionStore'
import { useMemberStore } from '@/stores/memberStore'
import { useLoanStore } from '@/stores/loanStore'
import { getTodayString, formatDate } from '@/lib/dateUtils'
import { PAYMENT_METHOD_OPTIONS } from '@/utils/paymentMethod'
import { formatKoreanUnit } from '@/utils/format'
import { useToastStore } from '@/stores/toastStore'
import { RECUR_OPTIONS, LOAN_INTEREST_CATEGORY_NAME, UNCATEGORIZED_LABEL } from '@/lib/ledgerConstants'
import { useTransactionTemplates } from '@/hooks/useTransactionTemplates'
import { useCountUp } from '@/hooks/useCountUp'
import { getCategoryIcon } from '@/utils/categoryIcons'
import { clsx } from 'clsx'
import { Select } from '@/components/ui/Select'
import {
  Landmark, Calendar as CalendarIcon, ChevronDown, X, Check,
  TrendingDown, TrendingUp, Zap, Users, Tag, FileText, Wallet,
  CreditCard, Banknote, Receipt, MoreHorizontal, Search, Sparkles,
} from 'lucide-react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { MiniCalendar } from '@/components/ui/MiniCalendar'
import { durations, easeOutExpo, springSnappy } from '@/lib/motionConfig'
import type { Transaction, TransactionType, RepeatType, PaymentMethod } from '@/lib/types'

const PAYMENT_METHOD_ICONS: Record<PaymentMethod, typeof Banknote> = {
  cash: Banknote,
  credit_card: CreditCard,
  debit_card: CreditCard,
  bank_transfer: Landmark,
  loan: Receipt,
  other: MoreHorizontal,
}

const QUICK_AMOUNTS = [1_000, 5_000, 10_000, 50_000, 100_000]

function getYesterdayString(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
}

interface TransactionFormModalProps {
  mode: 'create' | 'edit'
  open: boolean
  onClose: () => void
  initialData?: Transaction
  initialDate?: string | null
}

export function TransactionFormModal({ mode, open, onClose, initialData, initialDate }: TransactionFormModalProps) {
  const addTransaction = useTransactionStore((s) => s.addTransaction)
  const updateTransaction = useTransactionStore((s) => s.updateTransaction)
  const categories = useTransactionStore((s) => s.categories)
  const paymentMethodItems = useTransactionStore((s) => s.paymentMethodItems)
  const members = useMemberStore((s) => s.members)
  const transactions = useTransactionStore((s) => s.transactions)
  const loans = useLoanStore((s) => s.loans)
  const getMonthlyInterest = useLoanStore((s) => s.getMonthlyInterest)
  const loadLoans = useLoanStore((s) => s.loadLoans)
  const activeLoans = useMemo(() => loans.filter(l => l.isActive), [loans])

  const [type, setType] = useState<TransactionType>('expense')
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [memberId, setMemberId] = useState<number | ''>('')
  const [date, setDate] = useState(getTodayString())
  const [memo, setMemo] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('')
  const [paymentMethodDetail, setPaymentMethodDetail] = useState('')
  const [paymentMethodItemId, setPaymentMethodItemId] = useState<number | ''>('')
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurType, setRecurType] = useState<RepeatType>('monthly')
  const [recurEndDate, setRecurEndDate] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showCalendar, setShowCalendar] = useState(false)
  const [showRecurEndCalendar, setShowRecurEndCalendar] = useState(false)
  const [categorySearch, setCategorySearch] = useState('')
  const [showAllCategories, setShowAllCategories] = useState(false)
  const amountInputRef = useRef<HTMLInputElement>(null)
  const shouldReduceMotion = useReducedMotion()

  const numericAmount = useMemo(() => Number(amount.replace(/,/g, '')) || 0, [amount])
  const animatedAmount = useCountUp(numericAmount, 500)
  const selectedCategory = categoryId ? categories.find(c => c.id === categoryId) : null
  const selectedMember = memberId ? members.find(m => m.id === memberId) : null
  const accentColor = selectedCategory?.color
    ?? (type === 'expense' ? 'var(--value-negative)' : 'var(--value-positive)')

  const today = getTodayString()
  const yesterday = getYesterdayString()

  const currentCategories = categories.filter(c => c.type === type)

  // Items for selected payment method type
  const itemsForType = useMemo(() => {
    if (!paymentMethod || paymentMethod === 'cash') return []
    return paymentMethodItems.filter(i => i.type === paymentMethod && i.isActive)
  }, [paymentMethod, paymentMethodItems])

  const templates = useTransactionTemplates(transactions, mode === 'create')


  useEffect(() => {
    if (open) loadLoans()
  }, [open, loadLoans])

  const applyLoanInterest = (loanId: number) => {
    const loan = activeLoans.find(l => l.id === loanId)
    if (!loan) return
    const interest = getMonthlyInterest(loan)
    setType('expense')
    setAmount(interest.toLocaleString('ko-KR'))
    // Find "대출이자" category
    const interestCat = categories.find(c => c.type === 'expense' && c.name.includes(LOAN_INTEREST_CATEGORY_NAME))
    if (interestCat?.id) setCategoryId(interestCat.id)
    setMemo(`${loan.name} 이자 (잔액 ${loan.currentBalance.toLocaleString('ko-KR')}원 × 연 ${loan.annualRate}%)`)
  }

  useEffect(() => {
    if (!open) return
    setShowCalendar(false)
    setShowRecurEndCalendar(false)
    if (mode === 'edit' && initialData) {
      setType(initialData.type)
      setAmount(initialData.amount.toLocaleString('ko-KR'))
      setCategoryId(initialData.categoryId ?? '')
      setMemberId(initialData.memberId ?? '')
      setDate(initialData.date)
      setMemo(initialData.memo || '')
      setPaymentMethod(initialData.paymentMethod || '')
      setPaymentMethodDetail(initialData.paymentMethodDetail || '')
      setPaymentMethodItemId(initialData.paymentMethodItemId ?? '')
      setIsRecurring(initialData.isRecurring)
      setRecurType(initialData.recurPattern?.type || 'monthly')
      setRecurEndDate(initialData.recurPattern?.endDate || '')
    } else {
      setType('expense')
      setAmount('')
      setCategoryId('')
      setMemberId(members[0]?.id || '')
      setDate(initialDate || getTodayString())
      setMemo('')
      setPaymentMethod('')
      setPaymentMethodDetail('')
      setPaymentMethodItemId('')
      setIsRecurring(false)
      setRecurType('monthly')
      setRecurEndDate('')
    }
  }, [open, mode, initialData, initialDate, members])

  useEffect(() => {
    setCategoryId('')
  }, [type])

  // Reset payment method item when payment method type changes
  useEffect(() => {
    setPaymentMethodItemId('')
    setPaymentMethodDetail('')
  }, [paymentMethod])

  const applyTemplate = (tmpl: typeof templates[0]) => {
    setType(tmpl.type)
    setAmount(tmpl.amount.toLocaleString('ko-KR'))
    setCategoryId(tmpl.categoryId ?? '')
    setMemo(tmpl.memo || '')
    if (tmpl.paymentMethod) setPaymentMethod(tmpl.paymentMethod)
    if (tmpl.memberId) setMemberId(tmpl.memberId)
  }

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, '')
    if (raw === '') {
      setAmount('')
      return
    }
    const num = parseInt(raw, 10)
    setAmount(num.toLocaleString('ko-KR'))
  }

  const handleSubmit = async () => {
    const numAmount = Number(amount.replace(/,/g, ''))
    if (!numAmount || numAmount <= 0) return

    setIsSubmitting(true)
    try {
      const txnData = {
        type,
        amount: numAmount,
        categoryId: categoryId ? (categoryId as number) : null,
        memberId: memberId ? (memberId as number) : null,
        date,
        memo: memo.trim() || undefined,
        paymentMethod: paymentMethod || undefined,
        paymentMethodDetail: paymentMethodDetail.trim() || undefined,
        paymentMethodItemId: paymentMethodItemId ? (paymentMethodItemId as number) : undefined,
      }

      if (mode === 'edit' && initialData?.id) {
        await updateTransaction(initialData.id, txnData)
      } else {
        await addTransaction({
          ...txnData,
          isRecurring,
          recurPattern: isRecurring ? { type: recurType, interval: 1, endDate: recurEndDate || undefined } : undefined,
        })
      }
      onClose()
    } catch {
      useToastStore.getState().addToast('거래 저장에 실패했습니다.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSelectPaymentMethodItem = (itemId: number, itemName: string) => {
    setPaymentMethodItemId(itemId)
    setPaymentMethodDetail(itemName)
  }

  // ── Filtered/sorted categories (with search) ─────
  const visibleCategories = useMemo(() => {
    const q = categorySearch.trim().toLowerCase()
    const base = q ? currentCategories.filter(c => c.name.toLowerCase().includes(q)) : currentCategories
    // Move selected to front for visual continuity
    if (selectedCategory) {
      const others = base.filter(c => c.id !== selectedCategory.id)
      return [selectedCategory, ...others]
    }
    return base
  }, [currentCategories, categorySearch, selectedCategory])

  // ── Show condensed category set unless searching or expanded ──
  const CATEGORY_COLLAPSED_LIMIT = 10
  const shouldCollapseCategories = !categorySearch && !showAllCategories && visibleCategories.length > CATEGORY_COLLAPSED_LIMIT
  const renderedCategories = shouldCollapseCategories ? visibleCategories.slice(0, CATEGORY_COLLAPSED_LIMIT) : visibleCategories

  const isExpense = type === 'expense'

  return (
    <Dialog open={open} onClose={onClose} size="md" noPadding>
      {/* ─── Premium Aurora Header ───────────────────────── */}
      <div className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none transition-colors duration-500"
          style={{
            background: isExpense
              ? 'radial-gradient(circle at 20% 10%, oklch(0.68 0.20 25 / 0.20), transparent 50%), radial-gradient(circle at 90% 0%, oklch(0.78 0.16 340 / 0.14), transparent 45%)'
              : 'radial-gradient(circle at 20% 10%, oklch(0.72 0.18 155 / 0.20), transparent 50%), radial-gradient(circle at 90% 0%, oklch(0.74 0.14 195 / 0.14), transparent 45%)',
          }}
        />
        <div className="relative px-5 sm:px-6 pt-5 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0 transition-colors"
                style={{
                  background: `linear-gradient(135deg, color-mix(in srgb, ${accentColor} 22%, transparent), color-mix(in srgb, ${accentColor} 8%, transparent))`,
                  boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${accentColor} 28%, transparent), inset 0 1px 0 0 rgba(255,255,255,0.5)`,
                }}
              >
                {selectedCategory ? (
                  (() => {
                    const Icon = getCategoryIcon(selectedCategory.icon)
                    return <Icon className="w-4 h-4" style={{ color: accentColor }} />
                  })()
                ) : isExpense ? (
                  <TrendingDown className="w-4 h-4" style={{ color: accentColor }} />
                ) : (
                  <TrendingUp className="w-4 h-4" style={{ color: accentColor }} />
                )}
              </div>
              <div className="min-w-0">
                <h2 className="text-title2 font-bold text-heading tracking-tight truncate">
                  {mode === 'edit' ? '거래 수정' : '새 거래 기록'}
                </h2>
                <p className="text-[11px] text-sub font-medium mt-0.5">
                  {selectedCategory?.name ?? (isExpense ? '지출' : '수입')}
                  {selectedMember && (
                    <>
                      <span className="mx-1.5 text-disabled">·</span>
                      <span style={{ color: selectedMember.color }}>{selectedMember.name}</span>
                    </>
                  )}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full flex items-center justify-center text-sub hover:text-heading hover:bg-[var(--hover-bg)] transition-colors flex-shrink-0"
              aria-label="닫기"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Live amount preview */}
          <div className="mt-3 flex items-baseline gap-2 flex-wrap">
            <span
              className="text-financial-fluid font-extrabold tracking-tight tabular-nums transition-colors"
              style={{
                color: accentColor,
                textShadow: `0 1px 2px color-mix(in srgb, ${accentColor} 20%, transparent)`,
              }}
            >
              {isExpense && numericAmount > 0 && '−'}
              {animatedAmount.toLocaleString('ko-KR')}
            </span>
            <span className="text-body3-semi font-bold text-sub">원</span>
            {numericAmount > 0 && (
              <span className="text-[11px] text-disabled font-medium ml-auto">
                {formatKoreanUnit(numericAmount)}원
              </span>
            )}
          </div>
        </div>
      </div>

      <DialogBody className="!mt-0 px-5 sm:px-6 pb-5 max-h-[70vh] overflow-y-auto">
        <div className="space-y-5">
          {/* Templates (create only) */}
          {mode === 'create' && templates.length > 0 && (
            <div>
              <SectionLabel icon={Zap} label="자주 쓰는 거래" subtle />
              <div className="flex gap-2 overflow-x-auto scrollbar-none -my-1 py-1">
                {templates.map((tmpl, i) => {
                  const cat = tmpl.categoryId ? categories.find(c => c.id === tmpl.categoryId) : null
                  const c = cat?.color || 'var(--color-primary-500)'
                  return (
                    <motion.button
                      key={i}
                      type="button"
                      onClick={() => applyTemplate(tmpl)}
                      whileTap={shouldReduceMotion ? undefined : { scale: 0.96 }}
                      transition={springSnappy}
                      className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-caption font-semibold transition-all ring-1"
                      style={{
                        background: `color-mix(in srgb, ${c} 10%, var(--surface-primary))`,
                        color: `color-mix(in srgb, ${c} 80%, var(--text-heading))`,
                        boxShadow: 'inset 0 0 0 1px color-mix(in srgb, currentColor 18%, transparent)',
                      }}
                    >
                      {cat?.name || UNCATEGORIZED_LABEL}
                      <span className="text-disabled font-medium">·</span>
                      <span className="tabular-nums">{formatKoreanUnit(tmpl.amount)}</span>
                    </motion.button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Loan shortcuts (create only) */}
          {mode === 'create' && activeLoans.length > 0 && (
            <div>
              <SectionLabel icon={Landmark} label="대출이자 불러오기" subtle />
              <div className="flex gap-2 overflow-x-auto scrollbar-none -my-1 py-1">
                {activeLoans.map(loan => (
                  <motion.button
                    key={loan.id}
                    type="button"
                    onClick={() => applyLoanInterest(loan.id!)}
                    whileTap={shouldReduceMotion ? undefined : { scale: 0.96 }}
                    transition={springSnappy}
                    className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-caption font-semibold bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 ring-1 ring-red-200 dark:ring-red-800 hover:brightness-95 transition-all"
                  >
                    <Landmark className="w-3.5 h-3.5" />
                    {loan.name}
                    <span className="text-disabled font-medium">·</span>
                    <span className="tabular-nums">{formatKoreanUnit(getMonthlyInterest(loan))}원</span>
                  </motion.button>
                ))}
              </div>
            </div>
          )}

          {/* ─── Type Segment (premium with layoutId) ─── */}
          <div>
            <SectionLabel label="유형" />
            <div
              role="radiogroup"
              aria-label="거래 유형"
              className="relative grid grid-cols-2 gap-1 p-1.5 rounded-2xl bg-[color:var(--surface-muted)] ring-1 ring-[color:var(--border-strong)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]"
            >
              {(['expense', 'income'] as const).map((t) => {
                const isActive = type === t
                const Icon = t === 'expense' ? TrendingDown : TrendingUp
                const tintColor = t === 'expense' ? 'var(--value-negative)' : 'var(--value-positive)'
                return (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    onClick={() => setType(t)}
                    className={clsx(
                      'relative h-11 rounded-xl flex items-center justify-center gap-2 text-body3 font-bold transition-colors z-[1]',
                      isActive ? 'text-white' : 'text-sub hover:text-body',
                    )}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="tx-form-type-indicator"
                        className="absolute inset-0 rounded-xl"
                        style={{
                          background: `linear-gradient(135deg, ${tintColor}, color-mix(in srgb, ${tintColor} 80%, black))`,
                          boxShadow: `0 4px 14px color-mix(in srgb, ${tintColor} 38%, transparent), inset 0 1px 0 0 rgba(255,255,255,0.3)`,
                        }}
                        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                        aria-hidden="true"
                      />
                    )}
                    <span className="relative z-[2] flex items-center gap-2">
                      <Icon className="w-4 h-4" />
                      {t === 'expense' ? '지출' : '수입'}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* ─── Amount (large display) ─── */}
          <div>
            <SectionLabel label="금액" />
            <div className="relative">
              <input
                ref={amountInputRef}
                type="text"
                inputMode="numeric"
                value={amount}
                onChange={handleAmountChange}
                placeholder="0"
                aria-label="금액"
                className={clsx(
                  'w-full pl-5 pr-12 h-16 rounded-2xl bg-surface-primary ring-1 transition-all outline-none',
                  'text-[clamp(24px,5vw,32px)] font-bold tabular-nums tracking-tight',
                  'focus:ring-2 placeholder:text-disabled',
                )}
                style={{
                  color: numericAmount > 0 ? accentColor : 'var(--text-heading)',
                  boxShadow: numericAmount > 0
                    ? `inset 0 0 0 1px color-mix(in srgb, ${accentColor} 32%, transparent), 0 0 0 4px color-mix(in srgb, ${accentColor} 10%, transparent), 0 2px 8px color-mix(in srgb, ${accentColor} 14%, transparent)`
                    : 'inset 0 0 0 1px var(--border-strong), 0 1px 3px rgba(0,0,0,0.04)',
                }}
              />
              <span
                className="absolute right-5 top-1/2 -translate-y-1/2 text-body3 font-bold pointer-events-none"
                style={{ color: numericAmount > 0 ? accentColor : 'var(--text-disabled)' }}
              >
                원
              </span>
            </div>
            {/* Quick amount chips */}
            <div className="mt-2.5 flex gap-1.5 overflow-x-auto scrollbar-none -mx-1 px-1 -my-1 py-1">
              {QUICK_AMOUNTS.map(q => (
                <motion.button
                  key={q}
                  type="button"
                  onClick={() => {
                    const next = numericAmount + q
                    setAmount(next.toLocaleString('ko-KR'))
                  }}
                  whileTap={shouldReduceMotion ? undefined : { scale: 0.94 }}
                  transition={springSnappy}
                  className="flex-shrink-0 px-3 py-1 rounded-full text-[11px] font-semibold tabular-nums bg-surface-tertiary text-sub ring-1 ring-base hover:bg-[var(--hover-bg)] transition-all"
                >
                  +{formatKoreanUnit(q)}
                </motion.button>
              ))}
              <motion.button
                type="button"
                onClick={() => setAmount('')}
                whileTap={shouldReduceMotion ? undefined : { scale: 0.94 }}
                transition={springSnappy}
                disabled={numericAmount === 0}
                className="flex-shrink-0 px-3 py-1 rounded-full text-[11px] font-semibold tabular-nums bg-surface-tertiary text-sub ring-1 ring-base hover:bg-[var(--hover-bg)] transition-all disabled:opacity-40 disabled:pointer-events-none"
              >
                초기화
              </motion.button>
            </div>
          </div>

          {/* ─── Category Grid (replaces Select dropdown) ─── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <SectionLabel icon={Tag} label="카테고리" inline />
              {currentCategories.length > 6 && (
                <div className="relative flex-1 max-w-[180px] ml-3">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-disabled" />
                  <input
                    type="text"
                    value={categorySearch}
                    onChange={(e) => setCategorySearch(e.target.value)}
                    placeholder="검색"
                    aria-label="카테고리 검색"
                    className="w-full pl-7 pr-2 h-7 rounded-full text-[11px] bg-surface-tertiary ring-1 ring-base focus:ring-[color:var(--color-primary-400)] outline-none transition-all"
                  />
                </div>
              )}
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
              {renderedCategories.map(c => {
                const Icon = getCategoryIcon(c.icon)
                const isActive = categoryId === c.id
                return (
                  <motion.button
                    key={c.id}
                    type="button"
                    onClick={() => setCategoryId(c.id!)}
                    whileTap={shouldReduceMotion ? undefined : { scale: 0.93 }}
                    transition={springSnappy}
                    aria-pressed={isActive}
                    className={clsx(
                      'relative flex flex-col items-center gap-1 py-2.5 px-1 rounded-2xl transition-all',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring-focus)]',
                    )}
                    style={{
                      background: isActive
                        ? `linear-gradient(135deg, color-mix(in srgb, ${c.color} 22%, transparent), color-mix(in srgb, ${c.color} 8%, transparent))`
                        : 'var(--surface-tertiary)',
                      boxShadow: isActive
                        ? `inset 0 0 0 1.5px ${c.color}, 0 4px 14px color-mix(in srgb, ${c.color} 22%, transparent)`
                        : 'inset 0 0 0 1px var(--border-subtle)',
                    }}
                  >
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center"
                      style={{
                        background: isActive
                          ? c.color
                          : `color-mix(in srgb, ${c.color} 12%, transparent)`,
                      }}
                    >
                      <Icon
                        className="w-[18px] h-[18px]"
                        style={{ color: isActive ? '#fff' : c.color }}
                      />
                    </div>
                    <span
                      className={clsx(
                        'text-[11px] font-semibold leading-tight text-center line-clamp-1',
                        isActive ? 'text-heading' : 'text-sub',
                      )}
                    >
                      {c.name}
                    </span>
                    {isActive && (
                      <span
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center ring-2 ring-[color:var(--surface-primary)]"
                        style={{ backgroundColor: c.color }}
                      >
                        <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                      </span>
                    )}
                  </motion.button>
                )
              })}
              {renderedCategories.length === 0 && (
                <div className="col-span-4 sm:col-span-5 py-6 text-center text-caption text-disabled">
                  <Sparkles className="w-4 h-4 mx-auto mb-1.5 opacity-60" />
                  검색 결과 없음
                </div>
              )}
            </div>
            {shouldCollapseCategories && (
              <button
                type="button"
                onClick={() => setShowAllCategories(true)}
                className="mt-2 text-[11px] text-[color:var(--color-primary-600)] dark:text-[color:var(--color-primary-300)] font-semibold hover:underline"
              >
                +{visibleCategories.length - CATEGORY_COLLAPSED_LIMIT}개 더보기
              </button>
            )}
          </div>

          {/* ─── Member chips ─── */}
          {members.length > 0 && (
            <div>
              <SectionLabel icon={Users} label="구성원" />
              {members.length <= 4 ? (
                <div className="flex gap-2 flex-wrap" role="group" aria-label="구성원 선택">
                  <motion.button
                    type="button"
                    onClick={() => setMemberId('')}
                    whileTap={shouldReduceMotion ? undefined : { scale: 0.95 }}
                    transition={springSnappy}
                    aria-pressed={memberId === ''}
                    className={clsx(
                      'inline-flex items-center gap-1.5 px-3 h-9 rounded-full text-caption font-semibold ring-1 transition-all',
                      memberId === ''
                        ? 'bg-surface-primary text-heading ring-[color:var(--border-strong)] shadow-[0_2px_8px_rgba(0,0,0,0.06)]'
                        : 'bg-surface-tertiary text-sub ring-transparent hover:bg-[var(--hover-bg)]',
                    )}
                  >
                    <span className="w-5 h-5 rounded-full bg-surface-secondary ring-1 ring-base flex items-center justify-center">
                      <Users className="w-3 h-3 text-disabled" />
                    </span>
                    미지정
                  </motion.button>
                  {members.map(m => {
                    const isActive = memberId === m.id
                    const initial = m.name?.slice(0, 1) || '?'
                    return (
                      <motion.button
                        key={m.id}
                        type="button"
                        onClick={() => setMemberId(m.id!)}
                        whileTap={shouldReduceMotion ? undefined : { scale: 0.95 }}
                        transition={springSnappy}
                        aria-pressed={isActive}
                        className={clsx(
                          'inline-flex items-center gap-1.5 pl-1 pr-3.5 h-9 rounded-full text-caption font-bold transition-all',
                          isActive ? 'text-white' : 'text-sub hover:brightness-95',
                        )}
                        style={
                          isActive
                            ? {
                                background: `linear-gradient(135deg, ${m.color}, color-mix(in srgb, ${m.color} 75%, black))`,
                                boxShadow: `0 4px 14px color-mix(in srgb, ${m.color} 38%, transparent), inset 0 1px 0 0 rgba(255,255,255,0.3)`,
                              }
                            : { background: 'var(--surface-tertiary)' }
                        }
                      >
                        <span
                          className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold ring-2"
                          style={{
                            backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : m.color,
                            color: '#fff',
                            boxShadow: isActive ? 'inset 0 0 0 1px rgba(255,255,255,0.4)' : 'none',
                          }}
                        >
                          {initial}
                        </span>
                        {m.name}
                      </motion.button>
                    )
                  })}
                </div>
              ) : (
                <Select
                  value={String(memberId)}
                  onChange={(v) => setMemberId(v ? Number(v) : '')}
                  options={members.map(m => ({ value: String(m.id), label: m.name }))}
                  placeholder="미지정"
                />
              )}
            </div>
          )}

          {/* Date — premium picker (already upgraded) */}
          <div>
            <SectionLabel icon={CalendarIcon} label="날짜" />
            <div className="flex gap-2 mb-2 flex-wrap">
              {[
                { label: '오늘', value: today },
                { label: '어제', value: yesterday },
              ].map(chip => (
                <motion.button
                  key={chip.value}
                  type="button"
                  onClick={() => { setDate(chip.value); setShowCalendar(false) }}
                  whileTap={shouldReduceMotion ? undefined : { scale: 0.95 }}
                  transition={springSnappy}
                  className={clsx(
                    'px-4 py-1.5 rounded-full text-caption font-semibold ring-1',
                    date === chip.value
                      ? 'bg-[color:var(--color-primary-600)] text-white ring-transparent shadow-[0_4px_14px_color-mix(in_srgb,var(--color-primary-500)_28%,transparent)]'
                      : 'bg-surface-tertiary text-sub ring-transparent hover:bg-[var(--hover-bg)]',
                  )}
                >
                  {chip.label}
                </motion.button>
              ))}
            </div>
            <motion.button
              type="button"
              onClick={() => setShowCalendar(v => !v)}
              whileTap={shouldReduceMotion ? undefined : { scale: 0.99 }}
              className={clsx(
                'w-full flex items-center justify-between gap-2 px-4 py-3 rounded-2xl ring-1 transition-all',
                showCalendar
                  ? 'ring-[color:var(--color-primary-400)] bg-[color:var(--color-primary-50)] dark:bg-[color:var(--color-primary-900)]/20'
                  : 'ring-base bg-surface-primary hover:bg-[var(--hover-bg)] shadow-[0_1px_3px_rgba(0,0,0,0.04)]',
              )}
              aria-expanded={showCalendar}
              aria-label="달력 열기"
            >
              <span className="inline-flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-[color:var(--color-primary-50)] dark:bg-[color:var(--color-primary-900)]/30 flex items-center justify-center flex-shrink-0">
                  <CalendarIcon className="w-4 h-4 text-[color:var(--color-primary-600)] dark:text-[color:var(--color-primary-300)]" />
                </div>
                <span className="text-body3 text-heading font-semibold tabular-nums truncate">
                  {formatDate(date)}
                </span>
              </span>
              <ChevronDown
                className={clsx(
                  'w-4 h-4 text-sub flex-shrink-0 transition-transform',
                  showCalendar && 'rotate-180',
                )}
              />
            </motion.button>
            <AnimatePresence>
              {showCalendar && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: durations.base, ease: easeOutExpo }}
                  className="overflow-hidden mt-2"
                >
                  <MiniCalendar
                    value={date}
                    onChange={(d) => { setDate(d); setShowCalendar(false) }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ─── Payment Method (icons) ─── */}
          <div>
            <SectionLabel icon={Wallet} label="거래수단" optional />
            <div className="grid grid-cols-3 gap-2">
              {PAYMENT_METHOD_OPTIONS.map(opt => {
                const Icon = PAYMENT_METHOD_ICONS[opt.value as PaymentMethod] || Wallet
                const isActive = paymentMethod === opt.value
                return (
                  <motion.button
                    key={opt.value}
                    type="button"
                    onClick={() => setPaymentMethod(paymentMethod === opt.value ? '' : opt.value)}
                    whileTap={shouldReduceMotion ? undefined : { scale: 0.95 }}
                    transition={springSnappy}
                    aria-pressed={isActive}
                    className={clsx(
                      'inline-flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-2xl text-caption font-semibold transition-all',
                      isActive
                        ? 'bg-[color:var(--color-primary-500)] text-white shadow-[0_4px_14px_color-mix(in_oklch,var(--color-primary-500)_30%,transparent)]'
                        : 'bg-surface-tertiary text-sub ring-1 ring-base hover:bg-[var(--hover-bg)]',
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {opt.label}
                  </motion.button>
                )
              })}
            </div>

            {/* Managed payment method items or free-text fallback */}
            <AnimatePresence>
              {paymentMethod && paymentMethod !== 'cash' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: durations.base, ease: easeOutExpo }}
                  className="overflow-hidden"
                >
                  <div className="pt-2.5 space-y-2">
                    {itemsForType.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {itemsForType.map(item => (
                          <motion.button
                            key={item.id}
                            type="button"
                            onClick={() => handleSelectPaymentMethodItem(item.id!, item.name)}
                            whileTap={shouldReduceMotion ? undefined : { scale: 0.96 }}
                            transition={springSnappy}
                            className={clsx(
                              'inline-flex items-center gap-1 px-3 h-7 rounded-full text-[11px] font-semibold transition-all',
                              paymentMethodItemId === item.id
                                ? 'bg-[color:var(--color-primary-100)] text-[color:var(--color-primary-700)] dark:bg-[color:var(--color-primary-900)]/40 dark:text-[color:var(--color-primary-300)] ring-1 ring-[color:var(--color-primary-300)] dark:ring-[color:var(--color-primary-700)]'
                                : 'bg-surface-secondary text-sub ring-1 ring-base hover:bg-[var(--hover-bg)]',
                            )}
                          >
                            {paymentMethodItemId === item.id && <Check className="w-3 h-3" />}
                            {item.name}
                          </motion.button>
                        ))}
                        <motion.button
                          type="button"
                          onClick={() => { setPaymentMethodItemId(''); setPaymentMethodDetail('') }}
                          whileTap={shouldReduceMotion ? undefined : { scale: 0.96 }}
                          transition={springSnappy}
                          className={clsx(
                            'inline-flex items-center gap-1 px-3 h-7 rounded-full text-[11px] font-semibold transition-all',
                            paymentMethodItemId === ''
                              ? 'bg-surface-primary text-heading ring-1 ring-[color:var(--border-strong)]'
                              : 'bg-surface-secondary text-sub ring-1 ring-base hover:bg-[var(--hover-bg)]',
                          )}
                        >
                          직접 입력
                        </motion.button>
                      </div>
                    )}
                    {paymentMethodItemId === '' && (
                      <input
                        type="text"
                        value={paymentMethodDetail}
                        onChange={(e) => setPaymentMethodDetail(e.target.value)}
                        placeholder="카드/계좌명 (예: 신한카드)"
                        className="w-full px-3.5 h-10 rounded-xl bg-surface-primary text-caption text-heading placeholder:text-disabled outline-none ring-1 ring-base focus:ring-[color:var(--color-primary-400)] focus:shadow-[0_0_0_4px_color-mix(in_oklch,var(--color-primary-500)_14%,transparent)] transition-all"
                      />
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ─── Memo (polished input) ─── */}
          <div>
            <SectionLabel icon={FileText} label="메모" optional />
            <div className="relative">
              <input
                type="text"
                value={memo}
                onChange={(e) => setMemo(e.target.value.slice(0, 80))}
                placeholder="메모를 입력하세요"
                aria-label="메모"
                maxLength={80}
                className="w-full pl-3.5 pr-14 h-11 rounded-2xl bg-surface-primary text-body3 text-heading placeholder:text-disabled outline-none ring-1 ring-base focus:ring-[color:var(--color-primary-400)] focus:shadow-[0_0_0_4px_color-mix(in_oklch,var(--color-primary-500)_14%,transparent)] transition-all"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-disabled font-medium tabular-nums">
                {memo.length}/80
              </span>
            </div>
          </div>

          {/* Recurring Toggle - create only */}
          {mode === 'create' && (
            <>
              <div>
                <motion.label
                  className={clsx(
                    'flex items-center justify-between gap-2 cursor-pointer rounded-2xl px-4 py-3 transition-all ring-1',
                    isRecurring
                      ? 'bg-[color:var(--color-primary-50)] dark:bg-[color:var(--color-primary-900)]/20 ring-[color:var(--color-primary-300)] dark:ring-[color:var(--color-primary-700)]'
                      : 'bg-surface-tertiary ring-base',
                  )}
                  whileTap={shouldReduceMotion ? undefined : { scale: 0.995 }}
                >
                  <span className="inline-flex items-center gap-2 text-body3 font-semibold text-heading">
                    <CalendarIcon className="w-4 h-4 text-[color:var(--color-primary-600)] dark:text-[color:var(--color-primary-300)]" />
                    반복 거래
                  </span>
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={isRecurring}
                      onChange={(e) => setIsRecurring(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-6 rounded-full bg-surface-secondary ring-1 ring-base peer-checked:bg-[color:var(--color-primary-500)] peer-checked:ring-[color:var(--color-primary-500)] transition-all" />
                    <div className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform peer-checked:translate-x-4" />
                  </div>
                </motion.label>
              </div>

              <AnimatePresence>
              {isRecurring && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: durations.base, ease: easeOutExpo }}
                  className="overflow-hidden"
                >
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <SectionLabel label="반복 주기" />
                    <Select
                      value={recurType}
                      onChange={(v) => setRecurType(v as RepeatType)}
                      options={RECUR_OPTIONS}
                    />
                  </div>
                  <div>
                    <SectionLabel label="종료일" optional />
                    <motion.button
                      type="button"
                      onClick={() => setShowRecurEndCalendar(v => !v)}
                      whileTap={shouldReduceMotion ? undefined : { scale: 0.99 }}
                      className={clsx(
                        'w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-2xl ring-1 transition-all',
                        showRecurEndCalendar
                          ? 'ring-[color:var(--color-primary-400)] bg-[color:var(--color-primary-50)] dark:bg-[color:var(--color-primary-900)]/20'
                          : 'ring-base bg-surface-primary hover:bg-[var(--hover-bg)]',
                      )}
                      aria-expanded={showRecurEndCalendar}
                    >
                      <span className="inline-flex items-center gap-2 min-w-0">
                        <CalendarIcon className="w-4 h-4 text-sub flex-shrink-0" />
                        <span className={clsx(
                          'text-body3 tabular-nums truncate',
                          recurEndDate ? 'text-heading font-semibold' : 'text-disabled',
                        )}>
                          {recurEndDate ? formatDate(recurEndDate) : '종료일 없음'}
                        </span>
                      </span>
                      <ChevronDown
                        className={clsx(
                          'w-4 h-4 text-sub flex-shrink-0 transition-transform',
                          showRecurEndCalendar && 'rotate-180',
                        )}
                      />
                    </motion.button>
                    <AnimatePresence>
                      {showRecurEndCalendar && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: durations.base, ease: easeOutExpo }}
                          className="overflow-hidden mt-2 col-span-2"
                        >
                          {recurEndDate && (
                            <button
                              type="button"
                              onClick={() => { setRecurEndDate(''); setShowRecurEndCalendar(false) }}
                              className="mb-2 px-3 py-1.5 rounded-full text-caption font-semibold bg-surface-tertiary text-sub hover:bg-[var(--hover-bg)] transition-colors"
                            >
                              종료일 해제
                            </button>
                          )}
                          <MiniCalendar
                            value={recurEndDate || date}
                            minDate={date}
                            onChange={(d) => { setRecurEndDate(d); setShowRecurEndCalendar(false) }}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
                </motion.div>
              )}
              </AnimatePresence>
            </>
          )}
        </div>
      </DialogBody>

      {/* ─── Premium Footer with type-aware gradient CTA ─── */}
      <DialogFooter className="!mt-0 px-5 sm:px-6 py-4 border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-secondary)]/40 backdrop-blur-sm">
        <motion.button
          type="button"
          onClick={onClose}
          whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
          transition={springSnappy}
          className="h-12 px-5 rounded-2xl text-body3 font-semibold text-sub bg-surface-tertiary ring-1 ring-base hover:bg-[var(--hover-bg)] transition-all"
        >
          취소
        </motion.button>
        <motion.button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting || numericAmount <= 0}
          whileHover={shouldReduceMotion || isSubmitting || numericAmount <= 0 ? undefined : { y: -1 }}
          whileTap={shouldReduceMotion || isSubmitting || numericAmount <= 0 ? undefined : { scale: 0.97 }}
          transition={springSnappy}
          className={clsx(
            'h-12 px-6 rounded-2xl text-body3 font-bold text-white inline-flex items-center justify-center gap-1.5 transition-all',
            'disabled:opacity-50 disabled:pointer-events-none',
          )}
          style={
            numericAmount > 0
              ? {
                  background: `linear-gradient(135deg, ${accentColor}, color-mix(in srgb, ${accentColor} 75%, black))`,
                  boxShadow: `0 6px 20px color-mix(in srgb, ${accentColor} 38%, transparent), inset 0 1px 0 0 rgba(255,255,255,0.3)`,
                }
              : {
                  background: 'var(--surface-tertiary)',
                  color: 'var(--text-disabled)',
                }
          }
        >
          {isSubmitting ? (
            <>
              <motion.span
                animate={shouldReduceMotion ? undefined : { rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full"
              />
              저장 중...
            </>
          ) : (
            <>
              <Check className="w-4 h-4" strokeWidth={3} />
              {mode === 'edit' ? '수정 완료' : '거래 기록'}
            </>
          )}
        </motion.button>
      </DialogFooter>
    </Dialog>
  )
}

// ─── Section Label helper ──────────────────────────
function SectionLabel({
  icon: Icon, label, subtle = false, optional = false, inline = false,
}: {
  icon?: typeof Tag
  label: string
  subtle?: boolean
  optional?: boolean
  inline?: boolean
}) {
  return (
    <label
      className={clsx(
        'flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider',
        subtle ? 'text-disabled' : 'text-sub',
        inline ? '' : 'mb-2',
      )}
    >
      {Icon && <Icon className="w-3.5 h-3.5 text-[color:var(--color-primary-500)]" />}
      {label}
      {optional && <span className="font-normal text-disabled normal-case">선택</span>}
    </label>
  )
}
