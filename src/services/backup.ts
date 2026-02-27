import { db } from '@/services/database'
import { BACKUP_CONFIG } from '@/utils/constants'
import type { BackupFile } from '@/lib/types'

export async function exportBackup(): Promise<void> {
  const [members, assetCategories, assetItems, dailyValues, transactionCategories, transactions, budgets, goals] = await Promise.all([
    db.members.toArray(),
    db.assetCategories.toArray(),
    db.assetItems.toArray(),
    db.dailyValues.toArray(),
    db.transactionCategories.toArray(),
    db.transactions.toArray(),
    db.budgets.toArray(),
    db.goals.toArray(),
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
      budgets,
      goals,
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

  await db.transaction('rw', [db.members, db.assetCategories, db.assetItems, db.dailyValues, db.transactionCategories, db.transactions, db.budgets, db.goals], async () => {
    await db.members.clear()
    await db.assetCategories.clear()
    await db.assetItems.clear()
    await db.dailyValues.clear()
    await db.transactionCategories.clear()
    await db.transactions.clear()
    await db.budgets.clear()
    await db.goals.clear()

    if (backup.data.members?.length) await db.members.bulkAdd(backup.data.members)
    if (backup.data.assetCategories?.length) await db.assetCategories.bulkAdd(backup.data.assetCategories)
    if (backup.data.assetItems?.length) await db.assetItems.bulkAdd(backup.data.assetItems)
    if (backup.data.dailyValues?.length) await db.dailyValues.bulkAdd(backup.data.dailyValues)
    if (backup.data.transactionCategories?.length) await db.transactionCategories.bulkAdd(backup.data.transactionCategories)
    if (backup.data.transactions?.length) await db.transactions.bulkAdd(backup.data.transactions)
    if (backup.data.budgets?.length) await db.budgets.bulkAdd(backup.data.budgets)
    if (backup.data.goals?.length) await db.goals.bulkAdd(backup.data.goals)
  })
}

export async function exportTransactionsCSV(): Promise<void> {
  const transactions = await db.transactions.toArray()
  const categories = await db.transactionCategories.toArray()
  const members = await db.members.toArray()

  const catMap = new Map(categories.map(c => [c.id, c.name]))
  const memberMap = new Map(members.map(m => [m.id, m.name]))

  const header = '날짜,유형,카테고리,금액,구성원,메모'
  const rows = transactions
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(t => {
      const typeLabel = t.type === 'income' ? '수입' : '지출'
      const catName = t.categoryId ? catMap.get(t.categoryId) || '' : ''
      const memberName = t.memberId ? memberMap.get(t.memberId) || '' : ''
      const memo = (t.memo || '').replace(/"/g, '""')
      return `${t.date},${typeLabel},"${catName}",${t.amount},"${memberName}","${memo}"`
    })

  const csv = '\uFEFF' + [header, ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const dateStr = new Date().toISOString().split('T')[0]
  link.href = url
  link.download = `moonwave_transactions_${dateStr}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export async function exportAssetValuesCSV(): Promise<void> {
  const items = await db.assetItems.toArray()
  const values = await db.dailyValues.toArray()
  const categories = await db.assetCategories.toArray()
  const members = await db.members.toArray()

  const catMap = new Map(categories.map(c => [c.id, c.name]))
  const memberMap = new Map(members.map(m => [m.id, m.name]))
  const itemMap = new Map(items.map(i => [i.id, i]))

  const header = '날짜,항목명,카테고리,유형,구성원,금액'
  const rows = values
    .sort((a, b) => b.date.localeCompare(a.date) || a.assetItemId - b.assetItemId)
    .map(v => {
      const item = itemMap.get(v.assetItemId)
      if (!item) return null
      const catName = catMap.get(item.categoryId) || ''
      const memberName = memberMap.get(item.memberId) || ''
      const typeLabel = item.type === 'asset' ? '자산' : '부채'
      return `${v.date},"${item.name}","${catName}",${typeLabel},"${memberName}",${v.value}`
    })
    .filter(Boolean)

  const csv = '\uFEFF' + [header, ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const dateStr = new Date().toISOString().split('T')[0]
  link.href = url
  link.download = `moonwave_asset_values_${dateStr}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
