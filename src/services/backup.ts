import { db, setSyncWritingFlag } from '@/services/database'
import { BACKUP_CONFIG } from '@/utils/constants'
import { assertWritable } from '@/lib/writeGuard'
import type { BackupFile } from '@/lib/types'

export async function exportBackup(): Promise<void> {
  const [members, assetCategories, assetItems, dailyValues, transactionCategories, transactions, budgets, goals, paymentMethodItems, subscriptions, loans, investmentTrades, dividends, accountInterests] = await Promise.all([
    db.members.toArray(),
    db.assetCategories.toArray(),
    db.assetItems.toArray(),
    db.dailyValues.toArray(),
    db.transactionCategories.toArray(),
    db.transactions.toArray(),
    db.budgets.toArray(),
    db.goals.toArray(),
    db.paymentMethodItems.toArray(),
    db.subscriptions.toArray(),
    db.loans.toArray(),
    db.investmentTrades.toArray(),
    db.dividends.toArray(),
    db.accountInterests.toArray(),
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
      paymentMethodItems,
      subscriptions,
      loans,
      investmentTrades,
      dividends,
      accountInterests,
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
  assertWritable()  // read-only device: block the destructive restore before any wipe
  const text = await file.text()
  const backup: BackupFile = JSON.parse(text)

  if (!backup.version || !(BACKUP_CONFIG.SUPPORTED_VERSIONS as readonly string[]).includes(backup.version)) {
    throw new Error('지원하지 않는 백업 버전입니다.')
  }

  if (!backup.data) {
    throw new Error('올바르지 않은 백업 파일입니다.')
  }

  // 복원은 "로컬 교체"다 — 클라우드와의 수렴은 다음 mergeOnLogin이 담당한다.
  // sync-writing 플래그 없이 돌리면 clear()가 기존 전 레코드의 deleting 훅을
  // 행마다 발화시켜 수천 건의 delete 변경로그 + 톰스톤을 적재하고, 그 톰스톤이
  // 다음 로그인 때 클라우드/피어 기기로 삭제 전파 폭풍을 일으킨다.
  setSyncWritingFlag(true)
  try {
    await db.transaction('rw', [db.members, db.assetCategories, db.assetItems, db.dailyValues, db.transactionCategories, db.transactions, db.budgets, db.goals, db.paymentMethodItems, db.subscriptions, db.loans, db.investmentTrades, db.dividends, db.accountInterests], async () => {
      await db.members.clear()
      await db.assetCategories.clear()
      await db.assetItems.clear()
      await db.dailyValues.clear()
      await db.transactionCategories.clear()
      await db.transactions.clear()
      await db.budgets.clear()
      await db.goals.clear()
      await db.paymentMethodItems.clear()
      await db.subscriptions.clear()
      await db.loans.clear()
      await db.investmentTrades.clear()
      await db.dividends.clear()
      await db.accountInterests.clear()

      if (backup.data.members?.length) await db.members.bulkAdd(backup.data.members)
      if (backup.data.assetCategories?.length) await db.assetCategories.bulkAdd(backup.data.assetCategories)
      if (backup.data.assetItems?.length) await db.assetItems.bulkAdd(backup.data.assetItems)
      if (backup.data.dailyValues?.length) await db.dailyValues.bulkAdd(backup.data.dailyValues)
      if (backup.data.transactionCategories?.length) await db.transactionCategories.bulkAdd(backup.data.transactionCategories)
      if (backup.data.transactions?.length) await db.transactions.bulkAdd(backup.data.transactions)
      if (backup.data.budgets?.length) await db.budgets.bulkAdd(backup.data.budgets)
      if (backup.data.goals?.length) await db.goals.bulkAdd(backup.data.goals)
      if (backup.data.paymentMethodItems?.length) await db.paymentMethodItems.bulkAdd(backup.data.paymentMethodItems)
      if (backup.data.subscriptions?.length) await db.subscriptions.bulkAdd(backup.data.subscriptions)
      if (backup.data.loans?.length) await db.loans.bulkAdd(backup.data.loans)
      if (backup.data.investmentTrades?.length) await db.investmentTrades.bulkAdd(backup.data.investmentTrades)
      if (backup.data.dividends?.length) await db.dividends.bulkAdd(backup.data.dividends)
      if (backup.data.accountInterests?.length) await db.accountInterests.bulkAdd(backup.data.accountInterests)
    })
  } finally {
    setSyncWritingFlag(false)
  }
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

export async function exportInvestmentCSV(): Promise<void> {
  const trades = await db.investmentTrades.toArray()
  const divs = await db.dividends.toArray()
  const interests = await db.accountInterests.toArray()
  const members = await db.members.toArray()
  const memberMap = new Map(members.map(m => [m.id, m.name]))

  // Trades
  const tHeader = '유형,판매일,종목유형,마켓,종목명,판매수익,수익률(%),판매금액,구매금액,수량,수수료,제세금,1주당수익,1주당판매가,1주당구매가,환차손익,판매환율,구매환율,구성원'
  const tRows = trades.sort((a, b) => b.sellDate.localeCompare(a.sellDate)).map(t => {
    const mem = t.memberId != null ? memberMap.get(t.memberId) || '' : ''
    return `판매수익,${t.sellDate},${t.assetType},${t.market},"${t.stockName}",${t.totalProfit},${t.profitRate},${t.totalSellAmount},${t.totalBuyAmount},${t.sellQuantity},${t.fee},${t.tax},${t.profitPerShare},${t.sellPricePerShare},${t.buyPricePerShare},${t.fxGainLoss ?? ''},${t.sellExchangeRate ?? ''},${t.buyExchangeRate ?? ''},"${mem}"`
  })

  // Dividends
  const dHeader = '유형,지급일,배당락일,종목유형,마켓,종목명,배당금,수량,제세금,구성원'
  const dRows = divs.sort((a, b) => b.paymentDate.localeCompare(a.paymentDate)).map(d => {
    const mem = d.memberId != null ? memberMap.get(d.memberId) || '' : ''
    return `배당금,${d.paymentDate},${d.exDividendDate},${d.assetType},${d.market},"${d.stockName}",${d.dividendAmount},${d.quantity},${d.tax},"${mem}"`
  })

  // Interests
  const iHeader = '유형,입금일,기간시작,기간종료,이자유형,통화,이자,제세금,이자율(%),구성원'
  const iRows = interests.sort((a, b) => b.depositDate.localeCompare(a.depositDate)).map(r => {
    const mem = r.memberId != null ? memberMap.get(r.memberId) || '' : ''
    return `계좌이자,${r.depositDate},${r.periodStart},${r.periodEnd},${r.interestType},${r.currency},${r.interestAmount},${r.tax},${r.interestRate},"${mem}"`
  })

  const sections = []
  if (tRows.length) sections.push(`[판매수익]\n${tHeader}\n${tRows.join('\n')}`)
  if (dRows.length) sections.push(`[배당금]\n${dHeader}\n${dRows.join('\n')}`)
  if (iRows.length) sections.push(`[계좌이자]\n${iHeader}\n${iRows.join('\n')}`)

  const csv = '\uFEFF' + sections.join('\n\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const dateStr = new Date().toISOString().split('T')[0]
  link.href = url
  link.download = `moonwave_investments_${dateStr}.csv`
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
