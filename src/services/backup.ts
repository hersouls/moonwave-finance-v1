import { db, setSyncWritingFlag, drainChangeTracking } from '@/services/database'
import { BACKUP_CONFIG } from '@/utils/constants'
import type { BackupFile, SyncOutboxEntry } from '@/lib/types'

// ─── Backup format versions ─────────────────────────────
//
// Sync v2 부터 백업 파일은 version '2.0' — 모든 행이 문자열 id(구 syncId 승격)를
// 갖고 FK 필드도 부모의 문자열 id 를 가리킨다. 구버전(1.x) 백업 파일(숫자
// auto-increment id + 별도 syncId)은 임포트 시점에 id 승격 + FK 재작성으로
// 변환해 하위호환을 유지한다.
const BACKUP_VERSION_V2 = '2.0'
const SUPPORTED_VERSIONS: readonly string[] = [
  ...BACKUP_CONFIG.SUPPORTED_VERSIONS,
  BACKUP_VERSION_V2,
]

// ─── Legacy (1.x) backup conversion ─────────────────────

type RawRow = Record<string, unknown>

const BACKUP_TABLES = [
  'members', 'assetCategories', 'assetItems', 'dailyValues',
  'transactionCategories', 'transactions', 'budgets', 'goals',
  'paymentMethodItems', 'subscriptions', 'loans',
  'investmentTrades', 'dividends', 'accountInterests',
] as const
type BackupTableName = typeof BACKUP_TABLES[number]

/** FK 필드 정의 — 레거시 백업의 숫자 FK → 문자열 id 재작성 대상.
 *  mode 는 매핑 실패 시 처리: nullable→null, optional→delete, required→''. */
const BACKUP_FK_DEFS: Partial<Record<BackupTableName, Array<{
  field: string
  refTable: BackupTableName
  mode: 'required' | 'nullable' | 'optional'
}>>> = {
  assetItems: [
    { field: 'memberId', refTable: 'members', mode: 'required' },
    { field: 'categoryId', refTable: 'assetCategories', mode: 'required' },
  ],
  dailyValues: [
    { field: 'assetItemId', refTable: 'assetItems', mode: 'required' },
  ],
  transactions: [
    { field: 'memberId', refTable: 'members', mode: 'nullable' },
    { field: 'categoryId', refTable: 'transactionCategories', mode: 'nullable' },
    { field: 'paymentMethodItemId', refTable: 'paymentMethodItems', mode: 'optional' },
    { field: 'recurSourceId', refTable: 'transactions', mode: 'optional' },
    { field: 'subscriptionId', refTable: 'subscriptions', mode: 'optional' },
  ],
  budgets: [
    { field: 'categoryId', refTable: 'transactionCategories', mode: 'required' },
  ],
  paymentMethodItems: [
    { field: 'linkedAssetItemId', refTable: 'assetItems', mode: 'optional' },
  ],
  subscriptions: [
    { field: 'paymentMethodItemId', refTable: 'paymentMethodItems', mode: 'optional' },
    { field: 'linkedTransactionCategoryId', refTable: 'transactionCategories', mode: 'optional' },
  ],
  loans: [
    { field: 'linkedAssetItemId', refTable: 'assetItems', mode: 'optional' },
  ],
  investmentTrades: [{ field: 'memberId', refTable: 'members', mode: 'nullable' }],
  dividends: [{ field: 'memberId', refTable: 'members', mode: 'nullable' }],
  accountInterests: [{ field: 'memberId', refTable: 'members', mode: 'nullable' }],
}

/** 백업 데이터에 숫자 id 행이 하나라도 있으면 레거시(1.x) 형식이다. */
function isLegacyBackupData(data: BackupFile['data']): boolean {
  const raw = data as unknown as Record<string, RawRow[] | undefined>
  for (const name of BACKUP_TABLES) {
    const rows = raw[name]
    if (rows?.some((r) => typeof r.id === 'number')) return true
  }
  return false
}

