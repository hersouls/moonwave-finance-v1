import type { RepeatType, TransactionType } from './types'

// ─── Segment / Tab ─────────────────────────────────

export const LEDGER_SEGMENTS = [
  { id: 'expense' as const, label: '지출', path: '/ledger/expense' },
  { id: 'income' as const, label: '수입', path: '/ledger/income' },
  { id: 'calendar' as const, label: '캘린더', path: '/ledger/calendar' },
]

export const TRANSACTION_TYPE_TABS = [
  { id: 'all', label: '전체' },
  { id: 'expense', label: '지출' },
  { id: 'income', label: '수입' },
]

// ─── Wizard Steps ──────────────────────────────────

export const WIZARD_STEPS = [
  { label: '금액' },
  { label: '카테고리' },
  { label: '상세' },
  { label: '확인' },
] as const

export const WIZARD_MAX_STEP = WIZARD_STEPS.length - 1

// ─── Amount quick-add presets ──────────────────────

export const AMOUNT_PRESETS: { label: string; delta: number }[] = [
  { label: '+1천', delta: 1_000 },
  { label: '+1만', delta: 10_000 },
  { label: '+10만', delta: 100_000 },
  { label: '+100만', delta: 1_000_000 },
]

// ─── Recurring repeat options ──────────────────────

export const RECUR_OPTIONS: { value: RepeatType; label: string }[] = [
  { value: 'monthly', label: '매월' },
  { value: 'weekly', label: '매주' },
  { value: 'daily', label: '매일' },
  { value: 'yearly', label: '매년' },
]

export const RECUR_LABEL_MAP: Record<string, string> = RECUR_OPTIONS.reduce(
  (acc, opt) => ({ ...acc, [opt.value]: opt.label }),
  {} as Record<string, string>,
)

// ─── Budget warning thresholds (%) ─────────────────

export const BUDGET_THRESHOLDS = {
  OVER: 100,
  WARNING: 80,
} as const

// ─── Category matching ────────────────────────────

/** 대출이자 카테고리 이름 — 시드 데이터와 동기화 필요 */
export const LOAN_INTEREST_CATEGORY_NAME = '대출이자'

// ─── Fallbacks ────────────────────────────────────

export const UNCATEGORIZED_COLOR = '#71717a'
export const UNCATEGORIZED_LABEL = '미분류'

// ─── Transaction card swipe ────────────────────────

export const TRANSACTION_CARD_SWIPE = {
  THRESHOLD: 80,
  ACTION_WIDTH: 120,
} as const

// ─── Action sheet drag-to-close ───────────────────

export const SHEET_DRAG_CLOSE = {
  OFFSET_Y: 120,
  VELOCITY_Y: 600,
} as const

// ─── Template frequency detection ─────────────────

export const TEMPLATE_CONFIG = {
  MIN_COUNT: 2,
  LIMIT: 5,
} as const

// ─── Payment method items scroll ──────────────────

export const PAYMENT_METHOD_ITEMS_SCROLL_THRESHOLD = 6

// ─── Wizard success close delay (ms) ──────────────

export const WIZARD_SUCCESS_CLOSE_MS = 620

// ─── Type-safe helpers ────────────────────────────

export function isTransactionType(v: string): v is TransactionType {
  return v === 'expense' || v === 'income'
}
