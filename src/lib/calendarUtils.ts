import type { Transaction, TransactionCategory } from '@/lib/types'

export interface CategoryBreakdownEntry {
  categoryId: number | null
  amount: number
}

export interface DaySummary {
  income: number
  expense: number
  net: number
  count: number
  hasRecurring: boolean
  expenseCategories: CategoryBreakdownEntry[]
  incomeCategories: CategoryBreakdownEntry[]
}

export interface MonthAggregates {
  income: number
  expense: number
  net: number
  count: number
  activeDays: number
  avgDailyExpense: number
  maxExpenseDay: { date: string; amount: number } | null
  maxIncomeDay: { date: string; amount: number } | null
  topExpenseCategories: CategoryBreakdownEntry[]
  topIncomeCategories: CategoryBreakdownEntry[]
  weekdayExpense: number[] // 0(Sun) ~ 6(Sat)
  dailyNetSeries: { date: string; net: number; expense: number; income: number }[]
  recurringExpense: number
}

export function computeDailySummaries(transactions: Transaction[]): Map<string, DaySummary> {
  const map = new Map<string, DaySummary>()

  for (const t of transactions) {
    let entry = map.get(t.date)
    if (!entry) {
      entry = {
        income: 0,
        expense: 0,
        net: 0,
        count: 0,
        hasRecurring: false,
        expenseCategories: [],
        incomeCategories: [],
      }
      map.set(t.date, entry)
    }

    if (t.type === 'income') {
      entry.income += t.amount
      entry.net += t.amount
      upsertCategory(entry.incomeCategories, t.categoryId ?? null, t.amount)
    } else {
      entry.expense += t.amount
      entry.net -= t.amount
      upsertCategory(entry.expenseCategories, t.categoryId ?? null, t.amount)
    }
    entry.count++
    if (t.isRecurring || t.subscriptionId || t.recurSourceId) {
      entry.hasRecurring = true
    }
  }

  // Sort category breakdowns by amount desc
  for (const entry of map.values()) {
    entry.expenseCategories.sort((a, b) => b.amount - a.amount)
    entry.incomeCategories.sort((a, b) => b.amount - a.amount)
  }

  return map
}

function upsertCategory(
  list: CategoryBreakdownEntry[],
  categoryId: number | null,
  amount: number,
) {
  const found = list.find((e) => e.categoryId === categoryId)
  if (found) {
    found.amount += amount
  } else {
    list.push({ categoryId, amount })
  }
}

export function computeMonthAggregates(
  transactions: Transaction[],
  monthDates: string[],
  summaries: Map<string, DaySummary>,
): MonthAggregates {
  let income = 0
  let expense = 0
  let recurringExpense = 0
  const expenseCatMap = new Map<number | null, number>()
  const incomeCatMap = new Map<number | null, number>()
  const weekdayExpense = [0, 0, 0, 0, 0, 0, 0]
  let maxExpenseDay: { date: string; amount: number } | null = null
  let maxIncomeDay: { date: string; amount: number } | null = null

  for (const t of transactions) {
    if (t.type === 'income') {
      income += t.amount
      incomeCatMap.set(t.categoryId ?? null, (incomeCatMap.get(t.categoryId ?? null) ?? 0) + t.amount)
    } else {
      expense += t.amount
      expenseCatMap.set(t.categoryId ?? null, (expenseCatMap.get(t.categoryId ?? null) ?? 0) + t.amount)
      if (t.isRecurring || t.subscriptionId || t.recurSourceId) {
        recurringExpense += t.amount
      }
      const d = new Date(t.date)
      if (!Number.isNaN(d.getTime())) {
        weekdayExpense[d.getDay()] += t.amount
      }
    }
  }

  const activeDays = Array.from(summaries.values()).filter((s) => s.count > 0).length
  const avgDailyExpense = activeDays > 0 ? expense / activeDays : 0

  const dailyNetSeries = monthDates.map((date) => {
    const s = summaries.get(date)
    const dayExpense = s?.expense ?? 0
    const dayIncome = s?.income ?? 0
    const net = dayIncome - dayExpense
    if (dayExpense > 0 && (!maxExpenseDay || dayExpense > maxExpenseDay.amount)) {
      maxExpenseDay = { date, amount: dayExpense }
    }
    if (dayIncome > 0 && (!maxIncomeDay || dayIncome > maxIncomeDay.amount)) {
      maxIncomeDay = { date, amount: dayIncome }
    }
    return { date, net, expense: dayExpense, income: dayIncome }
  })

  const topExpenseCategories: CategoryBreakdownEntry[] = Array.from(expenseCatMap.entries())
    .map(([categoryId, amount]) => ({ categoryId, amount }))
    .sort((a, b) => b.amount - a.amount)
  const topIncomeCategories: CategoryBreakdownEntry[] = Array.from(incomeCatMap.entries())
    .map(([categoryId, amount]) => ({ categoryId, amount }))
    .sort((a, b) => b.amount - a.amount)

  return {
    income,
    expense,
    net: income - expense,
    count: transactions.length,
    activeDays,
    avgDailyExpense,
    maxExpenseDay,
    maxIncomeDay,
    topExpenseCategories,
    topIncomeCategories,
    weekdayExpense,
    dailyNetSeries,
    recurringExpense,
  }
}

/** Resolve a category color with a safe fallback. */
export function getCategoryColor(
  categoryId: number | null | undefined,
  categories: TransactionCategory[],
  fallback = '#94a3b8',
): string {
  if (categoryId == null) return fallback
  return categories.find((c) => c.id === categoryId)?.color ?? fallback
}

/** Resolve a category name with a safe fallback. */
export function getCategoryName(
  categoryId: number | null | undefined,
  categories: TransactionCategory[],
  fallback = '미분류',
): string {
  if (categoryId == null) return fallback
  return categories.find((c) => c.id === categoryId)?.name ?? fallback
}
