import { describe, it, expect } from 'vitest'
import { BACKUP_CONFIG } from '@/utils/constants'
import { importBackup } from '@/services/backup'
import { db } from '@/services/database'

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
    expect(backup.version).toBe(BACKUP_CONFIG.CURRENT_VERSION)
    expect(backup.data.members).toEqual([])
    expect((BACKUP_CONFIG.SUPPORTED_VERSIONS as readonly string[]).includes(backup.version)).toBe(true)
  })

  it('복원(importBackup)은 변경로그/톰스톤을 남기지 않는다 — 로컬 교체 의미론', async () => {
    // 기존 레코드 1건 (복원 시 wipe 대상 → deleting 훅이 발화하는 상황)
    const now = new Date().toISOString()
    await db.transactions.add({
      syncId: crypto.randomUUID(),
      memberId: null,
      type: 'expense',
      amount: 500,
      categoryId: null,
      date: '2026-06-01',
      isRecurring: false,
      createdAt: now,
      updatedAt: now,
    } as never)
    // add가 적재한 post-commit changelog가 도착한 뒤 비운다
    await new Promise((r) => setTimeout(r, 30))
    await db.syncChangeLog.clear()
    await db.syncTombstones.clear()

    const backupJson = JSON.stringify({
      version: BACKUP_CONFIG.CURRENT_VERSION,
      appName: BACKUP_CONFIG.APP_NAME,
      exportDate: now,
      data: {
        members: [],
        transactions: [{
          syncId: crypto.randomUUID(), memberId: null, type: 'income', amount: 1234,
          categoryId: null, date: '2026-06-02', isRecurring: false, createdAt: now, updatedAt: now,
        }],
      },
    })
    await importBackup(new File([backupJson], 'backup.json', { type: 'application/json' }))

    expect(await db.transactions.count()).toBe(1)
    expect((await db.transactions.toArray())[0].amount).toBe(1234)
    // 복원이 wipe한 기존 레코드의 톰스톤/변경로그가 적재되면 다음 로그인 때
    // 클라우드/피어로 삭제 전파 폭풍이 일어난다 — 반드시 0건이어야 한다.
    await new Promise((r) => setTimeout(r, 50))
    expect(await db.syncChangeLog.count()).toBe(0)
    expect(await db.syncTombstones.count()).toBe(0)
  })
})
