import { useReducer, useEffect, useMemo, useRef, useCallback } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { useTransactionStore } from '@/stores/transactionStore'
import { useMemberStore } from '@/stores/memberStore'
import { useBudgetStore } from '@/stores/budgetStore'
import { useLoanStore } from '@/stores/loanStore'
import { useToastStore } from '@/stores/toastStore'
import { useConfetti } from '@/hooks/useConfetti'
import { getTodayString, formatDate } from '@/lib/dateUtils'
import { PAYMENT_METHOD_OPTIONS, getPaymentMethodLabel } from '@/utils/paymentMethod'
import { formatKoreanUnit } from '@/utils/format'
import { getCategoryIcon } from '@/utils/categoryIcons'
import { springSnappy, easeOutExpo, durations } from '@/lib/motionConfig'
import { clsx } from 'clsx'
import {
  Check, ChevronLeft, ChevronRight, Zap, Landmark, Pencil, MoreHorizontal,
  Plus, Eraser, X,
} from 'lucide-react'
import type { TransactionType, RepeatType, PaymentMethod } from '@/lib/types'

// ─── Types ─────────────────────────────────────────

interface WizardState {
  currentStep: number
  direction: 'forward' | 'backward'
  isSubmitting: boolean
  isSuccess: boolean
  type: TransactionType
  amount: string
  categoryId: number | ''
  memberId: number | ''
  date: string
  memo: string
  paymentMethod: PaymentMethod | ''
  paymentMethodDetail: string
  paymentMethodItemId: number | ''
  isRecurring: boolean
  recurType: RepeatType
  recurEndDate: string
}

type WizardAction =
  | { type: 'NEXT_STEP' }
  | { type: 'PREV_STEP' }
  | { type: 'GO_TO_STEP'; step: number; direction?: 'forward' | 'backward' }
  | { type: 'SET_FIELD'; field: keyof WizardState; value: unknown }
  | { type: 'SET_TYPE'; value: TransactionType }
  | { type: 'SET_PAYMENT_METHOD'; value: PaymentMethod | '' }
  | { type: 'APPLY_TEMPLATE'; data: { type: TransactionType; amount: number; categoryId: number | null; memo?: string; paymentMethod?: PaymentMethod; memberId: number | null } }
  | { type: 'APPLY_LOAN'; data: { amount: number; categoryId: number | ''; memo: string } }
  | { type: 'ADD_AMOUNT'; delta: number }
  | { type: 'CLEAR_AMOUNT' }
  | { type: 'RESET'; initialDate?: string; defaultMemberId?: number | '' }
  | { type: 'SET_SUBMITTING'; value: boolean }
  | { type: 'SET_SUCCESS'; value: boolean }

// ─── Reducer ───────────────────────────────────────

function getInitialState(initialDate?: string, defaultMemberId?: number | ''): WizardState {
  return {
    currentStep: 0,
    direction: 'forward',
    isSubmitting: false,
    isSuccess: false,
    type: 'expense',
    amount: '',
    categoryId: '',
    memberId: defaultMemberId ?? '',
    date: initialDate || getTodayString(),
    memo: '',
    paymentMethod: '',
    paymentMethodDetail: '',
    paymentMethodItemId: '',
    isRecurring: false,
    recurType: 'monthly',
    recurEndDate: '',
  }
}

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'NEXT_STEP':
      return { ...state, currentStep: Math.min(state.currentStep + 1, 3), direction: 'forward' }
    case 'PREV_STEP':
      return { ...state, currentStep: Math.max(state.currentStep - 1, 0), direction: 'backward' }
    case 'GO_TO_STEP':
      return {
        ...state,
        currentStep: action.step,
        direction: action.direction ?? (action.step > state.currentStep ? 'forward' : 'backward'),
      }
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value }
    case 'SET_TYPE':
      return { ...state, type: action.value, categoryId: '' }
    case 'SET_PAYMENT_METHOD':
      return { ...state, paymentMethod: action.value, paymentMethodDetail: '', paymentMethodItemId: '' }
    case 'APPLY_TEMPLATE':
      return {
        ...state,
        type: action.data.type,
        amount: action.data.amount.toLocaleString('ko-KR'),
        categoryId: action.data.categoryId ?? '',
        memo: action.data.memo || '',
        paymentMethod: action.data.paymentMethod || '',
        memberId: action.data.memberId ?? state.memberId,
        currentStep: 3,
        direction: 'forward',
      }
    case 'APPLY_LOAN':
      return {
        ...state,
        type: 'expense',
        amount: action.data.amount.toLocaleString('ko-KR'),
        categoryId: action.data.categoryId,
        memo: action.data.memo,
        currentStep: 3,
        direction: 'forward',
      }
    case 'ADD_AMOUNT': {
      const current = Number(state.amount.replace(/,/g, '')) || 0
      const next = Math.max(0, current + action.delta)
      return { ...state, amount: next > 0 ? next.toLocaleString('ko-KR') : '' }
    }
    case 'CLEAR_AMOUNT':
      return { ...state, amount: '' }
    case 'RESET':
      return getInitialState(action.initialDate, action.defaultMemberId)
    case 'SET_SUBMITTING':
      return { ...state, isSubmitting: action.value }
    case 'SET_SUCCESS':
      return { ...state, isSuccess: action.value }
    default:
      return state
  }
}

