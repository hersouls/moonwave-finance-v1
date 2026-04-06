import { useReducer, useEffect, useMemo, useRef } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { useTransactionStore } from '@/stores/transactionStore'
import { useMemberStore } from '@/stores/memberStore'
import { useBudgetStore } from '@/stores/budgetStore'
import { useLoanStore } from '@/stores/loanStore'
import { useToastStore } from '@/stores/toastStore'
import { getTodayString } from '@/lib/dateUtils'
import { formatDate } from '@/lib/dateUtils'
import { PAYMENT_METHOD_OPTIONS, getPaymentMethodLabel } from '@/utils/paymentMethod'
import { formatKoreanUnit } from '@/utils/format'
import { getCategoryIcon } from '@/utils/categoryIcons'
import { clsx } from 'clsx'
import {
  Check, ChevronLeft, ChevronRight, Zap, Landmark, Pencil, MoreHorizontal,
} from 'lucide-react'
import type { TransactionType, RepeatType, PaymentMethod } from '@/lib/types'

// ─── Types ─────────────────────────────────────────

interface WizardState {
  currentStep: number
  direction: 'forward' | 'backward'
  isSubmitting: boolean
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
  | { type: 'RESET'; initialDate?: string; defaultMemberId?: number | '' }
  | { type: 'SET_SUBMITTING'; value: boolean }

// ─── Reducer ───────────────────────────────────────

function getInitialState(initialDate?: string, defaultMemberId?: number | ''): WizardState {
  return {
    currentStep: 0,
    direction: 'forward',
    isSubmitting: false,
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
    case 'RESET':
      return getInitialState(action.initialDate, action.defaultMemberId)
    case 'SET_SUBMITTING':
      return { ...state, isSubmitting: action.value }
    default:
      return state
  }
}

// ─── Step Indicator ────────────────────────────────

const STEPS = [
  { label: '금액' },
  { label: '카테고리' },
  { label: '상세' },
  { label: '확인' },
] as const

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-6">
      {STEPS.map((step, i) => {
        const isCompleted = i < currentStep
        const isCurrent = i === currentStep
        return (
          <div key={i} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={clsx(
                  'flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full text-xs font-bold transition-all duration-200',
                  isCompleted && 'bg-primary-500 text-white',
                  isCurrent && 'border-2 border-primary-500 text-primary-500',
                  !isCompleted && !isCurrent && 'bg-surface-tertiary text-disabled',
                )}
                aria-current={isCurrent ? 'step' : undefined}
              >
                {isCompleted ? <Check size={14} /> : i + 1}
              </div>
              <span
                className={clsx(
                  'mt-1 text-[10px] sm:text-xs font-medium',
                  isCurrent ? 'text-primary-500' : isCompleted ? 'text-body' : 'text-disabled',
                )}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={clsx(
                  'mx-1 sm:mx-2 h-0.5 w-5 sm:w-10 transition-colors duration-200',
                  i < currentStep ? 'bg-primary-500' : 'bg-[var(--surface-tertiary)]',
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

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

  const handleSubmit = async () => {
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
      onClose()
    } catch {
      useToastStore.getState().addToast('거래 저장에 실패했습니다.', 'error')
    } finally {
      dispatch({ type: 'SET_SUBMITTING', value: false })
    }
  }

  const getYesterdayString = () => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return d.toISOString().split('T')[0]
  }

  // ─── Step 0: Amount + Type + Member ────────────

  const renderStep0 = () => (
    <div className="space-y-5">
      {/* Quick Start */}
      {(templates.length > 0 || activeLoans.length > 0) && (
        <div className="space-y-3 pb-4 border-b border-zinc-100 dark:border-zinc-800">
          {templates.length > 0 && (
            <div>
              <label className="flex items-center gap-1 text-caption text-sub mb-2">
                <Zap className="w-3.5 h-3.5" />
                빠른 입력
              </label>
              <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
                {templates.map((tmpl, i) => {
                  const cat = tmpl.categoryId ? categories.find(c => c.id === tmpl.categoryId) : null
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => dispatch({ type: 'APPLY_TEMPLATE', data: tmpl })}
                      className="flex-shrink-0 px-3 py-1.5 rounded-lg text-caption bg-surface-tertiary text-body hover:bg-[var(--hover-bg)] active:scale-95 transition-all"
                    >
                      {cat?.name || '미분류'} {formatKoreanUnit(tmpl.amount)}원
                    </button>
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
              <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
                {activeLoans.map(loan => {
                  const interest = getMonthlyInterest(loan)
                  const interestCat = categories.find(c => c.type === 'expense' && c.name.includes('대출이자'))
                  return (
                    <button
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
                      className="flex-shrink-0 px-3 py-1.5 rounded-lg text-caption bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/30 active:scale-95 transition-all"
                    >
                      {loan.name} ({formatKoreanUnit(interest)}원/월)
                    </button>
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
          <button
            type="button"
            onClick={() => dispatch({ type: 'SET_TYPE', value: 'expense' })}
            className={clsx(
              'flex-1 py-2.5 px-4 rounded-lg text-body3 font-medium transition-all duration-150',
              state.type === 'expense'
                ? 'bg-status-danger text-red-700 dark:text-red-400 ring-1 ring-red-200 dark:ring-red-800'
                : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700',
            )}
          >
            지출
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: 'SET_TYPE', value: 'income' })}
            className={clsx(
              'flex-1 py-2.5 px-4 rounded-lg text-body3 font-medium transition-all duration-150',
              state.type === 'income'
                ? 'bg-status-success text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-200 dark:ring-emerald-800'
                : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700',
            )}
          >
            수입
          </button>
        </div>
      </div>

      {/* Hero Amount Input */}
      <div>
        <label className="block text-body3 text-body mb-2">금액</label>
        <div className="wizard-amount-wrap rounded-xl border-2 border-base transition-all duration-300 focus-within:border-primary-400 dark:focus-within:border-primary-400 focus-within:wizard-amount-glow">
          <div className="relative py-4 px-4">
            <input
              ref={amountRef}
              type="text"
              inputMode="numeric"
              value={state.amount}
              onChange={handleAmountChange}
              placeholder="0"
              className="w-full bg-transparent text-center text-3xl sm:text-4xl font-bold tabular-nums text-zinc-900 dark:text-white placeholder-zinc-300 dark:placeholder-zinc-600 outline-none"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-lg text-disabled font-medium">원</span>
          </div>
        </div>
        {numAmount > 0 && (
          <p className="mt-1.5 text-center text-caption text-disabled tabular-nums">
            {formatKoreanUnit(numAmount)}원
          </p>
        )}
      </div>

      {/* Member */}
      {members.length > 0 && (
        <div>
          <label className="block text-body3 text-body mb-2">구성원</label>
          <div className="flex gap-2" role="group" aria-label="구성원 선택">
            {members.length <= 4 ? (
              <>
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'SET_FIELD', field: 'memberId', value: '' })}
                  className={clsx(
                    'px-3 py-2 rounded-lg text-body3 transition-colors',
                    state.memberId === ''
                      ? 'bg-zinc-200 text-zinc-800 dark:bg-zinc-600 dark:text-zinc-100 ring-1 ring-zinc-300 dark:ring-zinc-500'
                      : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700',
                  )}
                >
                  미지정
                </button>
                {members.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => dispatch({ type: 'SET_FIELD', field: 'memberId', value: m.id! })}
                    className={clsx(
                      'flex-1 py-2 px-4 rounded-lg text-body3 transition-all duration-150',
                      state.memberId === m.id
                        ? 'text-white ring-1'
                        : 'bg-surface-tertiary text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700',
                    )}
                    style={state.memberId === m.id ? { backgroundColor: m.color, boxShadow: `0 0 0 1px ${m.color}` } : undefined}
                  >
                    {m.name}
                  </button>
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

      <div className="grid grid-cols-4 sm:grid-cols-5 gap-2.5 max-h-[280px] overflow-y-auto scrollbar-none" role="radiogroup" aria-label="카테고리 선택">
        {currentCategories.map(cat => {
          const Icon = getCategoryIcon(cat.icon)
          const isSelected = state.categoryId === cat.id
          return (
            <button
              key={cat.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => dispatch({ type: 'SET_FIELD', field: 'categoryId', value: isSelected ? '' : cat.id! })}
              className={clsx(
                'flex flex-col items-center gap-1.5 p-2.5 sm:p-3 rounded-xl border transition-all duration-150',
                'hover:scale-[1.03] active:scale-[0.97]',
                isSelected
                  ? 'border-transparent'
                  : 'bg-zinc-50 dark:bg-zinc-800/60 border-base hover:border-zinc-300 dark:hover:border-zinc-600',
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
                isSelected ? 'text-heading' : 'text-zinc-600 dark:text-zinc-400',
              )}>
                {cat.name}
              </span>
            </button>
          )
        })}

        {/* 미분류 */}
        <button
          type="button"
          role="radio"
          aria-checked={state.categoryId === ''}
          onClick={() => dispatch({ type: 'SET_FIELD', field: 'categoryId', value: '' })}
          className={clsx(
            'flex flex-col items-center gap-1.5 p-2.5 sm:p-3 rounded-xl border transition-all duration-150',
            'hover:scale-[1.03] active:scale-[0.97]',
            state.categoryId === ''
              ? 'bg-zinc-100 dark:bg-zinc-700 border-zinc-300 dark:border-zinc-600'
              : 'bg-zinc-50 dark:bg-zinc-800/60 border-base',
          )}
        >
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center bg-zinc-100 dark:bg-zinc-700">
            <MoreHorizontal className="w-4.5 h-4.5 sm:w-5 sm:h-5 text-zinc-400" />
          </div>
          <span className="text-[11px] sm:text-caption truncate max-w-full font-medium text-sub">
            미분류
          </span>
        </button>
      </div>

      {/* Budget Warning */}
      {budgetWarning && (
        <div className={clsx(
          'px-3 py-2.5 rounded-lg text-caption animate-fadeIn',
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
            <button
              key={chip.value}
              type="button"
              onClick={() => dispatch({ type: 'SET_FIELD', field: 'date', value: chip.value })}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-caption font-medium transition-all duration-150',
                state.date === chip.value
                  ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 ring-1 ring-primary-300 dark:ring-primary-700'
                  : 'bg-surface-tertiary text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700',
              )}
            >
              {chip.label}
            </button>
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
            <button
              key={opt.value}
              type="button"
              onClick={() => dispatch({ type: 'SET_PAYMENT_METHOD', value: state.paymentMethod === opt.value ? '' : opt.value })}
              className={clsx(
                'py-2 px-2 rounded-lg text-caption transition-all duration-150 text-center',
                state.paymentMethod === opt.value
                  ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 ring-1 ring-primary-300 dark:ring-primary-700'
                  : 'bg-surface-tertiary text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {state.paymentMethod && state.paymentMethod !== 'cash' && (
          <div className="mt-2.5">
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
                        : 'bg-zinc-50 text-zinc-600 dark:bg-zinc-800/80 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700',
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
                      ? 'bg-zinc-200 text-zinc-700 dark:bg-zinc-600 dark:text-zinc-200'
                      : 'bg-zinc-50 text-zinc-500 dark:bg-zinc-800/80 dark:text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-700',
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
          </div>
        )}
      </div>

      {/* Memo */}
      <div>
        <label className="block text-body3 text-body mb-1.5">메모 (선택)</label>
        <input
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
      {state.isRecurring && (
        <div className="grid grid-cols-2 gap-3">
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
        </div>
      )}
    </div>
  )

  // ─── Step 3: Review ────────────────────────────

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

    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-base overflow-hidden">
          {/* Hero Amount */}
          <div className={clsx(
            'py-5 text-center',
            state.type === 'expense'
              ? 'bg-red-50 dark:bg-red-900/10'
              : 'bg-emerald-50 dark:bg-emerald-900/10',
          )}>
            <p className={clsx(
              'text-2xl sm:text-3xl font-bold tabular-nums',
              state.type === 'expense' ? 'text-status-danger' : 'text-status-success',
            )}>
              {state.amount || '0'}
              <span className="text-lg ml-0.5">원</span>
            </p>
          </div>

          {/* Detail Rows */}
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map((row) => (
              <div key={row.label} className="flex items-center justify-between px-4 py-3">
                <span className="text-caption text-sub">{row.label}</span>
                <div className="flex items-center gap-2">
                  {row.color && (
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: row.color }} />
                  )}
                  <span className="text-body3 text-heading">{row.value}</span>
                  <button
                    type="button"
                    onClick={() => dispatch({ type: 'GO_TO_STEP', step: row.step, direction: 'backward' })}
                    className="p-1 rounded hover:bg-[var(--hover-bg)] transition-colors"
                    aria-label={`${row.label} 수정`}
                  >
                    <Pencil className="w-3.5 h-3.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300" />
                  </button>
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
          <h2 className="text-title2 font-semibold text-zinc-900 dark:text-white">새 거래 기록</h2>
          <button
            onClick={onClose}
            className="touch-target-icon text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-[var(--hover-bg)] transition-colors rounded-lg"
            aria-label="닫기"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <StepIndicator currentStep={state.currentStep} />
      </div>

      {/* Step Content */}
      <div className="px-6 sm:px-8 pb-2 overflow-y-auto max-h-[calc(100dvh-280px)] sm:max-h-[420px]">
        <div
          key={state.currentStep}
          className={state.direction === 'forward' ? 'wizard-step-forward' : 'wizard-step-backward'}
        >
          {stepRenderers[state.currentStep]()}
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 sm:px-8 py-4 sm:py-5 pb-[max(1rem,env(safe-area-inset-bottom,0px))] border-t border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center justify-between gap-3">
          {state.currentStep > 0 ? (
            <Button
              variant="ghost"
              size="md"
              onClick={() => dispatch({ type: 'PREV_STEP' })}
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
              disabled={state.isSubmitting || numAmount <= 0}
            >
              {state.isSubmitting ? '저장 중...' : '기록하기'}
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  )
}
