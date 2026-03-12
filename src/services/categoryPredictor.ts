import { db } from '@/services/database'

export async function suggestCategories(
  memo: string,
  type: 'income' | 'expense',
  limit = 3
): Promise<number[]> {
  if (!memo.trim()) return getFrequentCategories(type, limit)

  const memoLower = memo.toLowerCase()

  try {
    const recent = await db.transactions
      .where('type')
      .equals(type)
      .reverse()
      .limit(500)
      .toArray()

    // Count category frequency for matching memos
    const freqMap = new Map<number, number>()
    for (const txn of recent) {
      if (!txn.categoryId) continue
      const txnMemo = (txn.memo || '').toLowerCase()
      if (txnMemo.includes(memoLower) || memoLower.includes(txnMemo)) {
        freqMap.set(txn.categoryId, (freqMap.get(txn.categoryId) || 0) + 3) // Weighted for memo match
      } else {
        freqMap.set(txn.categoryId, (freqMap.get(txn.categoryId) || 0) + 1)
      }
    }

    const sorted = Array.from(freqMap.entries())
      .map(([categoryId, count]) => ({ categoryId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)

    return sorted.map((s) => s.categoryId)
  } catch {
    return []
  }
}

export async function getFrequentCategories(
  type: 'income' | 'expense',
  limit = 5
): Promise<number[]> {
  try {
    // Get last 30 days of transactions
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const dateStr = thirtyDaysAgo.toISOString().slice(0, 10)

    const recent = await db.transactions
      .where('type')
      .equals(type)
      .filter((t) => t.date >= dateStr)
      .toArray()

    const freqMap = new Map<number, number>()
    for (const txn of recent) {
      if (!txn.categoryId) continue
      freqMap.set(txn.categoryId, (freqMap.get(txn.categoryId) || 0) + 1)
    }

    return Array.from(freqMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id]) => id)
  } catch {
    return []
  }
}
