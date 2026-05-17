// ─── Shinhan-style card statement import service ───────
//
// Parses pasted text from card statements (Shinhan format) into structured
// transactions, detects duplicates against the local DB, and auto-classifies
// each row's category using rule-based merchant keyword matching plus the
// user's own historical merchant→category mappings.
//
// User-controlled at import time:
//   - bulk paymentMethod (single value applied to every row)
//   - card-suffix → member mapping (e.g., 643 → 대성, 429 → 다연)
//
// All other fields are derived automatically:
//   - date      → from statement
//   - amount    → from statement (adjusted by 할인/수수료/부분취소/이용금액)
//   - category  → auto-classified (rule + learned)
//   - memo      → merchant name as-is
//   - type      → 'expense' (statements are always expenses)

import { db } from '@/services/database'
import type { Transaction, TransactionCategory, PaymentMethod, SubscriptionCategoryType } from '@/lib/types'

// ─── Types ──────────────────────────────────────────────

export interface ParsedRow {
  /** 0-based index in the source text, useful for keys */
  index: number
  /** Merchant name from line 1 — also used as memo */
  merchant: string
  /** Net charged amount in KRW (positive integer) */
  amount: number
  /** ISO date yyyy-MM-dd */
  date: string
  /** Card suffix as raw token, e.g., "643" from "본인643" */
  cardSuffix: string
  /** Discount amount applied to this transaction (subtracted display only) */
  discount?: number
  /** Surcharge/fee (typically already included in `amount`) */
  fee?: number
  /** Original gross amount before discount (line: 이용금액 N원) */
  originalAmount?: number
  /** Partial-cancel adjustment (line: 부분취소 -N원) */
  partialCancel?: number
}

export type DuplicateLevel = 'none' | 'possible' | 'likely' | 'exact'

export interface DuplicateMatch {
  level: DuplicateLevel
  /** Local transaction this row likely duplicates (by id) */
  matchedTransactionId?: number
  /** Human reason for the match */
  reason?: string
}

export type CategoryConfidence = 'high' | 'medium' | 'low' | 'none'

export interface CategorySuggestion {
  categoryId?: number
  /** Confidence level for the auto-classification */
  confidence: CategoryConfidence
  /** Why this match was chosen (for debugging / UI tooltip) */
  reason?: string
  /**
   * Suggested subscription-type label inferred from the matched keyword rule
   * (e.g., 'ai' for Claude/Vercel, 'cloud' for Google Cloud/Supabase). The
   * bulk `subscriptionCategoryOverride` in ImportOptions takes priority over
   * this per-row value when both are set.
   */
  subscriptionCategory?: SubscriptionCategoryType
}

export interface AnalyzedRow extends ParsedRow {
  duplicate: DuplicateMatch
  suggestion: CategorySuggestion
}

export interface ImportOptions {
  /** Bulk payment method applied to every row */
  paymentMethod: PaymentMethod
  /** Card-suffix → memberId mapping (e.g., { "643": 1, "429": 2 }) */
  memberMap?: Record<string, number>
  /** Optional payment method item id (e.g., 신한카드) — also applied to all */
  paymentMethodItemId?: number
  /** Optional payment method detail (e.g., card name string) */
  paymentMethodDetail?: string
  /** Indexes (within parsed list) to skip — typically duplicates */
  skipIndexes?: Set<number>
  /** Override category per row, keyed by parsed index */
  categoryOverrides?: Record<number, number>
  /**
   * When set (yyyy-MM-dd), each transaction's date is replaced with this value
   * instead of the date parsed from the statement. Intended for users who track
   * daily cash flow against the card's payment due date rather than individual
   * purchase dates.
   */
  overrideDate?: string
  /**
   * Optional subscription-type label applied to every imported row. Lets the
   * user tag a whole statement (or a SaaS-heavy statement) with one
   * subscription classification in a single pick.
   */
  subscriptionCategoryOverride?: SubscriptionCategoryType
}

export interface ImportResult {
  totalParsed: number
  imported: number
  skipped: number
  failed: number
  byCategory: Record<string, number>
  dateRange: { from: string; to: string }
}

// ─── Parser ─────────────────────────────────────────────

/**
 * Parses Shinhan-style statement text into a list of rows. Each "block" is
 * separated by one or more blank lines; within a block:
 *   line 1 → merchant
 *   line 2 → amount (e.g., "293,100원")
 *   line 3 → date  (e.g., "2026.04.05")
 *   line 4 → card owner (e.g., "본인643")
 *   line 5+ → optional adjustments (할인 / 수수료 / 이용금액 / 부분취소)
 *
 * Resilient to extra whitespace and ignores lines that don't fit the schema.
 */
