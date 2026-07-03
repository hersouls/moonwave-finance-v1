// ─── merchantAliases 기기 간 수렴 (&merchantKey 유니크) ─────────────────────
//
// 두 기기가 같은 상호를 독립적으로 학습하면 merchantKey는 같고 id는 다르다.
// 인제스트(applyCloudChange)는 id 미스 + &merchantKey 히트를 "같은 논리 행"으로
// 보고 피어 id를 입양해야 한다 — 그렇지 않으면 put이 유니크 인덱스
// ConstraintError를 던지고 해당 상호의 동기화가 영구히 막힌다.
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/firebase', () => ({ firestore: {}, auth: {} }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_fs: unknown, path: string) => ({ __type: 'collection', path })),
  doc: vi.fn((_fs: unknown, path: string) => ({ __type: 'doc', path })),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => undefined })),
  getDocs: vi.fn(async () => ({ empty: true, docs: [] })),
  setDoc: vi.fn(async () => {}),
  deleteDoc: vi.fn(async () => {}),
  onSnapshot: vi.fn(() => () => {}),
  query: vi.fn((c: unknown) => c),
  limit: vi.fn(),
  where: vi.fn(),
  serverTimestamp: vi.fn(() => ({ __sentinel: 'serverTimestamp' })),
  writeBatch: vi.fn(() => ({ set: vi.fn(), delete: vi.fn(), commit: async () => {} })),
}))

import { db, setSyncWritingFlag, drainChangeTracking } from '@/services/database'
import { applyCloudChange } from '@/services/firestoreSync'
import type { MerchantAlias } from '@/lib/types'

const JAN = '2026-01-01T00:00:00.000Z'
const FEB = '2026-02-01T00:00:00.000Z'
const MAR = '2026-03-01T00:00:00.000Z'

/** v3 클라우드 alias 문서 (문자열 FK + 구버전 호환 컴패니언). */
function cloudAlias(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    syncId: 'cloud-B',
    merchantKey: '스타벅스',
    categoryId: 'cat-식비',
    categoryId_syncId: 'cat-식비',
    source: 'ai-suggestion',
    usageCount: 9,
    learnedAt: JAN,
    createdAt: JAN,
    updatedAt: FEB,
    __deviceId: 'device-B',
    __schemaV: 3,
    ...over,
  }
}

async function seedLocalAlias(over: Partial<MerchantAlias> = {}): Promise<void> {
  setSyncWritingFlag(true)
  try {
    await db.merchantAliases.add({
      id: 'local-A',
      merchantKey: '스타벅스',
      categoryId: 'cat-식비',
      source: 'user-override',
      usageCount: 3,
      learnedAt: JAN,
      createdAt: JAN,
      updatedAt: JAN,
      ...over,
    } as MerchantAlias)
  } finally {
    setSyncWritingFlag(false)
  }
}

beforeEach(async () => {
  setSyncWritingFlag(true)
  try {
    await db.merchantAliases.clear()
  } finally {
    setSyncWritingFlag(false)
  }
  await drainChangeTracking()
  await db.syncOutbox.clear()
})

describe('merchantAliases 기기 간 수렴 (applyCloudChange 경유)', () => {
  it('같은 merchantKey·다른 id의 더 새로운 피어 alias는 ConstraintError 없이 피어 id를 입양한다', async () => {
    await seedLocalAlias() // 이 기기가 먼저 학습 (JAN, id='local-A')

    // 피어가 같은 상호를 다른 id로 업로드 (FEB — 더 새로움).
    // 수렴 실패 시 &merchantKey 인덱스에서 ConstraintError가 난다.
    await expect(
      applyCloudChange('merchantAliases', 'modified', cloudAlias()),
    ).resolves.toBe(true)

    const rows = await db.merchantAliases.toArray()
    expect(rows).toHaveLength(1) // 수렴 — 복제 없음
    expect(rows[0].id).toBe('cloud-B') // 피어 id 입양
    expect(rows[0].source).toBe('ai-suggestion') // LWW — 더 새로운 피어가 이김
    expect(rows[0].usageCount).toBe(9)
    expect(rows[0].categoryId).toBe('cat-식비') // 문자열 FK 그대로

    // 인제스트 쓰기는 아웃박스 echo를 남기지 않는다
    await drainChangeTracking()
    await new Promise(r => setTimeout(r, 30))
    expect(await db.syncOutbox.count()).toBe(0)
  })

  it('로컬이 더 새로우면 피어 alias를 적용하지 않는다 (복제도 없음)', async () => {
    await seedLocalAlias({ usageCount: 5, updatedAt: MAR }) // 클라우드(FEB)보다 새로움

    await expect(
      applyCloudChange('merchantAliases', 'modified', cloudAlias()),
    ).resolves.toBe(false)

    const rows = await db.merchantAliases.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('local-A') // 입양 없음 — 로컬 id 유지
    expect(rows[0].source).toBe('user-override') // 로컬 보존
    expect(rows[0].usageCount).toBe(5)
  })

  it('같은 merchantKey를 공유하는 여러 클라우드 문서가 한 행으로 수렴한다', async () => {
    // 로컬 행 없음 — 두 피어가 각자 "다이소"를 업로드
    await applyCloudChange('merchantAliases', 'added',
      cloudAlias({ syncId: 'cloud-B', merchantKey: '다이소', updatedAt: FEB }))
    await applyCloudChange('merchantAliases', 'added',
      cloudAlias({ syncId: 'cloud-C', merchantKey: '다이소', updatedAt: MAR, __deviceId: 'device-C' }))

    const rows = await db.merchantAliases.toArray()
    expect(rows).toHaveLength(1) // ConstraintError 없이 단일 행
    expect(rows[0].id).toBe('cloud-C') // 더 새로운 문서의 id로 수렴
    expect(rows[0].merchantKey).toBe('다이소')
  })

  it('v2 레거시 alias 문서(숫자 categoryId + 컴패니언)는 문자열 FK로 복원된다', async () => {
    const legacy = cloudAlias({
      syncId: 'cloud-L',
      merchantKey: '올리브영',
      categoryId: 7, // 구버전 숫자 FK
      categoryId_syncId: 'cat-생활',
      __schemaV: 2,
    })

    await expect(applyCloudChange('merchantAliases', 'added', legacy)).resolves.toBe(true)

    const row = (await db.merchantAliases.toArray())[0]
    expect(row.id).toBe('cloud-L')
    expect(row.categoryId).toBe('cat-생활') // 컴패니언으로 복원
  })
})
