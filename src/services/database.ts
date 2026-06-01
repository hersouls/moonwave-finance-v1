import Dexie, { type Table } from 'dexie'
import { DEFAULT_MEMBERS } from '@/utils/constants'
import type {
  Member,
  AssetCategory,
  AssetItem,
  DailyValue,
  TransactionCategory,
  Transaction,
  TransactionType,
  Budget,
  FinancialGoal,
  PaymentMethodItem,
  Subscription,
  Loan,
  InvestmentTrade,
  Dividend,
  AccountInterest,
  MerchantAlias,
  SyncChangeLogEntry,
  SyncTombstone,
} from '@/lib/types'

class FinanceDatabase extends Dexie {
  members!: Table<Member>
  assetCategories!: Table<AssetCategory>
  assetItems!: Table<AssetItem>
  dailyValues!: Table<DailyValue>
  transactionCategories!: Table<TransactionCategory>
  transactions!: Table<Transaction>
  budgets!: Table<Budget>
  goals!: Table<FinancialGoal>
  paymentMethodItems!: Table<PaymentMethodItem>
  subscriptions!: Table<Subscription>
  loans!: Table<Loan>
  investmentTrades!: Table<InvestmentTrade>
  dividends!: Table<Dividend>
  accountInterests!: Table<AccountInterest>
  merchantAliases!: Table<MerchantAlias>
  syncChangeLog!: Table<SyncChangeLogEntry>
  syncTombstones!: Table<SyncTombstone>

