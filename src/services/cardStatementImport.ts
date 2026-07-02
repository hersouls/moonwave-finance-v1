// ─── Card statement import service (Shinhan + Samsung) ──
//
// Parses pasted text from card statements into structured transactions,
// detects duplicates against the local DB, and auto-classifies each row's
// category using rule-based merchant keyword matching plus the user's own
// historical merchant→category mappings.
//
// Supported card companies:
//   - Shinhan: block-based (빈 줄로 거래 구분, line-ordered)
//   - Samsung: stream-based (state machine, merchant→amount→date+owner triples
//              with optional inline discount lines like "LINK할인혜택 -2,000원")
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

import { db, createId } from '@/services/database'
import { normalizeMerchantKey } from '@/services/subscriptionDetection'
import { loadAliasMap, recordAliasUsage } from '@/services/merchantAliasService'
import type { Transaction, TransactionCategory, TransactionType, PaymentMethod, SubscriptionCategoryType, Subscription, MerchantAlias } from '@/lib/types'

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
  matchedTransactionId?: string
  /** Human reason for the match */
  reason?: string
}

export type CategoryConfidence = 'high' | 'medium' | 'low' | 'none'

export interface CategorySuggestion {
  categoryId?: string
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
  /**
   * When the merchant matches a registered subscription in db.subscriptions,
   * importStatement links the imported transaction to it via this id so the
   * dashboard's subscription view picks it up automatically.
   */
  subscriptionId?: string
  /**
   * Top runner-up categories with their observed share in history. Surfaced
   * to the import-review UI so the user can pick a close alternative without
   * opening the full category picker. Only populated when the stats-model
   * path produced the suggestion.
   */
  alternatives?: Array<{ categoryId: string; share: number }>
}

export interface AnalyzedRow extends ParsedRow {
  duplicate: DuplicateMatch
  suggestion: CategorySuggestion
}

export interface ImportOptions {
  /** Bulk payment method applied to every row */
  paymentMethod: PaymentMethod
  /** Card-suffix → memberId mapping (e.g., { "643": <memberId>, "429": <memberId> }) */
  memberMap?: Record<string, string>
  /** Optional payment method item id (e.g., 신한카드) — also applied to all */
  paymentMethodItemId?: string
  /** Optional payment method detail (e.g., card name string) */
  paymentMethodDetail?: string
  /** Indexes (within parsed list) to skip — typically duplicates */
  skipIndexes?: Set<number>
  /** Override category per row, keyed by parsed index */
  categoryOverrides?: Record<number, string>
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

// ─── Card-company detection ─────────────────────────────

export type CardCompany = 'shinhan' | 'samsung' | 'unknown'

const SAMSUNG_DATE_OWNER_RE = /\b\d{2}\.\s*\d{1,2}\.\s*\d{1,2}본\s*인\s*\d{3,4}\b/
const SHINHAN_FULL_DATE_RE = /^\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}$/m
const SHINHAN_OWNER_LINE_RE = /^(?:본인|가족)\s*\d{3,4}$/m

/**
 * Detects card company by signature line patterns. Falls back to 'shinhan'
 * when ambiguous, since that was the original supported format.
 *
 * Samsung signal: "YY. M. DD본 인 XXXX" combined date+owner on one line
 * Shinhan signal: full 4-digit-year date line AND standalone "본인XXX" line
 */
export function detectCardCompany(text: string): CardCompany {
  const samsungHit = SAMSUNG_DATE_OWNER_RE.test(text)
  const shinhanHit = SHINHAN_FULL_DATE_RE.test(text) && SHINHAN_OWNER_LINE_RE.test(text)
  if (samsungHit && !shinhanHit) return 'samsung'
  if (shinhanHit && !samsungHit) return 'shinhan'
  if (samsungHit && shinhanHit) return 'samsung' // prefer specific signature
  return 'unknown'
}

/**
 * Unified parser entry. Auto-detects card company unless explicitly given.
 * Falls back to Shinhan parser when detection returns 'unknown' (legacy behavior).
 */
