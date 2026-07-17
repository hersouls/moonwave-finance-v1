// ─── ID Model (Sync v2) ─────────────────────────────
//
// 모든 엔티티의 `id`는 전역 고유 문자열이다 (구 syncId가 PK로 승격).
//   - 새 레코드: crypto.randomUUID()
//   - 시드 기본값: 결정적 id ('default:member:본인' 등) — 기기 간 수렴
//   - Firestore 문서 id = encodeDocId(id) — 모든 기기에서 동일
// FK 필드(categoryId, memberId, …)도 부모의 문자열 id를 그대로 저장한다.
// 숫자 auto-increment id와 FK 리맵 레이어는 v2에서 폐기됨 (Dexie v14→16
// 마이그레이션이 기존 숫자 id/FK를 일괄 변환).

// ─── Member Types ──────────────────────────────────
export interface Member {
  id: string
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
  id: string
  name: string
  type: AssetLiabilityType
  color: string
  icon?: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

// ─── Asset Item Types ──────────────────────────────
/**
 * 자산 가치 변동 규칙 — 입력 시점부터 미래 값을 자동 투영(projection)한다.
 * 모두 비어있으면 평탄(flat: 동일 값 유지). 여러 규칙을 동시에 조합할 수 있다
 * (예: 부채 = 매월 상환(−) + 연 이자(+), 연금 = 매월 불입(+) + 연 수익(+)).
 */
export interface AssetValueProjection {
  /** 매일 ±정액 (예: 자동차 감가상각 = 음수, 일일이자 = 양수) */
  dailyDelta?: number
  /** 매월 ±정액 (예: 연금 불입 = 양수, 부채 상환 = 음수) */
  monthlyAmount?: number
  /** 매월 적용 날짜 (1-31, 해당 월 말일로 클램프) */
  monthlyDay?: number
  /** 연 정률 % (예: 예금이자 3.5, 물가 2, 부채이자 5). 음수도 가능. */
  annualRatePct?: number
  /** 정률 복리 여부 (true=복리/일복리, false·미지정=단리) */
  compound?: boolean
}

export interface AssetItem {
  id: string
  /** 구성원 FK — 마이그레이션에서 부모 소실 시 '' (미매칭 무해) */
  memberId: string
  categoryId: string
  name: string
  type: AssetLiabilityType
  memo?: string
  isActive: boolean
  sortOrder: number
  /** 가치 변동 규칙 (감가상각/월 불입 등). 없으면 평탄 유지. */
  projection?: AssetValueProjection
  createdAt: string
  updatedAt: string
}

// ─── Daily Value Types ─────────────────────────────
export interface DailyValue {
  id: string
  assetItemId: string
  date: string
  value: number
  /** 'manual' = 사용자 직접 입력(앵커), 'projected' = 규칙으로 자동 생성. 미지정은 자동으로 간주. */
  source?: 'manual' | 'projected'
  createdAt: string
  updatedAt: string
}

// ─── Transaction Types ─────────────────────────────
export type TransactionType = 'income' | 'expense'
export type PaymentMethod = 'cash' | 'credit_card' | 'debit_card' | 'bank_transfer' | 'loan' | 'other'

export interface TransactionCategory {
  id: string
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
  id: string
  type: PaymentMethod
  name: string
  memo?: string
  linkedAssetItemId?: string
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
  id: string
  memberId: string | null
  type: TransactionType
  amount: number
  categoryId: string | null
  date: string
  memo?: string
  paymentMethod?: PaymentMethod
  paymentMethodDetail?: string
  paymentMethodItemId?: string
  isRecurring: boolean
  recurPattern?: RepeatPattern
  recurSourceId?: string
  subscriptionId?: string
  /**
   * Optional subscription-type label (entertainment / productivity / cloud / …).
   * Independent of the user-defined transaction `categoryId` — acts as a
   * secondary classification so subscription-style expenses can be filtered
   * across the ledger regardless of which spending category they were
   * recorded under.
   */
  subscriptionCategory?: SubscriptionCategoryType
  /**
   * User marked this (memo+amount) as "not a duplicate" in 중복 거래 정리.
   * When set on any transaction, that whole memo+amount pattern is excluded
   * from duplicate detection (incl. future same-pattern rows). Synced like any
   * other field, so the allowance applies across devices.
   */
  dedupeIgnore?: boolean
  createdAt: string
  updatedAt: string
}

// ─── Budget Types ─────────────────────────────────
export interface Budget {
  id: string
  categoryId: string
  month: string // YYYY-MM
  amount: number
  createdAt: string
  updatedAt: string
}

// ─── Financial Goal Types ─────────────────────────
export type GoalType = 'savings' | 'debt' | 'investment' | 'custom'

export interface FinancialGoal {
  id: string
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
  | 'news' | 'education' | 'health' | 'shopping' | 'finance'
  | 'telecom' | 'other'

export interface PauseHistoryEntry {
  pausedAt: string    // YYYY-MM-DD
  resumedAt?: string  // YYYY-MM-DD, undefined = 현재 정지중
}

export interface Subscription {
  id: string
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
  paymentMethodItemId?: string
  linkedTransactionCategoryId?: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

// ─── Investment Trade Types ──────────────────────────
export type InvestmentMarket = 'domestic' | 'overseas'
export type InvestmentAssetType = '국내주식' | '해외주식' | '국내ETF' | '해외ETF' | '채권' | '펀드' | '기타'

export interface InvestmentTrade {
  id: string
  /** 구성원 FK */
  memberId: string | null
  /** 판매일 YYYY-MM-DD */
  sellDate: string
  /** 종목유형 */
  assetType: InvestmentAssetType
  /** 국내/해외 마켓 구분 */
  market: InvestmentMarket
  /** 종목명 */
  stockName: string
  /** 총 판매수익 (음수 가능) */
  totalProfit: number
  /** 수익률 (%) */
  profitRate: number
  /** 총 판매금액 */
  totalSellAmount: number
  /** 총 구매금액 */
  totalBuyAmount: number
  /** 판매수량 */
  sellQuantity: number
  /** 수수료 */
  fee: number
  /** 제세금 */
  tax: number
  /** 1주당 수익 */
  profitPerShare: number
  /** 1주당 판매가격 */
  sellPricePerShare: number
  /** 1주당 구매가격 */
  buyPricePerShare: number
  /** 환차손익 (해외 only, null이면 해당없음) */
  fxGainLoss: number | null
  /** 판매 환율 (해외 only) */
  sellExchangeRate: number | null
  /** 구매 환율 (해외 only) */
  buyExchangeRate: number | null
  /** 메모 */
  memo?: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

// ─── Dividend Types ──────────────────────────────────
export interface Dividend {
  id: string
  /** 구성원 FK */
  memberId: string | null
  /** 지급일 YYYY-MM-DD */
  paymentDate: string
  /** 배당락일 YYYY-MM-DD */
  exDividendDate: string
  /** 종목유형 */
  assetType: InvestmentAssetType
  /** 국내/해외 마켓 구분 */
  market: InvestmentMarket
  /** 종목명 */
  stockName: string
  /** 배당금 */
  dividendAmount: number
  /** 기준 수량 (소수 가능 — 해외주식 단주) */
  quantity: number
  /** 제세금·외국 납부 세금 */
  tax: number
  /** 비고 */
  memo?: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

// ─── Account Interest Types ──────────────────────────
export type InterestCurrency = 'KRW' | 'USD'

export interface AccountInterest {
  id: string
  /** 구성원 FK */
  memberId: string | null
  /** 입금일 YYYY-MM-DD */
  depositDate: string
  /** 쌓인 기간 시작 YYYY-MM-DD */
  periodStart: string
  /** 쌓인 기간 종료 YYYY-MM-DD */
  periodEnd: string
  /** 유형 (원화 이자 / 달러 이자) */
  interestType: string
  /** 통화 */
  currency: InterestCurrency
  /** 이자 금액 */
  interestAmount: number
  /** 제세금 */
  tax: number
  /** 이자율 (%) — e.g. 1.00 */
  interestRate: number
  /** 비고 */
  memo?: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

// ─── Loan Types ───────────────────────────────────
export type LoanRepaymentType = 'equal_principal' | 'equal_installment' | 'bullet' | 'custom'

export interface Loan {
  id: string
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
  linkedAssetItemId?: string
  memo?: string
  isActive: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

// ─── Settings Types ────────────────────────────────
export type ThemeMode = 'light' | 'dark' | 'system'
// v4 "One Purple": ColorPalette 타입 퇴역 — 브랜드 보라 단일 (index.css @theme)
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
  /** 자산 값 자동 이어쓰기 — 별도 입력이 없으면 어제 값을 오늘로 자동 저장 (기본 ON) */
  autoCarryForward?: boolean
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
  /** 총자산 월초 대비 증감 (대시보드 '총자산' 카드 '이번달'). */
  assetMonthlyChange: number
  /** 총부채 월초 대비 증감 (대시보드 '총부채' 카드 '이번달'). */
  liabilityMonthlyChange: number
}

export interface CategoryBreakdown {
  categoryId: string
  categoryName: string
  categoryColor: string
  total: number
  percentage: number
}

export interface MemberBreakdown {
  memberId: string
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

// ─── Merchant Alias (AI/learned category mapping) ──
export type MerchantAliasSource = 'user-override' | 'ai-suggestion'

export interface MerchantAlias {
  /** 결정적 id: `alias:<merchantKey>` — 기기 간 수렴 (merchantAliasService 참조) */
  id: string
  /** Normalized merchant key from normalizeMerchantKey() — unique. */
  merchantKey: string
  /** Resolved category id (FK to transactionCategories). */
  categoryId: string
  /** Optional subscription FK when the merchant was AI-classified as a known subscription. */
  subscriptionId?: string
  /** Optional subscription category label for keyword-style tagging. */
  subscriptionCategory?: SubscriptionCategoryType
  /** Where this alias came from — `user-override` wins over `ai-suggestion` on conflict. */
  source: MerchantAliasSource
  /** Optional original merchant name as displayed (for UI debugging). */
  sampleMerchant?: string
  /** Number of times this alias has been applied to an imported row. */
  usageCount: number
  learnedAt: string
  lastUsedAt?: string
  createdAt: string
  updatedAt: string
}

// ─── Sync Types ────────────────────────────────────
export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'offline'

export interface AuthUser {
  uid: string
  email: string
  displayName: string
  photoURL: string
}

/**
 * 동기화 아웃박스 — "이 레코드의 최신 상태를 클라우드에 반영해야 한다"는
 * 레코드 단위 마커. 내구성 있는 변경 로그가 아니다(그건 Firestore SDK의
 * persistentLocalCache가 소유): 업로드 페이로드는 항상 푸시 시점의 로컬
 * 최신 행에서 읽으므로, 같은 레코드를 몇 번 고쳐도 아웃박스에는 한 줄이다.
 * 앱이 setDoc 호출 전에 죽어도 아웃박스 행이 남아 다음 시작 때 재푸시된다
 * (at-least-once; setDoc은 전체 문서 교체 + LWW라 중복 전송이 무해하다).
 */
export interface SyncOutboxEntry {
  /** `${tableName}:${recordId}` — 레코드당 1행 (마지막 op가 이긴다) */
  key: string
  tableName: string
  recordId: string
  op: 'upsert' | 'delete'
  /** ISO — 조건부 삭제 판정(푸시 후 새 변경이 끼면 행 보존)에 쓴다 */
  queuedAt: string
  // dailyValues 전용 좌표 메타 — 번들 업로드가 (자산×월×일) 좌표를 알아야
  // 하는데, 삭제 항목은 행이 이미 사라져 id만으로는 좌표를 복원할 수 없다.
  assetItemId?: string
  date?: string
}

/**
 * 로컬 삭제 기록 — 오프라인 기기의 스테일 업서트가 SDK 큐로 재생될 때
 * 이미 삭제된 레코드를 부활시키는 것을 막는다. 삭제 훅과 클라우드 'removed'
 * 인제스트가 기록하고, 인제스트의 "로컬 행 없음 + 톰스톤이 더 새로움" 경로가
 * 적용을 거부하며 클라우드에 삭제를 재주장한다. 30일 후 정리된다.
 */
export interface SyncTombstone {
  /** `${tableName}:${recordId}` */
  key: string
  tableName: string
  recordId: string
  /** ISO — 삭제 시각. 클라우드 updatedAt과 비교해 부활 여부를 판정한다. */
  deletedAt: string
}

/** 클라우드 기기 레지스트리(presence) 문서 — users/{uid}/devices/{deviceId} */
export interface DeviceInfo {
  deviceId: string
  /** 사람이 읽는 기기 라벨 (UA 기반 자동 + 사용자 편집 가능) */
  label: string
  platform: string
  lastSeenAt: string
  /** 이 기기가 마지막으로 실행한 앱 동기화 프로토콜 버전 */
  syncProtocol: number
  createdAt: string
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
    investmentTrades?: InvestmentTrade[]
    dividends?: Dividend[]
    accountInterests?: AccountInterest[]
    settings: Partial<Settings>
  }
}
