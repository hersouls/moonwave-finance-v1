import { useReducer, useEffect, useMemo, useRef, useCallback } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Dialog } from '@/components/ui/Dialog'
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
  Plus, Eraser, X, Calendar as CalendarIcon, ChevronDown,
} from 'lucide-react'
import { MiniCalendar } from '@/components/ui/MiniCalendar'
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
  showCalendar: boolean
  showEndDateCalendar: boolean
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
    showCalendar: false,
    showEndDateCalendar: false,
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
  const contentRef = useRef<HTMLDivElement>(null)
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

  // Reset scroll position on step change
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0
    }
  }, [state.currentStep])

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
    <div className="space-y-6">
      {/* Quick Start — mini cards (KT style) */}
      {(templates.length > 0 || activeLoans.length > 0) && (
        <div className="space-y-3 pb-5 border-b border-base">
          {templates.length > 0 && (
            <div>
              <label className="flex items-center gap-1.5 text-caption text-sub mb-2.5 font-medium">
                <Zap className="w-3.5 h-3.5 text-[color:var(--color-primary-500)]" />
                빠른 입력
              </label>
              <div className="flex gap-2.5 overflow-x-auto scrollbar-none pb-1 -mx-1 px-1">
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
                        'flex-shrink-0 flex items-center gap-2.5 pl-2.5 pr-3.5 py-2.5 rounded-2xl',
                        'bg-surface-primary ring-1 ring-base hover:ring-[color:var(--color-primary-300)]',
                        'shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] el-hover transition-all',
                      )}
                      whileHover={shouldReduceMotion ? undefined : { y: -2 }}
                      whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
                      transition={springSnappy}
                    >
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${color}1a` }}
                      >
                        <Icon className="w-4 h-4" style={{ color }} />
                      </div>
                      <div className="flex flex-col items-start min-w-0 max-w-[120px]">
                        <span className="text-[11px] text-sub truncate w-full leading-tight">
                          {cat?.name || '미분류'}
                        </span>
                        <span className="text-body3 font-bold text-heading tabular-nums truncate w-full leading-tight">
                          {formatKoreanUnit(tmpl.amount)}원
                        </span>
                      </div>
                      <span className="text-[10px] text-disabled tabular-nums font-semibold px-1.5 py-0.5 rounded-full bg-surface-tertiary flex-shrink-0">×{tmpl.count}</span>
                    </motion.button>
                  )
                })}
              </div>
            </div>
          )}
          {activeLoans.length > 0 && (
            <div>
              <label className="flex items-center gap-1.5 text-caption text-sub mb-2.5 font-medium">
                <Landmark className="w-3.5 h-3.5 text-status-danger" />
                대출이자 불러오기
              </label>
              <div className="flex gap-2.5 overflow-x-auto scrollbar-none pb-1 -mx-1 px-1">
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
                      className="flex-shrink-0 flex flex-col items-start gap-0.5 px-3.5 py-2.5 rounded-2xl bg-status-danger-soft ring-1 min-w-0 max-w-[200px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition-all"
                      style={{ boxShadow: 'inset 0 0 0 1px var(--status-danger-border)' }}
                      whileHover={shouldReduceMotion ? undefined : { y: -2 }}
                      whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
                      transition={springSnappy}
                    >
                      <span className="text-[11px] text-status-danger truncate w-full leading-tight">
                        {loan.name}
                      </span>
                      <span className="text-body3 font-bold text-status-danger tabular-nums truncate w-full leading-tight">
                        {formatKoreanUnit(interest)}원
                        <span className="text-[10px] opacity-70 ml-0.5 font-medium">/월</span>
                      </span>
                    </motion.button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Type Toggle — pill segment (KT style) */}
      <div>
        <label className="block text-label2 text-sub mb-2.5">유형</label>
        <div
          className="relative inline-flex w-full p-1.5 rounded-full bg-surface-tertiary ring-1 ring-base"
          role="radiogroup"
          aria-label="거래 유형"
        >
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
                  'relative flex-1 py-2.5 px-4 rounded-full text-body3 font-bold z-10 transition-colors min-h-[44px]',
                  active ? 'text-white' : 'text-sub hover:text-heading',
                )}
                whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
                transition={springSnappy}
              >
                {active && (
                  <motion.span
                    layoutId="wizard-type-pill"
                    className="absolute inset-0 rounded-full -z-10"
                    style={{
                      background: t === 'expense'
                        ? 'linear-gradient(135deg, oklch(0.60 0.22 25), oklch(0.50 0.22 25))'
                        : 'linear-gradient(135deg, oklch(0.58 0.18 145), oklch(0.48 0.17 145))',
                      boxShadow: t === 'expense'
                        ? '0 6px 20px -4px color-mix(in srgb, var(--value-negative) 40%, transparent)'
                        : '0 6px 20px -4px color-mix(in srgb, var(--value-positive) 40%, transparent)',
                    }}
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                {t === 'expense' ? '지출' : '수입'}
              </motion.button>
            )
          })}
        </div>
      </div>

      {/* Hero Amount Input — KT-style display */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <label htmlFor="wizard-amount-input" className="text-label2 text-sub">금액</label>
          {numAmount > 0 && (
            <motion.button
              type="button"
              onClick={() => dispatch({ type: 'CLEAR_AMOUNT' })}
              className="inline-flex items-center gap-1 text-caption text-sub hover:text-heading transition-colors"
              aria-label="금액 지우기"
              whileTap={shouldReduceMotion ? undefined : { scale: 0.94 }}
            >
              <Eraser className="w-3.5 h-3.5" />
              지우기
            </motion.button>
          )}
        </div>
        <motion.div
          className={clsx(
            'relative overflow-hidden rounded-2xl px-5 py-6 transition-all',
            numAmount > 0 ? 'ring-1 ring-[color:var(--color-primary-400)]/40' : 'ring-1 ring-base',
          )}
          style={{
            background: numAmount > 0
              ? `linear-gradient(135deg,
                  color-mix(in srgb, var(--color-primary-500) 10%, var(--surface-primary)) 0%,
                  color-mix(in srgb, var(--color-primary-500) 4%, var(--surface-primary)) 100%)`
              : 'var(--surface-tertiary)',
            boxShadow: numAmount > 0
              ? '0 16px 40px -12px color-mix(in srgb, var(--color-primary-500) 22%, transparent), inset 0 1px 0 0 color-mix(in srgb, #fff 50%, transparent)'
              : 'inset 0 1px 0 0 color-mix(in srgb, #fff 40%, transparent)',
          }}
          animate={{ scale: numAmount > 0 ? 1 : 1 }}
          transition={{ duration: durations.base, ease: easeOutExpo }}
        >
          {/* Subtle noise overlay when active */}
          {numAmount > 0 && (
            <div
              aria-hidden="true"
              className="absolute inset-0 pointer-events-none opacity-[0.025]"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
                backgroundSize: '128px 128px',
              }}
            />
          )}

          <div className="relative">
            <p className="text-caption text-sub mb-2 font-semibold tracking-wide uppercase opacity-80">
              {state.type === 'expense' ? '지출 금액' : '수입 금액'}
            </p>
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <input
                id="wizard-amount-input"
                ref={amountRef}
                type="text"
                inputMode="numeric"
                value={state.amount}
                onChange={handleAmountChange}
                placeholder="0"
                aria-label="금액"
                className={clsx(
                  'bg-transparent tabular-nums outline-none font-extrabold min-w-0 max-w-full',
                  numAmount > 0 ? 'text-heading' : 'text-disabled',
                )}
                style={{
                  fontSize: 'clamp(28px, 8vw, 42px)',
                  letterSpacing: '-0.025em',
                  lineHeight: 1.1,
                  width: `${Math.max(state.amount.length || 1, 1)}ch`,
                  flexShrink: 0,
                }}
              />
              <span
                className={clsx(
                  'font-bold tabular-nums flex-shrink-0',
                  numAmount > 0 ? 'text-heading/80' : 'text-disabled',
                )}
                style={{ fontSize: 'clamp(16px, 3.5vw, 20px)', lineHeight: 1.2 }}
              >
                원
              </span>
            </div>
            <AnimatePresence mode="wait">
              {numAmount > 0 && (
                <motion.p
                  key="preview"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: durations.fast }}
                  className="mt-2 text-caption text-[color:var(--color-primary-700)] dark:text-[color:var(--color-primary-300)] tabular-nums font-medium"
                >
                  {formatKoreanUnit(numAmount)}원
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Amount quick-add chips — pill form */}
        <div className="mt-3 grid grid-cols-4 gap-2" role="group" aria-label="빠른 금액 추가">
          {AMOUNT_PRESETS.map((p) => (
            <motion.button
              key={p.delta}
              type="button"
              onClick={() => dispatch({ type: 'ADD_AMOUNT', delta: p.delta })}
              className="py-3 px-1 rounded-full text-body3 font-semibold bg-surface-tertiary text-heading hover:bg-[var(--hover-bg)] ring-1 ring-base hover:ring-[color:var(--color-primary-300)] el-hover inline-flex items-center justify-center gap-1 transition-all min-h-[44px]"
              whileTap={shouldReduceMotion ? undefined : { scale: 0.94 }}
              transition={springSnappy}
              aria-label={`금액 ${p.label.replace('+', '')} 추가`}
            >
              <Plus className="w-3.5 h-3.5 opacity-60" />
              <span className="tabular-nums">{p.label.replace('+', '')}</span>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Member — pill chips */}
      {members.length > 0 && (
        <div>
          <label className="block text-label2 text-sub mb-2.5">구성원</label>
          <div className="flex flex-wrap gap-2" role="group" aria-label="구성원 선택">
            {members.length <= 4 ? (
              <>
                <motion.button
                  type="button"
                  onClick={() => dispatch({ type: 'SET_FIELD', field: 'memberId', value: '' })}
                  className={clsx(
                    'px-5 py-3 rounded-full text-body3 font-semibold ring-1 min-h-[44px]',
                    state.memberId === ''
                      ? 'bg-surface-primary text-heading ring-[color:var(--border-strong)] shadow-[0_2px_8px_rgba(0,0,0,0.06)]'
                      : 'bg-surface-tertiary text-sub ring-transparent hover:bg-[var(--hover-bg)]',
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
                      'flex-1 py-3 px-4 rounded-full text-body3 font-semibold ring-1 min-w-[72px] min-h-[44px]',
                      state.memberId === m.id
                        ? 'text-white ring-transparent'
                        : 'bg-surface-tertiary text-sub ring-transparent hover:bg-[var(--hover-bg)]',
                    )}
                    style={state.memberId === m.id
                      ? {
                          background: `linear-gradient(135deg, ${m.color}, color-mix(in srgb, ${m.color} 82%, #000))`,
                          boxShadow: `0 6px 20px -4px color-mix(in srgb, ${m.color} 40%, transparent)`,
                        }
                      : undefined}
                    whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
                    animate={{ scale: state.memberId === m.id ? 1.03 : 1 }}
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
    <div className="space-y-5">
      <div>
        <label className="block text-label2 text-sub mb-1">
          {state.type === 'expense' ? '지출' : '수입'} 카테고리
        </label>
        <p className="text-caption text-disabled">아이콘을 선택하세요</p>
      </div>

      <motion.div
        className="grid grid-cols-3 xs:grid-cols-4 sm:grid-cols-5 gap-2.5 sm:gap-3 max-h-[320px] overflow-y-auto scrollbar-none -mx-1 px-1 py-1"
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
              whileHover={shouldReduceMotion ? undefined : { y: -3 }}
              animate={{ scale: isSelected ? 1.04 : 1 }}
              transition={springSnappy}
              className={clsx(
                'flex flex-col items-center justify-center gap-2 px-2 py-3.5 sm:py-4 rounded-2xl ring-1 transition-all min-h-[88px]',
                isSelected ? 'ring-transparent' : 'bg-surface-primary ring-base hover:ring-[color:var(--border-strong)]',
              )}
              style={isSelected ? {
                backgroundColor: cat.color,
                boxShadow: `0 8px 24px -4px color-mix(in srgb, ${cat.color} 40%, transparent), inset 0 1px 0 0 rgba(255,255,255,0.15)`,
              } : { boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
            >
              <div
                className={clsx(
                  'w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center',
                  isSelected && 'bg-white/20',
                )}
                style={!isSelected ? { backgroundColor: `${cat.color}15` } : undefined}
              >
                <Icon
                  className="w-5 h-5 sm:w-5 sm:h-5"
                  style={{ color: isSelected ? '#ffffff' : cat.color }}
                />
              </div>
              <span className={clsx(
                'text-caption truncate max-w-full font-semibold leading-tight',
                isSelected ? 'text-white' : 'text-heading',
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
          whileHover={shouldReduceMotion ? undefined : { y: -3 }}
          transition={springSnappy}
          className={clsx(
            'flex flex-col items-center justify-center gap-2 px-2 py-3.5 sm:py-4 rounded-2xl ring-1 transition-all min-h-[88px]',
            state.categoryId === ''
              ? 'bg-surface-tertiary ring-[color:var(--border-strong)]'
              : 'bg-surface-primary ring-base',
          )}
          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
        >
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center bg-surface-tertiary">
            <MoreHorizontal className="w-5 h-5 text-disabled" />
          </div>
          <span className="text-caption truncate max-w-full font-semibold text-sub leading-tight">
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
    <div className="space-y-6">
      {/* Date */}
      <div>
        <label className="block text-label2 text-sub mb-2.5">거래일</label>
        <div className="flex gap-2 mb-3 flex-wrap">
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
                'px-4 py-2 rounded-full text-caption font-semibold ring-1',
                state.date === chip.value
                  ? 'bg-[color:var(--color-primary-600)] text-white ring-transparent shadow-[0_4px_14px_color-mix(in_srgb,var(--color-primary-500)_28%,transparent)]'
                  : 'bg-surface-tertiary text-sub ring-transparent hover:bg-[var(--hover-bg)]',
              )}
            >
              {chip.label}
            </motion.button>
          ))}
        </div>
        {/* Date summary trigger — opens MiniCalendar */}
        <motion.button
          type="button"
          onClick={() => dispatch({ type: 'SET_FIELD', field: 'showCalendar', value: !state.showCalendar })}
          whileTap={shouldReduceMotion ? undefined : { scale: 0.99 }}
          className={clsx(
            'w-full flex items-center justify-between gap-2 px-4 py-3.5 rounded-2xl ring-1 transition-all',
            state.showCalendar
              ? 'ring-[color:var(--color-primary-400)] bg-[color:var(--color-primary-50)] dark:bg-[color:var(--color-primary-900)]/20'
              : 'ring-base bg-surface-primary hover:bg-[var(--hover-bg)] shadow-[0_1px_3px_rgba(0,0,0,0.04)]',
          )}
          aria-expanded={state.showCalendar}
        >
          <span className="inline-flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-[color:var(--color-primary-50)] dark:bg-[color:var(--color-primary-900)]/30 flex items-center justify-center flex-shrink-0">
              <CalendarIcon className="w-4 h-4 text-[color:var(--color-primary-600)] dark:text-[color:var(--color-primary-300)]" />
            </div>
            <span className="text-body3 text-heading font-semibold tabular-nums truncate">
              {formatDate(state.date)}
            </span>
          </span>
          <ChevronDown
            className={clsx(
              'w-4 h-4 text-sub flex-shrink-0 transition-transform',
              state.showCalendar && 'rotate-180',
            )}
          />
        </motion.button>
        <AnimatePresence>
          {state.showCalendar && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: durations.base, ease: easeOutExpo }}
              className="overflow-hidden mt-2"
            >
              <MiniCalendar
                value={state.date}
                onChange={(d) => {
                  dispatch({ type: 'SET_FIELD', field: 'date', value: d })
                  dispatch({ type: 'SET_FIELD', field: 'showCalendar', value: false })
                }}
                maxDate={today}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Payment Method */}
      <div>
        <label className="block text-label2 text-sub mb-2.5">
          거래수단 <span className="text-disabled font-normal">(선택)</span>
        </label>
        <div className="grid grid-cols-3 gap-2">
          {PAYMENT_METHOD_OPTIONS.map(opt => (
            <motion.button
              key={opt.value}
              type="button"
              onClick={() => dispatch({ type: 'SET_PAYMENT_METHOD', value: state.paymentMethod === opt.value ? '' : opt.value })}
              whileTap={shouldReduceMotion ? undefined : { scale: 0.95 }}
              transition={springSnappy}
              className={clsx(
                'py-2.5 px-2 rounded-full text-caption font-semibold text-center ring-1',
                state.paymentMethod === opt.value
                  ? 'bg-[color:var(--color-primary-600)] text-white ring-transparent shadow-[0_4px_14px_color-mix(in_srgb,var(--color-primary-500)_28%,transparent)]'
                  : 'bg-surface-tertiary text-sub ring-transparent hover:bg-[var(--hover-bg)]',
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
              className="mt-3 overflow-hidden"
            >
              {itemsForType.length > 0 && (
                <div className="rounded-2xl bg-surface-secondary ring-1 ring-base p-2.5 mb-2">
                  <div
                    className={clsx(
                      'flex flex-wrap gap-2',
                      itemsForType.length > 6 && 'max-h-[140px] overflow-y-auto scrollbar-none pr-1',
                    )}
                  >
                    {itemsForType.map(item => (
                      <motion.button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          dispatch({ type: 'SET_FIELD', field: 'paymentMethodItemId', value: item.id! })
                          dispatch({ type: 'SET_FIELD', field: 'paymentMethodDetail', value: item.name })
                        }}
                        whileTap={shouldReduceMotion ? undefined : { scale: 0.96 }}
                        className={clsx(
                          'px-3 py-2 rounded-full text-caption font-semibold transition-colors',
                          state.paymentMethodItemId === item.id
                            ? 'bg-[color:var(--color-primary-600)] text-white shadow-[0_4px_14px_color-mix(in_srgb,var(--color-primary-500)_28%,transparent)]'
                            : 'bg-surface-primary text-sub hover:bg-[var(--hover-bg)] ring-1 ring-base',
                        )}
                      >
                        {item.name}
                      </motion.button>
                    ))}
                    <motion.button
                      type="button"
                      onClick={() => { dispatch({ type: 'SET_FIELD', field: 'paymentMethodItemId', value: '' }); dispatch({ type: 'SET_FIELD', field: 'paymentMethodDetail', value: '' }) }}
                      whileTap={shouldReduceMotion ? undefined : { scale: 0.96 }}
                      className={clsx(
                        'px-3 py-2 rounded-full text-caption font-semibold transition-colors',
                        state.paymentMethodItemId === ''
                          ? 'bg-surface-tertiary text-heading ring-1 ring-[color:var(--border-strong)]'
                          : 'bg-surface-primary text-sub hover:bg-[var(--hover-bg)] ring-1 ring-base',
                      )}
                    >
                      직접 입력
                    </motion.button>
                  </div>
                  {itemsForType.length > 6 && (
                    <p className="text-[10px] text-disabled mt-2 text-center">
                      스크롤하여 더 보기
                    </p>
                  )}
                </div>
              )}
              {state.paymentMethodItemId === '' && (
                <input
                  type="text"
                  value={state.paymentMethodDetail}
                  onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'paymentMethodDetail', value: e.target.value })}
                  placeholder="카드/계좌명 입력 (예: 신한카드)"
                  className="input-base text-body3"
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Memo */}
      <div>
        <label htmlFor="wizard-memo" className="block text-label2 text-sub mb-2.5">
          메모 <span className="text-disabled font-normal">(선택)</span>
        </label>
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
      <div className="rounded-2xl bg-surface-primary ring-1 ring-base px-4 py-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={state.isRecurring}
            onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'isRecurring', value: e.target.checked })}
            className="check"
          />
          <span className="text-body3 text-heading font-semibold">반복 거래</span>
          <span className="ml-auto text-caption text-disabled">매주/매월 자동 기록</span>
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
              <motion.button
                type="button"
                onClick={() => dispatch({ type: 'SET_FIELD', field: 'showEndDateCalendar', value: !state.showEndDateCalendar })}
                whileTap={shouldReduceMotion ? undefined : { scale: 0.99 }}
                className={clsx(
                  'w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border el-hover min-h-[44px]',
                  state.showEndDateCalendar
                    ? 'border-[color:var(--color-primary-400)] bg-[color:var(--color-primary-50)] dark:bg-[color:var(--color-primary-900)]/20'
                    : 'border-base bg-surface-secondary hover:bg-[var(--hover-bg)]',
                )}
                aria-expanded={state.showEndDateCalendar}
              >
                <span className="inline-flex items-center gap-1.5 min-w-0">
                  <CalendarIcon className="w-3.5 h-3.5 text-sub flex-shrink-0" />
                  <span className="text-caption text-heading tabular-nums truncate">
                    {state.recurEndDate ? formatDate(state.recurEndDate) : '무기한'}
                  </span>
                </span>
                {state.recurEndDate && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation()
                      dispatch({ type: 'SET_FIELD', field: 'recurEndDate', value: '' })
                    }}
                    className="text-caption text-sub hover:text-heading flex-shrink-0"
                  >
                    지우기
                  </span>
                )}
              </motion.button>
              <AnimatePresence>
                {state.showEndDateCalendar && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: durations.base, ease: easeOutExpo }}
                    className="overflow-hidden mt-2"
                  >
                    <MiniCalendar
                      value={state.recurEndDate}
                      onChange={(d) => {
                        dispatch({ type: 'SET_FIELD', field: 'recurEndDate', value: d })
                        dispatch({ type: 'SET_FIELD', field: 'showEndDateCalendar', value: false })
                      }}
                      minDate={state.date}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
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
    const dateLabel = formatDate(state.date)

    return (
      <div className="space-y-5">
        {/* Hero — KT-style left-aligned display */}
        <div className="rounded-3xl bg-surface-primary ring-1 ring-base shadow-[0_4px_16px_rgba(0,0,0,0.04)] px-5 sm:px-6 py-6">
          <p className="text-label2 text-sub mb-1.5">
            {dateLabel}  {isExpense ? '지출 금액' : '수입 금액'}
          </p>
          <motion.p
            key={state.amount}
            initial={shouldReduceMotion ? undefined : { y: 6, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={springSnappy}
            className={clsx(
              'tabular-nums break-all font-extrabold',
              isExpense ? 'text-value-negative' : 'text-value-positive',
            )}
            style={{
              fontSize: 'clamp(28px, 8vw, 42px)',
              letterSpacing: '-0.025em',
              lineHeight: 1.15,
            }}
          >
            {state.amount || '0'}
            <span
              className="ml-1 font-semibold opacity-80"
              style={{ fontSize: 'clamp(18px, 4.5vw, 24px)' }}
            >
              원
            </span>
          </motion.p>
        </div>

        {/* Detail Rows — KT-style dashed divider + label/value */}
        <div className="rounded-3xl bg-surface-primary ring-1 ring-base shadow-[0_4px_16px_rgba(0,0,0,0.04)] px-5 sm:px-6 py-2">
          {rows.map((row, i) => (
            <div
              key={row.label}
              className={clsx(
                'flex items-start justify-between gap-3 py-3.5',
                i > 0 && 'border-t border-dashed border-[color:var(--border-default)]',
              )}
            >
              <span className="text-body3 text-sub flex-shrink-0 font-medium pt-0.5">{row.label}</span>
              <div className="flex items-start gap-2 min-w-0 flex-1 justify-end">
                {row.color && (
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5 ring-2 ring-white dark:ring-surface-secondary" style={{ backgroundColor: row.color }} />
                )}
                <span className="text-body3 text-heading font-semibold break-words text-right min-w-0 flex-1" title={row.value}>
                  {row.value}
                </span>
                <motion.button
                  type="button"
                  onClick={() => dispatch({ type: 'GO_TO_STEP', step: row.step, direction: 'backward' })}
                  className="p-1.5 rounded-lg hover:bg-[var(--hover-bg)] flex-shrink-0 -mt-0.5 -mr-1"
                  aria-label={`${row.label} 수정`}
                  whileHover={shouldReduceMotion ? undefined : { scale: 1.12 }}
                  whileTap={shouldReduceMotion ? undefined : { scale: 0.92 }}
                >
                  <Pencil className="w-3.5 h-3.5 text-disabled hover:text-heading" />
                </motion.button>
              </div>
            </div>
          ))}
        </div>

        {/* Budget Warning */}
        {budgetWarning && (
          <div className={clsx(
            'px-4 py-3 rounded-2xl text-caption font-medium',
            budgetWarning.percent > 100
              ? 'bg-status-danger-soft text-status-danger'
              : budgetWarning.percent >= 80
                ? 'bg-status-warning-soft text-status-warning'
                : 'bg-status-success-soft text-status-success',
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
      <div className="px-4 pt-4 sm:px-8 sm:pt-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-3 sm:mb-4">
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

      {/* Step Content — AnimatePresence wraps + scroll fade indicator */}
      <div className="relative">
        <div
          ref={contentRef}
          className="px-4 sm:px-8 pb-4 overflow-y-auto overflow-x-hidden max-h-[calc(100dvh-220px)] sm:max-h-[calc(100vh-240px)] min-h-[220px]"
        >
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
        {/* Fade gradient at bottom — hint for scrollable content */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-0 right-0 bottom-0 h-6"
          style={{
            background: 'linear-gradient(to bottom, transparent, var(--surface-primary))',
          }}
        />
      </div>

      {/* Footer — KT-style large pill buttons */}
      <div className="px-4 sm:px-8 py-3 sm:py-4 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] border-t border-base bg-surface-primary">
        <div className="flex items-center justify-between gap-3">
          {state.currentStep > 0 ? (
            <motion.button
              type="button"
              onClick={() => dispatch({ type: 'PREV_STEP' })}
              disabled={state.isSubmitting || state.isSuccess}
              whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
              className="inline-flex items-center gap-1 px-5 py-3 rounded-full text-body3 font-semibold text-sub hover:text-heading hover:bg-[var(--hover-bg)] transition-colors disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4 -ml-1" />
              이전
            </motion.button>
          ) : (
            <motion.button
              type="button"
              onClick={onClose}
              whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
              className="px-5 py-3 rounded-full text-body3 font-semibold text-sub hover:text-heading hover:bg-[var(--hover-bg)] transition-colors"
            >
              취소
            </motion.button>
          )}

          {state.currentStep < 3 ? (
            <motion.button
              type="button"
              onClick={() => dispatch({ type: 'NEXT_STEP' })}
              disabled={!canProceed}
              whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
              className={clsx(
                'inline-flex items-center gap-1 px-7 py-3.5 rounded-full text-body3 font-bold text-white transition-all min-w-[120px] justify-center',
                canProceed
                  ? 'bg-[color:var(--color-primary-600)] hover:bg-[color:var(--color-primary-700)] shadow-[0_4px_16px_color-mix(in_srgb,var(--color-primary-500)_30%,transparent)] hover:shadow-[0_8px_24px_color-mix(in_srgb,var(--color-primary-500)_40%,transparent)]'
                  : 'bg-surface-muted text-disabled cursor-not-allowed',
              )}
            >
              다음
              <ChevronRight className="w-4 h-4 -mr-1" />
            </motion.button>
          ) : (
            <motion.button
              type="button"
              onClick={handleSubmit}
              disabled={state.isSubmitting || state.isSuccess || numAmount <= 0}
              whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
              animate={state.isSuccess ? { scale: [1, 1.05, 1] } : undefined}
              className={clsx(
                'inline-flex items-center gap-1.5 px-7 py-3.5 rounded-full text-body3 font-bold text-white transition-all min-w-[132px] justify-center',
                state.isSuccess
                  ? 'bg-[color:var(--value-positive)]'
                  : 'bg-[color:var(--color-primary-600)] hover:bg-[color:var(--color-primary-700)] shadow-[0_4px_16px_color-mix(in_srgb,var(--color-primary-500)_30%,transparent)] hover:shadow-[0_8px_24px_color-mix(in_srgb,var(--color-primary-500)_40%,transparent)]',
                (state.isSubmitting || numAmount <= 0) && 'opacity-60 cursor-not-allowed',
              )}
            >
              {state.isSuccess ? (
                <>
                  <Check className="w-4 h-4" />
                  저장됨
                </>
              ) : state.isSubmitting ? '저장 중...' : '기록하기'}
            </motion.button>
          )}
        </div>
      </div>
    </Dialog>
  )
}
