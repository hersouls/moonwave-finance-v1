import { db } from '@/services/database'
import { addDays, addWeeks, addMonths, addYears, format, isAfter, parseISO } from 'date-fns'
import type { RepeatPattern, Transaction } from '@/lib/types'

/**
 * 소스 기준일에서 k번째 발생일을 계산한다.
 *
 * 항상 소스 날짜에 k×interval을 더해 산출한다 — 직전 발생일에서 걸음을
 * 옮기는 방식은 짧은 달 클램프(1/31→2/28)가 영구 고착되어 이후 회차가
 * 전부 28일로 밀리지만, 소스 기준 산출은 3월에 다시 31일로 복귀한다.
 */
function occurrenceAt(sourceDate: Date, pattern: RepeatPattern, k: number): Date {
  const n = k * pattern.interval
  switch (pattern.type) {
    case 'daily': return addDays(sourceDate, n)
    case 'weekly': return addWeeks(sourceDate, n)
    case 'monthly': return addMonths(sourceDate, n)
    case 'yearly': return addYears(sourceDate, n)
    default: return sourceDate
  }
}

/** 폭주 방지 상한 — 일간 반복 5년치보다 넉넉한 값. */
const MAX_OCCURRENCES = 2000

/** 소스의 미생성 후보 발생일 — 소스 다음 회차부터 오늘까지, endDate 이내. */
function getDueDates(source: Transaction, today: string): string[] {
  const pattern = source.recurPattern
  if (!pattern || pattern.type === 'none' || pattern.interval <= 0) return []
  // parseISO: 날짜 전용 문자열을 로컬 자정으로 해석 (new Date()는 UTC 자정 —
  // 음수 오프셋 타임존에서 하루 밀린다)
  const sourceDate = parseISO(source.date)
  const limitDate = parseISO(today)
  const endDate = pattern.endDate ? parseISO(pattern.endDate) : null
  const dates: string[] = []
  for (let k = 1; k <= MAX_OCCURRENCES; k++) {
    const d = occurrenceAt(sourceDate, pattern, k)
    if (isAfter(d, limitDate)) break
    if (endDate && isAfter(d, endDate)) break
    dates.push(format(d, 'yyyy-MM-dd'))
  }
  return dates
}

/**
 * 반복 거래 자식 id — 소스 id + 발생일에서 결정적으로 파생한다.
 *
 * 모든 기기가 같은 (소스, 발생일)에 같은 id를 만들므로 여러 기기가 동시에
 * 생성해도 클라우드에서 단일 문서(setDoc 동일 경로)로 수렴한다. 랜덤 UUID를
 * 쓰면 기기 수만큼 같은 회차가 중복 생성된다 (5기기 = 최대 5중복).
 */
export function recurChildId(sourceId: string, date: string): string {
  return `recur:${sourceId}:${date}`
}

// 동시 실행 가드 — 대시보드/가계부/구독 페이지가 loadAll을 겹쳐 불러도
// 엔진은 한 번만 돈다 (동일 탭 내 중복 삽입 경쟁 차단).
let _inFlight: Promise<number> | null = null

export async function processRecurringTransactions(): Promise<number> {
  if (_inFlight) return _inFlight
  _inFlight = processInternal().finally(() => { _inFlight = null })
  return _inFlight
}

async function processInternal(): Promise<number> {
  const today = format(new Date(), 'yyyy-MM-dd')
  // isRecurring은 JS boolean으로 저장된다 — IndexedDB 인덱스는 boolean 키를
  // 지원하지 않아 where('isRecurring').equals(1)은 항상 0건이므로 인메모리
  // filter로 평가한다 (getActiveLoans와 동일 패턴).
  const recurringTxns = await db.transactions.filter(t => t.isRecurring === true).toArray()
  let created = 0

  for (const source of recurringTxns) {
    if (!source.recurPattern || source.recurPattern.type === 'none') continue

    // 이미 존재하는 발생일은 건너뛴다 — 레거시(랜덤 id) 자식도 여기서 걸린다.
    const children = await db.transactions
      .where('recurSourceId')
      .equals(source.id)
      .toArray()
    const existingDates = new Set(children.map(c => c.date))

    const now = new Date().toISOString()
    for (const date of getDueDates(source, today)) {
      if (existingDates.has(date)) continue
      try {
        await db.transactions.add({
          id: recurChildId(source.id, date),
          memberId: source.memberId,
          type: source.type,
          amount: source.amount,
          categoryId: source.categoryId,
          date,
          memo: source.memo,
          paymentMethod: source.paymentMethod,
          paymentMethodDetail: source.paymentMethodDetail,
          paymentMethodItemId: source.paymentMethodItemId,
          isRecurring: false,
          recurSourceId: source.id,
          createdAt: now,
          updatedAt: now,
        })
        created++
      } catch (err) {
        // ConstraintError = 다른 실행/피어 인제스트가 같은 결정적 id를 먼저
        // 삽입 — 정상 수렴이므로 건너뛴다.
        if ((err as { name?: string })?.name !== 'ConstraintError') throw err
      }
    }
  }
  return created
}
