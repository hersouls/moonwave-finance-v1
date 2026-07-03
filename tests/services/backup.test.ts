// ─── backup service (Sync v2) ───────────────────────────────────────
//
// 검증 대상:
// 1. v2 백업(version '2.0', 문자열 id/FK) export → import 왕복 보존
// 2. 레거시 1.x 백업(숫자 id + syncId + 숫자 FK) 임포트 시 변환:
//    id 승격(syncId→id) + FK 재작성 + projected dailyValues 드롭
// 3. 복원 후 syncOutbox에 업서트 마커 시드 (dailyValues는 좌표 메타 동반,
//    projected 제외) — 복원분이 다음 푸시로 클라우드에 올라가는 경로
// 4. 복원은 "로컬 교체" — 기존 레코드의 delete 마커를 남기지 않는다
//    (삭제 전파 폭풍 방지)
import { describe, it, expect, beforeEach, vi } from 'vitest'

// importBackup 말미의 dynamic import('@/services/firestoreSync')가 실제
// Firebase 초기화를 타지 않도록 모킹한다 (requestPush는 세션 없으면 no-op).
vi.mock('@/lib/firebase', () => ({ firestore: {}, auth: {} }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_fs: unknown, path: string) => ({ path })),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => undefined })),
  getDocs: vi.fn(async () => ({ empty: true, docs: [] })),
  setDoc: vi.fn(async () => {}),
  deleteDoc: vi.fn(async () => {}),
  deleteField: vi.fn(() => ({ __sentinel: 'deleteField' })),
  onSnapshot: vi.fn(() => () => {}),
  query: vi.fn((c: unknown) => c),
  limit: vi.fn(),
  where: vi.fn(),
  serverTimestamp: vi.fn(() => ({ __sentinel: 'serverTimestamp' })),
  Timestamp: { fromMillis: (ms: number) => ({ toMillis: () => ms }) },
  writeBatch: vi.fn(() => ({ set: vi.fn(), delete: vi.fn(), commit: vi.fn(async () => {}) })),
}))

import { BACKUP_CONFIG } from '@/utils/constants'
import { exportBackup, importBackup } from '@/services/backup'
import { db, setSyncWritingFlag, drainChangeTracking } from '@/services/database'
import type {
  Member, AssetCategory, AssetItem, DailyValue,
  TransactionCategory, Transaction, BackupFile,
} from '@/lib/types'

const NOW = '2026-06-01T00:00:00.000Z'

/** 전 테이블 wipe — 훅 침묵(동기화 쓰기 취급) + 아웃박스 정리. */
async function wipeAll(): Promise<void> {
  setSyncWritingFlag(true)
  try {
    for (const table of db.tables) await table.clear()
  } finally {
    setSyncWritingFlag(false)
  }
  await drainChangeTracking()
  await db.syncOutbox.clear()
}

/** 훅을 발화시키지 않는 시드 (테스트 픽스처 준비용). */
async function seedSilently(fn: () => Promise<void>): Promise<void> {
  setSyncWritingFlag(true)
  try {
    await fn()
  } finally {
    setSyncWritingFlag(false)
  }
}

function backupFile(json: unknown): File {
  return new File([JSON.stringify(json)], 'backup.json', { type: 'application/json' })
}

// ─── v2 픽스처 (문자열 id / 문자열 FK) ─────────────────────────────
const member: Member = {
  id: 'member-1', name: '본인', color: '#8B5CF6', isDefault: true,
  sortOrder: 0, createdAt: NOW, updatedAt: NOW,
}
const assetCat: AssetCategory = {
  id: 'acat-1', name: '주식', type: 'asset', color: '#3B82F6',
  sortOrder: 0, createdAt: NOW, updatedAt: NOW,
}
const assetItem: AssetItem = {
  id: 'item-1', memberId: 'member-1', categoryId: 'acat-1', name: '증권계좌',
  type: 'asset', isActive: true, sortOrder: 0, createdAt: NOW, updatedAt: NOW,
}
const dvManual: DailyValue = {
  id: 'dv-manual', assetItemId: 'item-1', date: '2026-06-01', value: 100000,
  source: 'manual', createdAt: NOW, updatedAt: NOW,
}
const dvLegacySource: DailyValue = { // source 미지정 = 레거시 앵커 취급
  id: 'dv-legacy', assetItemId: 'item-1', date: '2026-06-02', value: 100500,
  createdAt: NOW, updatedAt: NOW,
}
const dvProjected: DailyValue = {
  id: 'dv-proj', assetItemId: 'item-1', date: '2026-06-03', value: 101000,
  source: 'projected', createdAt: NOW, updatedAt: NOW,
}
const txnCat: TransactionCategory = {
  id: 'tcat-1', name: '식비', type: 'expense', color: '#F59E0B',
  isDefault: true, sortOrder: 0, createdAt: NOW, updatedAt: NOW,
}
const txn: Transaction = {
  id: 'txn-1', memberId: 'member-1', type: 'expense', amount: 12000,
  categoryId: 'tcat-1', date: '2026-06-01', isRecurring: false,
  createdAt: NOW, updatedAt: NOW,
}