// ─── Step Indicator (morph progress) ───────────────

const STEPS = [
  { label: '금액' },
  { label: '카테고리' },
  { label: '상세' },
  { label: '확인' },
] as const

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div
      className="flex items-center justify-center gap-0 mb-6"
      role="progressbar"
      aria-valuenow={currentStep + 1}
      aria-valuemin={1}
      aria-valuemax={STEPS.length}
      aria-label={`거래 기록 ${currentStep + 1} / ${STEPS.length} 단계`}
    >
      {STEPS.map((step, i) => {
        const isCompleted = i < currentStep
        const isCurrent = i === currentStep
        return (
          <div key={i} className="flex items-center">
            <div className="flex flex-col items-center">
              <motion.div
                className={clsx(
                  'relative flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full text-xs font-bold',
                  isCompleted && 'bg-primary-500 text-white',
                  isCurrent && 'border-2 border-primary-500 text-primary-500',
                  !isCompleted && !isCurrent && 'bg-surface-tertiary text-disabled',
                )}
                aria-current={isCurrent ? 'step' : undefined}
                animate={{
                  scale: isCurrent ? 1.06 : 1,
                  boxShadow: isCurrent ? 'var(--el-glow-soft)' : '0 0 0 0 transparent',
                }}
                transition={{ type: 'spring', stiffness: 340, damping: 22 }}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {isCompleted ? (
                    <motion.span
                      key="check"
                      initial={{ scale: 0, rotate: -90 }}
                      animate={{ scale: 1, rotate: 0 }}
                      exit={{ scale: 0 }}
                      transition={{ type: 'spring', stiffness: 480, damping: 22 }}
                    >
                      <Check size={14} />
                    </motion.span>
                  ) : (
                    <motion.span
                      key="num"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: durations.fast }}
                    >
                      {i + 1}
                    </motion.span>
                  )}
                </AnimatePresence>
                {isCurrent && (
                  <motion.span
                    layoutId="wizard-step-dot"
                    className="absolute -bottom-1 w-1 h-1 rounded-full bg-primary-500"
                    aria-hidden="true"
                    transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                  />
                )}
              </motion.div>
              <span
                className={clsx(
                  'mt-1 text-[10px] sm:text-xs font-medium transition-colors',
                  isCurrent ? 'text-primary-500' : isCompleted ? 'text-body' : 'text-disabled',
                )}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className="mx-1 sm:mx-2 h-0.5 w-5 sm:w-10 relative overflow-hidden rounded-full bg-[var(--surface-tertiary)]">
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full bg-primary-500"
                  initial={false}
                  animate={{ width: i < currentStep ? '100%' : '0%' }}
                  transition={{ duration: durations.base, ease: easeOutExpo }}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Amount quick-add chips ────────────────────────

const AMOUNT_PRESETS: { label: string; delta: number }[] = [
  { label: '+1천', delta: 1_000 },
  { label: '+1만', delta: 10_000 },
  { label: '+10만', delta: 100_000 },
  { label: '+100만', delta: 1_000_000 },
]

// ─── Main Component ────────────────────────────────

interface TransactionWizardProps {
  open: boolean
  onClose: () => void
  initialDate?: string | null
}

export function TransactionWizard({ open, onClose, initialDate }: TransactionWizardProps) {
  const addTransaction = useTransactionStore((s) => s.addTransaction)
  const categories = useTransactionStore((s) => s.categories)
  const paymentMethodItems = useTransactionStore((s) => s.paymentMethodItems)
  const transactions = useTransactionStore((s) => s.transactions)
  const members = useMemberStore((s) => s.members)
  const budgets = useBudgetStore((s) => s.budgets)
  const loans = useLoanStore((s) => s.loans)
  const getMonthlyInterest = useLoanStore((s) => s.getMonthlyInterest)
  const loadLoans = useLoanStore((s) => s.loadLoans)
  const activeLoans = useMemo(() => loans.filter(l => l.isActive), [loans])
  const amountRef = useRef<HTMLInputElement>(null)
  const shouldReduceMotion = useReducedMotion()
  const { subtleSuccess } = useConfetti()

  const [state, dispatch] = useReducer(wizardReducer, getInitialState(initialDate ?? undefined, members[0]?.id ?? ''))

  // Reset on open
  useEffect(() => {
    if (open) {
      dispatch({ type: 'RESET', initialDate: initialDate ?? undefined, defaultMemberId: members[0]?.id ?? '' })
      loadLoans()
    }
  }, [open, initialDate, members, loadLoans])

  // Auto-focus amount input when Step 0
  useEffect(() => {
    if (open && state.currentStep === 0) {
      requestAnimationFrame(() => amountRef.current?.focus())
    }
  }, [open, state.currentStep])

  // ─── Derived data ──────────────────────────────

  const numAmount = Number(state.amount.replace(/,/g, '')) || 0

  const currentCategories = useMemo(
    () => categories.filter(c => c.type === state.type),
    [categories, state.type],
  )

  const templates = useMemo(() => {
    const freqMap = new Map<string, { count: number; type: TransactionType; categoryId: number | null; amount: number; memo?: string; paymentMethod?: PaymentMethod; memberId: number | null }>()
    for (const t of transactions) {
      const key = `${t.type}|${t.categoryId}|${t.amount}|${t.memo || ''}`
      const existing = freqMap.get(key)
      if (existing) existing.count++
      else freqMap.set(key, { count: 1, type: t.type, categoryId: t.categoryId, amount: t.amount, memo: t.memo, paymentMethod: t.paymentMethod, memberId: t.memberId })
    }
    return Array.from(freqMap.values()).filter(t => t.count >= 2).sort((a, b) => b.count - a.count).slice(0, 5)
  }, [transactions])

  const budgetWarning = useMemo(() => {
    if (state.type !== 'expense' || !state.categoryId) return null
    const budget = budgets.find(b => b.categoryId === state.categoryId)
    if (!budget) return null
    const used = transactions.filter(t => t.type === 'expense' && t.categoryId === state.categoryId).reduce((sum, t) => sum + t.amount, 0)
    const remaining = budget.amount - used
    const percent = budget.amount > 0 ? (used / budget.amount) * 100 : 0
    return { budgetAmount: budget.amount, used, remaining, percent }
  }, [state.type, state.categoryId, budgets, transactions])

  const itemsForType = useMemo(() => {
    if (!state.paymentMethod || state.paymentMethod === 'cash') return []
    return paymentMethodItems.filter(i => i.type === state.paymentMethod && i.isActive)
  }, [state.paymentMethod, paymentMethodItems])

  // ─── Handlers ──────────────────────────────────

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, '')
    if (raw === '') { dispatch({ type: 'SET_FIELD', field: 'amount', value: '' }); return }
    const num = parseInt(raw, 10)
    dispatch({ type: 'SET_FIELD', field: 'amount', value: num.toLocaleString('ko-KR') })
  }

  const canProceed = state.currentStep === 0 ? numAmount > 0 : true

  const handleSubmit = useCallback(async () => {
    if (numAmount <= 0) return
    dispatch({ type: 'SET_SUBMITTING', value: true })
    try {
      await addTransaction({
        type: state.type,
        amount: numAmount,
        categoryId: state.categoryId ? (state.categoryId as number) : null,
        memberId: state.memberId ? (state.memberId as number) : null,
        date: state.date,
        memo: state.memo.trim() || undefined,
        paymentMethod: state.paymentMethod || undefined,
        paymentMethodDetail: state.paymentMethodDetail.trim() || undefined,
        paymentMethodItemId: state.paymentMethodItemId ? (state.paymentMethodItemId as number) : undefined,
        isRecurring: state.isRecurring,
        recurPattern: state.isRecurring
          ? { type: state.recurType, interval: 1, endDate: state.recurEndDate || undefined }
          : undefined,
      })
      // Success animation, then close
      dispatch({ type: 'SET_SUCCESS', value: true })
      if (!shouldReduceMotion) subtleSuccess()
      setTimeout(() => onClose(), 620)
    } catch {
      useToastStore.getState().addToast('거래 저장에 실패했습니다.', 'error')
      dispatch({ type: 'SET_SUBMITTING', value: false })
    }
  }, [numAmount, state, addTransaction, shouldReduceMotion, subtleSuccess, onClose])

  // ─── Keyboard shortcuts ────────────────────────
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      // Don't steal Enter from input/textarea (amount is handled separately)
      const target = e.target as HTMLElement | null
      const inAmount = target === amountRef.current
      const inInput = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA'
      if (e.key === 'Enter' && (inAmount || !inInput)) {
        if (state.currentStep < 3 && canProceed) {
          e.preventDefault()
          dispatch({ type: 'NEXT_STEP' })
        } else if (state.currentStep === 3 && !state.isSubmitting) {
          e.preventDefault()
          handleSubmit()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, state.currentStep, state.isSubmitting, canProceed, handleSubmit])

  // ─── Step motion variants ──────────────────────
  const stepVariants = shouldReduceMotion
    ? {
        enter: { opacity: 0 },
        center: { opacity: 1 },
        exit: { opacity: 0 },
      }
    : {
        enter: (dir: 'forward' | 'backward') => ({ x: dir === 'forward' ? 32 : -32, opacity: 0 }),
        center: { x: 0, opacity: 1 },
        exit: (dir: 'forward' | 'backward') => ({ x: dir === 'forward' ? -32 : 32, opacity: 0 }),
      }

  const gridStagger = shouldReduceMotion
    ? { hidden: {}, visible: {} }
    : { hidden: {}, visible: { transition: { staggerChildren: 0.028 } } }
  const gridItem = shouldReduceMotion
    ? { hidden: { opacity: 0 }, visible: { opacity: 1 } }
    : { hidden: { opacity: 0, y: 8, scale: 0.95 }, visible: { opacity: 1, y: 0, scale: 1, transition: springSnappy } }

  const getYesterdayString = () => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return d.toISOString().split('T')[0]
  }

  // ─── Step 0: Amount + Type + Member ────────────

  const renderStep0 = () => (
    <div className="space-y-5">
      {/* Quick Start — mini cards */}
      {(templates.length > 0 || activeLoans.length > 0) && (
        <div className="space-y-3 pb-4 border-b border-base">
          {templates.length > 0 && (
            <div>
              <label className="flex items-center gap-1 text-caption text-sub mb-2">
                <Zap className="w-3.5 h-3.5" />
                빠른 입력
              </label>
              <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1 -mx-1 px-1">
                {templates.map((tmpl, i) => {
                  const cat = tmpl.categoryId ? categories.find(c => c.id === tmpl.categoryId) : null
                  const Icon = getCategoryIcon(cat?.icon)
                  const color = cat?.color || '#71717a'
                  return (
                    <motion.button
                      key={i}
                      type="button"
                      onClick={() => dispatch({ type: 'APPLY_TEMPLATE', data: tmpl })}
                      className={clsx(
                        'flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border border-base',
                        'bg-surface-secondary hover:bg-[var(--hover-bg)] el-hover',
                      )}
                      whileHover={shouldReduceMotion ? undefined : { y: -2 }}
                      whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
                      transition={springSnappy}
                    >
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${color}18` }}
                      >
                        <Icon className="w-3.5 h-3.5" style={{ color }} />
                      </div>
                      <div className="flex flex-col items-start min-w-0">
                        <span className="text-[11px] text-sub truncate max-w-[96px]">
                          {cat?.name || '미분류'}
                        </span>
                        <span className="text-caption font-semibold text-heading tabular-nums">
                          {formatKoreanUnit(tmpl.amount)}원
                        </span>
                      </div>
                      <span className="text-[10px] text-disabled tabular-nums ml-1">×{tmpl.count}</span>
                    </motion.button>
                  )
                })}
              </div>
            </div>
          )}
          {activeLoans.length > 0 && (
            <div>
              <label className="flex items-center gap-1 text-caption text-sub mb-2">
                <Landmark className="w-3.5 h-3.5" />
                대출이자 불러오기
              </label>
              <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1 -mx-1 px-1">
                {activeLoans.map(loan => {
                  const interest = getMonthlyInterest(loan)
                  const interestCat = categories.find(c => c.type === 'expense' && c.name.includes('대출이자'))
                  return (
                    <motion.button
                      key={loan.id}
                      type="button"
                      onClick={() => dispatch({
                        type: 'APPLY_LOAN',
                        data: {
                          amount: interest,
                          categoryId: interestCat?.id ?? '',
                          memo: `${loan.name} 이자 (잔액 ${loan.currentBalance.toLocaleString('ko-KR')}원 × 연 ${loan.annualRate}%)`,
                        },
                      })}
                      className="flex-shrink-0 flex flex-col items-start gap-0.5 px-3 py-2 rounded-xl border border-red-200/50 dark:border-red-800/40 bg-red-50/60 dark:bg-red-900/15 hover:bg-red-100/60 dark:hover:bg-red-900/25"
                      whileHover={shouldReduceMotion ? undefined : { y: -2 }}
                      whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
                      transition={springSnappy}
                    >
                      <span className="text-[11px] text-red-700 dark:text-red-300 truncate max-w-[140px]">
                        {loan.name}
                      </span>
                      <span className="text-caption font-semibold text-red-800 dark:text-red-200 tabular-nums">
                        {formatKoreanUnit(interest)}원<span className="text-[10px] text-red-600/70 dark:text-red-400/70 ml-0.5">/월</span>
                      </span>
                    </motion.button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Type Toggle */}
      <div>
        <label className="block text-body3 text-body mb-2">유형</label>
        <div className="flex gap-2" role="radiogroup" aria-label="거래 유형">
          {(['expense', 'income'] as const).map((t) => {
            const active = state.type === t
            return (
              <motion.button
                key={t}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => dispatch({ type: 'SET_TYPE', value: t })}
                className={clsx(
                  'flex-1 py-2.5 px-4 rounded-lg text-body3 font-medium',
                  active
                    ? t === 'expense'
                      ? 'bg-status-danger text-red-700 dark:text-red-400 ring-1 ring-red-200 dark:ring-red-800'
                      : 'bg-status-success text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-200 dark:ring-emerald-800'
                    : 'bg-surface-tertiary text-sub hover:bg-[var(--hover-bg)]',
                )}
                whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
                animate={{ scale: active ? 1.015 : 1 }}
                transition={springSnappy}
              >
                {t === 'expense' ? '지출' : '수입'}
              </motion.button>
            )
          })}
        </div>
      </div>

      {/* Hero Amount Input */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label htmlFor="wizard-amount-input" className="text-body3 text-body">금액</label>
          {numAmount > 0 && (
            <button
              type="button"
              onClick={() => dispatch({ type: 'CLEAR_AMOUNT' })}
              className="inline-flex items-center gap-1 text-caption text-sub hover:text-heading transition-colors"
              aria-label="금액 지우기"
            >
              <Eraser className="w-3.5 h-3.5" />
              지우기
            </button>
          )}
        </div>
        <motion.div
          className="wizard-amount-wrap rounded-xl border-2 border-base focus-within:border-primary-400 dark:focus-within:border-primary-400 focus-within:wizard-amount-glow"
          animate={{
            boxShadow: numAmount > 0
              ? '0 8px 32px var(--glow-primary)'
              : '0 0 0 0 transparent',
          }}
          transition={{ duration: durations.base, ease: easeOutExpo }}
        >
          <div className="relative py-4 px-4">
            <input
              id="wizard-amount-input"
              ref={amountRef}
              type="text"
              inputMode="numeric"
              value={state.amount}
              onChange={handleAmountChange}
              placeholder="0"
              aria-label="금액"
              className="w-full bg-transparent text-center text-financial-fluid tabular-nums text-heading placeholder-[var(--text-disabled)] outline-none"
              style={{ letterSpacing: '-0.015em' }}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-lg text-disabled font-medium">원</span>
          </div>
        </motion.div>
        <AnimatePresence mode="wait">
          {numAmount > 0 && (
            <motion.p
              key="preview"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: durations.fast }}
              className="mt-1.5 text-center text-caption text-disabled tabular-nums"
            >
              {formatKoreanUnit(numAmount)}원
            </motion.p>
          )}
        </AnimatePresence>

        {/* Amount quick-add chips */}
        <div className="mt-3 grid grid-cols-4 gap-2" role="group" aria-label="빠른 금액 추가">
          {AMOUNT_PRESETS.map((p) => (
            <motion.button
              key={p.delta}
              type="button"
              onClick={() => dispatch({ type: 'ADD_AMOUNT', delta: p.delta })}
              className="py-2 px-1 rounded-lg text-caption font-medium bg-surface-tertiary text-body hover:bg-[var(--hover-bg)] el-hover inline-flex items-center justify-center gap-0.5"
              whileTap={shouldReduceMotion ? undefined : { scale: 0.94 }}
              transition={springSnappy}
              aria-label={`금액 ${p.label.replace('+', '')} 추가`}
            >
              <Plus className="w-3 h-3 opacity-70" />
              {p.label.replace('+', '')}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Member */}
      {members.length > 0 && (
        <div>
          <label className="block text-body3 text-body mb-2">구성원</label>
          <div className="flex gap-2" role="group" aria-label="구성원 선택">
            {members.length <= 4 ? (
              <>
                <motion.button
                  type="button"
                  onClick={() => dispatch({ type: 'SET_FIELD', field: 'memberId', value: '' })}
                  className={clsx(
                    'px-3 py-2 rounded-lg text-body3',
                    state.memberId === ''
                      ? 'bg-[var(--surface-tertiary)] text-heading ring-1 ring-[var(--border-default)]'
                      : 'bg-surface-tertiary text-sub hover:bg-[var(--hover-bg)]',
                  )}
                  whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
                >
                  미지정
                </motion.button>
                {members.map(m => (
                  <motion.button
                    key={m.id}
                    type="button"
                    onClick={() => dispatch({ type: 'SET_FIELD', field: 'memberId', value: m.id! })}
                    className={clsx(
                      'flex-1 py-2 px-4 rounded-lg text-body3',
                      state.memberId === m.id
                        ? 'text-white ring-1'
                        : 'bg-surface-tertiary text-sub hover:bg-[var(--hover-bg)]',
                    )}
                    style={state.memberId === m.id ? { backgroundColor: m.color, boxShadow: `0 0 0 1px ${m.color}` } : undefined}
                    whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
                    animate={{ scale: state.memberId === m.id ? 1.02 : 1 }}
                    transition={springSnappy}
                  >
                    {m.name}
                  </motion.button>
                ))}
              </>
            ) : (
              <Select
                value={String(state.memberId)}
                onChange={(v) => dispatch({ type: 'SET_FIELD', field: 'memberId', value: v ? Number(v) : '' })}
                options={members.map(m => ({ value: String(m.id), label: m.name }))}
                placeholder="미지정"
              />
            )}
          </div>
        </div>
      )}
    </div>
  )

  // ─── Step 1: Category ──────────────────────────

  const renderStep1 = () => (
    <div className="space-y-4">
      <label className="block text-body3 text-body">
        {state.type === 'expense' ? '지출' : '수입'} 카테고리
      </label>

      <motion.div
        className="grid grid-cols-4 sm:grid-cols-5 gap-2.5 max-h-[280px] overflow-y-auto scrollbar-none"
        role="radiogroup"
        aria-label="카테고리 선택"
        variants={gridStagger}
        initial="hidden"
        animate="visible"
      >
        {currentCategories.map(cat => {
          const Icon = getCategoryIcon(cat.icon)
          const isSelected = state.categoryId === cat.id
          return (
            <motion.button
              key={cat.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              variants={gridItem}
              onClick={() => dispatch({ type: 'SET_FIELD', field: 'categoryId', value: isSelected ? '' : cat.id! })}
              whileTap={shouldReduceMotion ? undefined : { scale: 0.94 }}
              whileHover={shouldReduceMotion ? undefined : { y: -2 }}
              animate={{ scale: isSelected ? 1.04 : 1 }}
              transition={springSnappy}
              className={clsx(
                'flex flex-col items-center gap-1.5 p-2.5 sm:p-3 rounded-xl border',
                isSelected ? 'border-transparent' : 'bg-surface-secondary border-base hover:border-[var(--border-default)]',
              )}
              style={isSelected ? {
                backgroundColor: `${cat.color}14`,
                borderColor: `${cat.color}40`,
                boxShadow: `0 0 16px -4px ${cat.color}30`,
              } : undefined}
            >
              <div
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: isSelected ? `${cat.color}20` : `${cat.color}12` }}
              >
                <Icon className="w-4.5 h-4.5 sm:w-5 sm:h-5" style={{ color: cat.color }} />
              </div>
              <span className={clsx(
                'text-[11px] sm:text-caption truncate max-w-full font-medium',
                isSelected ? 'text-heading' : 'text-sub',
              )}>
                {cat.name}
              </span>
            </motion.button>
          )
        })}

        {/* 미분류 */}
        <motion.button
          type="button"
          role="radio"
          aria-checked={state.categoryId === ''}
          variants={gridItem}
          onClick={() => dispatch({ type: 'SET_FIELD', field: 'categoryId', value: '' })}
          whileTap={shouldReduceMotion ? undefined : { scale: 0.94 }}
          whileHover={shouldReduceMotion ? undefined : { y: -2 }}
          transition={springSnappy}
          className={clsx(
            'flex flex-col items-center gap-1.5 p-2.5 sm:p-3 rounded-xl border',
            state.categoryId === ''
              ? 'bg-surface-tertiary border-[var(--border-default)]'
              : 'bg-surface-secondary border-base',
          )}
        >
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center bg-surface-tertiary">
            <MoreHorizontal className="w-4.5 h-4.5 sm:w-5 sm:h-5 text-disabled" />
          </div>
          <span className="text-[11px] sm:text-caption truncate max-w-full font-medium text-sub">
            미분류
          </span>
        </motion.button>
      </motion.div>

      {/* Budget Warning */}
      <AnimatePresence>
        {budgetWarning && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: durations.fast }}
            className={clsx(
              'px-3 py-2.5 rounded-lg text-caption',
              budgetWarning.percent > 100
                ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                : budgetWarning.percent >= 80
                  ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
                  : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400',
            )}
          >
            {budgetWarning.percent > 100
              ? `예산 ${formatKoreanUnit(budgetWarning.budgetAmount)}원 중 ${formatKoreanUnit(budgetWarning.used)}원 사용 (${formatKoreanUnit(Math.abs(budgetWarning.remaining))}원 초과!)`
              : `예산 ${formatKoreanUnit(budgetWarning.budgetAmount)}원 중 ${formatKoreanUnit(budgetWarning.used)}원 사용 (${formatKoreanUnit(budgetWarning.remaining)}원 남음)`
            }
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )

  // ─── Step 2: Details ───────────────────────────

  const today = getTodayString()
  const yesterday = getYesterdayString()

  const renderStep2 = () => (
    <div className="space-y-5">
      {/* Date */}
      <div>
        <label className="block text-body3 text-body mb-2">날짜</label>
        <div className="flex gap-2 mb-2">
          {[
            { label: '오늘', value: today },
            { label: '어제', value: yesterday },
          ].map(chip => (
            <motion.button
              key={chip.value}
              type="button"
              onClick={() => dispatch({ type: 'SET_FIELD', field: 'date', value: chip.value })}
              whileTap={shouldReduceMotion ? undefined : { scale: 0.95 }}
              transition={springSnappy}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-caption font-medium',
                state.date === chip.value
                  ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 ring-1 ring-primary-300 dark:ring-primary-700'
                  : 'bg-surface-tertiary text-sub hover:bg-[var(--hover-bg)]',
              )}
            >
              {chip.label}
            </motion.button>
          ))}
        </div>
        <input
          type="date"
          value={state.date}
          onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'date', value: e.target.value })}
          className="input-base"
        />
      </div>

      {/* Payment Method */}
      <div>
        <label className="block text-body3 text-body mb-2">거래수단 (선택)</label>
        <div className="grid grid-cols-3 gap-2">
          {PAYMENT_METHOD_OPTIONS.map(opt => (
            <motion.button
              key={opt.value}
              type="button"
              onClick={() => dispatch({ type: 'SET_PAYMENT_METHOD', value: state.paymentMethod === opt.value ? '' : opt.value })}
              whileTap={shouldReduceMotion ? undefined : { scale: 0.95 }}
              transition={springSnappy}
              className={clsx(
                'py-2 px-2 rounded-lg text-caption text-center',
                state.paymentMethod === opt.value
                  ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 ring-1 ring-primary-300 dark:ring-primary-700'
                  : 'bg-surface-tertiary text-sub hover:bg-[var(--hover-bg)]',
              )}
            >
              {opt.label}
            </motion.button>
          ))}
        </div>

        <AnimatePresence>
          {state.paymentMethod && state.paymentMethod !== 'cash' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: durations.base, ease: easeOutExpo }}
              className="mt-2.5 overflow-hidden"
            >
              {itemsForType.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {itemsForType.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        dispatch({ type: 'SET_FIELD', field: 'paymentMethodItemId', value: item.id! })
                        dispatch({ type: 'SET_FIELD', field: 'paymentMethodDetail', value: item.name })
                      }}
                      className={clsx(
                        'px-3 py-1.5 rounded-lg text-caption transition-colors',
                        state.paymentMethodItemId === item.id
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 ring-1 ring-blue-300 dark:ring-blue-700'
                          : 'bg-surface-secondary text-sub hover:bg-[var(--hover-bg)]',
                      )}
                    >
                      {item.name}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => { dispatch({ type: 'SET_FIELD', field: 'paymentMethodItemId', value: '' }); dispatch({ type: 'SET_FIELD', field: 'paymentMethodDetail', value: '' }) }}
                    className={clsx(
                      'px-3 py-1.5 rounded-lg text-caption transition-colors',
                      state.paymentMethodItemId === ''
                        ? 'bg-[var(--surface-tertiary)] text-heading'
                        : 'bg-surface-secondary text-sub hover:bg-[var(--hover-bg)]',
                    )}
                  >
                    직접 입력
                  </button>
                </div>
              )}
              {state.paymentMethodItemId === '' && (
                <input
                  type="text"
                  value={state.paymentMethodDetail}
                  onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'paymentMethodDetail', value: e.target.value })}
                  placeholder="카드/계좌명 입력 (예: 신한카드)"
                  className="input-base text-caption"
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Memo */}
      <div>
        <label htmlFor="wizard-memo" className="block text-body3 text-body mb-1.5">메모 (선택)</label>
        <input
          id="wizard-memo"
          type="text"
          value={state.memo}
          onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'memo', value: e.target.value })}
          placeholder="메모를 입력하세요"
          className="input-base"
        />
      </div>

      {/* Recurring */}
      <div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={state.isRecurring}
            onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'isRecurring', value: e.target.checked })}
            className="check"
          />
          <span className="text-body3 text-body">반복 거래</span>
        </label>
      </div>
      <AnimatePresence>
        {state.isRecurring && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: durations.base, ease: easeOutExpo }}
            className="grid grid-cols-2 gap-3 overflow-hidden"
          >
            <div>
              <label className="block text-body3 text-body mb-1.5">반복 주기</label>
              <Select
                value={state.recurType}
                onChange={(v) => dispatch({ type: 'SET_FIELD', field: 'recurType', value: v as RepeatType })}
                options={[
                  { value: 'monthly', label: '매월' },
                  { value: 'weekly', label: '매주' },
                  { value: 'daily', label: '매일' },
                  { value: 'yearly', label: '매년' },
                ]}
              />
            </div>
            <div>
              <label className="block text-body3 text-body mb-1.5">종료일 (선택)</label>
              <input
                type="date"
                value={state.recurEndDate}
                onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'recurEndDate', value: e.target.value })}
                className="input-base"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )

  // ─── Step 3: Review (Hero variant) ─────────────

  const renderStep3 = () => {
    const cat = state.categoryId ? categories.find(c => c.id === state.categoryId) : null
    const member = state.memberId ? members.find(m => m.id === state.memberId) : null
    const payLabel = state.paymentMethod ? getPaymentMethodLabel(state.paymentMethod) : ''
    const payDetail = state.paymentMethodDetail ? ` · ${state.paymentMethodDetail}` : ''
    const recurLabels: Record<string, string> = { monthly: '매월', weekly: '매주', daily: '매일', yearly: '매년' }

    const rows: { label: string; value: string; step: number; color?: string }[] = [
      { label: '유형', value: state.type === 'expense' ? '지출' : '수입', step: 0 },
      { label: '카테고리', value: cat?.name || '미분류', step: 1, color: cat?.color },
      { label: '날짜', value: formatDate(state.date), step: 2 },
      { label: '구성원', value: member?.name || '미지정', step: 0 },
      { label: '거래수단', value: payLabel ? `${payLabel}${payDetail}` : '미지정', step: 2 },
      { label: '메모', value: state.memo.trim() || '-', step: 2 },
    ]
    if (state.isRecurring) {
      rows.push({
        label: '반복',
        value: `${recurLabels[state.recurType] || state.recurType}${state.recurEndDate ? ` (~${formatDate(state.recurEndDate)})` : ''}`,
        step: 2,
      })
    }

    const isExpense = state.type === 'expense'

    return (
      <div className="space-y-4">
        <div className="rounded-2xl overflow-hidden el-card-elevated">
          {/* Hero Amount — variant colored */}
          <div
            className={clsx(
              'relative overflow-hidden py-6 text-center noise-overlay',
              isExpense ? 'hero-gradient-warning' : 'hero-gradient-success',
            )}
          >
            <div className="relative z-10">
              <p className="text-white/70 text-caption mb-1">
                {isExpense ? '지출' : '수입'}
              </p>
              <motion.p
                key={state.amount}
                initial={shouldReduceMotion ? undefined : { scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={springSnappy}
                className="text-financial-fluid text-white tabular-nums tracking-tight"
              >
                {state.amount || '0'}
                <span className="text-lg text-white/60 ml-1">원</span>
              </motion.p>
            </div>
          </div>

          {/* Detail Rows */}
          <div className="divide-y divide-[var(--border-default)] bg-surface-primary">
            {rows.map((row) => (
              <div key={row.label} className="flex items-center justify-between px-4 py-3">
                <span className="text-caption text-sub">{row.label}</span>
                <div className="flex items-center gap-2">
                  {row.color && (
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: row.color }} />
                  )}
                  <span className="text-body3 text-heading">{row.value}</span>
                  <motion.button
                    type="button"
                    onClick={() => dispatch({ type: 'GO_TO_STEP', step: row.step, direction: 'backward' })}
                    className="p-1 rounded hover:bg-[var(--hover-bg)]"
                    aria-label={`${row.label} 수정`}
                    whileHover={shouldReduceMotion ? undefined : { scale: 1.15 }}
                    whileTap={shouldReduceMotion ? undefined : { scale: 0.92 }}
                  >
                    <Pencil className="w-3.5 h-3.5 text-disabled hover:text-heading" />
                  </motion.button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Budget Warning */}
        {budgetWarning && (
          <div className={clsx(
            'px-3 py-2.5 rounded-lg text-caption',
            budgetWarning.percent > 100
              ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
              : budgetWarning.percent >= 80
                ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
                : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400',
          )}>
            {budgetWarning.percent > 100
              ? `예산 ${formatKoreanUnit(budgetWarning.budgetAmount)}원 중 ${formatKoreanUnit(budgetWarning.used)}원 사용 (${formatKoreanUnit(Math.abs(budgetWarning.remaining))}원 초과!)`
              : `예산 ${formatKoreanUnit(budgetWarning.budgetAmount)}원 중 ${formatKoreanUnit(budgetWarning.used)}원 사용 (${formatKoreanUnit(budgetWarning.remaining)}원 남음)`
            }
          </div>
        )}
      </div>
    )
  }

  // ─── Render ────────────────────────────────────

  const stepRenderers = [renderStep0, renderStep1, renderStep2, renderStep3]

  return (
    <Dialog open={open} onClose={onClose} size="md" noPadding>
      <div className="px-6 pt-6 sm:px-8 sm:pt-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-title2 font-semibold text-heading">새 거래 기록</h2>
          <button
            onClick={onClose}
            className="touch-target-icon text-sub hover:text-heading hover:bg-[var(--hover-bg)] transition-colors rounded-lg"
            aria-label="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <StepIndicator currentStep={state.currentStep} />

        {/* SR-only step announcement */}
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {`${STEPS[state.currentStep].label} 단계 (${state.currentStep + 1} / ${STEPS.length})`}
        </div>
      </div>

      {/* Step Content — AnimatePresence wraps */}
      <div className="px-6 sm:px-8 pb-2 overflow-y-auto max-h-[calc(100dvh-280px)] sm:max-h-[420px]">
        <AnimatePresence mode="wait" custom={state.direction}>
          <motion.div
            key={state.currentStep}
            custom={state.direction}
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: durations.base, ease: easeOutExpo }}
          >
            {stepRenderers[state.currentStep]()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="px-6 sm:px-8 py-4 sm:py-5 pb-[max(1rem,env(safe-area-inset-bottom,0px))] border-t border-base">
        <div className="flex items-center justify-between gap-3">
          {state.currentStep > 0 ? (
            <Button
              variant="ghost"
              size="md"
              onClick={() => dispatch({ type: 'PREV_STEP' })}
              disabled={state.isSubmitting || state.isSuccess}
            >
              <ChevronLeft className="w-4 h-4 -ml-1" />
              이전
            </Button>
          ) : (
            <Button variant="secondary" size="md" onClick={onClose}>
              취소
            </Button>
          )}

          {state.currentStep < 3 ? (
            <Button
              variant="primary"
              size="md"
              onClick={() => dispatch({ type: 'NEXT_STEP' })}
              disabled={!canProceed}
            >
              다음
              <ChevronRight className="w-4 h-4 -mr-1" />
            </Button>
          ) : (
            <Button
              variant="primary"
              size="md"
              onClick={handleSubmit}
              disabled={state.isSubmitting || state.isSuccess || numAmount <= 0}
              className={clsx(state.isSuccess && 'el-success')}
            >
              {state.isSuccess ? (
                <span className="inline-flex items-center gap-1">
                  <Check className="w-4 h-4" />
                  저장됨
                </span>
              ) : state.isSubmitting ? '저장 중...' : '기록하기'}
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  )
}