  constructor() {
    super('MoonwaveFinance')
    this.version(1).stores({
      members: '++id, syncId, name, sortOrder',
      assetCategories: '++id, syncId, name, type, sortOrder',
      assetItems: '++id, syncId, memberId, categoryId, type, isActive, sortOrder',
      dailyValues: '++id, syncId, assetItemId, date, [assetItemId+date]',
      transactionCategories: '++id, syncId, name, type, sortOrder',
      transactions: '++id, syncId, memberId, type, categoryId, date',
    })

    this.version(2).stores({
      members: '++id, syncId, name, sortOrder',
      assetCategories: '++id, syncId, name, type, sortOrder',
      assetItems: '++id, syncId, memberId, categoryId, type, isActive, sortOrder',
      dailyValues: '++id, syncId, assetItemId, date, [assetItemId+date]',
      transactionCategories: '++id, syncId, name, type, sortOrder',
      transactions: '++id, syncId, memberId, type, categoryId, date, isRecurring, recurSourceId',
      budgets: '++id, syncId, categoryId, month',
      goals: '++id, syncId, targetDate',
    })

    this.version(3).stores({
      members: '++id, syncId, name, sortOrder',
      assetCategories: '++id, syncId, name, type, sortOrder',
      assetItems: '++id, syncId, memberId, categoryId, type, isActive, sortOrder',
      dailyValues: '++id, syncId, assetItemId, date, [assetItemId+date]',
      transactionCategories: '++id, syncId, name, type, sortOrder',
      transactions: '++id, syncId, memberId, type, categoryId, date, isRecurring, recurSourceId, paymentMethod',
      budgets: '++id, syncId, categoryId, month',
      goals: '++id, syncId, targetDate',
    })

    this.version(4).stores({
      members: '++id, syncId, name, sortOrder',
      assetCategories: '++id, syncId, name, type, sortOrder',
      assetItems: '++id, syncId, memberId, categoryId, type, isActive, sortOrder',
      dailyValues: '++id, syncId, assetItemId, date, [assetItemId+date]',
      transactionCategories: '++id, syncId, name, type, sortOrder',
      transactions: '++id, syncId, memberId, type, categoryId, date, isRecurring, recurSourceId, paymentMethod, paymentMethodItemId',
      budgets: '++id, syncId, categoryId, month',
      goals: '++id, syncId, targetDate',
      paymentMethodItems: '++id, syncId, type, name, sortOrder',
    }).upgrade(async (tx) => {
      const transactions = await tx.table('transactions').toArray()
      const seen = new Map<string, { type: string; name: string }>()
      const now = new Date().toISOString()

      for (const t of transactions) {
        if (t.paymentMethod && t.paymentMethodDetail) {
          const key = `${t.paymentMethod}|${t.paymentMethodDetail}`
          if (!seen.has(key)) {
            seen.set(key, { type: t.paymentMethod, name: t.paymentMethodDetail })
          }
        }
      }

      const items = Array.from(seen.values())
      for (let i = 0; i < items.length; i++) {
        const id = await tx.table('paymentMethodItems').add({
          syncId: crypto.randomUUID(),
          type: items[i].type,
          name: items[i].name,
          isActive: true,
          sortOrder: i,
          createdAt: now,
          updatedAt: now,
        })
        await tx.table('transactions')
          .where('paymentMethod').equals(items[i].type)
          .filter((t: Transaction) => t.paymentMethodDetail === items[i].name)
          .modify({ paymentMethodItemId: id })
      }
    })

    this.version(5).stores({
      members: '++id, syncId, name, sortOrder',
      assetCategories: '++id, syncId, name, type, sortOrder',
      assetItems: '++id, syncId, memberId, categoryId, type, isActive, sortOrder',
      dailyValues: '++id, syncId, assetItemId, date, [assetItemId+date]',
      transactionCategories: '++id, syncId, name, type, sortOrder',
      transactions: '++id, syncId, memberId, type, categoryId, date, isRecurring, recurSourceId, paymentMethod, paymentMethodItemId',
      budgets: '++id, syncId, categoryId, month',
      goals: '++id, syncId, targetDate',
      paymentMethodItems: '++id, syncId, type, name, sortOrder',
      subscriptions: '++id, syncId, currency, category, status, billingDay, cycle, sortOrder',
    })

    this.version(6).stores({
      members: '++id, syncId, name, sortOrder',
      assetCategories: '++id, syncId, name, type, sortOrder',
      assetItems: '++id, syncId, memberId, categoryId, type, isActive, sortOrder',
      dailyValues: '++id, syncId, assetItemId, date, [assetItemId+date]',
      transactionCategories: '++id, syncId, name, type, sortOrder',
      transactions: '++id, syncId, memberId, type, categoryId, date, isRecurring, recurSourceId, paymentMethod, paymentMethodItemId, subscriptionId',
      budgets: '++id, syncId, categoryId, month',
      goals: '++id, syncId, targetDate',
      paymentMethodItems: '++id, syncId, type, name, sortOrder, linkedAssetItemId',
      subscriptions: '++id, syncId, currency, category, status, billingDay, cycle, sortOrder, paymentMethodItemId',
    })

    // v7: pauseHistory, customCycleDays added as non-indexed JSON fields — no schema change needed
    this.version(7).stores({
      members: '++id, syncId, name, sortOrder',
      assetCategories: '++id, syncId, name, type, sortOrder',
      assetItems: '++id, syncId, memberId, categoryId, type, isActive, sortOrder',
      dailyValues: '++id, syncId, assetItemId, date, [assetItemId+date]',
      transactionCategories: '++id, syncId, name, type, sortOrder',
      transactions: '++id, syncId, memberId, type, categoryId, date, isRecurring, recurSourceId, paymentMethod, paymentMethodItemId, subscriptionId',
      budgets: '++id, syncId, categoryId, month',
      goals: '++id, syncId, targetDate',
      paymentMethodItems: '++id, syncId, type, name, sortOrder, linkedAssetItemId',
      subscriptions: '++id, syncId, currency, category, status, billingDay, cycle, sortOrder, paymentMethodItemId',
    })

    // v8: syncChangeLog + syncTombstones for incremental multi-device sync
    this.version(8).stores({
      members: '++id, syncId, name, sortOrder',
      assetCategories: '++id, syncId, name, type, sortOrder',
      assetItems: '++id, syncId, memberId, categoryId, type, isActive, sortOrder',
      dailyValues: '++id, syncId, assetItemId, date, [assetItemId+date]',
      transactionCategories: '++id, syncId, name, type, sortOrder',
      transactions: '++id, syncId, memberId, type, categoryId, date, isRecurring, recurSourceId, paymentMethod, paymentMethodItemId, subscriptionId',
      budgets: '++id, syncId, categoryId, month',
      goals: '++id, syncId, targetDate',
      paymentMethodItems: '++id, syncId, type, name, sortOrder, linkedAssetItemId',
      subscriptions: '++id, syncId, currency, category, status, billingDay, cycle, sortOrder, paymentMethodItemId',
      syncChangeLog: '++id, tableName, syncId, processed, timestamp, [tableName+syncId]',
      syncTombstones: '++id, tableName, syncId, deletedAt, [tableName+syncId]',
    })

    // v9: add 부동산 asset category for existing users
    this.version(9).stores({}).upgrade(async (tx: any) => {
      const cats = await tx.table('assetCategories').toArray()
      const hasRealEstate = cats.some((c: AssetCategory) => c.name === '부동산')
      if (!hasRealEstate) {
        const now = new Date().toISOString()
        const maxSort = cats
          .filter((c: AssetCategory) => c.type === 'asset')
          .reduce((max: number, c: AssetCategory) => Math.max(max, c.sortOrder), -1)
        await tx.table('assetCategories').add({
          name: '부동산',
          type: 'asset',
          color: '#D97706',
          icon: 'Home',
          sortOrder: maxSort + 1,
          syncId: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
        })
      }
    })

    // v10: add loans table + "대출이자" expense category for existing users
    this.version(10).stores({
      members: '++id, syncId, name, sortOrder',
      assetCategories: '++id, syncId, name, type, sortOrder',
      assetItems: '++id, syncId, memberId, categoryId, type, isActive, sortOrder',
      dailyValues: '++id, syncId, assetItemId, date, [assetItemId+date]',
      transactionCategories: '++id, syncId, name, type, sortOrder',
      transactions: '++id, syncId, memberId, type, categoryId, date, isRecurring, recurSourceId, paymentMethod, paymentMethodItemId, subscriptionId',
      budgets: '++id, syncId, categoryId, month',
      goals: '++id, syncId, targetDate',
      paymentMethodItems: '++id, syncId, type, name, sortOrder, linkedAssetItemId',
      subscriptions: '++id, syncId, currency, category, status, billingDay, cycle, sortOrder, paymentMethodItemId',
      loans: '++id, syncId, isActive, sortOrder',
      syncChangeLog: '++id, tableName, syncId, processed, timestamp, [tableName+syncId]',
      syncTombstones: '++id, tableName, syncId, deletedAt, [tableName+syncId]',
    }).upgrade(async (tx: any) => {
      const cats = await tx.table('transactionCategories').toArray()
      const hasLoanInterest = cats.some((c: TransactionCategory) => c.name === '대출이자')
      if (!hasLoanInterest) {
        const now = new Date().toISOString()
        const expenseCats = cats.filter((c: TransactionCategory) => c.type === 'expense')
        const maxSort = expenseCats.reduce((max: number, c: TransactionCategory) => Math.max(max, c.sortOrder), -1)
        await tx.table('transactionCategories').add({
          name: '대출이자',
          type: 'expense',
          color: '#B91C1C',
          icon: 'Percent',
          isDefault: true,
          sortOrder: maxSort + 1,
          syncId: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
        })
      }
    })

    // v11: merchantAliases table (AI / learned merchant→category aliases)
    this.version(11).stores({
      members: '++id, syncId, name, sortOrder',
      assetCategories: '++id, syncId, name, type, sortOrder',
      assetItems: '++id, syncId, memberId, categoryId, type, isActive, sortOrder',
      dailyValues: '++id, syncId, assetItemId, date, [assetItemId+date]',
      transactionCategories: '++id, syncId, name, type, sortOrder',
      transactions: '++id, syncId, memberId, type, categoryId, date, isRecurring, recurSourceId, paymentMethod, paymentMethodItemId, subscriptionId',
      budgets: '++id, syncId, categoryId, month',
      goals: '++id, syncId, targetDate',
      paymentMethodItems: '++id, syncId, type, name, sortOrder, linkedAssetItemId',
      subscriptions: '++id, syncId, currency, category, status, billingDay, cycle, sortOrder, paymentMethodItemId',
      loans: '++id, syncId, isActive, sortOrder',
      merchantAliases: '++id, syncId, &merchantKey, categoryId, source, learnedAt, lastUsedAt',
      syncChangeLog: '++id, tableName, syncId, processed, timestamp, [tableName+syncId]',
      syncTombstones: '++id, tableName, syncId, deletedAt, [tableName+syncId]',
    })

    // v12: add investmentTrades + dividends + accountInterests tables
    this.version(12).stores({
      members: '++id, syncId, name, sortOrder',
      assetCategories: '++id, syncId, name, type, sortOrder',
      assetItems: '++id, syncId, memberId, categoryId, type, isActive, sortOrder',
      dailyValues: '++id, syncId, assetItemId, date, [assetItemId+date]',
      transactionCategories: '++id, syncId, name, type, sortOrder',
      transactions: '++id, syncId, memberId, type, categoryId, date, isRecurring, recurSourceId, paymentMethod, paymentMethodItemId, subscriptionId',
      budgets: '++id, syncId, categoryId, month',
      goals: '++id, syncId, targetDate',
      paymentMethodItems: '++id, syncId, type, name, sortOrder, linkedAssetItemId',
      subscriptions: '++id, syncId, currency, category, status, billingDay, cycle, sortOrder, paymentMethodItemId',
      loans: '++id, syncId, isActive, sortOrder',
      investmentTrades: '++id, syncId, memberId, sellDate, assetType, market, stockName, sortOrder, [sellDate+stockName+sellQuantity]',
      dividends: '++id, syncId, memberId, paymentDate, exDividendDate, assetType, market, stockName, sortOrder, [paymentDate+stockName+quantity]',
      accountInterests: '++id, syncId, memberId, depositDate, currency, interestType, sortOrder, [depositDate+periodStart+periodEnd+currency]',
      merchantAliases: '++id, syncId, &merchantKey, categoryId, source, learnedAt, lastUsedAt',
      syncChangeLog: '++id, tableName, syncId, processed, timestamp, [tableName+syncId]',
      syncTombstones: '++id, tableName, syncId, deletedAt, [tableName+syncId]',
    })
  }
}

