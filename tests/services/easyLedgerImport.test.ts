// ─── easyLedgerImport (편한가계부 HTML 임포트) ──────────────────────
//
// 검증 대상:
// 1. 콤마 구분 금액("1,234,567") 파싱 — 과거 bare parseFloat는 1로 오파싱 (C26)
// 2. 단일 임포트 정확성 (날짜/타입/메모/환급/카테고리·거래수단 자동 생성)
// 3. 재임포트 중복 스킵 — 같은 파일을 다시 가져와도 새 행 0건 (C22-1)
// 4. 중복 지문은 카운트 기반 — 파일 안의 정당한 동일 거래는 보존
// 5. 원자성 — 중간 실패 시 카테고리/거래 전부 롤백, 재시도해도 중복 없음 (C22-2)
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { importEasyLedger } from '@/services/easyLedgerImport'
import { db, setSyncWritingFlag, drainChangeTracking } from '@/services/database'

/** 전 테이블 wipe — 훅 침묵(동기화 쓰기 취급) + 아웃박스 정리. */
async function wipeAll(): Promise<void> {
  setSyncWritingFlag(true)
  try {
    for (const table of db.tables) await table.clear()
  } finally {
    setSyncWritingFlag(false)
  }
  await drainChangeTracking()
  await db.syncOutbox.clear()
}

interface RawRow {
  date: string
  asset: string
  category: string
  subcategory?: string
  content: string
  amount: string
  type: string
  memo?: string
}

/** 편한가계부 HTML export 형식(테이블 8열)의 File 픽스처 생성. */
function easyLedgerFile(rows: RawRow[]): File {
  const body = rows.map(r =>
    `<tr><td>${r.date}</td><td>${r.asset}</td><td>${r.category}</td><td>${r.subcategory ?? ''}</td>` +
    `<td>${r.content}</td><td>${r.amount}</td><td>${r.type}</td><td>${r.memo ?? ''}</td></tr>`
  ).join('\n')
  const html = `<table>\n<tr><th>날짜</th><th>자산</th><th>분류</th><th>소분류</th><th>내용</th><th>금액</th><th>타입</th><th>메모</th></tr>\n${body}\n</table>`
  return new File([html], 'ledger.html', { type: 'text/html' })
}

const THREE_ROWS: RawRow[] = [
  { date: '2024/01/15 12:30', asset: '현금', category: '식비', content: '대성 점심', amount: '10,000', type: '지출', memo: '동네식당' },
  { date: '2024/01/16 09:00', asset: '우리은행', category: '월급', content: '1월 급여', amount: '3,000,000', type: '수입' },
  // 음수 금액 = 환급 → income + "[환급]" 메모
  { date: '2024/01/17 10:00', asset: '삼성카드', category: '마트/편의점', content: '반품 환불', amount: '-5,000', type: '지출' },
]

beforeEach(async () => {
  await wipeAll()
})

describe('금액 파싱 (C26)', () => {
  it('콤마 구분 금액 "1,234,567"을 1234567로 파싱한다 (기존: 1로 오파싱)', async () => {
    const result = await importEasyLedger(easyLedgerFile([
      { date: '2024/02/01 08:00', asset: '현금', category: '식비', content: '큰 지출', amount: '1,234,567', type: '지출' },
    ]))

    expect(result.totalImported).toBe(1)
    const txns = await db.transactions.toArray()
    expect(txns).toHaveLength(1)
    expect(txns[0].amount).toBe(1234567)
  })

  it('콤마 없는 정수 금액도 그대로 파싱한다', async () => {
    await importEasyLedger(easyLedgerFile([
      { date: '2024/02/01 08:00', asset: '현금', category: '식비', content: '소액', amount: '4500', type: '지출' },
    ]))
    expect((await db.transactions.toArray())[0].amount).toBe(4500)
  })
})

describe('단일 임포트 정확성', () => {
  it('날짜/타입/메모/환급을 정확히 변환하고 카테고리·거래수단을 생성한다', async () => {
    const result = await importEasyLedger(easyLedgerFile(THREE_ROWS))

    expect(result.totalParsed).toBe(3)
    expect(result.totalImported).toBe(3)
    expect(result.totalSkipped).toBe(0)
    expect(result.warnings).toHaveLength(0)
    expect(result.dateRange).toEqual({ from: '2024-01-15', to: '2024-01-17' })
    // wipe 후라 필요한 카테고리/거래수단이 전부 새로 생성된다
    expect(result.createdCategories).toContain('식비')
    expect(result.createdCategories).toContain('월급')
    expect(result.createdPaymentMethods).toEqual(expect.arrayContaining(['현금', '우리은행', '삼성카드']))

    const txns = await db.transactions.toArray()
    expect(txns).toHaveLength(3)

    const lunch = txns.find(t => t.memo === '대성 점심 | 동네식당')!
    expect(lunch).toBeTruthy()
    expect(lunch.type).toBe('expense')
    expect(lunch.amount).toBe(10000)
    expect(lunch.date).toBe('2024-01-15')
    expect(lunch.paymentMethod).toBe('cash')
    expect(lunch.paymentMethodDetail).toBe('현금')
    expect(lunch.categoryId).not.toBeNull()

    const salary = txns.find(t => t.memo === '1월 급여')!
    expect(salary.type).toBe('income')
    expect(salary.amount).toBe(3000000)

    // 음수 금액 → 환급: income + 절대값 + "[환급]" 접두 메모
    const refund = txns.find(t => t.memo === '[환급] 반품 환불')!
    expect(refund.type).toBe('income')
    expect(refund.amount).toBe(5000)
  })

  it('파싱 가능한 행이 없으면 에러를 던진다', async () => {
    const empty = new File(['<table><tr><th>날짜</th></tr></table>'], 'empty.html', { type: 'text/html' })
    await expect(importEasyLedger(empty)).rejects.toThrow('파싱 가능한 거래 데이터가 없습니다.')
  })
})