/**
 * 레거시(1.x) 백업 데이터를 v2 형식으로 변환한다:
 *   - 각 행의 syncId 를 id 로 승격 (syncId 없으면 새 UUID)
 *   - 파일 내 데이터로 (테이블 × 숫자 id → 문자열 id) 매핑을 만들어 FK 재작성
 *   - FK 매핑 실패 시: nullable→null, optional→필드 삭제, required→'' (미매칭 표식)
 *   - projected dailyValues 는 드롭 — 동기화/백업 대상이 아니며 앵커에서 재생성된다
 * v2 형식(문자열 id) 데이터는 그대로 반환한다.
 */
function normalizeBackupData(data: BackupFile['data']): BackupFile['data'] {
  if (!isLegacyBackupData(data)) return data

  const raw = data as unknown as Record<string, RawRow[] | undefined>

  // 1패스 — 테이블별 (숫자 id → 문자열 id) 매핑 구성
  const idMaps: Record<BackupTableName, Map<number, string>> =
    {} as Record<BackupTableName, Map<number, string>>
  for (const name of BACKUP_TABLES) {
    const map = new Map<number, string>()
    for (const row of raw[name] ?? []) {
      if (typeof row.id === 'number') {
        const sid = typeof row.syncId === 'string' && row.syncId ? row.syncId : crypto.randomUUID()
        map.set(row.id, sid)
      }
    }
    idMaps[name] = map
  }

  // 2패스 — id 승격 + FK 재작성 (+ projected dailyValues 제외)
  const out: Record<string, RawRow[]> = {}
  for (const name of BACKUP_TABLES) {
    const rows = raw[name]
    if (!rows) continue
    const fkDefs = BACKUP_FK_DEFS[name] ?? []
    const converted: RawRow[] = []
    for (const row of rows) {
      if (name === 'dailyValues' && row.source === 'projected') continue
      const next: RawRow = { ...row }
      if (typeof next.id === 'number') {
        next.id = idMaps[name].get(next.id)!
      } else if (typeof next.id !== 'string' || !next.id) {
        next.id = typeof next.syncId === 'string' && next.syncId ? next.syncId : crypto.randomUUID()
      }
      delete next.syncId
      for (const def of fkDefs) {
        const v = next[def.field]
        if (typeof v !== 'number') continue // 문자열/null/undefined 는 그대로
        const mapped = idMaps[def.refTable].get(v)
        if (mapped != null) {
          next[def.field] = mapped
        } else if (def.mode === 'nullable') {
          next[def.field] = null
        } else if (def.mode === 'optional') {
          delete next[def.field]
        } else {
          next[def.field] = '' // required — 미매칭 표식 ('' 조회는 항상 미스)
        }
      }
      converted.push(next)
    }
    out[name] = converted
  }

  return { ...data, ...out } as unknown as BackupFile['data']
}

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
    version: BACKUP_VERSION_V2,
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
  const text = await file.text()
  const backup: BackupFile = JSON.parse(text)

  if (!backup.version || !SUPPORTED_VERSIONS.includes(backup.version)) {
    throw new Error('지원하지 않는 백업 버전입니다.')
  }

  if (!backup.data) {
    throw new Error('올바르지 않은 백업 파일입니다.')
  }

  // 구버전(숫자 id) 백업이면 여기서 v2 형식으로 변환된다. v2 백업은 그대로.
  const data = normalizeBackupData(backup.data)

  // 복원은 "로컬 교체"다 — 클라우드와의 수렴은 다음 동기화 세션이 담당한다.
  // sync-writing 플래그 없이 돌리면 clear()가 기존 전 레코드의 deleting 훅을
  // 행마다 발화시켜 수천 건의 delete 아웃박스 항목을 적재하고, 그 삭제가
  // 다음 푸시 때 클라우드/피어 기기로 삭제 전파 폭풍을 일으킨다.
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

      if (data.members?.length) await db.members.bulkAdd(data.members)
      if (data.assetCategories?.length) await db.assetCategories.bulkAdd(data.assetCategories)
      if (data.assetItems?.length) await db.assetItems.bulkAdd(data.assetItems)
      if (data.dailyValues?.length) await db.dailyValues.bulkAdd(data.dailyValues)
      if (data.transactionCategories?.length) await db.transactionCategories.bulkAdd(data.transactionCategories)
      if (data.transactions?.length) await db.transactions.bulkAdd(data.transactions)
      if (data.budgets?.length) await db.budgets.bulkAdd(data.budgets)
      if (data.goals?.length) await db.goals.bulkAdd(data.goals)
      if (data.paymentMethodItems?.length) await db.paymentMethodItems.bulkAdd(data.paymentMethodItems)
      if (data.subscriptions?.length) await db.subscriptions.bulkAdd(data.subscriptions)
      if (data.loans?.length) await db.loans.bulkAdd(data.loans)
      if (data.investmentTrades?.length) await db.investmentTrades.bulkAdd(data.investmentTrades)
      if (data.dividends?.length) await db.dividends.bulkAdd(data.dividends)
      if (data.accountInterests?.length) await db.accountInterests.bulkAdd(data.accountInterests)
    })

    // 복원 전 상태를 가리키는 잔여 동기화 아웃박스를 정리한다 — 특히 pending
    // 'delete' 항목은 복원으로 부활한 레코드(동일 id)를 다음 푸시에서 클라우드/
    // 피어 기기로부터 삭제시킬 수 있다. clearAllData와 동일한 로컬 교체 의미론.
    await drainChangeTracking()
    await db.syncOutbox.clear()

    // 복원된 데이터를 클라우드로 밀어 올릴 아웃박스 마커를 시드한다 — 복원은
    // sync-writing 플래그로 CRUD 훅이 침묵하므로, 이 시드가 없으면 복원분이
    // 영원히 업로드되지 않는다. 클라우드와의 수렴은 다음 푸시 + 문서 단위
    // LWW(피어 인제스트)가 담당한다. projected dailyValues는 동기화 범위 밖.
    const queuedAt = new Date().toISOString()
    const outboxRows: SyncOutboxEntry[] = []
    const seedOutbox = (tableName: string, rows: ReadonlyArray<{ id: string }> | undefined) => {
      for (const r of rows ?? []) {
        if (!r.id) continue
        outboxRows.push({ key: `${tableName}:${r.id}`, tableName, recordId: r.id, op: 'upsert', queuedAt })
      }
    }
    seedOutbox('members', data.members)
    seedOutbox('assetCategories', data.assetCategories)
    seedOutbox('assetItems', data.assetItems)
    seedOutbox('transactionCategories', data.transactionCategories)
    seedOutbox('transactions', data.transactions)
    seedOutbox('budgets', data.budgets)
    seedOutbox('goals', data.goals)
    seedOutbox('paymentMethodItems', data.paymentMethodItems)
    seedOutbox('subscriptions', data.subscriptions)
    seedOutbox('loans', data.loans)
    seedOutbox('investmentTrades', data.investmentTrades)
    seedOutbox('dividends', data.dividends)
    seedOutbox('accountInterests', data.accountInterests)
    for (const dv of data.dailyValues ?? []) {
      if (!dv.id || dv.source === 'projected') continue
      outboxRows.push({
        key: `dailyValues:${dv.id}`,
        tableName: 'dailyValues',
        recordId: dv.id,
        op: 'upsert',
        queuedAt,
        assetItemId: dv.assetItemId,
        date: dv.date,
      })
    }
    if (outboxRows.length > 0) await db.syncOutbox.bulkPut(outboxRows)
  } finally {
    setSyncWritingFlag(false)
  }

  // 로그인 상태라면 즉시 푸시 시작 (로그아웃 상태면 다음 로그인의
  // startSyncSession → flushOutbox가 잔량을 처리한다).
  try {
    const { requestPush } = await import('@/services/firestoreSync')
    requestPush()
  } catch { /* 동기화 모듈 미초기화 — 다음 세션이 처리 */ }
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
    .sort((a, b) => b.date.localeCompare(a.date) || a.assetItemId.localeCompare(b.assetItemId))
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
