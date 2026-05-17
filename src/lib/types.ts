// ─── Member Types ──────────────────────────────────
export interface Member {
  id?: number
  syncId?: string
  name: string
  color: string
  isDefault: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

// ─── Asset Category Types ──────────────────────────
export type AssetLiabilityType = 'asset' | 'liability'

export interface AssetCategory {
  id?: number
  syncId?: string
  name: string
  type: AssetLiabilityType
  color: string
  icon?: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

// ─── Asset Item Types ──────────────────────────────
export interface AssetItem {
  id?: number
  syncId?: string
  memberId: number
  categoryId: number
  name: string
  type: AssetLiabilityType
  memo?: string
  isActive: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

// ─── Daily Value Types ─────────────────────────────
export interface DailyValue {
  id?: number
  syncId?: string
  assetItemId: number
  date: string
  value: number
  createdAt: string
  updatedAt: string
}

// ─── Transaction Types ─────────────────────────────
export type TransactionType = 'income' | 'expense'
export type PaymentMethod = 'cash' | 'credit_card' | 'debit_card' | 'bank_transfer' | 'loan' | 'other'

export interface TransactionCategory {
  id?: number
  syncId?: string
  name: string
  type: TransactionType
  color: string
  icon?: string
  isDefault: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface PaymentMethodItem {
  id?: number
  syncId?: string
  type: PaymentMethod
  name: string
  memo?: string
  linkedAssetItemId?: number
  isActive: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type RepeatType = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'

export interface RepeatPattern {
  type: RepeatType
  interval: number
  endDate?: string
}

export interface Transaction {
  id?: number
  syncId?: string
  memberId: number | null
  type: TransactionType
  amount: number
  categoryId: number | null
  date: string
  memo?: string
  paymentMethod?: PaymentMethod
  paymentMethodDetail?: string
  paymentMethodItemId?: number
  isRecurring: boolean
  recurPattern?: RepeatPattern
  recurSourceId?: number
  subscriptionId?: number
  /**
   * Optional subscription-type label (entertainment / productivity / cloud / …).
   * Independent of the user-defined transaction `categoryId` — acts as a
   * secondary classification so subscription-style expenses can be filtered
   * across the ledger regardless of which spending category they were
   * recorded under.
   */
  subscriptionCategory?: SubscriptionCategoryType
  createdAt: string
  updatedAt: string
}

// ─── Budget Types ─────────────────────────────────
export interface Budget {
  id?: number
  syncId?: string
  categoryId: number
  month: string // YYYY-MM
  amount: number
  createdAt: string
  updatedAt: string
}

// ─── Financial Goal Types ─────────────────────────
export type GoalType = 'savings' | 'debt' | 'investment' | 'custom'

export interface FinancialGoal {
  id?: number
  syncId?: string
  name: string
  type: GoalType
  targetAmount: number
  currentAmount: number
  targetDate: string
  color: string
  icon?: string
  memo?: string
  isCompleted: boolean
  createdAt: string
  updatedAt: string
}

// ─── Subscription Types ──────────────────────────────
export type SubscriptionCurrency = 'KRW' | 'USD'
export type SubscriptionStatus = 'active' | 'paused' | 'cancelled'
export type SubscriptionCycle =
  | 'weekly' | 'biweekly' | 'monthly'
  | 'quarterly' | 'semi-annual' | 'yearly' | 'custom'
export type SubscriptionCategoryType =
  | 'entertainment' | 'productivity' | 'ai' | 'cloud' | 'music'
  | 'news' | 'education' | 'health' | 'shopping' | 'finance' | 'other'

export interface PauseHistoryEntry {
  pausedAt: string    // YYYY-MM-DD
  resumedAt?: string  // YYYY-MM-DD, undefined = 현재 정지중
}

export interface Subscription {
  id?: number
  syncId?: string
  name: string
  description?: string
  currency: SubscriptionCurrency
  amount: number
  cycle: SubscriptionCycle
  billingDay: number           // 1-28
  billingMonth?: number        // 1-12 (yearly only)
  customCycleDays?: number     // cycle === 'custom' 일 때만 사용 (1-365)
  category: SubscriptionCategoryType
  status: SubscriptionStatus
  startDate: string
  endDate?: string
  pauseHistory?: PauseHistoryEntry[]
  icon?: string
  color: string
  url?: string
  memo?: string
  paymentMethodItemId?: number
  linkedTransactionCategoryId?: number
  sortOrder: number
  createdAt: string
  updatedAt: string
}

// ─── Loan Types ───────────────────────────────────
export type LoanRepaymentType = 'equal_principal' | 'equal_installment' | 'bullet' | 'custom'

export interface Loan {
  id?: number
  syncId?: string
  name: string
  lender?: string
  loanDate: string
  maturityDate: string
  principalAmount: number
  currentBalance: number
  annualRate: number
  repaymentType: LoanRepaymentType
  paymentDay: number
  paymentAccount?: string
  linkedAssetItemId?: number
  memo?: string
  isActive: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

// ─── Settings Types ────────────────────────────────
export type ThemeMode = 'light' | 'dark' | 'system'
export type ColorPalette = 'default' | 'ocean' | 'rose' | 'purple' | 'forest'
export type Density = 'compact' | 'comfortable' | 'spacious'

export interface UserProfile {
  name: string
  avatarUrl?: string
}

export interface NotificationSettings {
  budgetAlert: boolean
  budgetThreshold: number
  transactionReminder: boolean
  reminderTime: string
  subscriptionBillingAlert: boolean
  subscriptionAlertDaysBefore: number[]  // e.g. [0, 1, 3]
}

export interface Settings {
  theme: ThemeMode
  colorPalette: ColorPalette
  currencyUnit: 'won' | 'dollar'
  userProfile: UserProfile
  hasCompletedOnboarding: boolean
  lastBackupDate?: string
  googleDrive: {
    isConnected: boolean
    autoBackup: boolean
    lastSyncDate?: string
  }
  highContrastMode: boolean
  notifications: NotificationSettings
  exchangeRate: {
    usdToKrw: number
    lastUpdated?: string
  }
  /** v2 UI — display density (compact/comfortable/spacious) */
  density?: Density
  /** v2 UI — AMOLED 순수 블랙 모드 (dark mode + oled) */
  oledMode?: boolean
  /** v2 UI — 금액 마스킹 (●●● 표시) */
  hideAmounts?: boolean
  /** v2 UI — 시간대 자동 테마 적용 */
  timeBasedTheme?: boolean
}

// ─── Computed Types ────────────────────────────────
export interface NetWorthSnapshot {
  date: string
  totalAssets: number
  totalLiabilities: number
  netWorth: number
  debtRatio: number
}

export interface AssetStats {
  totalAssets: number
  totalLiabilities: number
  netWorth: number
  debtRatio: number
  dailyChange: number
  monthlyChange: number
}

export interface CategoryBreakdown {
  categoryId: number
  categoryName: string
  categoryColor: string
  total: number
  percentage: number
}

export interface MemberBreakdown {
  memberId: number
  memberName: string
  memberColor: string
  totalAssets: number
  totalLiabilities: number
  netWorth: number
}

export interface MonthlyTransactionSummary {
  month: string
  totalIncome: number
  totalExpense: number
  netSavings: number
  categoryBreakdown: CategoryBreakdown[]
}

// ─── Sync Types ────────────────────────────────────
export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error'

export interface AuthUser {
  uid: string
  email: string
  displayName: string
  photoURL: string
}

export interface SyncChangeLogEntry {
  id?: number
  tableName: string
  syncId: string
  operation: 'create' | 'update' | 'delete'
  timestamp: string
  processed: number       // 0 = pending, 1 = synced
}

export interface SyncTombstone {
  id?: number
  tableName: string
  syncId: string
  deletedAt: string
}

// ─── Backup Types ──────────────────────────────────
export interface BackupFile {
  version: string
  appName: string
  exportDate: string
  data: {
    members: Member[]
    assetCategories: AssetCategory[]
    assetItems: AssetItem[]
    dailyValues: DailyValue[]
    transactionCategories: TransactionCategory[]
    transactions: Transaction[]
    budgets?: Budget[]
    goals?: FinancialGoal[]
    paymentMethodItems?: PaymentMethodItem[]
    subscriptions?: Subscription[]
    loans?: Loan[]
    settings: Partial<Settings>
  }
}
