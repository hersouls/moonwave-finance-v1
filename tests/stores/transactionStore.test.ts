import { describe, it, expect, beforeEach } from 'vitest'
import { useTransactionStore } from '@/stores/transactionStore'

describe('transactionStore', () => {
  beforeEach(() => {
    useTransactionStore.setState({ transactions: [], categories: [], isLoading: false })
  })

  it('initializes with empty state', () => {
    const state = useTransactionStore.getState()
    expect(state.transactions).toEqual([])
    expect(state.categories).toEqual([])
  })

  it('adds a transaction', async () => {
    await useTransactionStore.getState().loadAll()
    const id = await useTransactionStore.getState().addTransaction({
      memberId: null,
      type: 'expense',
      amount: 50000,
      categoryId: null,
      date: '2026-02-27',
      memo: 'test expense',
    })
    expect(id).toBeGreaterThan(0)
  })

  it('loads categories', async () => {
    await useTransactionStore.getState().loadCategories()
    const cats = useTransactionStore.getState().categories
    expect(cats.length).toBeGreaterThan(0)
  })

  it('filters categories by type', async () => {
    await useTransactionStore.getState().loadCategories()
    const income = useTransactionStore.getState().getCategoriesByType('income')
    const expense = useTransactionStore.getState().getCategoriesByType('expense')
    expect(income.every(c => c.type === 'income')).toBe(true)
    expect(expense.every(c => c.type === 'expense')).toBe(true)
  })
})
