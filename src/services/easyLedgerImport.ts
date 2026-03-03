import { db } from '@/services/database'
import type { TransactionType, PaymentMethod, TransactionCategory, PaymentMethodItem } from '@/lib/types'

// ─── Types ──────────────────────────────────────────

interface EasyLedgerRow {
  date: string
  asset: string
  category: string
  subcategory: string
  content: string
  amountKRW: number
  type: '수입' | '지출'
  memo: string
}

export interface ImportPreview {
  totalRecords: number
  dateRange: { from: string; to: string }
  categories: { name: string; type: string; count: number; isNew: boolean }[]
  assets: { name: string; count: number }[]
  members: { name: string; count: number }[]
  negativeAmountCount: number
}

export interface ImportResult {
  totalParsed: number
  totalImported: number
  createdCategories: string[]
  createdPaymentMethods: string[]
  dateRange: { from: string; to: string }
  warnings: string[]
}

export type ImportProgressCallback = (current: number, total: number, phase: string) => void

// ─── Constants ──────────────────────────────────────

const CATEGORY_NAME_MAP: Record<string, string> = {
  '교통': '교통비',
  '교육': '교육비',
  '주거': '주거비',
  '통신': '통신비',
}

const ASSET_PAYMENT_MAP: Record<string, { type: PaymentMethod; name: string }> = {
  '현금': { type: 'cash', name: '현금' },
  '삼성카드': { type: 'credit_card', name: '삼성카드' },
  '씨티카드': { type: 'credit_card', name: '씨티카드' },
  '우리은행': { type: 'bank_transfer', name: '우리은행' },
}

const KNOWN_MEMBERS = ['대성', '다연']

// Default colors/icons for auto-created categories
const CATEGORY_DEFAULTS: Record<string, { color: string; icon: string }> = {
  '다연여행수입': { color: '#14B8A6', icon: 'Plane' },
  '가상화폐수익': { color: '#F59E0B', icon: 'Bitcoin' },
  '주식수익': { color: '#22C55E', icon: 'LineChart' },
  '건강': { color: '#EF4444', icon: 'HeartPulse' },
  '경조사/회비': { color: '#A855F7', icon: 'Gift' },
  '대출상환': { color: '#DC2626', icon: 'Landmark' },
  '마트/편의점': { color: '#FB923C', icon: 'ShoppingCart' },
  '보험': { color: '#0EA5E9', icon: 'Shield' },
  '부모님': { color: '#EC4899', icon: 'Heart' },
  '생활용품': { color: '#84CC16', icon: 'Package' },
  '여행': { color: '#06B6D4', icon: 'Map' },
  '카드대금': { color: '#F43F5E', icon: 'CreditCard' },
  '투자': { color: '#6366F1', icon: 'TrendingUp' },
  '패션/미용': { color: '#E879F9', icon: 'Shirt' },
}

// ─── Parsing ────────────────────────────────────────

function parseEasyLedgerHTML(htmlContent: string): EasyLedgerRow[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(htmlContent, 'text/html')
  const trs = doc.querySelectorAll('tr')
  const rows: EasyLedgerRow[] = []

  for (let i = 1; i < trs.length; i++) {
    const tds = trs[i].querySelectorAll('td')
    if (tds.length < 7) continue

    const rawDate = (tds[0].textContent || '').trim()
    const rawAmount = parseFloat((tds[5].textContent || '').trim())

    if (!rawDate || isNaN(rawAmount)) continue

    const type = (tds[6].textContent || '').trim()
    if (type !== '수입' && type !== '지출') continue

    rows.push({
      date: rawDate,
      asset: (tds[1].textContent || '').trim(),
      category: (tds[2].textContent || '').trim(),
      subcategory: (tds[3].textContent || '').trim(),
      content: (tds[4].textContent || '').trim(),
      amountKRW: rawAmount,
      type,
      memo: (tds[7]?.textContent || '').trim(),
    })
  }

  return rows
}