export function parseCardStatement(text: string, company?: CardCompany): ParsedRow[] {
  const c = company ?? detectCardCompany(text)
  if (c === 'samsung') return parseSamsungStatement(text)
  return parseShinhanStatement(text) // default fallback
}

// ─── Shinhan parser (block-based) ───────────────────────

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
  // Samsung-style 자유 라벨: "LINK할인혜택 -2,000원" 같이 prefix가 자유로움
  // → "할인" 단어가 포함되고 음수면 discount로 인식
  if (line.includes('할인') && value < 0) return { kind: 'discount', value: Math.abs(value) }
  return null
}

// ─── Samsung parser (state-machine, line-stream based) ──

const SAMSUNG_AMOUNT_RE = /^([0-9][\d,]*)\s*원$/
// "26. 3. 17본 인 0438" → groups: yy, m, d, suffix. Allows arbitrary whitespace.
const SAMSUNG_DATE_OWNER_LINE_RE = /^(\d{2})\.\s*(\d{1,2})\.\s*(\d{1,2})\s*본\s*인\s*(\d{3,4})$/
// Lines to skip outright (section headers / subtotals / page noise)
const SAMSUNG_SKIP_EXACT = new Set([
  '일시불', '할부', '해외', '국내', '현금서비스', '카드론', '이전월', '합계',
])
function isSamsungSkipLine(line: string): boolean {
  if (SAMSUNG_SKIP_EXACT.has(line)) return true
  if (line.startsWith('소계')) return true   // "소계 총 7건 275,242원"
  if (/^합계\b/.test(line)) return true
  return false
}

/**
 * Parses Samsung-style statement text. Walks lines as a stream and builds
 * (merchant, amount, date+owner) triples. Inline discount lines like
 * "LINK할인혜택 -2,000원" attach to either the pending or last-emitted row,
 * whichever has not yet been finalized.
 *
 * Two-digit year (e.g., "26") is expanded to 20YY.
 */
export function parseSamsungStatement(text: string): ParsedRow[] {
  const rows: ParsedRow[] = []
  let pendingMerchant: string | null = null
  let pendingAmount: number | null = null
  let pendingDiscount: number | null = null
  let lastEmitted: ParsedRow | null = null

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    if (isSamsungSkipLine(line)) continue

    // 1) Date+owner line — finalize the pending triple
    const dateOwnerMatch = line.match(SAMSUNG_DATE_OWNER_LINE_RE)
    if (dateOwnerMatch) {
      const [, yy, m, d, suffix] = dateOwnerMatch
      if (pendingMerchant && pendingAmount != null) {
        const row: ParsedRow = {
          index: rows.length,
          merchant: pendingMerchant,
          amount: pendingAmount,
          date: `20${yy}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`,
          cardSuffix: suffix,
        }
        if (pendingDiscount != null) row.discount = pendingDiscount
        rows.push(row)
        lastEmitted = row
      }
      pendingMerchant = null
      pendingAmount = null
      pendingDiscount = null
      continue
    }

    // 2) Discount line — attach to whichever transaction is closest
    const adj = parseAdjustment(line)
    if (adj && adj.kind === 'discount') {
      if (pendingAmount != null) {
        pendingDiscount = (pendingDiscount ?? 0) + adj.value
      } else if (lastEmitted) {
        lastEmitted.discount = (lastEmitted.discount ?? 0) + adj.value
      }
      continue
    }

    // 3) Amount line
    const amountMatch = line.match(SAMSUNG_AMOUNT_RE)
    if (amountMatch) {
      const value = parseInt(amountMatch[1].replace(/,/g, ''), 10)
      if (!Number.isNaN(value)) {
        pendingAmount = value
      }
      continue
    }

    // 4) Otherwise: treat as merchant candidate. Replace any earlier candidate
    //    that wasn't followed by an amount — the *latest* line before an
    //    amount wins (handles header/footer noise that appears between rows).
    pendingMerchant = line
  }

  return rows
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