describe('재임포트 중복 스킵 (C22)', () => {
  it('같은 파일을 다시 가져오면 새 행 0건 + 스킵 경고를 보고한다', async () => {
    await importEasyLedger(easyLedgerFile(THREE_ROWS))
    expect(await db.transactions.count()).toBe(3)
    const catCountAfterFirst = await db.transactionCategories.count()
    const pmCountAfterFirst = await db.paymentMethodItems.count()

    const second = await importEasyLedger(easyLedgerFile(THREE_ROWS))

    expect(second.totalParsed).toBe(3)
    expect(second.totalImported).toBe(0)
    expect(second.totalSkipped).toBe(3)
    expect(second.warnings.some(w => w.includes('중복'))).toBe(true)
    // 거래도, 카테고리/거래수단도 두 배로 늘지 않는다
    expect(await db.transactions.count()).toBe(3)
    expect(second.createdCategories).toHaveLength(0)
    expect(second.createdPaymentMethods).toHaveLength(0)
    expect(await db.transactionCategories.count()).toBe(catCountAfterFirst)
    expect(await db.paymentMethodItems.count()).toBe(pmCountAfterFirst)
  })

  it('파일 안의 정당한 동일 거래(같은 날 같은 금액·메모 2건)는 보존한다', async () => {
    const twin: RawRow = { date: '2024/03/01 12:00', asset: '현금', category: '식비', content: '커피', amount: '4,500', type: '지출' }
    const first = await importEasyLedger(easyLedgerFile([twin, twin]))
    expect(first.totalImported).toBe(2)
    expect(await db.transactions.count()).toBe(2)

    // 재임포트 시에는 둘 다 기존 지문에 흡수된다
    const second = await importEasyLedger(easyLedgerFile([twin, twin]))
    expect(second.totalImported).toBe(0)
    expect(second.totalSkipped).toBe(2)
    expect(await db.transactions.count()).toBe(2)
  })

  it('지문은 카운트 기반 — 기존 1건이면 파일의 동일 2건 중 1건만 스킵한다', async () => {
    const twin: RawRow = { date: '2024/03/02 12:00', asset: '현금', category: '식비', content: '점심', amount: '9,000', type: '지출' }
    await importEasyLedger(easyLedgerFile([twin, twin]))
    // 사용자가 1건을 삭제한 상황
    const one = (await db.transactions.toArray())[0]
    await db.transactions.delete(one.id)
    expect(await db.transactions.count()).toBe(1)

    const again = await importEasyLedger(easyLedgerFile([twin, twin]))
    expect(again.totalSkipped).toBe(1)
    expect(again.totalImported).toBe(1)
    expect(await db.transactions.count()).toBe(2)
  })
})

describe('원자성 (C22 — 단일 트랜잭션)', () => {
  it('행 저장이 중간에 실패하면 카테고리 생성까지 통째로 롤백되고, 재시도해도 중복이 없다', async () => {
    const file = () => easyLedgerFile([
      { date: '2024/04/01 10:00', asset: '현금', category: '원자성검증분류', content: '롤백 대상', amount: '7,700', type: '지출' },
    ])

    const spy = vi.spyOn(db.transactions, 'bulkAdd').mockImplementation(() => {
      throw new Error('저장 실패 시뮬레이션')
    })
    try {
      await expect(importEasyLedger(file())).rejects.toThrow()
    } finally {
      spy.mockRestore()
    }

    // 트랜잭션 abort → 거래 0건 + 같은 트랜잭션에서 만든 카테고리도 미잔존
    expect(await db.transactions.count()).toBe(0)
    const cats = await db.transactionCategories.toArray()
    expect(cats.some(c => c.name === '원자성검증분류')).toBe(false)

    // 재시도: 깨끗한 상태에서 정확히 1건만 들어간다 (접두 배치 중복 없음)
    const retry = await importEasyLedger(file())
    expect(retry.totalImported).toBe(1)
    expect(retry.totalSkipped).toBe(0)
    expect(await db.transactions.count()).toBe(1)
    expect((await db.transactionCategories.toArray()).filter(c => c.name === '원자성검증분류')).toHaveLength(1)
  })
})