beforeEach(async () => {
  await wipeAll()
})

describe('backup config', () => {
  it('has valid backup config', () => {
    expect(BACKUP_CONFIG.CURRENT_VERSION).toBeDefined()
    expect(BACKUP_CONFIG.APP_NAME).toBe('Moonwave Finance')
    expect(BACKUP_CONFIG.SUPPORTED_VERSIONS).toContain(BACKUP_CONFIG.CURRENT_VERSION)
  })

  it('rejects an unsupported backup version', async () => {
    const bad = backupFile({ version: '0.9', appName: 'x', exportDate: NOW, data: { members: [] } })
    await expect(importBackup(bad)).rejects.toThrow('지원하지 않는 백업 버전')
  })
})

describe('v2 백업 export → import 왕복', () => {
  it('문자열 id/FK가 그대로 보존되고, 복원 후 아웃박스에 업서트 마커가 시드된다', async () => {
    await seedSilently(async () => {
      await db.members.add(member)
      await db.assetCategories.add(assetCat)
      await db.assetItems.add(assetItem)
      await db.dailyValues.bulkAdd([dvManual, dvLegacySource, dvProjected])
      await db.transactionCategories.add(txnCat)
      await db.transactions.add(txn)
    })

    // exportBackup은 브라우저 다운로드 플로우(createObjectURL + <a>.click)를
    // 타므로 Blob을 가로채 JSON을 획득한다.
    let capturedBlob: Blob | null = null
    const origCreate = URL.createObjectURL
    const origRevoke = URL.revokeObjectURL
    const anchorProto = HTMLAnchorElement.prototype as { click: () => void }
    const origClick = anchorProto.click
    URL.createObjectURL = ((b: Blob) => { capturedBlob = b; return 'blob:mock' }) as typeof URL.createObjectURL
    URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL
    anchorProto.click = () => {} // happy-dom 네비게이션 방지
    try {
      await exportBackup()
    } finally {
      URL.createObjectURL = origCreate
      URL.revokeObjectURL = origRevoke
      anchorProto.click = origClick
    }

    expect(capturedBlob).not.toBeNull()
    const exported = JSON.parse(await capturedBlob!.text()) as BackupFile
    expect(exported.version).toBe('2.0')
    expect(exported.data.members.map((m) => m.id)).toEqual(['member-1'])
    expect(exported.data.transactions[0].categoryId).toBe('tcat-1')
    // v2 백업에는 레거시 syncId 필드가 없다
    expect('syncId' in (exported.data.transactions[0] as unknown as Record<string, unknown>)).toBe(false)

    // ── 왕복: wipe 후 그 파일을 그대로 복원 ──
    await wipeAll()
    await importBackup(backupFile(exported))

    expect((await db.members.toArray()).map((m) => m.id)).toEqual(['member-1'])
    const restoredItem = await db.assetItems.get('item-1')
    expect(restoredItem?.memberId).toBe('member-1')
    expect(restoredItem?.categoryId).toBe('acat-1')
    const restoredTxn = await db.transactions.get('txn-1')
    expect(restoredTxn?.categoryId).toBe('tcat-1')
    expect(restoredTxn?.amount).toBe(12000)
    // v2 데이터는 무변환 복원 — projected 행도 파일에 있으면 테이블에는 복원된다
    expect(await db.dailyValues.count()).toBe(3)

    // ── 아웃박스 시드: 복원분 업서트 마커 (projected dailyValues 제외) ──
    const outbox = await db.syncOutbox.toArray()
    expect(outbox.every((e) => e.op === 'upsert')).toBe(true)
    const keys = new Set(outbox.map((e) => e.key))
    expect(keys).toContain('members:member-1')
    expect(keys).toContain('assetCategories:acat-1')
    expect(keys).toContain('assetItems:item-1')
    expect(keys).toContain('transactionCategories:tcat-1')
    expect(keys).toContain('transactions:txn-1')
    expect(keys).toContain('dailyValues:dv-manual')
    expect(keys).toContain('dailyValues:dv-legacy')
    expect(keys).not.toContain('dailyValues:dv-proj') // projected는 동기화 범위 밖
    // dailyValues 마커는 번들 업로드용 (자산×일자) 좌표 메타를 동반한다
    const dvEntry = outbox.find((e) => e.key === 'dailyValues:dv-manual')!
    expect(dvEntry.assetItemId).toBe('item-1')
    expect(dvEntry.date).toBe('2026-06-01')
  })
})

