import { describe, it, expect } from 'vitest'
import { formatKoreanUnit, formatPercent, formatNumber, formatKRW, formatKoreanAxisTick } from '@/utils/format'

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

describe('formatKoreanAxisTick', () => {
  // 회귀: 순자산이 같은 억 구간(5.1억~5.4억)에서 움직이면 정수 억 반올림은
  // 모든 눈금을 "5억"으로 붕괴시켰다 — step 기반 자릿수로 구분되어야 한다.
  it('distinguishes ticks within the same 억 band (step 0.1억)', () => {
    const ticks = [
      { value: 510_000_000 }, { value: 520_000_000 }, { value: 530_000_000 }, { value: 540_000_000 },
    ]
    expect(ticks.map(t => formatKoreanAxisTick(t.value, ticks)))
      .toEqual(['5.1억', '5.2억', '5.3억', '5.4억'])
  })

  it('uses two decimals for finer steps (step 0.05억)', () => {
    const ticks = [{ value: 520_000_000 }, { value: 525_000_000 }, { value: 530_000_000 }]
    expect(ticks.map(t => formatKoreanAxisTick(t.value, ticks)))
      .toEqual(['5.2억', '5.25억', '5.3억'])
  })

  it('keeps integer 억 when the step is 1억 or larger', () => {
    const ticks = [{ value: 100_000_000 }, { value: 200_000_000 }, { value: 300_000_000 }]
    expect(ticks.map(t => formatKoreanAxisTick(t.value, ticks)))
      .toEqual(['1억', '2억', '3억'])
  })

  it('trims trailing zeros ("5.0억" → "5억")', () => {
    const ticks = [{ value: 500_000_000 }, { value: 510_000_000 }]
    expect(formatKoreanAxisTick(500_000_000, ticks)).toBe('5억')
  })

  it('applies step-aware decimals in the 만 range', () => {
    const ticks = [{ value: 25_000 }, { value: 50_000 }, { value: 75_000 }]
    expect(ticks.map(t => formatKoreanAxisTick(t.value, ticks)))
      .toEqual(['2.5만', '5만', '7.5만'])
  })

  it('formats sub-만 values with comma grouping', () => {
    expect(formatKoreanAxisTick(2000, [{ value: 0 }, { value: 2000 }])).toBe('2,000')
    expect(formatKoreanAxisTick(0, [{ value: 0 }, { value: 2000 }])).toBe('0')
  })

  it('handles negative values (부채 차트)', () => {
    const ticks = [{ value: -520_000_000 }, { value: -510_000_000 }]
    expect(formatKoreanAxisTick(-520_000_000, ticks)).toBe('-5.2억')
  })

  it('falls back to integer rounding without ticks', () => {
    expect(formatKoreanAxisTick(523_000_000)).toBe('5억')
    expect(formatKoreanAxisTick(52_300_000)).toBe('5230만')
  })
})