const db = new FinanceDatabase()

// ─── Change Tracking for Incremental Sync ────────────
// Tracks all local mutations to syncChangeLog for incremental upload.
// Uses a module-level flag to skip logging writes that come from the sync system itself.
let _syncWritingCount = 0
export function setSyncWritingFlag(v: boolean) {
  if (v) _syncWritingCount++
  else _syncWritingCount = Math.max(0, _syncWritingCount - 1)
}
export function getSyncWritingFlag() { return _syncWritingCount > 0 }

type SyncableTableName = 'members' | 'assetCategories' | 'assetItems' | 'dailyValues' | 'transactionCategories' | 'transactions' | 'budgets' | 'goals' | 'paymentMethodItems' | 'subscriptions' | 'loans' | 'investmentTrades' | 'dividends' | 'accountInterests' | 'merchantAliases'

function installChangeTracking() {
  const tables: { table: Table; name: SyncableTableName }[] = [
    { table: db.members, name: 'members' },
    { table: db.assetCategories, name: 'assetCategories' },
    { table: db.assetItems, name: 'assetItems' },
    { table: db.dailyValues, name: 'dailyValues' },
    { table: db.transactionCategories, name: 'transactionCategories' },
    { table: db.transactions, name: 'transactions' },
    { table: db.budgets, name: 'budgets' },
    { table: db.goals, name: 'goals' },
    { table: db.paymentMethodItems, name: 'paymentMethodItems' },
    { table: db.subscriptions, name: 'subscriptions' },
    { table: db.loans, name: 'loans' },
    { table: db.investmentTrades, name: 'investmentTrades' },
    { table: db.dividends, name: 'dividends' },
    { table: db.accountInterests, name: 'accountInterests' },
    { table: db.merchantAliases, name: 'merchantAliases' },
  ]

  for (const { table, name } of tables) {
    table.hook('creating', function (_primKey, obj) {
      if (_syncWritingCount > 0) return
      const syncId = obj?.syncId as string | undefined
      if (syncId) {
        db.syncChangeLog.add({
          tableName: name,
          syncId,
          operation: 'create',
          timestamp: new Date().toISOString(),
          processed: 0,
        })
      }
    })

    table.hook('updating', function (_mods, _primKey, obj) {
      if (_syncWritingCount > 0) return
      const syncId = obj?.syncId as string | undefined
      if (syncId) {
        db.syncChangeLog.add({
          tableName: name,
          syncId,
          operation: 'update',
          timestamp: new Date().toISOString(),
          processed: 0,
        })
      }
    })

    table.hook('deleting', function (_primKey, obj) {
      if (_syncWritingCount > 0) return
      const syncId = obj?.syncId as string | undefined
      if (syncId) {
        db.syncChangeLog.add({
          tableName: name,
          syncId,
          operation: 'delete',
          timestamp: new Date().toISOString(),
          processed: 0,
        })
        db.syncTombstones.add({
          tableName: name,
          syncId,
          deletedAt: new Date().toISOString(),
        })
      }
    })
  }
}

installChangeTracking()

// Deterministic syncIds for seeded defaults. Used by both `db.on('populate')`
// (initial seed) and `ensureDefaultCategories` (late-addition top-up) so that
// every device produces identical syncIds for the same logical default record.
// This eliminates the new-device duplicate bug at the source.
const defaultMemberSyncId = (name: string) => `default:member:${name}`
const defaultAssetCatSyncId = (type: string, name: string) => `default:assetCat:${type}:${name}`
const defaultTxnCatSyncId = (type: string, name: string) => `default:txnCat:${type}:${name}`

