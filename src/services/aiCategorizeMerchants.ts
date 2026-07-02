// ─── AI fallback for unknown merchants ──────────────────
//
// Sends a batched request to the Anthropic Claude API to classify merchants
// the local heuristics couldn't resolve (or resolved with low confidence).
//
// Why batched: one request per merchant would be wasteful — Claude reads
// the full category list as input every time and pays the cache cost.
// Batching N merchants in one request lets the system prompt + category
// list hit the cache and only the N×merchant tokens vary.
//
// API key: read from localStorage (`anthropic_api_key`). Set via Settings UI.
// We never sync this key to Firestore — keys stay client-side per device.
//
// Privacy note: only the normalized merchant strings + user's category names
// are sent. No amounts, dates, member info, or transaction history.

import { setAlias, type SetAliasInput } from '@/services/merchantAliasService'
import type { TransactionCategory } from '@/lib/types'

const ANTHROPIC_API_KEY_STORAGE = 'anthropic_api_key'
const MODEL = 'claude-haiku-4-5-20251001'  // small + cheap + good enough
const API_URL = 'https://api.anthropic.com/v1/messages'

export interface AiCategorizeRequest {
  /** Raw merchant strings (one per row). Order is preserved in the response. */
  merchants: string[]
  /** Available expense categories to pick from. Only `id` + `name` are sent. */
  categories: TransactionCategory[]
}

export interface AiCategorizeResult {
  merchant: string
  categoryId: string | null
  categoryName: string | null
  /** Free-form short reason from the model, surfaced in the import UI. */
  reason: string
  confidence: 'high' | 'medium' | 'low'
}

export function getApiKey(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(ANTHROPIC_API_KEY_STORAGE)
}

export function setApiKey(key: string): void {
  if (typeof window === 'undefined') return
  if (key.trim().length === 0) {
    localStorage.removeItem(ANTHROPIC_API_KEY_STORAGE)
  } else {
    localStorage.setItem(ANTHROPIC_API_KEY_STORAGE, key.trim())
  }
}

export function clearApiKey(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(ANTHROPIC_API_KEY_STORAGE)
}

export function hasApiKey(): boolean {
  return !!getApiKey()
}

/** Builds a prompt that asks for a JSON array, one entry per input merchant. */
function buildPrompt(merchants: string[], categories: TransactionCategory[]): {
  system: string
  user: string
} {
  const expenseCats = categories
    .filter(c => c.type === 'expense' && c.id != null)
    .map(c => ({ id: c.id, name: c.name }))

  const system = [
    '당신은 한국 카드 명세서의 가맹점 이름을 보고 가장 적합한 지출 카테고리를 선택하는 분류기입니다.',
    '응답은 JSON 배열 하나만 출력하세요. 다른 텍스트나 마크다운을 절대 포함하지 마세요.',
    '각 항목은 { "merchant": string, "categoryId": string|null, "reason": string, "confidence": "high"|"medium"|"low" } 형태입니다.',
    '입력 순서 그대로 같은 길이의 배열을 반환하세요.',
    'categoryId 는 반드시 제공된 카테고리 목록의 id 문자열 중 하나를 그대로 사용해야 하며, 적합한 카테고리가 없으면 null 을 사용하세요.',
    'reason 은 한국어 짧은 문구(예: "마트/편의점 — GS25 편의점").',
    'confidence 는 high (확실), medium (그럴 가능성), low (모호) 중 하나.',
  ].join(' ')

  const catTable = expenseCats
    .map(c => `  - ${c.id}: ${c.name}`)
    .join('\n')

  const merchantList = merchants
    .map((m, i) => `  ${i + 1}. ${m}`)
    .join('\n')

  const user = [
    '## 사용자 카테고리 (id: 이름)',
    catTable,
    '',
    '## 분류할 가맹점',
    merchantList,
    '',
    '응답: JSON 배열 (마크다운 코드블록 없이, 순수 JSON):',
  ].join('\n')

  return { system, user }
}

interface AnthropicResponse {
  content: Array<{ type: string; text?: string }>
  stop_reason?: string
}

/**
 * Sends merchants to Claude in a single batched call. Returns one result per
 * input merchant in the same order. Errors throw — caller decides UX.
 *
 * Model defaults to Haiku 4.5 (fast + cheap). Override if needed.
 */
export async function classifyMerchantsWithAI(
  req: AiCategorizeRequest,
  opts?: { model?: string },
): Promise<AiCategorizeResult[]> {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('Anthropic API key not set. Open settings to configure.')
  if (req.merchants.length === 0) return []

  const { system, user } = buildPrompt(req.merchants, req.categories)
  const model = opts?.model ?? MODEL

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Claude API ${response.status}: ${text.slice(0, 200)}`)
  }

  const data = (await response.json()) as AnthropicResponse
  const textOut = data.content?.find(c => c.type === 'text')?.text ?? ''

  let parsed: Array<{ merchant: string; categoryId: string | null; reason: string; confidence: string }>
  try {
    // The model sometimes wraps output in a fenced block despite instructions —
    // strip ```json ... ``` if present before parsing.
    const cleaned = textOut.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
    parsed = JSON.parse(cleaned)
  } catch (err) {
    throw new Error(`Claude returned unparseable JSON: ${textOut.slice(0, 200)}`)
  }

  // Map results back by index, falling back to "null" entries for missing rows
  // so callers can rely on output.length === input.length.
  const expenseCatMap = new Map(
    req.categories.filter(c => c.type === 'expense' && c.id != null).map(c => [c.id, c.name]),
  )

  const results: AiCategorizeResult[] = []
  for (let i = 0; i < req.merchants.length; i++) {
    const entry = parsed[i]
    const categoryId =
      entry && typeof entry.categoryId === 'string' && expenseCatMap.has(entry.categoryId)
        ? entry.categoryId
        : null
    const categoryName = categoryId != null ? expenseCatMap.get(categoryId)! : null
    const confidence: AiCategorizeResult['confidence'] =
      entry?.confidence === 'high' ? 'high' :
      entry?.confidence === 'medium' ? 'medium' : 'low'
    results.push({
      merchant: req.merchants[i],
      categoryId,
      categoryName,
      reason: entry?.reason ?? '',
      confidence,
    })
  }

  return results
}

/**
 * Convenience helper that runs the AI classifier and persists the results
 * into merchantAliases for future imports. Returns the AI results for UI
 * surfacing (toast count, per-row badges).
 */
export async function classifyAndPersistAliases(
  req: AiCategorizeRequest,
): Promise<AiCategorizeResult[]> {
  const results = await classifyMerchantsWithAI(req)
  const aliasInputs: SetAliasInput[] = results
    .filter(r => r.categoryId != null)
    .map(r => ({
      merchant: r.merchant,
      categoryId: r.categoryId!,
      source: 'ai-suggestion' as const,
      sampleMerchant: r.merchant,
    }))
  // Persist each — setAlias() respects user-override priority so this won't
  // clobber rows the user already confirmed manually.
  for (const input of aliasInputs) {
    await setAlias(input)
  }
  return results
}
