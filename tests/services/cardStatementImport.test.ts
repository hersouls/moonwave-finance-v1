import { describe, it, expect } from 'vitest'
import {
  detectCardCompany,
  parseCardStatement,
  parseSamsungStatement,
  parseShinhanStatement,
} from '@/services/cardStatementImport'

// 사용자가 직접 공유한 삼성카드 명세서 샘플 (일시불 섹션 7건, 소계 275,242원)
const SAMSUNG_SAMPLE = `일시불
소계 총 7건275,242원
컬리페이_컬리
79,142원

26. 3. 17본 인 0438
LINK할인혜택 -2,000원

설성푸드 주식회사
59,140원

26. 4. 1본 인 0438
(유)아웃백스테이크하우스 파주점
50,700원

26. 4. 5본 인 0438
설성푸드 주식회사
35,960원

26. 3. 23본 인 0438
청도신화랑풍류마을
35,000원

26. 4. 12본 인 0438
케이플레이즈라운지주식회사
15,000원

26. 3. 20본 인 0438
바로알림서비스 03월이용료
300원

26. 3. 25본 인 0438`

const SHINHAN_SAMPLE = `스타벅스 강남R점
4,500원
2026.04.05
본인643

봉추찜닭 판교점
22,000원
2026.04.02
가족429`

describe('detectCardCompany', () => {
  it('detects Samsung by combined "YY. M. DD본 인 XXXX" line', () => {
    expect(detectCardCompany(SAMSUNG_SAMPLE)).toBe('samsung')
  })

  it('detects Shinhan by full-year date + standalone owner line', () => {
    expect(detectCardCompany(SHINHAN_SAMPLE)).toBe('shinhan')
  })

  it('returns unknown when neither pattern matches', () => {
    expect(detectCardCompany('hello world\nno card data here')).toBe('unknown')
  })
})

describe('parseSamsungStatement', () => {
  const rows = parseSamsungStatement(SAMSUNG_SAMPLE)

  it('parses exactly 7 transactions', () => {
    expect(rows).toHaveLength(7)
  })

  it('parses merchants, amounts, dates, suffix in order', () => {
    expect(rows.map(r => [r.merchant, r.amount, r.date, r.cardSuffix])).toEqual([
      ['컬리페이_컬리', 79142, '2026-03-17', '0438'],
      ['설성푸드 주식회사', 59140, '2026-04-01', '0438'],
      ['(유)아웃백스테이크하우스 파주점', 50700, '2026-04-05', '0438'],
      ['설성푸드 주식회사', 35960, '2026-03-23', '0438'],
      ['청도신화랑풍류마을', 35000, '2026-04-12', '0438'],
      ['케이플레이즈라운지주식회사', 15000, '2026-03-20', '0438'],
      ['바로알림서비스 03월이용료', 300, '2026-03-25', '0438'],
    ])
  })

  it('attaches "LINK할인혜택 -2,000원" as discount on the 컬리페이 row', () => {
    expect(rows[0].discount).toBe(2000)
    // Other rows have no discount
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].discount).toBeUndefined()
    }
  })

  it('gross amount sum matches the printed 소계 (275,242원)', () => {
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(275242)
  })
})

describe('parseShinhanStatement (regression)', () => {
  const rows = parseShinhanStatement(SHINHAN_SAMPLE)

  it('still parses Shinhan format unchanged', () => {
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      merchant: '스타벅스 강남R점',
      amount: 4500,
      date: '2026-04-05',
      cardSuffix: '643',
    })
    expect(rows[1]).toMatchObject({
      merchant: '봉추찜닭 판교점',
      amount: 22000,
      date: '2026-04-02',
      cardSuffix: '429',
    })
  })
})

describe('parseCardStatement (unified entry, auto-detect)', () => {
  it('routes Samsung text to Samsung parser', () => {
    const rows = parseCardStatement(SAMSUNG_SAMPLE)
    expect(rows).toHaveLength(7)
    expect(rows[0].merchant).toBe('컬리페이_컬리')
  })

  it('routes Shinhan text to Shinhan parser', () => {
    const rows = parseCardStatement(SHINHAN_SAMPLE)
    expect(rows).toHaveLength(2)
    expect(rows[0].merchant).toBe('스타벅스 강남R점')
  })

  it('honors explicit company override', () => {
    expect(parseCardStatement(SAMSUNG_SAMPLE, 'samsung')).toHaveLength(7)
    expect(parseCardStatement(SHINHAN_SAMPLE, 'shinhan')).toHaveLength(2)
  })
})
