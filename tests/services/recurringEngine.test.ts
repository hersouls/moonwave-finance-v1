// ─── 반복 거래 엔진 — 결정적 id + 멱등 생성 ─────────────────────────────
//
// 회귀 맥락: (1) isRecurring은 JS boolean으로 저장되는데 IndexedDB 인덱스는
// boolean 키를 지원하지 않아 구 코드의 where('isRecurring').equals(1)이 항상
// 0건 — 엔진이 완전히 죽어 있었다. (2) 자식 id가 랜덤 UUID여서 기기마다
// 같은 회차를 따로 만들면 클라우드에 기기 수만큼 중복 문서가 생겼다.
// 새 엔진: 인메모리 filter + recur:{sourceId}:{date} 결정적 id + 재진입 가드.
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/firebase', () => ({ firestore: {}, auth: {} }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => undefined })),
  getDocs: vi.fn(async () => ({ empty: true, docs: [] })),
  setDoc: vi.fn(async () => {}),
  deleteDoc: vi.fn(async () => {}),
  onSnapshot: vi.fn(() => () => {}),
  query: vi.fn((c: unknown) => c),
  limit: vi.fn(),
  where: vi.fn(),
  serverTimestamp: vi.fn(() => ({ __sentinel: 'serverTimestamp' })),
  writeBatch: vi.fn(() => ({ set: vi.fn(), delete: vi.fn(), commit: async () => {} })),
}))

import { format, subMonths, addDays } from 'date-fns'
import { db, setSyncWritingFlag, drainChangeTracking, getRecurringTransactions } from '@/services/database'
import { processRecurringTransactions, recurChildId } from '@/services/recurringEngine'
import type { Transaction } from '@/lib/types'

const NOW = new Date().toISOString()

function recurringSource(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 'src-rent',
    memberId: null,
    type: 'expense',
    amount: 500000,
    categoryId: null,
    date: format(subMonths(new Date(), 3), 'yyyy-MM-dd'),
    memo: '월세',
    isRecurring: true,
    recurPattern: { type: 'monthly', interval: 1 },
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  } as Transaction
}

async function seed(fn: () => Promise<unknown>): Promise<void> {
  setSyncWritingFlag(true)
  try { await fn() } finally { setSyncWritingFlag(false) }
}

beforeEach(async () => {
  setSyncWritingFlag(true)
  try {
    await db.transactions.clear()
  } finally {
    setSyncWritingFlag(false)
  }
  await drainChangeTracking()
  await db.syncOutbox.clear()
})

describe('boolean isRecurring 소스 조회 (죽은 인덱스 회귀)', () => {
  it('isRecurring=true(boolean) 소스를 찾아 자식을 생성한다', async () => {
    await seed(() => db.transactions.add(recurringSource()))

    const created = await processRecurringTransactions()
    expect(created).toBe(3) // 3개월 전 시작 → 1·2·3개월 후 회차

    const children = await db.transactions.where('recurSourceId').equals('src-rent').toArray()
    expect(children).toHaveLength(3)
    expect(children.every(c => c.amount === 500000 && c.memo === '월세')).toBe(true)
    expect(children.every(c => c.isRecurring === false)).toBe(true)
  })

  it('getRecurringTransactions도 boolean 소스를 반환한다', async () => {
    await seed(() => db.transactions.add(recurringSource()))
    const sources = await getRecurringTransactions()
    expect(sources.map(s => s.id)).toEqual(['src-rent'])
  })
})

describe('결정적 자식 id — 기기 간 수렴', () => {
  it('자식 id는 recur:{sourceId}:{date}로 파생된다', async () => {
    await seed(() => db.transactions.add(recurringSource()))
    await processRecurringTransactions()

    const children = await db.transactions.where('recurSourceId').equals('src-rent').toArray()
    for (const c of children) {
      expect(c.id).toBe(recurChildId('src-rent', c.date))
    }
  })

  it('두 번 실행해도 새 자식이 생기지 않는다 (멱등)', async () => {
    await seed(() => db.transactions.add(recurringSource()))
    const first = await processRecurringTransactions()
    expect(first).toBeGreaterThan(0)

    const second = await processRecurringTransactions()
    expect(second).toBe(0)
    const children = await db.transactions.where('recurSourceId').equals('src-rent').toArray()
    expect(children.length).toBe(first)
  })

  it('동시 실행은 재진입 가드로 1회만 돈다', async () => {
    await seed(() => db.transactions.add(recurringSource()))
    const [a, b] = await Promise.all([
      processRecurringTransactions(),
      processRecurringTransactions(),
    ])
    // 같은 in-flight Promise를 공유하므로 결과도 동일하고 중복 삽입이 없다
    expect(a).toBe(b)
    const children = await db.transactions.where('recurSourceId').equals('src-rent').toArray()
    expect(children.length).toBe(a)
    expect(new Set(children.map(c => c.date)).size).toBe(children.length)
  })

  it('레거시(랜덤 id) 자식이 있는 발생일은 건너뛴다', async () => {
    const src = recurringSource()
    await seed(() => db.transactions.add(src))
    await processRecurringTransactions()
    const children = await db.transactions.where('recurSourceId').equals('src-rent').toArray()

    // 자식 하나를 레거시 랜덤 id 행으로 교체
    const victim = children[0]
    await seed(async () => {
      await db.transactions.delete(victim.id)
      await db.transactions.add({ ...victim, id: 'legacy-random-uuid' })
    })

    const created = await processRecurringTransactions()
    expect(created).toBe(0) // 날짜 기준으로 이미 존재 — 재생성하지 않는다
  })
})

describe('발생일 산출 — 짧은 달 클램프 미고착', () => {
  it('말일 소스는 짧은 달을 지나도 원래 결제일로 복귀한다', async () => {
    // 소스: 1월 31일, 오늘을 4월 15일로 가정한 upTo 산출을 재현하기 위해
    // 소스 날짜를 상대적으로 계산하지 않고 고정 시나리오로 검증한다.
    // Date만 가짜로 — 타이머 전체를 가짜로 하면 fake-indexeddb 콜백이 멈춘다
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 3, 15)) // 2026-04-15 (로컬)
    try {
      await seed(() => db.transactions.add(recurringSource({
        id: 'src-eom', date: '2026-01-31',
      })))
      await processRecurringTransactions()
      const children = await db.transactions.where('recurSourceId').equals('src-eom').toArray()
      const dates = children.map(c => c.date).sort()
      // 2월은 28일로 클램프되지만 3월은 31일로 복귀해야 한다 (드리프트 금지)
      expect(dates).toEqual(['2026-02-28', '2026-03-31'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('endDate 이후 회차는 생성하지 않는다', async () => {
    const start = format(subMonths(new Date(), 3), 'yyyy-MM-dd')
    const end = format(addDays(subMonths(new Date(), 2), 5), 'yyyy-MM-dd')
    await seed(() => db.transactions.add(recurringSource({
      id: 'src-ended', date: start,
      recurPattern: { type: 'monthly', interval: 1, endDate: end },
    })))
    const created = await processRecurringTransactions()
    expect(created).toBe(1) // 1개월 후 회차만 endDate 이내
  })

  it('interval<=0 또는 none 패턴은 무시한다', async () => {
    await seed(() => db.transactions.add(recurringSource({
      id: 'src-bad', recurPattern: { type: 'monthly', interval: 0 },
    })))
    expect(await processRecurringTransactions()).toBe(0)
  })
})