// Ensure default categories exist — called from App.tsx init, NOT from db.on('ready')
// because async db.on('ready') callbacks cause Dexie deadlock (queries hang forever).
//
// Uses deterministic syncIds (matching `db.on('populate')`) so that late-added
// defaults converge across devices via syncId equality instead of duplicating.
export async function ensureDefaultCategories(): Promise<void> {
  const assetCats = await db.assetCategories.toArray()
  if (!assetCats.some((c) => c.name === '부동산')) {
    setSyncWritingFlag(true)
    try {
      const now = new Date().toISOString()
      const maxSort = assetCats
        .filter((c) => c.type === 'asset')
        .reduce((max, c) => Math.max(max, c.sortOrder), -1)
      await db.assetCategories.add({
        name: '부동산',
        type: 'asset',
        color: '#D97706',
        icon: 'Home',
        sortOrder: maxSort + 1,
        syncId: defaultAssetCatSyncId('asset', '부동산'),
        createdAt: now,
        updatedAt: now,
      } as AssetCategory)
    } finally {
      setSyncWritingFlag(false)
    }
  }

  const txnCats = await db.transactionCategories.toArray()
  if (!txnCats.some((c) => c.name === '대출이자')) {
    setSyncWritingFlag(true)
    try {
      const now = new Date().toISOString()
      const expenseCats = txnCats.filter((c) => c.type === 'expense')
      const maxSort = expenseCats.reduce((max, c) => Math.max(max, c.sortOrder), -1)
      await db.transactionCategories.add({
        name: '대출이자',
        type: 'expense',
        color: '#B91C1C',
        icon: 'Percent',
        isDefault: true,
        sortOrder: maxSort + 1,
        syncId: defaultTxnCatSyncId('expense', '대출이자'),
        createdAt: now,
        updatedAt: now,
      } as TransactionCategory)
    } finally {
      setSyncWritingFlag(false)
    }
  }
}

db.on('populate', () => {
  const now = new Date().toISOString()

  // Default members
  db.members.bulkAdd(
    DEFAULT_MEMBERS.map((m, i) => ({
      ...m,
      isDefault: true,
      sortOrder: i,
      syncId: defaultMemberSyncId(m.name),
      createdAt: now,
      updatedAt: now,
    }))
  )

  // Default asset categories
  db.assetCategories.bulkAdd([
    { name: '퇴직금', type: 'asset', color: '#6366F1', icon: 'Landmark', sortOrder: 0, syncId: defaultAssetCatSyncId('asset', '퇴직금'), createdAt: now, updatedAt: now },
    { name: '주식', type: 'asset', color: '#3B82F6', icon: 'TrendingUp', sortOrder: 1, syncId: defaultAssetCatSyncId('asset', '주식'), createdAt: now, updatedAt: now },
    { name: '암호화폐', type: 'asset', color: '#F59E0B', icon: 'Bitcoin', sortOrder: 2, syncId: defaultAssetCatSyncId('asset', '암호화폐'), createdAt: now, updatedAt: now },
    { name: '거래소 현금', type: 'asset', color: '#10B981', icon: 'Banknote', sortOrder: 3, syncId: defaultAssetCatSyncId('asset', '거래소 현금'), createdAt: now, updatedAt: now },
    { name: '금', type: 'asset', color: '#EAB308', icon: 'Gem', sortOrder: 4, syncId: defaultAssetCatSyncId('asset', '금'), createdAt: now, updatedAt: now },
    { name: '은행계좌', type: 'asset', color: '#06B6D4', icon: 'Building2', sortOrder: 5, syncId: defaultAssetCatSyncId('asset', '은행계좌'), createdAt: now, updatedAt: now },
    { name: '부동산', type: 'asset', color: '#D97706', icon: 'Home', sortOrder: 6, syncId: defaultAssetCatSyncId('asset', '부동산'), createdAt: now, updatedAt: now },
    { name: '기타자산', type: 'asset', color: '#8B5CF6', icon: 'Package', sortOrder: 7, syncId: defaultAssetCatSyncId('asset', '기타자산'), createdAt: now, updatedAt: now },
    { name: '주택대출', type: 'liability', color: '#EF4444', icon: 'Home', sortOrder: 0, syncId: defaultAssetCatSyncId('liability', '주택대출'), createdAt: now, updatedAt: now },
    { name: '신용대출', type: 'liability', color: '#F97316', icon: 'CreditCard', sortOrder: 1, syncId: defaultAssetCatSyncId('liability', '신용대출'), createdAt: now, updatedAt: now },
    { name: '마이너스 대출', type: 'liability', color: '#DC2626', icon: 'MinusCircle', sortOrder: 2, syncId: defaultAssetCatSyncId('liability', '마이너스 대출'), createdAt: now, updatedAt: now },
    { name: '회사 대출', type: 'liability', color: '#E11D48', icon: 'Building', sortOrder: 3, syncId: defaultAssetCatSyncId('liability', '회사 대출'), createdAt: now, updatedAt: now },
    { name: '개인 대출', type: 'liability', color: '#BE185D', icon: 'Users', sortOrder: 4, syncId: defaultAssetCatSyncId('liability', '개인 대출'), createdAt: now, updatedAt: now },
  ])

  // Default transaction categories
  db.transactionCategories.bulkAdd([
    // Income
    { name: '월급', type: 'income', color: '#10B981', icon: 'Briefcase', isDefault: true, sortOrder: 0, syncId: defaultTxnCatSyncId('income', '월급'), createdAt: now, updatedAt: now },
    { name: '부수입', type: 'income', color: '#06B6D4', icon: 'Coins', isDefault: true, sortOrder: 1, syncId: defaultTxnCatSyncId('income', '부수입'), createdAt: now, updatedAt: now },
    { name: '투자수익', type: 'income', color: '#8B5CF6', icon: 'TrendingUp', isDefault: true, sortOrder: 2, syncId: defaultTxnCatSyncId('income', '투자수익'), createdAt: now, updatedAt: now },
    { name: '다연여행수입', type: 'income', color: '#14B8A6', icon: 'Plane', isDefault: true, sortOrder: 3, syncId: defaultTxnCatSyncId('income', '다연여행수입'), createdAt: now, updatedAt: now },
    { name: '가상화폐수익', type: 'income', color: '#F59E0B', icon: 'Bitcoin', isDefault: true, sortOrder: 4, syncId: defaultTxnCatSyncId('income', '가상화폐수익'), createdAt: now, updatedAt: now },
    { name: '주식수익', type: 'income', color: '#22C55E', icon: 'LineChart', isDefault: true, sortOrder: 5, syncId: defaultTxnCatSyncId('income', '주식수익'), createdAt: now, updatedAt: now },
    { name: '기타', type: 'income', color: '#71717A', icon: 'MoreHorizontal', isDefault: true, sortOrder: 6, syncId: defaultTxnCatSyncId('income', '기타'), createdAt: now, updatedAt: now },
    // Expense
    { name: '식비', type: 'expense', color: '#F59E0B', icon: 'UtensilsCrossed', isDefault: true, sortOrder: 0, syncId: defaultTxnCatSyncId('expense', '식비'), createdAt: now, updatedAt: now },
    { name: '교통비', type: 'expense', color: '#3B82F6', icon: 'Car', isDefault: true, sortOrder: 1, syncId: defaultTxnCatSyncId('expense', '교통비'), createdAt: now, updatedAt: now },
    { name: '주거비', type: 'expense', color: '#8B5CF6', icon: 'Home', isDefault: true, sortOrder: 2, syncId: defaultTxnCatSyncId('expense', '주거비'), createdAt: now, updatedAt: now },
    { name: '통신비', type: 'expense', color: '#EC4899', icon: 'Smartphone', isDefault: true, sortOrder: 3, syncId: defaultTxnCatSyncId('expense', '통신비'), createdAt: now, updatedAt: now },
    { name: '의료비', type: 'expense', color: '#EF4444', icon: 'Heart', isDefault: true, sortOrder: 4, syncId: defaultTxnCatSyncId('expense', '의료비'), createdAt: now, updatedAt: now },
    { name: '교육비', type: 'expense', color: '#6366F1', icon: 'GraduationCap', isDefault: true, sortOrder: 5, syncId: defaultTxnCatSyncId('expense', '교육비'), createdAt: now, updatedAt: now },
    { name: '건강', type: 'expense', color: '#EF4444', icon: 'HeartPulse', isDefault: true, sortOrder: 6, syncId: defaultTxnCatSyncId('expense', '건강'), createdAt: now, updatedAt: now },
    { name: '경조사/회비', type: 'expense', color: '#A855F7', icon: 'Gift', isDefault: true, sortOrder: 7, syncId: defaultTxnCatSyncId('expense', '경조사/회비'), createdAt: now, updatedAt: now },
    { name: '대출상환', type: 'expense', color: '#DC2626', icon: 'Landmark', isDefault: true, sortOrder: 8, syncId: defaultTxnCatSyncId('expense', '대출상환'), createdAt: now, updatedAt: now },
    { name: '대출이자', type: 'expense', color: '#B91C1C', icon: 'Percent', isDefault: true, sortOrder: 9, syncId: defaultTxnCatSyncId('expense', '대출이자'), createdAt: now, updatedAt: now },
    { name: '마트/편의점', type: 'expense', color: '#FB923C', icon: 'ShoppingCart', isDefault: true, sortOrder: 10, syncId: defaultTxnCatSyncId('expense', '마트/편의점'), createdAt: now, updatedAt: now },
    { name: '보험', type: 'expense', color: '#0EA5E9', icon: 'Shield', isDefault: true, sortOrder: 11, syncId: defaultTxnCatSyncId('expense', '보험'), createdAt: now, updatedAt: now },
    { name: '부모님', type: 'expense', color: '#EC4899', icon: 'Heart', isDefault: true, sortOrder: 12, syncId: defaultTxnCatSyncId('expense', '부모님'), createdAt: now, updatedAt: now },
    { name: '생활용품', type: 'expense', color: '#84CC16', icon: 'Package', isDefault: true, sortOrder: 13, syncId: defaultTxnCatSyncId('expense', '생활용품'), createdAt: now, updatedAt: now },
    { name: '여행', type: 'expense', color: '#06B6D4', icon: 'Map', isDefault: true, sortOrder: 14, syncId: defaultTxnCatSyncId('expense', '여행'), createdAt: now, updatedAt: now },
    { name: '카드대금', type: 'expense', color: '#F43F5E', icon: 'CreditCard', isDefault: true, sortOrder: 15, syncId: defaultTxnCatSyncId('expense', '카드대금'), createdAt: now, updatedAt: now },
    { name: '투자', type: 'expense', color: '#6366F1', icon: 'TrendingUp', isDefault: true, sortOrder: 16, syncId: defaultTxnCatSyncId('expense', '투자'), createdAt: now, updatedAt: now },
    { name: '패션/미용', type: 'expense', color: '#E879F9', icon: 'Shirt', isDefault: true, sortOrder: 17, syncId: defaultTxnCatSyncId('expense', '패션/미용'), createdAt: now, updatedAt: now },
    { name: '기타', type: 'expense', color: '#71717A', icon: 'MoreHorizontal', isDefault: true, sortOrder: 18, syncId: defaultTxnCatSyncId('expense', '기타'), createdAt: now, updatedAt: now },
  ])
})

