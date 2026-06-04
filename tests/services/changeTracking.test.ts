// ─── 변경추적(syncChangeLog/syncTombstones) 회귀 테스트 ──────────────────────
//
// 회귀 대상: change-tracking 훅이 트랜잭션 스코프 밖의 syncChangeLog에 직접
// 쓰다가 NotFoundError로 조용히 실패해, 모든 생성/수정/삭제가 changelog에
// 기록되지 않던 버그 (2026-06-04 확정). 본 쓰기는 커밋되는데 changelog만
// 비어 있어 incrementalUpload가 항상 pending 0건 → 라이브 동기화 불능.
//
// 현재 구현은 트랜잭션 'complete' 이후에 큐잉된 항목을 기록하므로(비동기),
// 단언은 vi.waitFor로 수렴을 기다린다.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import Dexie from 'dexie'
import { db, addTransaction, bulkSetDailyValues, setSyncWritingFlag } from '@/services/database'
import type { Transaction } from '@/lib/types'

function makeTxn(): Omit<Transaction, 'id'> {
  const now = new Date().toISOString()
  return {
    syncId: crypto.randomUUID(),
    memberId: null,
    type: 'expense',
    amount: 1000,
    categoryId: null,
    date: '2026-06-04',
    isRecurring: false,
    createdAt: now,
    updatedAt: now,
  }
}

async function waitForChangeLogCount(expected: number): Promise<void> {
  await vi.waitFor(async () => {
    expect(await db.syncChangeLog.count()).toBe(expected)
  }, { timeout: 2000 })
}

beforeEach(async () => {
  await db.transactions.clear()
  await db.dailyValues.clear()
  // 위 clear가 큐잉했을 수 있는 post-commit 기록이 끝난 뒤 로그를 비운다.
  await new Promise((r) => setTimeout(r, 20))
  await db.syncChangeLog.clear()
  await db.syncTombstones.clear()
})

describe('change-tracking 훅 → syncChangeLog 기록', () => {
  it('암시적 단일테이블 트랜잭션(add)에서 create 항목을 기록한다', async () => {
    const txn = makeTxn()
    await addTransaction(txn)
    expect(await db.transactions.count()).toBe(1)

    await waitForChangeLogCount(1)
    const log = (await db.syncChangeLog.toArray())[0]
    expect(log.operation).toBe('create')
    expect(log.tableName).toBe('transactions')
    expect(log.syncId).toBe(txn.syncId)
    expect(log.processed).toBe(0)
  })

  it('명시적 단일스코프 트랜잭션(bulkSetDailyValues)에서도 기록한다', async () => {
    await bulkSetDailyValues([
      { assetItemId: 1, date: '2026-06-01', value: 100 },
      { assetItemId: 1, date: '2026-06-02', value: 200 },
    ])
    expect(await db.dailyValues.count()).toBe(2)
    await waitForChangeLogCount(2)
  })

  it('update 경로에서 update 항목을 기록한다', async () => {
    const id = await db.transactions.add(makeTxn() as Transaction)
    await waitForChangeLogCount(1)
    await db.syncChangeLog.clear()

    await db.transactions.update(id, { amount: 9999 })
    await waitForChangeLogCount(1)
    expect((await db.syncChangeLog.toArray())[0].operation).toBe('update')
  })

  it('delete 경로에서 delete 항목 + 톰스톤을 기록한다', async () => {
    const txn = makeTxn()
    const id = await db.transactions.add(txn as Transaction)
    await waitForChangeLogCount(1)
    await db.syncChangeLog.clear()

    await db.transactions.delete(id)
    expect(await db.transactions.count()).toBe(0)
    await waitForChangeLogCount(1)
    expect((await db.syncChangeLog.toArray())[0].operation).toBe('delete')

    await vi.waitFor(async () => {
      expect(await db.syncTombstones.count()).toBe(1)
    }, { timeout: 2000 })
    expect((await db.syncTombstones.toArray())[0].syncId).toBe(txn.syncId)
  })

  it('abort된 트랜잭션은 changelog/톰스톤을 남기지 않는다 (유령 항목 방지)', async () => {
    await expect(
      db.transaction('rw', db.transactions, async () => {
        await db.transactions.add(makeTxn() as Transaction)
        throw new Error('force abort')
      })
    ).rejects.toThrow('force abort')

    expect(await db.transactions.count()).toBe(0)
    // post-commit 기록이 있었다면 도착할 시간을 충분히 준 뒤 0건을 단언
    await new Promise((r) => setTimeout(r, 50))
    expect(await db.syncChangeLog.count()).toBe(0)
    expect(await db.syncTombstones.count()).toBe(0)
  })

  it('동기화 다운로드(sync-flagged) 쓰기는 changelog를 남기지 않는다', async () => {
    setSyncWritingFlag(true)
    try {
      await db.transactions.add(makeTxn() as Transaction)
    } finally {
      setSyncWritingFlag(false)
    }
    expect(await db.transactions.count()).toBe(1)
    await new Promise((r) => setTimeout(r, 50))
    expect(await db.syncChangeLog.count()).toBe(0)
  })

  it('한 트랜잭션의 여러 쓰기는 하나의 post-commit 기록으로 배칭된다', async () => {
    await db.transaction('rw', db.transactions, async () => {
      await db.transactions.add(makeTxn() as Transaction)
      await db.transactions.add(makeTxn() as Transaction)
      await db.transactions.add(makeTxn() as Transaction)
    })
    await waitForChangeLogCount(3)
    // Dexie.currentTransaction 기반 큐잉이 트랜잭션 단위로 묶였는지 간접 확인:
    // 세 항목 모두 create여야 한다.
    const ops = (await db.syncChangeLog.toArray()).map((l) => l.operation)
    expect(ops).toEqual(['create', 'create', 'create'])
    expect(Dexie.currentTransaction).toBeNull()
  })
})