function parseDate(rawDate: string): string {
  const datePart = rawDate.split(' ')[0]
  return datePart.replace(/\//g, '-')
}

function detectMember(content: string): string | null {
  for (const name of KNOWN_MEMBERS) {
    if (content.startsWith(name + ' ') || content === name) {
      return name
    }
  }
  return null
}

function resolveFinCategoryName(easyLedgerCategoryName: string): string {
  return CATEGORY_NAME_MAP[easyLedgerCategoryName] || easyLedgerCategoryName
}

function buildMemo(content: string, originalMemo: string, isRefund: boolean): string {
  let memo = content
  if (isRefund) memo = `[환급] ${memo}`
  if (originalMemo) memo = `${memo} | ${originalMemo}`
  return memo
}

// ─── Preview ────────────────────────────────────────

export async function previewEasyLedgerImport(file: File): Promise<ImportPreview> {
  const text = await file.text()
  const rows = parseEasyLedgerHTML(text)

  if (rows.length === 0) {
    throw new Error('파싱 가능한 거래 데이터가 없습니다.')
  }

  // Existing categories
  const existingCategories = await db.transactionCategories.toArray()
  const existingCatNames = new Set(existingCategories.map(c => c.name))

  // Aggregate
  const catCount = new Map<string, { type: string; count: number }>()
  const assetCount = new Map<string, number>()
  const memberCount = new Map<string, number>()
  let negativeCount = 0
  const dates: string[] = []

  for (const row of rows) {
    // Category
    const finCatName = resolveFinCategoryName(row.category)
    const catKey = `${finCatName}|${row.type === '수입' ? 'income' : 'expense'}`
    const existing = catCount.get(catKey)
    if (existing) {
      existing.count++
    } else {
      catCount.set(catKey, { type: row.type === '수입' ? '수입' : '지출', count: 1 })
    }

    // Asset
    assetCount.set(row.asset, (assetCount.get(row.asset) || 0) + 1)

    // Member
    const member = detectMember(row.content)
    if (member) {
      memberCount.set(member, (memberCount.get(member) || 0) + 1)
    }

    // Negative
    if (row.amountKRW < 0) negativeCount++

    // Date
    dates.push(parseDate(row.date))
  }

  dates.sort()

  const categories = Array.from(catCount.entries()).map(([key, val]) => {
    const name = key.split('|')[0]
    return { name, type: val.type, count: val.count, isNew: !existingCatNames.has(name) }
  }).sort((a, b) => b.count - a.count)

  return {
    totalRecords: rows.length,
    dateRange: { from: dates[0], to: dates[dates.length - 1] },
    categories,
    assets: Array.from(assetCount.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    members: Array.from(memberCount.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    negativeAmountCount: negativeCount,
  }
}

// ─── Import ─────────────────────────────────────────

export async function importEasyLedger(
  file: File,
  onProgress?: ImportProgressCallback
): Promise<ImportResult> {
  const warnings: string[] = []
  const createdCategories: string[] = []
  const createdPaymentMethods: string[] = []

  // Step A: Parse
  onProgress?.(0, 100, '파일 파싱 중...')
  const text = await file.text()
  const rows = parseEasyLedgerHTML(text)

  if (rows.length === 0) {
    throw new Error('파싱 가능한 거래 데이터가 없습니다.')
  }

  // Step B: Ensure categories exist
  onProgress?.(5, 100, '카테고리 준비 중...')
  const existingCategories = await db.transactionCategories.toArray()
  const categoryMap = new Map<string, number>()

  // Build lookup: name+type -> id
  for (const cat of existingCategories) {
    categoryMap.set(`${cat.name}|${cat.type}`, cat.id!)
  }

  // Find unique categories needed
  const neededCategories = new Map<string, TransactionType>()
  for (const row of rows) {
    const finName = resolveFinCategoryName(row.category)
    const finType: TransactionType = row.amountKRW < 0 ? 'income' : (row.type === '수입' ? 'income' : 'expense')
    const key = `${finName}|${finType}`
    if (!categoryMap.has(key) && !neededCategories.has(key)) {
      neededCategories.set(key, finType)
    }
  }

  // Create missing categories
  const now = new Date().toISOString()
  for (const [key, type] of neededCategories) {
    const name = key.split('|')[0]
    const defaults = CATEGORY_DEFAULTS[name] || { color: '#71717A', icon: 'MoreHorizontal' }
    const maxOrder = existingCategories.filter(c => c.type === type).reduce((max, c) => Math.max(max, c.sortOrder), -1)

    const id = await db.transactionCategories.add({
      name,
      type,
      color: defaults.color,
      icon: defaults.icon,
      isDefault: false,
      sortOrder: maxOrder + 1,
      syncId: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    } as TransactionCategory) as number

    categoryMap.set(key, id)
    createdCategories.push(name)
    existingCategories.push({ id, name, type, color: defaults.color, icon: defaults.icon, isDefault: false, sortOrder: maxOrder + 1, createdAt: now, updatedAt: now })
  }

  // Step C: Ensure PaymentMethodItems exist
  onProgress?.(10, 100, '거래수단 준비 중...')
  const existingPaymentMethods = await db.paymentMethodItems.toArray()
  const pmMap = new Map<string, number>()
  const pmTypeMap = new Map<string, PaymentMethod>()

  for (const pm of existingPaymentMethods) {
    pmMap.set(pm.name, pm.id!)
    pmTypeMap.set(pm.name, pm.type)
  }

  const uniqueAssets = new Set(rows.map(r => r.asset))
  for (const asset of uniqueAssets) {
    if (!pmMap.has(asset)) {
      const mapping = ASSET_PAYMENT_MAP[asset] || { type: 'other' as PaymentMethod, name: asset }
      const maxOrder = existingPaymentMethods.reduce((max, i) => Math.max(max, i.sortOrder), -1)

      const id = await db.paymentMethodItems.add({
        type: mapping.type,
        name: asset,
        isActive: true,
        sortOrder: maxOrder + 1,
        syncId: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
      } as PaymentMethodItem) as number

      pmMap.set(asset, id)
      pmTypeMap.set(asset, mapping.type)
      createdPaymentMethods.push(asset)
      existingPaymentMethods.push({ id, type: mapping.type, name: asset, isActive: true, sortOrder: maxOrder + 1, createdAt: now, updatedAt: now } as PaymentMethodItem)
    }
  }

  // Step D: Resolve members
  const existingMembers = await db.members.toArray()
  const memberMap = new Map<string, number>()
  for (const m of existingMembers) {
    memberMap.set(m.name, m.id!)
  }

  // Step E: Transform & insert transactions
  const BATCH_SIZE = 500
  const totalRows = rows.length
  let importedCount = 0
  const dates: string[] = []

  for (let batchStart = 0; batchStart < totalRows; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, totalRows)
    const batchRows = rows.slice(batchStart, batchEnd)
    const progressPercent = Math.round(15 + (batchEnd / totalRows) * 85)
    onProgress?.(progressPercent, 100, `거래 데이터 가져오는 중... (${batchEnd}/${totalRows})`)

    const transactions = batchRows.map(row => {
      const parsedDate = parseDate(row.date)
      dates.push(parsedDate)

      // Handle negative amounts (refunds)
      const isRefund = row.amountKRW < 0
      const amount = Math.abs(row.amountKRW)
      const txType: TransactionType = isRefund ? 'income' : (row.type === '수입' ? 'income' : 'expense')

      // Category lookup
      const finCatName = resolveFinCategoryName(row.category)
      const catKey = `${finCatName}|${txType}`
      const categoryId = categoryMap.get(catKey) ?? null

      // Member detection
      const memberName = detectMember(row.content)
      const memberId = memberName ? (memberMap.get(memberName) ?? null) : null

      // Payment method
      const paymentMethodItemId = pmMap.get(row.asset)
      const paymentMethodType = pmTypeMap.get(row.asset) || ('other' as PaymentMethod)

      return {
        syncId: crypto.randomUUID(),
        memberId,
        type: txType,
        amount,
        categoryId,
        date: parsedDate,
        memo: buildMemo(row.content, row.memo, isRefund),
        paymentMethod: paymentMethodType,
        paymentMethodDetail: row.asset,
        paymentMethodItemId: paymentMethodItemId ?? undefined,
        isRecurring: false,
        createdAt: now,
        updatedAt: now,
      }
    })

    await db.transactions.bulkAdd(transactions as any[])
    importedCount += transactions.length
  }

  dates.sort()

  return {
    totalParsed: totalRows,
    totalImported: importedCount,
    createdCategories,
    createdPaymentMethods,
    dateRange: { from: dates[0], to: dates[dates.length - 1] },
    warnings,
  }
}
