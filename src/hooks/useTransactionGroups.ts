import { useMemo } from 'react'
import type { Transaction } from '@/lib/types'
import { getLocalTodayString } from '@/lib/dateUtils'
import { parseISO, differenceInDays, format, getDay } from 'date-fns'

export interface TransactionGroup {
  /** 그룹 라벨 (예: "오늘", "어제", "3일 전 · 월요일", "4월 11일 (금)") */
  label: string
  /** 그룹 대표 날짜 (yyyy-MM-dd) */
  date: string
  /** 거래 배열 (정렬 순서 유지) */
  transactions: Transaction[]
  /** 그룹 내 지출 합계 */
  totalExpense: number
  /** 그룹 내 수입 합계 */
  totalIncome: number
  /** 건수 */
  count: number
}

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토']

function groupLabel(dateStr: string, today: string): string {
  const date = parseISO(dateStr)
  const todayDate = parseISO(today)
  const diff = differenceInDays(todayDate, date)
  if (diff === 0) return '오늘'
  if (diff === 1) return '어제'
  if (diff > 1 && diff <= 6) return `${diff}일 전 · ${WEEKDAY_KO[getDay(date)]}요일`
  const year = date.getFullYear()
  const nowYear = todayDate.getFullYear()
  if (year === nowYear) {
    return `${format(date, 'M월 d일')} (${WEEKDAY_KO[getDay(date)]})`
  }
  return format(date, 'yyyy년 M월 d일')
}

/**
 * 거래 배열을 날짜 그룹으로 묶음.
 * 입력은 이미 date desc 정렬된 것을 가정하지만, 내부에서도 다시 정렬.
 */
export function useTransactionGroups(
  transactions: Transaction[],
  todayOverride?: string,
): TransactionGroup[] {
  return useMemo(() => {
    // 거래 날짜는 로컬 달력 기준으로 기록되므로 "오늘/어제" 라벨도 로컬 기준
    const today = todayOverride ?? getLocalTodayString()
    const sorted = [...transactions].sort((a, b) => b.date.localeCompare(a.date))

    const groups = new Map<string, Transaction[]>()
    for (const t of sorted) {
      if (!groups.has(t.date)) groups.set(t.date, [])
      groups.get(t.date)!.push(t)
    }

    return Array.from(groups.entries()).map(([date, txs]) => {
      const totalExpense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
      const totalIncome = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
      return {
        label: groupLabel(date, today),
        date,
        transactions: txs,
        totalExpense,
        totalIncome,
        count: txs.length,
      }
    })
  }, [transactions, todayOverride])
}
