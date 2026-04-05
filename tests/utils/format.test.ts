import { describe, it, expect } from 'vitest'
import { formatKoreanUnit, formatPercent, formatNumber, formatKRW } from '@/utils/format'

describe('formatKoreanUnit', () => {
  it('formats hundreds of millions exactly', () => {
    expect(formatKoreanUnit(178154775)).toBe('178,154,775')
  })

  it('formats tens of millions exactly', () => {
    expect(formatKoreanUnit(53000000)).toBe('53,000,000')
  })

  it('formats millions exactly', () => {
    expect(formatKoreanUnit(1234567)).toBe('1,234,567')
  })

  it('formats small numbers', () => {
    expect(formatKoreanUnit(5000)).toBe('5,000')
  })

  it('handles zero', () => {
    expect(formatKoreanUnit(0)).toBe('0')
  })

  it('handles negative', () => {
    expect(formatKoreanUnit(-53000000)).toBe('-53,000,000')
  })
})

describe('formatPercent', () => {
  it('formats with default decimals', () => {
    expect(formatPercent(33.256)).toBe('33.3%')
  })

  it('formats with 0 decimals', () => {
    expect(formatPercent(33.256, 0)).toBe('33%')
  })
})

describe('formatNumber', () => {
  it('formats with commas', () => {
    expect(formatNumber(1234567)).toBe('1,234,567')
  })
})

describe('formatKRW', () => {
  it('formats as Korean won', () => {
    expect(formatKRW(1234567)).toBe('1,234,567원')
  })
})