export { db }

// ─── Member CRUD ──────────────────────────────────
export async function getAllMembers(): Promise<Member[]> {
  return db.members.orderBy('sortOrder').toArray()
}

export async function addMember(member: Omit<Member, 'id'>): Promise<number> {
  return db.members.add(member as Member) as Promise<number>
}

export async function updateMember(id: number, updates: Partial<Member>): Promise<void> {
  await db.members.update(id, { ...updates, updatedAt: new Date().toISOString() })
}

export async function deleteMember(id: number): Promise<void> {
  await db.transaction('rw', [db.members, db.assetItems, db.dailyValues, db.transactions], async () => {
    const items = await db.assetItems.where('memberId').equals(id).toArray()
    for (const item of items) {
      await db.dailyValues.where('assetItemId').equals(item.id!).delete()
    }
    await db.assetItems.where('memberId').equals(id).delete()
    await db.transactions.where('memberId').equals(id).delete()
    await db.members.delete(id)
  })
}

// ─── AssetCategory CRUD ───────────────────────────
export async function getAllAssetCategories(): Promise<AssetCategory[]> {
  return db.assetCategories.orderBy('sortOrder').toArray()
}

export async function addAssetCategory(cat: Omit<AssetCategory, 'id'>): Promise<number> {
  return db.assetCategories.add(cat as AssetCategory) as Promise<number>
}

export async function updateAssetCategory(id: number, updates: Partial<AssetCategory>): Promise<void> {
  await db.assetCategories.update(id, { ...updates, updatedAt: new Date().toISOString() })
}

