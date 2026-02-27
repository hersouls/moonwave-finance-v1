import { describe, it, expect } from 'vitest'

// Test the computation logic directly
describe('asset stats computation', () => {
  it('calculates net worth correctly', () => {
    const totalAssets = 100000000
    const totalLiabilities = 30000000
    const netWorth = totalAssets - totalLiabilities
    expect(netWorth).toBe(70000000)
  })

  it('calculates debt ratio correctly', () => {
    const totalAssets = 100000000
    const totalLiabilities = 30000000
    const debtRatio = totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0
    expect(debtRatio).toBe(30)
  })

  it('handles zero assets', () => {
    const totalAssets = 0
    const totalLiabilities = 0
    const debtRatio = totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0
    expect(debtRatio).toBe(0)
  })
})
