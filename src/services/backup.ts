import { db } from '@/services/database'
import { BACKUP_CONFIG } from '@/utils/constants'
import type { BackupFile } from '@/lib/types'

export async function exportBackup(): Promise<void> {
  const [members, assetCategories, assetItems, dailyValues, transactionCategories, transactions] = await Promise.all([
    db.members.toArray(),
    db.assetCategories.toArray(),
    db.assetItems.toArray(),
    db.dailyValues.toArray(),
    db.transactionCategories.toArray(),
    db.transactions.toArray(),
  ])

  const backup: BackupFile = {
    version: BACKUP_CONFIG.CURRENT_VERSION,
    appName: BACKUP_CONFIG.APP_NAME,
    exportDate: new Date().toISOString(),
    data: {
      members,
      assetCategories,
      assetItems,
      dailyValues,
      transactionCategories,
      transactions,
      settings: {},
    },
  }

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const dateStr = new Date().toISOString().split('T')[0]
  link.href = url
  link.download = `${BACKUP_CONFIG.FILE_PREFIX}_${dateStr}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export async function importBackup(file: File): Promise<void> {
  const text = await file.text()
  const backup: BackupFile = JSON.parse(text)

  if (!backup.version || !(BACKUP_CONFIG.SUPPORTED_VERSIONS as readonly string[]).includes(backup.version)) {
    throw new Error('지원하지 않는 백업 버전입니다.')
  }

  if (!backup.data) {
    throw new Error('올바르지 않은 백업 파일입니다.')
  }

  await db.transaction('rw', [db.members, db.assetCategories, db.assetItems, db.dailyValues, db.transactionCategories, db.transactions], async () => {
    await db.members.clear()
    await db.assetCategories.clear()
    await db.assetItems.clear()
    await db.dailyValues.clear()
    await db.transactionCategories.clear()
    await db.transactions.clear()

    if (backup.data.members?.length) await db.members.bulkAdd(backup.data.members)
    if (backup.data.assetCategories?.length) await db.assetCategories.bulkAdd(backup.data.assetCategories)
    if (backup.data.assetItems?.length) await db.assetItems.bulkAdd(backup.data.assetItems)
    if (backup.data.dailyValues?.length) await db.dailyValues.bulkAdd(backup.data.dailyValues)
    if (backup.data.transactionCategories?.length) await db.transactionCategories.bulkAdd(backup.data.transactionCategories)
    if (backup.data.transactions?.length) await db.transactions.bulkAdd(backup.data.transactions)
  })
}
