import { db } from '@/services/database'
import { addDays, addWeeks, addMonths, addYears, format, isAfter, startOfDay } from 'date-fns'
import type { Transaction, RepeatPattern } from '@/lib/types'

function getNextDates(lastDate: string, pattern: RepeatPattern, upToDate: string): string[] {
  const dates: string[] = []
  let current = new Date(lastDate)
  const end = pattern.endDate ? new Date(pattern.endDate) : new Date(upToDate)
  const limit = new Date(upToDate)

  while (true) {
    switch (pattern.type) {
      case 'daily': current = addDays(current, pattern.interval); break
      case 'weekly': current = addWeeks(current, pattern.interval); break
      case 'monthly': current = addMonths(current, pattern.interval); break
      case 'yearly': current = addYears(current, pattern.interval); break
      default: return dates
    }
    if (isAfter(startOfDay(current), startOfDay(limit))) break
    if (pattern.endDate && isAfter(startOfDay(current), startOfDay(end))) break
    dates.push(format(current, 'yyyy-MM-dd'))
  }
  return dates
}

export async function processRecurringTransactions(): Promise<number> {
  const today = format(new Date(), 'yyyy-MM-dd')
  const recurringTxns = await db.transactions.where('isRecurring').equals(1).toArray()
  let created = 0

  for (const source of recurringTxns) {
    if (!source.recurPattern || source.recurPattern.type === 'none') continue

    // Find the latest generated child transaction date
    const children = await db.transactions
      .where('recurSourceId')
      .equals(source.id!)
      .toArray()

    const lastDate = children.length > 0
      ? children.sort((a, b) => b.date.localeCompare(a.date))[0].date
      : source.date

    const newDates = getNextDates(lastDate, source.recurPattern, today)
    const now = new Date().toISOString()

    for (const date of newDates) {
      await db.transactions.add({
        syncId: crypto.randomUUID(),
        memberId: source.memberId,
        type: source.type,
        amount: source.amount,
        categoryId: source.categoryId,
        date,
        memo: source.memo,
        isRecurring: false,
        recurSourceId: source.id!,
        createdAt: now,
        updatedAt: now,
      } as Transaction)
      created++
    }
  }
  return created
}
