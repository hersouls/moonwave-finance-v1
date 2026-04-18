import { useMemo } from 'react'
import type { PaymentMethod, Transaction, TransactionType } from '@/lib/types'
import { TEMPLATE_CONFIG } from '@/lib/ledgerConstants'

export interface TransactionTemplate {
  count: number
  type: TransactionType
  categoryId: number | null
  amount: number
  memo?: string
  paymentMethod?: PaymentMethod
  memberId: number | null
}

/**
 * 거래 내역에서 자주 쓰는 패턴(type|category|amount|memo 동일)을 집계.
 * count >= MIN_COUNT 이고 상위 LIMIT 개만 반환.
 */
export function useTransactionTemplates(
  transactions: Transaction[],
  enabled = true,
): TransactionTemplate[] {
  return useMemo(() => {
    if (!enabled) return []
    const freqMap = new Map<string, TransactionTemplate>()
    for (const t of transactions) {
      const key = `${t.type}|${t.categoryId}|${t.amount}|${t.memo || ''}`
      const existing = freqMap.get(key)
      if (existing) {
        existing.count++
      } else {
        freqMap.set(key, {
          count: 1,
          type: t.type,
          categoryId: t.categoryId,
          amount: t.amount,
          memo: t.memo,
          paymentMethod: t.paymentMethod,
          memberId: t.memberId,
        })
      }
    }
    return Array.from(freqMap.values())
      .filter(t => t.count >= TEMPLATE_CONFIG.MIN_COUNT)
      .sort((a, b) => b.count - a.count)
      .slice(0, TEMPLATE_CONFIG.LIMIT)
  }, [transactions, enabled])
}
