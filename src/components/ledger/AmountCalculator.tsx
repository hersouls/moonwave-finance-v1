import { useReducer } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { clsx } from 'clsx'
import { Delete, Check, RotateCcw, X as XIcon } from 'lucide-react'
import { springSnappy } from '@/lib/motionConfig'
import { formatKoreanUnit } from '@/utils/format'

type Operator = '+' | '-' | '×' | '÷'

interface CalcState {
  display: string
  previous: number | null
  operator: Operator | null
  waitingForOperand: boolean
  expression: string
}

type CalcAction =
  | { type: 'DIGIT'; d: '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '00' }
  | { type: 'OPERATOR'; op: Operator }
  | { type: 'EQUALS' }
  | { type: 'BACKSPACE' }
  | { type: 'CLEAR' }
  | { type: 'INIT'; value: number }

function applyOp(a: number, b: number, op: Operator): number {
  switch (op) {
    case '+': return a + b
    case '-': return a - b
    case '×': return a * b
    case '÷': return b === 0 ? 0 : Math.floor(a / b)
  }
}

function initial(initialValue: number): CalcState {
  return {
    display: initialValue > 0 ? String(initialValue) : '0',
    previous: null,
    operator: null,
    waitingForOperand: false,
    expression: '',
  }
}

function reducer(state: CalcState, action: CalcAction): CalcState {
  switch (action.type) {
    case 'INIT':
      return initial(action.value)

    case 'DIGIT': {
      // Limit 12 digit safety
      if (state.display.length >= 12 && !state.waitingForOperand) return state
      const newDisplay = state.waitingForOperand
        ? (action.d === '00' ? '0' : action.d)
        : state.display === '0'
          ? (action.d === '00' ? '0' : action.d)
          : state.display + action.d
      return { ...state, display: newDisplay, waitingForOperand: false }
    }

    case 'OPERATOR': {
      const current = Number(state.display) || 0
      if (state.previous === null) {
        return {
          ...state,
          previous: current,
          operator: action.op,
          waitingForOperand: true,
          expression: `${formatKoreanUnit(current)} ${action.op}`,
        }
      }
      // Chained operation: compute then set new operator
      if (state.operator && !state.waitingForOperand) {
        const result = applyOp(state.previous, current, state.operator)
        return {
          ...state,
          display: String(Math.max(0, result)),
          previous: result,
          operator: action.op,
          waitingForOperand: true,
          expression: `${formatKoreanUnit(Math.max(0, result))} ${action.op}`,
        }
      }
      return {
        ...state,
        operator: action.op,
        waitingForOperand: true,
        expression: `${formatKoreanUnit(state.previous)} ${action.op}`,
      }
    }

    case 'EQUALS': {
      if (state.previous === null || state.operator === null) return state
      const current = Number(state.display) || 0
      const result = applyOp(state.previous, current, state.operator)
      const safe = Math.max(0, result)
      return {
        ...state,
        display: String(safe),
        previous: null,
        operator: null,
        waitingForOperand: true,
        expression: `${formatKoreanUnit(state.previous)} ${state.operator} ${formatKoreanUnit(current)} =`,
      }
    }

    case 'BACKSPACE': {
      if (state.waitingForOperand) return state
      const next = state.display.length > 1 ? state.display.slice(0, -1) : '0'
      return { ...state, display: next }
    }

    case 'CLEAR':
      return initial(0)

    default:
      return state
  }
}

interface AmountCalculatorProps {
  value: number
  onApply: (value: number) => void
  onClose: () => void
}

export function AmountCalculator({ value, onApply, onClose }: AmountCalculatorProps) {
  const shouldReduceMotion = useReducedMotion()
  const [state, dispatch] = useReducer(reducer, value, initial)

  const current = Number(state.display) || 0
  const canApply = current > 0

  const keys: { label: string; action: () => void; variant: 'digit' | 'op' | 'util' | 'equals'; span?: number }[] = [
    { label: 'AC', action: () => dispatch({ type: 'CLEAR' }), variant: 'util' },
    { label: '⌫', action: () => dispatch({ type: 'BACKSPACE' }), variant: 'util' },
    { label: '÷', action: () => dispatch({ type: 'OPERATOR', op: '÷' }), variant: 'op' },
    { label: '×', action: () => dispatch({ type: 'OPERATOR', op: '×' }), variant: 'op' },

    { label: '7', action: () => dispatch({ type: 'DIGIT', d: '7' }), variant: 'digit' },
    { label: '8', action: () => dispatch({ type: 'DIGIT', d: '8' }), variant: 'digit' },
    { label: '9', action: () => dispatch({ type: 'DIGIT', d: '9' }), variant: 'digit' },
    { label: '-', action: () => dispatch({ type: 'OPERATOR', op: '-' }), variant: 'op' },

    { label: '4', action: () => dispatch({ type: 'DIGIT', d: '4' }), variant: 'digit' },
    { label: '5', action: () => dispatch({ type: 'DIGIT', d: '5' }), variant: 'digit' },
    { label: '6', action: () => dispatch({ type: 'DIGIT', d: '6' }), variant: 'digit' },
    { label: '+', action: () => dispatch({ type: 'OPERATOR', op: '+' }), variant: 'op' },

    { label: '1', action: () => dispatch({ type: 'DIGIT', d: '1' }), variant: 'digit' },
    { label: '2', action: () => dispatch({ type: 'DIGIT', d: '2' }), variant: 'digit' },
    { label: '3', action: () => dispatch({ type: 'DIGIT', d: '3' }), variant: 'digit' },
    { label: '=', action: () => dispatch({ type: 'EQUALS' }), variant: 'equals' },

    { label: '00', action: () => dispatch({ type: 'DIGIT', d: '00' }), variant: 'digit' },
    { label: '0', action: () => dispatch({ type: 'DIGIT', d: '0' }), variant: 'digit' },
  ]

  return (
    <div
      className="rounded-2xl bg-[color:var(--surface-secondary)] ring-1 ring-[color:var(--border-strong)] p-3 sm:p-4 shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)]"
      role="group"
      aria-label="금액 계산기"
    >
      {/* Expression + Display */}
      <div className="mb-3 px-1">
        <div className="h-4 flex items-center justify-end">
          <motion.span
            key={state.expression || 'empty'}
            initial={shouldReduceMotion ? undefined : { opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-caption text-sub tabular-nums truncate max-w-full"
          >
            {state.expression || '\u00A0'}
          </motion.span>
        </div>
        <div className="flex items-baseline justify-end gap-1 min-h-[44px]">
          <motion.span
            key={state.display}
            initial={shouldReduceMotion ? undefined : { y: -4, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={springSnappy}
            className="text-financial-fluid text-heading font-extrabold tabular-nums tracking-tight break-all text-right"
            style={{
              letterSpacing: '-0.02em',
              lineHeight: 1.15,
            }}
          >
            {formatKoreanUnit(current)}
          </motion.span>
          <span className="text-body3 text-sub font-semibold">원</span>
        </div>
      </div>

      {/* Keypad 4 × 5 grid */}
      <div className="grid grid-cols-4 gap-2">
        {keys.slice(0, 16).map(k => (
          <KeyButton key={k.label} {...k} reducedMotion={!!shouldReduceMotion} />
        ))}
        {/* Row 5: [00][0] span 2 each */}
        <KeyButton
          label="00"
          action={() => dispatch({ type: 'DIGIT', d: '00' })}
          variant="digit"
          reducedMotion={!!shouldReduceMotion}
          colSpan={2}
        />
        <KeyButton
          label="0"
          action={() => dispatch({ type: 'DIGIT', d: '0' })}
          variant="digit"
          reducedMotion={!!shouldReduceMotion}
          colSpan={2}
        />
      </div>

      {/* Footer actions */}
      <div className="mt-3 flex items-center justify-between gap-2">
        <motion.button
          type="button"
          onClick={() => dispatch({ type: 'CLEAR' })}
          whileTap={shouldReduceMotion ? undefined : { scale: 0.96 }}
          className="inline-flex items-center gap-1 px-3 py-2 rounded-full text-caption font-semibold text-sub hover:text-heading hover:bg-[var(--hover-bg)] transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          초기화
        </motion.button>
        <div className="flex items-center gap-2">
          <motion.button
            type="button"
            onClick={onClose}
            whileTap={shouldReduceMotion ? undefined : { scale: 0.96 }}
            className="inline-flex items-center gap-1 px-4 py-2 rounded-full text-caption font-semibold text-sub hover:text-heading hover:bg-[var(--hover-bg)] transition-colors"
          >
            <XIcon className="w-3.5 h-3.5" />
            취소
          </motion.button>
          <motion.button
            type="button"
            onClick={() => onApply(current)}
            disabled={!canApply}
            whileTap={shouldReduceMotion || !canApply ? undefined : { scale: 0.96 }}
            className={clsx(
              'inline-flex items-center gap-1 px-5 py-2.5 rounded-full text-caption font-bold transition-all',
              canApply
                ? 'bg-[color:var(--color-primary-600)] text-white shadow-[0_4px_14px_color-mix(in_oklch,var(--color-primary-500)_30%,transparent)] hover:shadow-[0_6px_20px_color-mix(in_oklch,var(--color-primary-500)_40%,transparent)]'
                : 'bg-surface-muted text-disabled cursor-not-allowed',
            )}
          >
            <Check className="w-4 h-4" />
            적용
          </motion.button>
        </div>
      </div>
    </div>
  )
}

// ─── Key Button ─────────────────────────────────────

interface KeyButtonProps {
  label: string
  action: () => void
  variant: 'digit' | 'op' | 'util' | 'equals'
  reducedMotion: boolean
  colSpan?: number
}

function KeyButton({ label, action, variant, reducedMotion, colSpan = 1 }: KeyButtonProps) {
  return (
    <motion.button
      type="button"
      onClick={action}
      whileTap={reducedMotion ? undefined : { scale: 0.93 }}
      transition={springSnappy}
      className={clsx(
        'h-12 rounded-2xl text-body2-bold font-bold transition-all tabular-nums select-none',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring-focus)]',
        variant === 'digit' && 'bg-surface-primary text-heading ring-1 ring-[color:var(--border-default)] hover:ring-[color:var(--color-primary-300)] elevation-1',
        variant === 'util' && 'bg-[color:var(--status-warning-bg)] text-status-warning ring-1 ring-[color:var(--status-warning-border)] hover:shadow-[0_4px_10px_color-mix(in_oklch,var(--status-warning-text)_22%,transparent)]',
        variant === 'op' && 'bg-[color:var(--color-primary-50)] text-[color:var(--color-primary-700)] ring-1 ring-[color:var(--color-primary-200)] hover:shadow-[0_4px_10px_color-mix(in_oklch,var(--color-primary-500)_24%,transparent)] dark:bg-[color:var(--color-primary-900)]/30 dark:text-[color:var(--color-primary-200)]',
        variant === 'equals' && 'bg-gradient-to-br from-[color:var(--color-primary-500)] to-[color:var(--color-primary-700)] text-white shadow-[0_4px_14px_color-mix(in_oklch,var(--color-primary-500)_30%,transparent)] hover:shadow-[0_6px_20px_color-mix(in_oklch,var(--color-primary-500)_40%,transparent)]',
      )}
      style={colSpan > 1 ? { gridColumn: `span ${colSpan} / span ${colSpan}` } : undefined}
      aria-label={label === '⌫' ? '한 자리 지우기' : label === 'AC' ? '전체 초기화' : label === '=' ? '계산' : label}
    >
      {label === '⌫' ? <Delete className="w-4 h-4 mx-auto" /> : label}
    </motion.button>
  )
}
