import Dexie, { type Table } from 'dexie'
import type {
  Member,
  AssetCategory,
  AssetItem,
  DailyValue,
  TransactionCategory,
  Transaction,
  Budget,
  FinancialGoal,
  PaymentMethodItem,
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
  }
}

const db = new FinanceDatabase()

db.on('populate', () => {
  const now = new Date().toISOString()

  // Default members
  db.members.bulkAdd([
    { name: '대성', color: '#3B82F6', isDefault: true, sortOrder: 0, createdAt: now, updatedAt: now },
    { name: '다연', color: '#EC4899', isDefault: true, sortOrder: 1, createdAt: now, updatedAt: now },
  ])

  // Default asset categories
  db.assetCategories.bulkAdd([
    { name: '퇴직금', type: 'asset', color: '#6366F1', icon: 'Landmark', sortOrder: 0, createdAt: now, updatedAt: now },
    { name: '주식', type: 'asset', color: '#3B82F6', icon: 'TrendingUp', sortOrder: 1, createdAt: now, updatedAt: now },
    { name: '암호화폐', type: 'asset', color: '#F59E0B', icon: 'Bitcoin', sortOrder: 2, createdAt: now, updatedAt: now },
    { name: '거래소 현금', type: 'asset', color: '#10B981', icon: 'Banknote', sortOrder: 3, createdAt: now, updatedAt: now },
    { name: '금', type: 'asset', color: '#EAB308', icon: 'Gem', sortOrder: 4, createdAt: now, updatedAt: now },
    { name: '은행계좌', type: 'asset', color: '#06B6D4', icon: 'Building2', sortOrder: 5, createdAt: now, updatedAt: now },
    { name: '기타자산', type: 'asset', color: '#8B5CF6', icon: 'Package', sortOrder: 6, createdAt: now, updatedAt: now },
    { name: '주택대출', type: 'liability', color: '#EF4444', icon: 'Home', sortOrder: 0, createdAt: now, updatedAt: now },
    { name: '신용대출', type: 'liability', color: '#F97316', icon: 'CreditCard', sortOrder: 1, createdAt: now, updatedAt: now },
    { name: '마이너스 대출', type: 'liability', color: '#DC2626', icon: 'MinusCircle', sortOrder: 2, createdAt: now, updatedAt: now },
    { name: '회사 대출', type: 'liability', color: '#E11D48', icon: 'Building', sortOrder: 3, createdAt: now, updatedAt: now },
    { name: '개인 대출', type: 'liability', color: '#BE185D', icon: 'Users', sortOrder: 4, createdAt: now, updatedAt: now },
  ])

  // Default transaction categories
  db.transactionCategories.bulkAdd([
    { name: '월급', type: 'income', color: '#10B981', icon: 'Briefcase', isDefault: true, sortOrder: 0, createdAt: now, updatedAt: now },
    { name: '부수입', type: 'income', color: '#06B6D4', icon: 'Coins', isDefault: true, sortOrder: 1, createdAt: now, updatedAt: now },
    { name: '투자수익', type: 'income', color: '#8B5CF6', icon: 'TrendingUp', isDefault: true, sortOrder: 2, createdAt: now, updatedAt: now },
    { name: '식비', type: 'expense', color: '#F59E0B', icon: 'UtensilsCrossed', isDefault: true, sortOrder: 0, createdAt: now, updatedAt: now },
    { name: '교통비', type: 'expense', color: '#3B82F6', icon: 'Car', isDefault: true, sortOrder: 1, createdAt: now, updatedAt: now },
    { name: '주거비', type: 'expense', color: '#8B5CF6', icon: 'Home', isDefault: true, sortOrder: 2, createdAt: now, updatedAt: now },
    { name: '통신비', type: 'expense', color: '#EC4899', icon: 'Smartphone', isDefault: true, sortOrder: 3, createdAt: now, updatedAt: now },
    { name: '의료비', type: 'expense', color: '#EF4444', icon: 'Heart', isDefault: true, sortOrder: 4, createdAt: now, updatedAt: now },
    { name: '교육비', type: 'expense', color: '#6366F1', icon: 'GraduationCap', isDefault: true, sortOrder: 5, createdAt: now, updatedAt: now },
    { name: '기타', type: 'expense', color: '#71717A', icon: 'MoreHorizontal', isDefault: true, sortOrder: 6, createdAt: now, updatedAt: now },
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

export async function deleteAssetItem(id: number): Promise<void> {
  await db.transaction('rw', [db.assetItems, db.dailyValues], async () => {
    await db.dailyValues.where('assetItemId').equals(id).delete()
    await db.assetItems.delete(id)
  })
}

// ─── DailyValue CRUD ──────────────────────────────
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

export async function bulkSetDailyValues(entries: { assetItemId: number; date: string; value: number }[]): Promise<void> {
  const now = new Date().toISOString()
  await db.transaction('rw', db.dailyValues, async () => {
    for (const entry of entries) {
      const existing = await getDailyValue(entry.assetItemId, entry.date)
      if (existing) {
        await db.dailyValues.update(existing.id!, { value: entry.value, updatedAt: now })
      } else {
        await db.dailyValues.add({
          assetItemId: entry.assetItemId,
          date: entry.date,
          value: entry.value,
          syncId: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
        } as DailyValue)
      }
    }
  })
}

export async function getLatestDailyValues(assetItemId: number, limit: number = 30): Promise<DailyValue[]> {
  return db.dailyValues
    .where('assetItemId')
    .equals(assetItemId)
    .reverse()
    .sortBy('date')
    .then(vals => vals.slice(0, limit))
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
  await db.transactionCategories.delete(id)
  await db.transactions.where('categoryId').equals(id).modify({ categoryId: null })
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
  await db.transactions.where('paymentMethodItemId').equals(id).modify({ paymentMethodItemId: undefined })
  await db.paymentMethodItems.delete(id)
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
  await db.transactions.bulkDelete(ids)
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

// ─── Recurring Transaction Helpers ───────────────
export async function getRecurringTransactions(): Promise<Transaction[]> {
  return db.transactions.where('isRecurring').equals(1).toArray()
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

  const now = new Date().toISOString()
  await db.members.bulkAdd([
    { name: '대성', color: '#3B82F6', isDefault: true, sortOrder: 0, createdAt: now, updatedAt: now },
    { name: '다연', color: '#EC4899', isDefault: true, sortOrder: 1, createdAt: now, updatedAt: now },
  ])
}
