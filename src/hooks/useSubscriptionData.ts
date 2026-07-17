import { useEffect, useMemo } from 'react'
import { useTransactionStore } from '@/stores/transactionStore'
import { useSyncListener } from './useSyncListener'
import { useHiddenSubscriptions } from './useHiddenSubscriptions'
import { useMultiMonthTransactions } from './useMultiMonthTransactions'
import {
  detectSubscriptions,
  computeSubscriptionStats,
  type DetectedSubscription,
  type SubscriptionStats,
} from '@/services/subscriptionDetection'
import type { TransactionCategory } from '@/lib/types'

interface UseSubscriptionDataResult {
  /** Detected subscriptions, excluding ones the user marked as 종료. */
  detected: DetectedSubscription[]
  /** Aggregate stats computed from `detected`. */
  stats: SubscriptionStats
  /** Transaction categories (for icon/name lookup). */
  categories: TransactionCategory[]
}

/**
 * How many months of ledger history feed subscription detection.
 * The store's `transactions` slice only ever holds one month, which starves
 * the detector — yearly/quarterly cycles need multiple payments to be
 * recognized. 24 months guarantees at least two payments even for annual
 * subscriptions.
 */
export const SUBSCRIPTION_DETECTION_MONTHS = 24

/**
 * Single source of truth for subscription views across the app.
 * Reads tagged transactions (Transaction.subscriptionCategory) and applies
 * the user's "종료" filter so every widget shows the same list as the main
 * /subscriptions page.
 */
export function useSubscriptionData(): UseSubscriptionDataResult {
  // Detection runs over multi-month history, NOT the store's single-month slice.
  const { transactions } = useMultiMonthTransactions(SUBSCRIPTION_DETECTION_MONTHS)
  const categories = useTransactionStore((s) => s.categories)
  const loadAll = useTransactionStore((s) => s.loadAll)
  const hiddenSubs = useHiddenSubscriptions()

  useEffect(() => { loadAll() }, [loadAll])
  useSyncListener(() => { loadAll() }, ['transactions', 'transactionCategories'])

  const detected = useMemo(() => {
    const all = detectSubscriptions(transactions, categories)
    return all.filter((s) => !hiddenSubs.isHidden(s.key))
  }, [transactions, categories, hiddenSubs])

  const stats = useMemo(
    () => computeSubscriptionStats(detected, categories),
    [detected, categories],
  )

  return { detected, stats, categories }
}