export async function deleteAssetCategory(id: number): Promise<void> {
  await db.transaction('rw', [db.assetCategories, db.assetItems, db.dailyValues], async () => {
    const items = await db.assetItems.where('categoryId').equals(id).toArray()
    for (const item of items) {
      await db.dailyValues.where('assetItemId').equals(item.id!).delete()
    }
    await db.assetItems.where('categoryId').equals(id).delete()
    await db.assetCategories.delete(id)
  })
}

// ─── AssetItem CRUD ───────────────────────────────
export async function getAllAssetItems(): Promise<AssetItem[]> {
  return db.assetItems.orderBy('sortOrder').toArray()
}

export async function getAssetItemsByMember(memberId: number): Promise<AssetItem[]> {
  return db.assetItems.where('memberId').equals(memberId).toArray()
}

export async function getAssetItemsByCategory(categoryId: number): Promise<AssetItem[]> {
  return db.assetItems.where('categoryId').equals(categoryId).toArray()
}

export async function addAssetItem(item: Omit<AssetItem, 'id'>): Promise<number> {
  return db.assetItems.add(item as AssetItem) as Promise<number>
}

export async function updateAssetItem(id: number, updates: Partial<AssetItem>): Promise<void> {
  await db.assetItems.update(id, { ...updates, updatedAt: new Date().toISOString() })
}

/** 자산/부채 항목 삭제 + 일별값 삭제 + 연결된 대출의 댕글링 FK(linkedAssetItemId) 정리.
 *  반환 = FK 가 해제된 대출 레코드들(호출부에서 클라우드에도 반영하도록). */
export async function deleteAssetItem(id: number): Promise<Loan[]> {
  const now = new Date().toISOString()
  let cleared: Loan[] = []
  await db.transaction('rw', [db.assetItems, db.dailyValues, db.loans], async () => {
    await db.dailyValues.where('assetItemId').equals(id).delete()
    await db.assetItems.delete(id)
    // linkedAssetItemId 는 인덱스가 아니므로 인메모리 filter 로 조회 후 일괄 해제.
    const linked = await db.loans.filter(l => l.linkedAssetItemId === id).toArray()
    if (linked.length > 0) {
      cleared = linked.map(l => ({ ...l, linkedAssetItemId: undefined, updatedAt: now }))
      await db.loans.bulkPut(cleared)
    }
  })
  return cleared
}

// ─── DailyValue CRUD ──────────────────────────────
export async function getAllDailyValues(): Promise<DailyValue[]> {
  return db.dailyValues.toArray()
}

export async function getDailyValuesByMonth(month: string): Promise<DailyValue[]> {
  return db.dailyValues
    .where('date')
    .between(month + '-01', month + '-31', true, true)
    .toArray()
}

export async function getDailyValuesByItem(assetItemId: number): Promise<DailyValue[]> {
  return db.dailyValues.where('assetItemId').equals(assetItemId).toArray()
}

export async function getDailyValue(assetItemId: number, date: string): Promise<DailyValue | undefined> {
  return db.dailyValues.where('[assetItemId+date]').equals([assetItemId, date]).first()
}

export async function setDailyValue(assetItemId: number, date: string, value: number): Promise<void> {
  const now = new Date().toISOString()
  const existing = await getDailyValue(assetItemId, date)
  if (existing) {
    await db.dailyValues.update(existing.id!, { value, updatedAt: now })
  } else {
    await db.dailyValues.add({
      assetItemId,
      date,
      value,
      syncId: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    } as DailyValue)
  }
}

export async function bulkSetDailyValues(entries: { assetItemId: number; date: string; value: number; source?: 'manual' | 'projected' }[]): Promise<void> {
  const now = new Date().toISOString()
  await db.transaction('rw', db.dailyValues, async () => {
    for (const entry of entries) {
      const existing = await getDailyValue(entry.assetItemId, entry.date)
      if (existing) {
        await db.dailyValues.update(existing.id!, { value: entry.value, source: entry.source ?? existing.source, updatedAt: now })
      } else {
        await db.dailyValues.add({
          assetItemId: entry.assetItemId,
          date: entry.date,
          value: entry.value,
          source: entry.source,
          syncId: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
        } as DailyValue)
      }
    }
  })
}

/** 항목의 자동 생성(projected) 일별 값을 모두 삭제한다. 수동 입력(manual)은 보존.
 *  평탄 규칙으로 전환하거나 희소 저장으로 정리할 때 사용. 반환=삭제된 syncId 목록. */
export async function clearProjectedDailyValues(assetItemId: number): Promise<string[]> {
  const vals = await db.dailyValues.where('assetItemId').equals(assetItemId).toArray()
  const toDelete = vals.filter(v => v.source !== 'manual' && v.source !== undefined) // 명시적 projected 만
  const ids = toDelete.map(v => v.id!).filter((x): x is number => x != null)
  const syncIds = toDelete.map(v => v.syncId).filter((x): x is string => !!x)
  if (ids.length > 0) await db.dailyValues.bulkDelete(ids)
  return syncIds
}

export async function getLatestDailyValues(assetItemId: number, limit: number = 30): Promise<DailyValue[]> {
  const vals = await db.dailyValues
    .where('assetItemId')
    .equals(assetItemId)
    .toArray()
  return vals.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit)
}

// ─── TransactionCategory CRUD ─────────────────────
export async function getAllTransactionCategories(): Promise<TransactionCategory[]> {
  return db.transactionCategories.orderBy('sortOrder').toArray()
}

export async function addTransactionCategory(cat: Omit<TransactionCategory, 'id'>): Promise<number> {
  return db.transactionCategories.add(cat as TransactionCategory) as Promise<number>
}

export async function updateTransactionCategory(id: number, updates: Partial<TransactionCategory>): Promise<void> {
  await db.transactionCategories.update(id, { ...updates, updatedAt: new Date().toISOString() })
}

export async function deleteTransactionCategory(id: number): Promise<void> {
  await db.transaction('rw', [db.transactionCategories, db.transactions], async () => {
    await db.transactions.where('categoryId').equals(id).modify({ categoryId: null })
    await db.transactionCategories.delete(id)
  })
}