export function parseShinhanStatement(text: string): ParsedRow[] {
  const blocks: string[][] = []
  let current: string[] = []
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) {
      if (current.length > 0) {
        blocks.push(current)
        current = []
      }
      continue
    }
    current.push(line)
  }
  if (current.length > 0) blocks.push(current)

  const rows: ParsedRow[] = []
  for (const block of blocks) {
    const parsed = parseBlock(block, rows.length)
    if (parsed) rows.push(parsed)
  }
  return rows
}

const AMOUNT_RE = /^(-?[\d,]+)\s*원$/
const DATE_RE = /^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/
const CARD_OWNER_RE = /^(?:본인|가족)\s*(\d{3,4})$/

function parseBlock(block: string[], index: number): ParsedRow | null {
  if (block.length < 4) return null
  const merchant = block[0]
  const amountStr = block[1]
  const dateStr = block[2]
  const ownerStr = block[3]

  const amountMatch = amountStr.match(AMOUNT_RE)
  const dateMatch = dateStr.match(DATE_RE)
  const ownerMatch = ownerStr.match(CARD_OWNER_RE)
  if (!amountMatch || !dateMatch || !ownerMatch) return null

  const amount = Math.abs(parseInt(amountMatch[1].replace(/,/g, ''), 10))
  if (Number.isNaN(amount)) return null

  const [, y, m, d] = dateMatch
  const date = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`

  const row: ParsedRow = {
    index,
    merchant,
    amount,
    date,
    cardSuffix: ownerMatch[1],
  }

  // Parse optional adjustment lines
  for (let i = 4; i < block.length; i++) {
    const line = block[i]
    const adj = parseAdjustment(line)
    if (!adj) continue
    if (adj.kind === 'discount') row.discount = adj.value
    else if (adj.kind === 'fee') row.fee = adj.value
    else if (adj.kind === 'original') row.originalAmount = adj.value
    else if (adj.kind === 'partial') row.partialCancel = adj.value
  }

  return row
}

const ADJ_VALUE_RE = /(-?[\d,]+)\s*원/
function parseAdjustment(line: string): { kind: 'discount' | 'fee' | 'original' | 'partial'; value: number } | null {
  const valMatch = line.match(ADJ_VALUE_RE)
  if (!valMatch) return null
  const value = parseInt(valMatch[1].replace(/,/g, ''), 10)
  if (Number.isNaN(value)) return null
  if (line.startsWith('할인')) return { kind: 'discount', value: Math.abs(value) }
  if (line.startsWith('수수료')) return { kind: 'fee', value: Math.abs(value) }
  if (line.startsWith('이용금액')) return { kind: 'original', value: Math.abs(value) }
  if (line.startsWith('부분취소')) return { kind: 'partial', value }
  return null
}

// ─── Merchant keyword rules (for auto-categorization) ──

interface KeywordRule {
  /**
   * Category name(s) to map to. If an array, the resolver tries each name in
   * order and uses the first one that exists in the user's category list. This
   * lets a single rule degrade gracefully — e.g., SaaS merchants prefer the
   * '구독료' category but fall back to '투자' for users who haven't created
   * '구독료' yet.
   */
  categoryName: string | string[]
  /** Keyword tokens to match against normalized merchant string */
  keywords: string[]
  /** Reason text for UI display */
  reason?: string
  /**
   * Optional subscription-type label for the matched merchant. Used to
   * automatically classify SaaS expenses (e.g., 'ai' for Claude/Vercel,
   * 'cloud' for Google Cloud/Supabase) without requiring the user to tag
   * each row manually.
   */
  subscriptionCategory?: SubscriptionCategoryType
}

const KEYWORD_RULES: KeywordRule[] = [
  // 식비 (음식점/카페/패스트푸드/배달)
  {
    categoryName: '식비',
    reason: '음식점/식당 키워드',
    keywords: [
      '식당', '뭉티기', '중화요리', '반점', '막국수', '도담', '아덴', '비케이알',
      '봉추', '식', '맛집', '한식', '일식', '중식', '양식', '레스토랑', '회',
      '죽', '면', '국밥', '냉면', '치킨', '피자', '버거', '햄버거', '돈가스',
      '카페', '커피', '디저트', '컴포즈', '스타벅스', '메가', '투썸', '이디야',
      '아이스헌터', '밀키프레소', '맥도날드', '롯데리아', '버거킹', '서브웨이',
      '던킨', '베이커리', '빵', 'KFC', '에스씨케이', '용화', '레이',
      '컬리', '비비고', '아성다이소', '아이스',
      '음료', '한우', '뚝배기이탈리아',
    ],
  },
  // 교통비 (지하철/버스/택시/KTX/SRT/주유)
  {
    categoryName: '교통비',
    reason: '교통/주유 키워드',
    keywords: [
      'KTX', 'SRT', '고속철도', '코레일', '버스', '지하철', '택시', '카카오T',
      '카카오택시', '티머니', '교통', '주유', '오일뱅크', 'GS칼텍스', 'SK에너지',
      'S-OIL', '에쓰오일', '주차', '하이패스', '공단', '시설관리공단', '톨게이트',
    ],
  },
  // 통신비
  {
    categoryName: '통신비',
    reason: '통신/인터넷 키워드',
    keywords: ['KT통신', 'SKT', 'LGU+', 'LG유플러스', 'KT', '인터넷', '와이파이', '통신요금'],
  },
  // 보험
  {
    categoryName: '보험',
    reason: '보험사 키워드',
    keywords: ['생명보험', '손해보험', '화재해상', '라이나', '삼성생명', '한화생명', '교보생명'],
  },
  // 주거비 (월세/관리비/공과금)
  {
    categoryName: '주거비',
    reason: '주거/관리비 키워드',
    keywords: ['관리비', '월세', '전세', '풍경채', '아파트', '오피스텔', '수도', '도시가스', '한국전력', '한전'],
  },
  // 마트/편의점
  {
    categoryName: '마트/편의점',
    reason: '마트/편의점 키워드',
    keywords: [
      '마트', '편의점', '홈플러스', '이마트', '롯데마트', '코스트코',
      'GS25', 'CU', '세븐일레븐', '미니스톱', '이마트24',
      'GS수퍼', 'GS슈퍼', '농협하나로', '하나로마트', '농협',
    ],
  },
  // 패션/미용
  {
    categoryName: '패션/미용',
    reason: '패션/미용 키워드',
    keywords: ['신세계사이먼', '아울렛', '백화점', '의류', '미용', '헤어', '뷰티', '화장품', '올리브영'],
  },
  // 교육비
  {
    categoryName: '교육비',
    reason: '학원/교육 키워드',
    keywords: ['아카데미', '학원', '뮤직', '음악', '미술', '영어', '수학', '국어', '학습', '교습', '튜터'],
  },
  // 의료비
  {
    categoryName: '의료비',
    reason: '병원/약국 키워드',
    keywords: ['의원', '병원', '약국', '한의원', '치과', '안과', '피부과', '내과'],
  },
  // 여행 (숙박/온천)
  {
    categoryName: '여행',
    reason: '숙박/여행 키워드',
    keywords: ['호텔', '온천', '리조트', '펜션', '게스트하우스', '모텔', '에어비앤비', 'AIRBNB'],
  },
  // AI 구독 서비스 — 거래 카테고리는 '구독료' (폴백 '투자'), 구독 분류는 'ai'
  {
    categoryName: ['구독료', '투자'],
    reason: 'AI 구독 키워드',
    subscriptionCategory: 'ai',
    keywords: [
      'CLAUDE.AI', 'CLAUDE', 'ANTHROPIC',
      'OPENAI', 'CHATGPT',
      'CURSOR',
      'VERCEL',
      'PERPLEXITY', 'MIDJOURNEY', 'COPILOT',
    ],
  },
  // 클라우드/인프라 구독 — 거래 카테고리는 '구독료' (폴백 '투자'), 구독 분류는 'cloud'
  {
    categoryName: ['구독료', '투자'],
    reason: '클라우드/인프라 구독 키워드',
    subscriptionCategory: 'cloud',
    keywords: [
      '구글클라우드', 'GOOGLE CLOUD', 'GCP',
      'SUPABASE',
      'AWS', '아마존웹서비스', 'AMAZON WEB',
      'AZURE',
      'GITHUB',
      'CLOUDFLARE',
    ],
  },
]

// ─── Auto-categorization ────────────────────────────────

/**
 * Normalizes a merchant string for matching: removes punctuation, collapses
 * whitespace, keeps Korean letters and ASCII.
 */
function normalizeMerchant(s: string): string {
  return s
    .replace(/\([^)]*\)/g, ' ')      // strip (주), (청라) etc.
    .replace(/주식회사|㈜/g, ' ')
    .replace(/[^\p{L}\p{N}\s.]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Suggests a category for a merchant string by:
 *   1) Exact merchant match against the user's history (highest confidence)
 *   2) Normalized merchant prefix match against history
 *   3) Keyword rule match (medium confidence)
 *   4) Falls back to '기타' if user has it (low confidence)
 */
export function suggestCategory(
  merchant: string,
  categories: TransactionCategory[],
  history: Transaction[],
): CategorySuggestion {
  const expenseCats = categories.filter(c => c.type === 'expense')
  if (expenseCats.length === 0) return { confidence: 'none' }

  const findCatByName = (name: string) => expenseCats.find(c => c.name === name)

  // 1) Exact merchant match in user history (highest confidence)
  const exactHistory = history.find(t =>
    t.type === 'expense'
    && t.categoryId != null
    && t.memo === merchant
  )
  if (exactHistory?.categoryId) {
    return {
      categoryId: exactHistory.categoryId,
      confidence: 'high',
      reason: '이전에 같은 가맹점으로 기록한 카테고리',
    }
  }

  // 2) Normalized merchant fuzzy match in history
  const norm = normalizeMerchant(merchant)
  if (norm.length >= 2) {
    // Score each historical record by token overlap
    const tokens = new Set(norm.toLowerCase().split(/\s+/).filter(t => t.length >= 2))
    if (tokens.size > 0) {
      const tally = new Map<number, number>() // categoryId → score
      for (const t of history) {
        if (t.type !== 'expense' || t.categoryId == null || !t.memo) continue
        const histNorm = normalizeMerchant(t.memo).toLowerCase()
        let hit = 0
        for (const tk of tokens) {
          if (histNorm.includes(tk)) hit++
        }
        if (hit > 0) {
          tally.set(t.categoryId, (tally.get(t.categoryId) ?? 0) + hit)
        }
      }
      let best: { id: number; score: number } | null = null
      for (const [id, score] of tally) {
        if (!best || score > best.score) best = { id, score }
      }
      if (best && best.score >= 2) {
        return {
          categoryId: best.id,
          confidence: 'high',
          reason: '유사한 가맹점을 같은 카테고리로 기록한 이력',
        }
      }
      if (best) {
        return {
          categoryId: best.id,
          confidence: 'medium',
          reason: '비슷한 이름의 거래에서 사용한 카테고리',
        }
      }
    }
  }

  // 3) Keyword rule — try each rule's category fallback chain in order;
  //    skip the rule if none of its candidate categories exist on this user.
  const upper = merchant.toUpperCase()
  for (const rule of KEYWORD_RULES) {
    for (const kw of rule.keywords) {
      if (!merchant.includes(kw) && !upper.includes(kw.toUpperCase())) continue
      const names = Array.isArray(rule.categoryName) ? rule.categoryName : [rule.categoryName]
      for (const name of names) {
        const cat = findCatByName(name)
        if (cat?.id) {
          return {
            categoryId: cat.id,
            confidence: 'medium',
            reason: rule.reason || `${name} 키워드 매칭`,
            subscriptionCategory: rule.subscriptionCategory,
          }
        }
      }
    }
  }

  // 4) Fallback: 기타 (only if exists as expense category)
  const etc = findCatByName('기타')
  if (etc?.id) {
    return {
      categoryId: etc.id,
      confidence: 'low',
      reason: '매칭 실패 — 기타로 분류',
    }
  }

  return { confidence: 'none' }
}

// ─── Duplicate detection ────────────────────────────────

/**
 * Returns a DuplicateMatch for a parsed row against existing transactions.
 *
 * Primary key: amount. Secondary signal: merchant/memo similarity.
 *
 * Heuristic levels (per user spec — amount-first, content-compared):
 *   exact    — same amount + normalized merchant === memo
 *   likely   — same amount + memo contains/contained-by merchant (>=3 chars)
 *   possible — same amount + token overlap OR same amount with no memo
 *   none     — no matching amount
 */
export function detectDuplicate(
  row: ParsedRow,
  existing: Transaction[],
): DuplicateMatch {
  // ── 1차 필터: 같은 금액 (expense)
  const sameAmount = existing.filter(t =>
    t.type === 'expense' && t.amount === row.amount
  )
  if (sameAmount.length === 0) return { level: 'none' }

  const merchantNorm = normalizeMerchant(row.merchant).toLowerCase()

  // ── 2차: 가맹점/지출내용 정확 일치 → exact
  for (const t of sameAmount) {
    if (!t.memo) continue
    const memoNorm = normalizeMerchant(t.memo).toLowerCase()
    if (memoNorm && memoNorm === merchantNorm) {
      return {
        level: 'exact',
        matchedTransactionId: t.id,
        reason: '같은 금액 · 같은 지출내용',
      }
    }
  }

  // ── 3차: 한쪽이 다른쪽을 포함 (>=3자) → likely
  if (merchantNorm.length >= 3) {
    for (const t of sameAmount) {
      if (!t.memo) continue
      const memoNorm = normalizeMerchant(t.memo).toLowerCase()
      if (memoNorm.length >= 3
          && (memoNorm.includes(merchantNorm) || merchantNorm.includes(memoNorm))) {
        return {
          level: 'likely',
          matchedTransactionId: t.id,
          reason: '같은 금액 · 유사 지출내용',
        }
      }
    }
  }

  // ── 4차: 토큰 부분 일치 (>=2자 단어) → possible
  if (merchantNorm.length >= 2) {
    const tokens = merchantNorm.split(/\s+/).filter(t => t.length >= 2)
    for (const t of sameAmount) {
      if (!t.memo) continue
      const memoNorm = normalizeMerchant(t.memo).toLowerCase()
      for (const tk of tokens) {
        if (memoNorm.includes(tk)) {
          return {
            level: 'possible',
            matchedTransactionId: t.id,
            reason: '같은 금액 · 지출내용 일부 일치',
          }
        }
      }
    }
  }

  // ── 5차: 메모 없음/비교 불가 — 금액만 일치 → possible
  return {
    level: 'possible',
    matchedTransactionId: sameAmount[0].id,
    reason: '같은 금액의 거래 존재',
  }
}

// ─── Top-level analyze ──────────────────────────────────

export function analyzeStatement(
  text: string,
  categories: TransactionCategory[],
  existing: Transaction[],
): AnalyzedRow[] {
  const rows = parseShinhanStatement(text)
  return rows.map(row => ({
    ...row,
    duplicate: detectDuplicate(row, existing),
    suggestion: suggestCategory(row.merchant, categories, existing),
  }))
}

// ─── Bulk import ────────────────────────────────────────

export async function importStatement(
  rows: AnalyzedRow[],
  options: ImportOptions,
): Promise<ImportResult> {
  const now = new Date().toISOString()
  const skip = options.skipIndexes ?? new Set<number>()
  const toInsert: Omit<Transaction, 'id'>[] = []
  const byCategory: Record<string, number> = {}
  const dates: string[] = []
  let failed = 0
  let skipped = 0

  // Validate overrideDate at the top so a single bad input fails fast rather
  // than silently writing thousands of rows to "Invalid Date".
  const overrideDate = options.overrideDate?.trim() || undefined
  if (overrideDate && !/^\d{4}-\d{2}-\d{2}$/.test(overrideDate)) {
    throw new Error(`overrideDate must be yyyy-MM-dd, got: ${overrideDate}`)
  }

  for (const row of rows) {
    if (skip.has(row.index)) {
      skipped++
      continue
    }
    try {
      const categoryId = options.categoryOverrides?.[row.index] ?? row.suggestion.categoryId ?? null
      const memberId = options.memberMap?.[row.cardSuffix] ?? null
      const effectiveDate = overrideDate ?? row.date

      // Subscription tagging is strictly opt-in — only the bulk UI override
      // applies it. The keyword rule's per-row suggestion (Claude → 'ai',
      // Supabase → 'cloud', etc.) is exposed in CategorySuggestion for
      // hint UIs but is NOT auto-written to the transaction here; users were
      // surprised by Claude/OpenAI rows silently appearing as subscriptions
      // after a card statement import.
      const subscriptionCategory = options.subscriptionCategoryOverride

      const txn: Omit<Transaction, 'id'> = {
        syncId: crypto.randomUUID(),
        type: 'expense',
        amount: row.amount,
        categoryId: categoryId,
        memberId: memberId,
        date: effectiveDate,
        memo: row.merchant, // memo = merchant name per user request
        paymentMethod: options.paymentMethod,
        paymentMethodDetail: options.paymentMethodDetail,
        paymentMethodItemId: options.paymentMethodItemId,
        subscriptionCategory,
        isRecurring: false,
        createdAt: now,
        updatedAt: now,
      }
      toInsert.push(txn)
      const catKey = categoryId != null ? String(categoryId) : 'uncategorized'
      byCategory[catKey] = (byCategory[catKey] ?? 0) + 1
      dates.push(effectiveDate)
    } catch {
      failed++
    }
  }

  if (toInsert.length > 0) {
    await db.transactions.bulkAdd(toInsert as Transaction[])
  }
  dates.sort()

  return {
    totalParsed: rows.length,
    imported: toInsert.length,
    skipped,
    failed,
    byCategory,
    dateRange: dates.length > 0 ? { from: dates[0], to: dates[dates.length - 1] } : { from: '', to: '' },
  }
}