// Merchant normalization is shared with subscriptionDetection so the same
// canonical form is used here, for subscription matching, and for stats
// aggregation. See `normalizeMerchantKey` in subscriptionDetection.ts —
// strips parenthesized prefixes, 주식회사/㈜, month prefixes ("04월"),
// reference numbers ("**65-8093"), punctuation, and lowercases.

// ─── Merchant statistics model (P1.3) ──────────────────

export interface MerchantStats {
  topCategoryId: string
  topShare: number
  total: number
  alternatives: Array<{ categoryId: string; count: number; share: number }>
}

/**
 * Builds a normalized-merchant → category-frequency model from history.
 * Categories no longer present in the user's category list are filtered out
 * so we don't suggest a deleted category. Caller builds this once per import
 * session and passes it to every `suggestCategory` call.
 *
 * `type` defaults to 'expense' (card-statement path). The ledger entry wizard
 * passes 'income' too so income merchants get history-based suggestions.
 */
export function buildMerchantStats(
  history: Transaction[],
  categories: TransactionCategory[],
  type: TransactionType = 'expense',
): Map<string, MerchantStats> {
  const validCatIds = new Set(
    categories.filter(c => c.type === type && c.id != null).map(c => c.id),
  )
  const byMerchant = new Map<string, Map<string, number>>()
  for (const t of history) {
    if (t.type !== type || t.categoryId == null || !t.memo) continue
    if (!validCatIds.has(t.categoryId)) continue
    const key = normalizeMerchantKey(t.memo)
    if (!key) continue
    let tally = byMerchant.get(key)
    if (!tally) { tally = new Map(); byMerchant.set(key, tally) }
    tally.set(t.categoryId, (tally.get(t.categoryId) ?? 0) + 1)
  }

  const out = new Map<string, MerchantStats>()
  for (const [merchantKey, tally] of byMerchant) {
    const entries = Array.from(tally.entries())
      .map(([categoryId, count]) => ({ categoryId, count }))
      .sort((a, b) => b.count - a.count)
    const total = entries.reduce((s, e) => s + e.count, 0)
    if (total === 0) continue
    const alternatives = entries.map(e => ({ ...e, share: e.count / total }))
    out.set(merchantKey, {
      topCategoryId: alternatives[0].categoryId,
      topShare: alternatives[0].share,
      total,
      alternatives,
    })
  }
  return out
}

// ─── Registered-subscription matcher (P1.1) ─────────────

/**
 * Tries to match the merchant against the user's registered subscriptions.
 * Uses the shared normalized-key form so fuzzy variants
 * ("(주)클로드AI" vs "Claude AI") collapse to the same canonical form.
 *
 * `exact` — normalized-key equality (highest confidence).
 * `contains` — bidirectional substring containment, requires subKey length ≥ 3
 *              to avoid false positives like sub="AI" matching every merchant
 *              with the letter combination.
 *
 * Cancelled subscriptions are ignored so a long-dead subscription doesn't
 * keep claiming new transactions.
 */
function matchSubscription(
  merchant: string,
  subscriptions: Subscription[],
): { sub: Subscription; how: 'exact' | 'contains' } | null {
  if (subscriptions.length === 0) return null
  const merchantKey = normalizeMerchantKey(merchant)
  if (!merchantKey) return null

  for (const sub of subscriptions) {
    if (sub.status === 'cancelled') continue
    const subKey = normalizeMerchantKey(sub.name)
    if (subKey && subKey === merchantKey) return { sub, how: 'exact' }
  }

  for (const sub of subscriptions) {
    if (sub.status === 'cancelled') continue
    const subKey = normalizeMerchantKey(sub.name)
    if (!subKey || subKey.length < 3) continue
    if (merchantKey.includes(subKey) || subKey.includes(merchantKey)) {
      return { sub, how: 'contains' }
    }
  }
  return null
}

