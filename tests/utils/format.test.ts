import { describe, it, expect } from 'vitest'
import { formatKoreanUnit, formatPercent, formatNumber, formatKRW } from '@/utils/format'

describe('formatKoreanUnit', () => {
  it('formats billions', () => {
    expect(formatKoreanUnit(150000000)).toBe('1.5억')
  })

  it('formats tens of millions', () => {
    expect(formatKoreanUnit(53000000)).toBe('5,300만')
  })

  it('formats millions', () => {
    expect(formatKoreanUnit(1234567)).toBe('123만')
  })

  it('formats small numbers', () => {
    expect(formatKoreanUnit(5000)).toBe('5,000')
  })

  it('handles zero', () => {
    expect(formatKoreanUnit(0)).toBe('0')
  })

  it('handles negative', () => {
    const result = formatKoreanUnit(-53000000)
    expect(result).toContain('5,300만')
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
