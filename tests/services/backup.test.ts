import { describe, it, expect } from 'vitest'
import { BACKUP_CONFIG } from '@/utils/constants'

describe('backup service', () => {
  it('has valid backup config', () => {
    expect(BACKUP_CONFIG.CURRENT_VERSION).toBeDefined()
    expect(BACKUP_CONFIG.APP_NAME).toBe('Moonwave Finance')
    expect(BACKUP_CONFIG.SUPPORTED_VERSIONS).toContain(BACKUP_CONFIG.CURRENT_VERSION)
  })

  it('validates backup file structure', () => {
    const backup = {
      version: BACKUP_CONFIG.CURRENT_VERSION,
      appName: BACKUP_CONFIG.APP_NAME,
      exportDate: new Date().toISOString(),
      data: {
        members: [],
        assetCategories: [],
        assetItems: [],
        dailyValues: [],
        transactionCategories: [],
        transactions: [],
        settings: {},
      },
    }
    expect(backup.version).toBe('1.0.0')
    expect(backup.data.members).toEqual([])
    expect((BACKUP_CONFIG.SUPPORTED_VERSIONS as readonly string[]).includes(backup.version)).toBe(true)
  })
})
