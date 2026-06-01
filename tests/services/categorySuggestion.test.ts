import { describe, it, expect } from 'vitest'
import { suggestCategory, buildMerchantStats } from '@/services/cardStatementImport'
import type { Transaction, TransactionCategory } from '@/lib/types'

const NOW = '2026-01-01T00:00:00.000Z'

function cat(id: number, name: string, type: 'expense' | 'income'): TransactionCategory {
  return { id, name, type, color: '#000000', isDefault: true, sortOrder: id, createdAt: NOW, updatedAt: NOW }
}

function txn(over: Partial<Transaction>): Transaction {
  return {
    memberId: null,
    type: 'expense',
    amount: 1000,
    categoryId: null,
    date: '2026-01-01',
    isRecurring: false,
    ...over,
  }
}

const CATEGORIES: TransactionCategory[] = [
  cat(1, '식비', 'expense'),
  cat(2, '교통비', 'expense'),
  cat(10, '급여', 'income'),
  cat(11, '용돈', 'income'),
]

describe('suggestCategory — expense (existing behavior preserved)', () => {
  it('matches expense keyword rules', () => {
    const s = suggestCategory('스타벅스 강남점', CATEGORIES, [], [], undefined, undefined, 'expense')
    expect(s.categoryId).toBe(1) // 식비
    expect(s.confidence).toBe('medium')
  })

  it('prefers exact history match over keyword rules', () => {
    const history = [txn({ id: 1, type: 'expense', memo: '동네빵집', categoryId: 2 })]
    const s = suggestCategory('동네빵집', CATEGORIES, history, [], undefined, undefined, 'expense')
    expect(s.categoryId).toBe(2)
    expect(s.confidence).toBe('high')
  })

  it('defaults to type param of "expense" (card-import callers unchanged)', () => {
    const s = suggestCategory('스타벅스', CATEGORIES, [])
    expect(s.categoryId).toBe(1)
  })
})

describe('suggestCategory — income (generalized)', () => {
  it('does NOT apply expense keyword rules for income type', () => {
    const s = suggestCategory('스타벅스 강남점', CATEGORIES, [], [], undefined, undefined, 'income')
    // No income history/alias → must not leak the expense 식비 rule.
    expect(s.categoryId).toBeUndefined()
    expect(s.confidence).toBe('none')
  })

  it('suggests an income category from history exact match', () => {
    const history = [txn({ id: 1, type: 'income', amount: 3_000_000, memo: 'Acme Payroll', categoryId: 10 })]
    const s = suggestCategory('Acme Payroll', CATEGORIES, history, [], undefined, undefined, 'income')
    expect(s.categoryId).toBe(10) // 급여
    expect(s.confidence).toBe('high')
  })

  it('never resolves an income query to an expense category', () => {
    const history = [txn({ id: 1, type: 'expense', memo: 'Acme Payroll', categoryId: 1 })]
    const s = suggestCategory('Acme Payroll', CATEGORIES, history, [], undefined, undefined, 'income')
    // The only history hit is an expense category — must be ignored for income.
    expect(s.categoryId).toBeUndefined()
  })
})

describe('buildMerchantStats — type filter', () => {
  it('only tallies transactions of the requested type', () => {
    const history = [
      txn({ id: 1, type: 'income', memo: 'Acme Payroll', categoryId: 10 }),
      txn({ id: 2, type: 'income', memo: 'Acme Payroll', categoryId: 10 }),
      txn({ id: 3, type: 'expense', memo: 'Acme Payroll', categoryId: 1 }),
    ]
    const incomeStats = buildMerchantStats(history, CATEGORIES, 'income')
    const key = Array.from(incomeStats.keys())[0]
    expect(incomeStats.get(key)?.total).toBe(2)
    expect(incomeStats.get(key)?.topCategoryId).toBe(10)

    const expenseStats = buildMerchantStats(history, CATEGORIES, 'expense')
    expect(expenseStats.get(key)?.total).toBe(1)
    expect(expenseStats.get(key)?.topCategoryId).toBe(1)
  })
})