export interface TransactionCategoryUsage {
  transactionCount: number
  transactionTotal: number
  incomeCount: number
  incomeTotal: number
  expenseCount: number
  expenseTotal: number
  recurringSourceCount: number
  budgetCount: number
  budgetMonths: string[]
  linkedSubscriptions: { id: number; name: string }[]
  recentTransactions: { id: number; date: string; amount: number; memo?: string; type: TransactionType }[]
}

export async function getTransactionCategoryUsage(id: number): Promise<TransactionCategoryUsage> {
  const [transactions, budgets, subscriptions] = await Promise.all([
    db.transactions.where('categoryId').equals(id).toArray(),
    db.budgets.where('categoryId').equals(id).toArray(),
    db.subscriptions.toArray(),
  ])

  let incomeCount = 0
  let incomeTotal = 0
  let expenseCount = 0
  let expenseTotal = 0
  let recurringSourceCount = 0
  for (const t of transactions) {
    if (t.type === 'income') {
      incomeCount += 1
      incomeTotal += t.amount
    } else {
      expenseCount += 1
      expenseTotal += t.amount
    }
    if (t.isRecurring && !t.recurSourceId) recurringSourceCount += 1
  }

  const recentTransactions = [...transactions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5)
    .map(t => ({ id: t.id!, date: t.date, amount: t.amount, memo: t.memo, type: t.type }))

  const budgetMonths = Array.from(new Set(budgets.map(b => b.month))).sort((a, b) => b.localeCompare(a))

  const linkedSubscriptions = subscriptions
    .filter(s => s.linkedTransactionCategoryId === id)
    .map(s => ({ id: s.id!, name: s.name }))

  return {
    transactionCount: transactions.length,
    transactionTotal: incomeTotal + expenseTotal,
    incomeCount,
    incomeTotal,
    expenseCount,
    expenseTotal,
    recurringSourceCount,
    budgetCount: budgets.length,
    budgetMonths,
    linkedSubscriptions,
    recentTransactions,
  }
}

// ─── PaymentMethodItem CRUD ──────────────────────
export async function getAllPaymentMethodItems(): Promise<PaymentMethodItem[]> {
  return db.paymentMethodItems.orderBy('sortOrder').toArray()
}

export async function getPaymentMethodItemsByType(type: string): Promise<PaymentMethodItem[]> {
  return db.paymentMethodItems.where('type').equals(type).sortBy('sortOrder')
}

export async function addPaymentMethodItem(item: Omit<PaymentMethodItem, 'id'>): Promise<number> {
  return db.paymentMethodItems.add(item as PaymentMethodItem) as Promise<number>
}

export async function updatePaymentMethodItem(id: number, updates: Partial<PaymentMethodItem>): Promise<void> {
  await db.paymentMethodItems.update(id, { ...updates, updatedAt: new Date().toISOString() })
}

export async function deletePaymentMethodItem(id: number): Promise<void> {
  await db.transaction('rw', [db.paymentMethodItems, db.transactions], async () => {
    await db.transactions.where('paymentMethodItemId').equals(id).modify({ paymentMethodItemId: undefined })
    await db.paymentMethodItems.delete(id)
  })
}

// ─── Transaction CRUD ─────────────────────────────
export async function getAllTransactions(): Promise<Transaction[]> {
  return db.transactions.toArray()
}

export async function getTransactionsByMonth(month: string): Promise<Transaction[]> {
  return db.transactions
    .where('date')
    .between(month + '-01', month + '-31', true, true)
    .toArray()
}

export async function getTransactionsByDateRange(start: string, end: string): Promise<Transaction[]> {
  return db.transactions
    .where('date')
    .between(start, end, true, true)
    .toArray()
}

export async function addTransaction(txn: Omit<Transaction, 'id'>): Promise<number> {
  return db.transactions.add(txn as Transaction) as Promise<number>
}

export async function updateTransaction(id: number, updates: Partial<Transaction>): Promise<void> {
  await db.transactions.update(id, { ...updates, updatedAt: new Date().toISOString() })
}

export async function deleteTransaction(id: number): Promise<void> {
  await db.transactions.delete(id)
}

export async function bulkDeleteTransactions(ids: number[]): Promise<void> {
  await db.transaction('rw', db.transactions, async () => {
    for (const id of ids) {
      await db.transactions.delete(id)
    }
  })
}

// ─── Sync Helpers ─────────────────────────────────
export function generateSyncId(): string {
  return crypto.randomUUID()
}

export async function getMemberBySyncId(syncId: string): Promise<Member | undefined> {
  return db.members.where('syncId').equals(syncId).first()
}

export async function getAssetCategoryBySyncId(syncId: string): Promise<AssetCategory | undefined> {
  return db.assetCategories.where('syncId').equals(syncId).first()
}

export async function getAssetItemBySyncId(syncId: string): Promise<AssetItem | undefined> {
  return db.assetItems.where('syncId').equals(syncId).first()
}

export async function getDailyValueBySyncId(syncId: string): Promise<DailyValue | undefined> {
  return db.dailyValues.where('syncId').equals(syncId).first()
}

// ─── Budget CRUD ─────────────────────────────────
export async function getAllBudgets(): Promise<Budget[]> {
  return db.budgets.toArray()
}

export async function getBudgetsByMonth(month: string): Promise<Budget[]> {
  return db.budgets.where('month').equals(month).toArray()
}

export async function setBudget(categoryId: number, month: string, amount: number): Promise<void> {
  const now = new Date().toISOString()
  const existing = await db.budgets.where({ categoryId, month }).first()
  if (existing) {
    await db.budgets.update(existing.id!, { amount, updatedAt: now })
  } else {
    await db.budgets.add({
      categoryId,
      month,
      amount,
      syncId: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    } as Budget)
  }
}

export async function deleteBudget(id: number): Promise<void> {
  await db.budgets.delete(id)
}

// ─── Goal CRUD ───────────────────────────────────
export async function getAllGoals(): Promise<FinancialGoal[]> {
  return db.goals.toArray()
}

export async function addGoal(goal: Omit<FinancialGoal, 'id'>): Promise<number> {
  return db.goals.add(goal as FinancialGoal) as Promise<number>
}

