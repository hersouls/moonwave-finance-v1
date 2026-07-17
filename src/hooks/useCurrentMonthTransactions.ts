import { useEffect, useState } from 'react'
import { getTransactionsByMonth } from '@/services/database'
import { getCurrentMonthString } from '@/lib/dateUtils'
import { useSyncListener } from '@/hooks/useSyncListener'
import type { Transaction } from '@/lib/types'

/**
 * 이번달(현재 로컬 월) 거래 목록 — 대시보드 전용 데이터 소스.
 *
 * transactionStore.transactions 는 전역 selectedMonth 한 달만 담고 있어,
 * 가계부에서 과거 달을 탐색한 뒤 대시보드로 돌아오면 "이번달" 합계가
 * 0으로 표시된다. 이 훅은 스토어를 거치지 않고 Dexie에서 현재 월을
 * 직접 읽고, 피어 동기화 echo(fin-sync-update)로 갱신한다.
 */
export function useCurrentMonthTransactions(): Transaction[] {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const month = getCurrentMonthString()

  useEffect(() => {
    let cancelled = false
    getTransactionsByMonth(month)
      .then((rows) => {
        if (!cancelled) setTransactions(rows)
      })
      .catch(() => {
        /* Dexie 미초기화 등 — 거래 없음으로 둔다 */
      })
    return () => {
      cancelled = true
    }
  }, [month])

  useSyncListener(() => {
    // 자정 넘김 대비 — echo 시점의 현재 월을 다시 계산해 읽는다
    getTransactionsByMonth(getCurrentMonthString())
      .then(setTransactions)
      .catch(() => {})
  }, ['transactions'])

  return transactions
}