describe('레거시 1.x 백업 임포트 (숫자 id + syncId + 숫자 FK)', () => {
  it('syncId를 id로 승격하고 숫자 FK를 부모 문자열 id로 재작성한다', async () => {
    const legacy = {
      version: BACKUP_CONFIG.CURRENT_VERSION, // 1.x
      appName: BACKUP_CONFIG.APP_NAME,
      exportDate: NOW,
      data: {
        members: [
          { id: 1, syncId: 'm-sync-1', name: '본인', color: '#fff', isDefault: true, sortOrder: 0, createdAt: NOW, updatedAt: NOW },
        ],
        assetCategories: [
          { id: 2, syncId: 'ac-sync-2', name: '주식', type: 'asset', color: '#123', sortOrder: 0, createdAt: NOW, updatedAt: NOW },
        ],
        assetItems: [
          { id: 3, syncId: 'ai-sync-3', memberId: 1, categoryId: 2, name: '증권계좌', type: 'asset', isActive: true, sortOrder: 0, createdAt: NOW, updatedAt: NOW },
        ],
        dailyValues: [
          { id: 4, syncId: 'dv-sync-4', assetItemId: 3, date: '2026-06-01', value: 100, source: 'manual', createdAt: NOW, updatedAt: NOW },
          // projected — 레거시 변환 시 드롭 (동기화/백업 대상 아님, 앵커에서 재생성)
          { id: 5, syncId: 'dv-sync-5', assetItemId: 3, date: '2026-06-02', value: 200, source: 'projected', createdAt: NOW, updatedAt: NOW },
        ],
        transactionCategories: [
          { id: 7, syncId: 'tc-sync-7', name: '식비', type: 'expense', color: '#f00', isDefault: true, sortOrder: 0, createdAt: NOW, updatedAt: NOW },
        ],
        transactions: [
          // FK 전부 매핑 + 미매칭 optional FK(recurSourceId: 999)는 필드 삭제
          { id: 8, syncId: 'tx-sync-8', memberId: 1, categoryId: 7, recurSourceId: 999, type: 'expense', amount: 5000, date: '2026-06-01', isRecurring: false, createdAt: NOW, updatedAt: NOW },
          // 미매칭 nullable FK(memberId: 999) → null
          { id: 9, syncId: 'tx-sync-9', memberId: 999, categoryId: null, type: 'expense', amount: 700, date: '2026-06-02', isRecurring: false, createdAt: NOW, updatedAt: NOW },
          // syncId 없는 행 → 새 문자열 id 생성
          { id: 10, memberId: null, categoryId: null, type: 'income', amount: 900, date: '2026-06-03', isRecurring: false, createdAt: NOW, updatedAt: NOW },
        ],
        budgets: [
          { id: 11, syncId: 'b-sync-11', categoryId: 7, month: '2026-06', amount: 300000, createdAt: NOW, updatedAt: NOW },
        ],
        settings: {},
      },
    }

    await importBackup(backupFile(legacy))

    // id 승격 — 구 syncId가 그대로 PK가 된다 (클라우드 문서 id와 수렴)
    expect((await db.members.toArray()).map((m) => m.id)).toEqual(['m-sync-1'])
    const item = await db.assetItems.get('ai-sync-3')
    expect(item).toBeTruthy()
    expect(item!.memberId).toBe('m-sync-1')   // 숫자 1 → 'm-sync-1'
    expect(item!.categoryId).toBe('ac-sync-2') // 숫자 2 → 'ac-sync-2'
    // 레코드에 syncId 필드가 남지 않는다
    expect('syncId' in (item as unknown as Record<string, unknown>)).toBe(false)

    // projected dailyValues 드롭 — manual 앵커만 복원
    const dvs = await db.dailyValues.toArray()
    expect(dvs.map((d) => d.id)).toEqual(['dv-sync-4'])
    expect(dvs[0].assetItemId).toBe('ai-sync-3')

    const tx8 = await db.transactions.get('tx-sync-8')
    expect(tx8!.memberId).toBe('m-sync-1')
    expect(tx8!.categoryId).toBe('tc-sync-7')
    // 미매칭 optional FK는 필드째 제거
    expect('recurSourceId' in (tx8 as unknown as Record<string, unknown>)).toBe(false)

    const tx9 = await db.transactions.get('tx-sync-9')
    expect(tx9!.memberId).toBeNull() // 미매칭 nullable FK → null

    // syncId 없던 행도 문자열 id를 부여받아 복원된다
    const txns = await db.transactions.toArray()
    expect(txns).toHaveLength(3)
    const generated = txns.find((t) => t.id !== 'tx-sync-8' && t.id !== 'tx-sync-9')!
    expect(typeof generated.id).toBe('string')
    expect(generated.id.length).toBeGreaterThan(0)
    expect(generated.amount).toBe(900)

    const budget = (await db.budgets.toArray())[0]
    expect(budget.id).toBe('b-sync-11')
    expect(budget.categoryId).toBe('tc-sync-7')

    // 변환된 레코드도 전부 아웃박스에 업서트 마커로 시드된다 (projected 제외)
    const keys = new Set((await db.syncOutbox.toArray()).map((e) => e.key))
    expect(keys).toContain('members:m-sync-1')
    expect(keys).toContain('assetItems:ai-sync-3')
    expect(keys).toContain('transactions:tx-sync-8')
    expect(keys).toContain(`transactions:${generated.id}`)
    expect(keys).toContain('budgets:b-sync-11')
    expect(keys).toContain('dailyValues:dv-sync-4')
    expect(keys).not.toContain('dailyValues:dv-sync-5')
  })
})

