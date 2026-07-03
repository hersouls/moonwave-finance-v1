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

  it('adds a transaction and returns its string id', async () => {
    await useTransactionStore.getState().loadAll()
    const id = await useTransactionStore.getState().addTransaction({
      memberId: null,
      type: 'expense',
      amount: 50000,
      categoryId: null,
      date: '2026-02-27',
      memo: 'test expense',
    })
    // Sync v2: 엔티티 id는 전역 고유 문자열 (구 syncId 승격) — 숫자 아님.
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })

  it('loads categories with string ids (seeded defaults are deterministic)', async () => {
    await useTransactionStore.getState().loadCategories()
    const cats = useTransactionStore.getState().categories
    expect(cats.length).toBeGreaterThan(0)
    expect(cats.every(c => typeof c.id === 'string' && c.id.length > 0)).toBe(true)
    // 시드 기본 카테고리는 결정적 id — 모든 기기에서 동일하게 수렴한다.
    expect(cats.some(c => c.id.startsWith('default:txnCat:'))).toBe(true)
  })

  it('filters categories by type', async () => {
    await useTransactionStore.getState().loadCategories()
    const income = useTransactionStore.getState().getCategoriesByType('income')
    const expense = useTransactionStore.getState().getCategoriesByType('expense')
    expect(income.every(c => c.type === 'income')).toBe(true)
    expect(expense.every(c => c.type === 'expense')).toBe(true)
  })
})
