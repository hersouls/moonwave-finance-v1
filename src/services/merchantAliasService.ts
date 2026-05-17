// ─── Merchant alias service ─────────────────────────────
//
// Learned merchant→category mappings. Built up from two sources:
//   1. User overrides in the card-statement import modal (source='user-override').
//   2. Anthropic API classifications for unknown merchants (source='ai-suggestion').
//
// `user-override` always wins over `ai-suggestion` when both exist for the
// same merchant key — the user is the ground truth.
//
// merchantKey is the normalized form from normalizeMerchantKey() so that
// "(주)아성다이소 청라점" and "주식회사 아성다이소" collapse to the same row.
// The Dexie index has `&merchantKey` (unique) to guarantee one row per merchant.

import { db } from '@/services/database'
import { normalizeMerchantKey } from '@/services/subscriptionDetection'
import type { MerchantAlias, MerchantAliasSource, SubscriptionCategoryType } from '@/lib/types'

export interface SetAliasInput {
  merchant: string                  // raw merchant text — will be normalized
  categoryId: number
  subscriptionId?: number
  subscriptionCategory?: SubscriptionCategoryType
  source: MerchantAliasSource
  sampleMerchant?: string
}

/**
 * Loads all aliases into a Map<merchantKey, MerchantAlias> for O(1) lookup.
 * Caller is expected to build this once per import session and pass it to
 * suggestCategory rather than hitting Dexie per row.
 */
export async function loadAliasMap(): Promise<Map<string, MerchantAlias>> {
  const all = await db.merchantAliases.toArray()
  const map = new Map<string, MerchantAlias>()
  for (const a of all) {
    if (a.merchantKey) map.set(a.merchantKey, a)
  }
  return map
}

/**
 * Upserts an alias. If a row with the same merchantKey exists:
 *   - user-override write replaces any existing source
 *   - ai-suggestion write only overwrites if existing source is also ai-suggestion
 *     (we never let AI clobber a user-confirmed mapping).
 */
export async function setAlias(input: SetAliasInput): Promise<void> {
  const merchantKey = normalizeMerchantKey(input.merchant)
  if (!merchantKey) return
  const now = new Date().toISOString()
  const existing = await db.merchantAliases.where('merchantKey').equals(merchantKey).first()

  if (existing) {
    if (input.source === 'ai-suggestion' && existing.source === 'user-override') {
      // Never let AI overwrite a user-confirmed mapping.
      return
    }
    await db.merchantAliases.update(existing.id!, {
      categoryId: input.categoryId,
      subscriptionId: input.subscriptionId,
      subscriptionCategory: input.subscriptionCategory,
      source: input.source,
      sampleMerchant: input.sampleMerchant ?? existing.sampleMerchant,
      updatedAt: now,
    })
    return
  }

  await db.merchantAliases.add({
    syncId: crypto.randomUUID(),
    merchantKey,
    categoryId: input.categoryId,
    subscriptionId: input.subscriptionId,
    subscriptionCategory: input.subscriptionCategory,
    source: input.source,
    sampleMerchant: input.sampleMerchant ?? input.merchant,
    usageCount: 0,
    learnedAt: now,
    createdAt: now,
    updatedAt: now,
  })
}

/**
 * Increments usageCount + sets lastUsedAt for a merchant key. Called from
 * `importStatement` after a row is committed using an alias-derived category.
 * Best-effort — failures don't block the import.
 */
export async function recordAliasUsage(merchantKey: string): Promise<void> {
  try {
    const existing = await db.merchantAliases.where('merchantKey').equals(merchantKey).first()
    if (!existing) return
    await db.merchantAliases.update(existing.id!, {
      usageCount: existing.usageCount + 1,
      lastUsedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.warn('[merchantAliasService] recordAliasUsage failed', err)
  }
}

/** Sets multiple aliases in one transaction — used by the AI bulk classifier. */
export async function setAliasesBulk(inputs: SetAliasInput[]): Promise<void> {
  for (const input of inputs) {
    await setAlias(input)
  }
}

export async function deleteAlias(merchantKey: string): Promise<void> {
  const existing = await db.merchantAliases.where('merchantKey').equals(merchantKey).first()
  if (existing?.id != null) {
    await db.merchantAliases.delete(existing.id)
  }
}

/** Drops every learned alias. Intended for a settings "reset learning" action. */
export async function clearAllAliases(): Promise<void> {
  await db.merchantAliases.clear()
}