describe('복원의 로컬 교체 의미론', () => {
  it('기존 레코드의 delete 마커를 남기지 않는다 — 삭제 전파 폭풍 방지', async () => {
    // 기존 레코드 1건을 "사용자 쓰기"로 생성 → CRUD 훅이 아웃박스에 upsert 적재
    await db.transactions.add({
      id: 'old-1', memberId: null, type: 'expense', amount: 500,
      categoryId: null, date: '2026-06-01', isRecurring: false,
      createdAt: NOW, updatedAt: NOW,
    })
    await vi.waitFor(async () => {
      expect(await db.syncOutbox.count()).toBe(1)
    })

    // 'old-1'이 없는 백업을 복원 — wipe가 old-1을 지우지만 delete 마커는 금지
    await importBackup(backupFile({
      version: '2.0',
      appName: BACKUP_CONFIG.APP_NAME,
      exportDate: NOW,
      data: { members: [], transactions: [{ ...txn, id: 'new-1' }] },
    }))

    expect((await db.transactions.toArray()).map((t) => t.id)).toEqual(['new-1'])

    // 아웃박스: delete 마커 0건 — 잔존 시 다음 푸시 때 클라우드/피어에서
    // 복원 전 레코드들이 삭제 전파된다. 복원 전 잔여 마커('old-1')도 소거.
    await drainChangeTracking()
    const outbox = await db.syncOutbox.toArray()
    expect(outbox.filter((e) => e.op === 'delete')).toHaveLength(0)
    expect(outbox.map((e) => e.key)).toEqual(['transactions:new-1'])
  })
})