/**
 * Suggests a category for a merchant string.
 *
 * Priority chain (each tier short-circuits on first hit):
 *   1) Registered subscription (db.subscriptions) — auto-links subscriptionId
 *      so dashboards count the import as a real subscription payment.
 *   2) Merchant statistics model from history — uses the dominant category
 *      observed for this merchant in the user's past. Confidence scales with
 *      the dominance share.
 *   3) Exact normalized-key match in history (for single-occurrence merchants
 *      that the stats model excludes because it requires ≥2 samples).
 *   4) Keyword rule match (KEYWORD_RULES constant).
 *   5) Falls back to '기타' if the user keeps that category.
 *
 * Pre-build `stats` once with `buildMerchantStats` and pass it in so the same
 * O(N) history sweep isn't repeated per row.
 */
export function suggestCategory(
  merchant: string,
  categories: TransactionCategory[],
  history: Transaction[],
  subscriptions: Subscription[] = [],
  stats?: Map<string, MerchantStats>,
  aliases?: Map<string, MerchantAlias>,
  type: TransactionType = 'expense',
): CategorySuggestion {
  const typeCats = categories.filter(c => c.type === type)
  if (typeCats.length === 0) return { confidence: 'none' }

  const findCatByName = (name: string) => typeCats.find(c => c.name === name)
  const findCatById = (id: string) => typeCats.find(c => c.id === id)
  const merchantKey = normalizeMerchantKey(merchant)

  // ── 0) Learned alias (highest priority) ──
  //    User overrides and AI suggestions both flow into the same alias table.
  //    A direct hit is the strongest signal we have — it's either confirmed by
  //    the user explicitly or already AI-classified and accepted in the past.
  if (merchantKey && aliases) {
    const hit = aliases.get(merchantKey)
    if (hit) {
      const cat = findCatById(hit.categoryId)
      if (cat?.id != null) {
        const reasonPrefix = hit.source === 'user-override'
          ? '학습된 사용자 분류'
          : 'AI 분류 결과 캐시'
        return {
          categoryId: cat.id,
          confidence: 'high',
          reason: `${reasonPrefix} (${hit.usageCount}회 사용)`,
          subscriptionId: hit.subscriptionId,
          subscriptionCategory: hit.subscriptionCategory,
        }
      }
    }
  }

  // ── 1) Registered subscription match (expense only) ──
  const subMatch = type === 'expense' ? matchSubscription(merchant, subscriptions) : null
  if (subMatch) {
    const { sub, how } = subMatch
    const linkedCat = sub.linkedTransactionCategoryId != null
      ? findCatById(sub.linkedTransactionCategoryId)
      : null
    if (linkedCat?.id != null) {
      return {
        categoryId: linkedCat.id,
        confidence: how === 'exact' ? 'high' : 'medium',
        reason: `등록된 구독 "${sub.name}" ${how === 'exact' ? '정확 매칭' : '부분 매칭'}`,
        subscriptionId: sub.id,
        subscriptionCategory: sub.category,
      }
    }
    // Subscription matched but no linked category — still tag subscriptionId
    // so the subscription dashboard counts this transaction.
    return {
      confidence: 'medium',
      reason: `등록된 구독 "${sub.name}" 매칭 (카테고리 연결 안 됨)`,
      subscriptionId: sub.id,
      subscriptionCategory: sub.category,
    }
  }

  // ── 2) Merchant statistics model ──
  // Requires the merchant to have appeared ≥ 2 times in history; below that
  // we prefer the single-hit exact path below since the share metric is
  // meaningless on n=1.
  const statsForMerchant = stats?.get(merchantKey)
  if (statsForMerchant && statsForMerchant.total >= 2) {
    const cat = findCatById(statsForMerchant.topCategoryId)
    if (cat?.id != null) {
      const share = statsForMerchant.topShare
      const confidence: CategoryConfidence =
        share >= 0.7 ? 'high' :
        share >= 0.4 ? 'medium' : 'low'
      const topCount = statsForMerchant.alternatives[0].count
      return {
        categoryId: cat.id,
        confidence,
        reason: `이전 거래 ${statsForMerchant.total}건 중 ${cat.name} ${topCount}건 (${Math.round(share * 100)}%)`,
        alternatives: statsForMerchant.alternatives.slice(1, 4).map(a => ({
          categoryId: a.categoryId,
          share: a.share,
        })),
      }
    }
  }

  // ── 3) Single-hit exact match (normalized-key equality) ──
  // Catches the case where the merchant appears exactly once before — the
  // stats model would skip that (total < 2) but a single confident sample is
  // still better than falling through to keyword rules.
  if (merchantKey) {
    const exactHistory = history.find(t =>
      t.type === type
      && t.categoryId != null
      && t.memo
      && normalizeMerchantKey(t.memo) === merchantKey,
    )
    if (exactHistory?.categoryId) {
      const cat = findCatById(exactHistory.categoryId)
      if (cat?.id != null) {
        return {
          categoryId: cat.id,
          confidence: 'high',
          reason: '이전에 같은 가맹점으로 기록한 카테고리',
        }
      }
    }
  }

  // ── 4) Keyword rule fallback (expense only — rules map to expense categories) ──
  //    Try each rule's category fallback chain in order;
  //    skip the rule if none of its candidate categories exist on this user.
  if (type === 'expense') {
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

  const merchantNorm = normalizeMerchantKey(row.merchant)

  // ── 2차: 가맹점/지출내용 정확 일치 → exact
  for (const t of sameAmount) {
    if (!t.memo) continue
    const memoNorm = normalizeMerchantKey(t.memo)
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
      const memoNorm = normalizeMerchantKey(t.memo)
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
      const memoNorm = normalizeMerchantKey(t.memo)
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

export async function analyzeStatement(
  text: string,
  categories: TransactionCategory[],
  existing: Transaction[],
): Promise<AnalyzedRow[]> {
  const rows = parseCardStatement(text)
  // Load registered subscriptions + learned aliases + history stats once.
  // O(history + N) total rather than O(N × history).
  const [subscriptions, aliases] = await Promise.all([
    db.subscriptions.toArray(),
    loadAliasMap(),
  ])
  const stats = buildMerchantStats(existing, categories)
  return rows.map(row => ({
    ...row,
    duplicate: detectDuplicate(row, existing),
    suggestion: suggestCategory(row.merchant, categories, existing, subscriptions, stats, aliases),
  }))
}

// ─── Bulk import ────────────────────────────────────────

export async function importStatement(
  rows: AnalyzedRow[],
  options: ImportOptions,
): Promise<ImportResult> {
  const now = new Date().toISOString()
  const skip = options.skipIndexes ?? new Set<number>()
  const toInsert: Transaction[] = []
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

      // Subscription tagging is strictly opt-in for the *keyword*-derived
      // suggestion (e.g., Claude/Supabase keywords). Users were surprised by
      // silent tags. BUT a match against `db.subscriptions` (P1.1) is an
      // explicit registration by the user — for those, both subscriptionId
      // and subscriptionCategory are auto-applied so the dashboard counts
      // the imported transaction as a real subscription payment.
      const matchedSubscriptionId = row.suggestion.subscriptionId
      const subscriptionCategory =
        options.subscriptionCategoryOverride
        ?? (matchedSubscriptionId != null ? row.suggestion.subscriptionCategory : undefined)

      const txn: Transaction = {
        id: createId(),
        type: 'expense',
        amount: row.amount,
        categoryId: categoryId,
        memberId: memberId,
        date: effectiveDate,
        memo: row.merchant, // memo = merchant name per user request
        paymentMethod: options.paymentMethod,
        paymentMethodDetail: options.paymentMethodDetail,
        paymentMethodItemId: options.paymentMethodItemId,
        subscriptionId: matchedSubscriptionId,
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
    await db.transactions.bulkAdd(toInsert)
  }

  // Record alias usage for any rows that resolved via the merchant alias path.
  // Done after bulkAdd so a partial alias-tracking failure can't roll back the
  // transaction insert. Best-effort.
  for (const row of rows) {
    if (skip.has(row.index)) continue
    if (row.suggestion.reason?.startsWith('학습된 사용자 분류') || row.suggestion.reason?.startsWith('AI 분류 결과 캐시')) {
      const merchantKey = normalizeMerchantKey(row.merchant)
      if (merchantKey) {
        // Fire-and-forget — caller doesn't await individual counter writes
        void recordAliasUsage(merchantKey)
      }
    }
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
