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
  isRecurring: boolean
  recurPattern?: RepeatPattern
  recurSourceId?: number
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

// ─── Settings Types ────────────────────────────────
export type ThemeMode = 'light' | 'dark' | 'system'
export type ColorPalette = 'default' | 'ocean' | 'rose' | 'purple' | 'forest'

export interface UserProfile {
  name: string
  avatarUrl?: string
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
    settings: Partial<Settings>
  }
}