export async function updateGoal(id: number, updates: Partial<FinancialGoal>): Promise<void> {
  await db.goals.update(id, { ...updates, updatedAt: new Date().toISOString() })
}

export async function deleteGoal(id: number): Promise<void> {
  await db.goals.delete(id)
}

// ─── Subscription CRUD ──────────────────────────
export async function getAllSubscriptions(): Promise<Subscription[]> {
  return db.subscriptions.orderBy('sortOrder').toArray()
}

export async function getActiveSubscriptions(): Promise<Subscription[]> {
  return db.subscriptions.where('status').equals('active').sortBy('sortOrder')
}

export async function addSubscription(sub: Omit<Subscription, 'id'>): Promise<number> {
  return db.subscriptions.add(sub as Subscription) as Promise<number>
}

export async function updateSubscription(id: number, updates: Partial<Subscription>): Promise<void> {
  await db.subscriptions.update(id, { ...updates, updatedAt: new Date().toISOString() })
}

export async function deleteSubscription(id: number): Promise<void> {
  await db.subscriptions.delete(id)
}

// ─── Loan CRUD ──────────────────────────────────
export async function getAllLoans(): Promise<Loan[]> {
  return db.loans.orderBy('sortOrder').toArray()
}

export async function getActiveLoans(): Promise<Loan[]> {
  // isActive 는 JS boolean 으로 저장 — IndexedDB 인덱스에서 .equals(1) 은 매칭되지 않으므로
  // 인메모리 filter 로 평가한다.
  return (await db.loans.orderBy('sortOrder').toArray()).filter(l => l.isActive)
}

export async function addLoan(loan: Omit<Loan, 'id'>): Promise<number> {
  return db.loans.add(loan as Loan) as Promise<number>
}

export async function updateLoan(id: number, updates: Partial<Loan>): Promise<void> {
  await db.loans.update(id, { ...updates, updatedAt: new Date().toISOString() })
}

export async function deleteLoan(id: number): Promise<void> {
  await db.loans.delete(id)
}

// ─── Investment Trade CRUD ──────────────────────
export async function getAllInvestmentTrades(): Promise<InvestmentTrade[]> {
  return db.investmentTrades.orderBy('sortOrder').toArray()
}

export async function addInvestmentTrade(trade: Omit<InvestmentTrade, 'id'>): Promise<number> {
  return db.investmentTrades.add(trade as InvestmentTrade) as Promise<number>
}

export async function updateInvestmentTrade(id: number, updates: Partial<InvestmentTrade>): Promise<void> {
  await db.investmentTrades.update(id, { ...updates, updatedAt: new Date().toISOString() })
}

export async function deleteInvestmentTrade(id: number): Promise<void> {
  await db.investmentTrades.delete(id)
}

export async function findDuplicateInvestmentTrade(sellDate: string, stockName: string, sellQuantity: number): Promise<InvestmentTrade | undefined> {
  return db.investmentTrades
    .where('[sellDate+stockName+sellQuantity]')
    .equals([sellDate, stockName, sellQuantity])
    .first()
}

// ─── Dividend CRUD ──────────────────────────────
export async function getAllDividends(): Promise<Dividend[]> {
  return db.dividends.orderBy('sortOrder').toArray()
}

export async function addDividend(div: Omit<Dividend, 'id'>): Promise<number> {
  return db.dividends.add(div as Dividend) as Promise<number>
}

export async function updateDividend(id: number, updates: Partial<Dividend>): Promise<void> {
  await db.dividends.update(id, { ...updates, updatedAt: new Date().toISOString() })
}

export async function deleteDividend(id: number): Promise<void> {
  await db.dividends.delete(id)
}

export async function findDuplicateDividend(paymentDate: string, stockName: string, quantity: number): Promise<Dividend | undefined> {
  return db.dividends
    .where('[paymentDate+stockName+quantity]')
    .equals([paymentDate, stockName, quantity])
    .first()
}

// ─── Account Interest CRUD ──────────────────────
export async function getAllAccountInterests(): Promise<AccountInterest[]> {
  return db.accountInterests.orderBy('sortOrder').toArray()
}

export async function addAccountInterest(interest: Omit<AccountInterest, 'id'>): Promise<number> {
  return db.accountInterests.add(interest as AccountInterest) as Promise<number>
}

export async function updateAccountInterest(id: number, updates: Partial<AccountInterest>): Promise<void> {
  await db.accountInterests.update(id, { ...updates, updatedAt: new Date().toISOString() })
}

export async function deleteAccountInterest(id: number): Promise<void> {
  await db.accountInterests.delete(id)
}

export async function findDuplicateAccountInterest(depositDate: string, periodStart: string, periodEnd: string, currency: string): Promise<AccountInterest | undefined> {
  return db.accountInterests
    .where('[depositDate+periodStart+periodEnd+currency]')
    .equals([depositDate, periodStart, periodEnd, currency])
    .first()
}

// ─── Recurring Transaction Helpers ───────────────
export async function getRecurringTransactions(): Promise<Transaction[]> {
  return db.transactions.where('isRecurring').equals(1).toArray()
}

export async function getTransactionsBySubscriptionId(subscriptionId: number): Promise<Transaction[]> {
  return db.transactions.where('subscriptionId').equals(subscriptionId).toArray()
}

// ─── Bulk Operations ───────────────────────────────
export async function clearAllData(): Promise<void> {
  await db.members.clear()
  await db.assetCategories.clear()
  await db.assetItems.clear()
  await db.dailyValues.clear()
  await db.transactionCategories.clear()
  await db.transactions.clear()
  await db.budgets.clear()
  await db.goals.clear()
  await db.paymentMethodItems.clear()
  await db.subscriptions.clear()
  await db.loans.clear()
  await db.investmentTrades.clear()
  await db.dividends.clear()
  await db.accountInterests.clear()
  await db.merchantAliases.clear()
  await db.syncChangeLog.clear()
  await db.syncTombstones.clear()

  const now = new Date().toISOString()
  await db.members.bulkAdd(
    DEFAULT_MEMBERS.map((m, i) => ({ ...m, isDefault: true, sortOrder: i, createdAt: now, updatedAt: now }))
  )
}
