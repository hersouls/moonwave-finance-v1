// ─── CRUD 훅 → syncOutbox 기록 (Sync v2 업로드 큐) ──────────────────────────
//
// 검증 대상 (fresh v16 DB — 신규 설치 경로, populate 시드는 마커로 미기록):
// 1. create/update/delete 각각 올바른 {key, tableName, recordId, op} 기록
// 2. 같은 트랜잭션/연속 변경 시 레코드당 1행 + 마지막 op 승리
// 3. echo 억제 — runSyncWrite(트랜잭션 마커) / setSyncWritingFlag(전역) 중 미기록,
//    동시 진행 중인 사용자 쓰기는 정확히 기록
// 4. projected dailyValues 미기록 (생성/수정/삭제 모두), projected→manual 전환은 기록
// 5. dailyValues 항목에 assetItemId/date 좌표 메타 동반 (업서트·삭제 모두)
// 6. onUserWritePersisted 신호 발화 (사용자 쓰기만)
// 7. drainChangeTracking 후 행 가시성 (post-commit 기록 수렴)
// 8. clearAllData()가 아웃박스도 비운다 (로컬 전용 리셋)
//
// 훅은 트랜잭션 커밋 후(post-commit) 비동기로 아웃박스에 기록하므로
// 단언은 vi.waitFor / drainChangeTracking으로 수렴을 기다린다.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  db,
  createId,
  runSyncWrite,
  setSyncWritingFlag,
  drainChangeTracking,
  onUserWritePersisted,
  countPendingOutbox,
  clearAllData,
} from '@/services/database'
import type { Transaction, DailyValue } from '@/lib/types'

const NOW = '2026-07-01T00:00:00.000Z'

function makeTxn(id: string): Transaction {
  return {
    id,
    memberId: null,
    type: 'expense',
    amount: 1000,
    categoryId: null,
    date: '2026-07-01',
    isRecurring: false,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function makeDv(id: string, date: string, source?: 'manual' | 'projected'): DailyValue {
  return {
    id,
    assetItemId: 'asset-1',
    date,
    value: 100,
    ...(source ? { source } : {}),
    createdAt: NOW,
    updatedAt: NOW,
  }
}

/** 동기화 쓰기(마커 트랜잭션)로 시드 — 아웃박스를 오염시키지 않는다. */
async function seedSilently(fn: () => Promise<void>): Promise<void> {
  await runSyncWrite([db.transactions, db.dailyValues], fn)
}

async function waitForOutboxCount(expected: number): Promise<void> {
  await vi.waitFor(async () => {
    expect(await db.syncOutbox.count()).toBe(expected)
  }, { timeout: 2000 })
}

/** post-commit 기록이 도착할 시간을 충분히 준 뒤 아웃박스 0건을 단언. */
async function expectOutboxStaysEmpty(): Promise<void> {
  await new Promise((r) => setTimeout(r, 50))
  await drainChangeTracking()
  expect(await db.syncOutbox.count()).toBe(0)
}

beforeEach(async () => {
  // 마커 트랜잭션 안에서 clear → deleting 훅이 큐잉하지 않는다.
  await seedSilently(async () => {
    await db.transactions.clear()
    await db.dailyValues.clear()
  })
  // 직전 테스트가 남긴 in-flight post-commit 기록까지 정리한 뒤 아웃박스를 비운다.
  await new Promise((r) => setTimeout(r, 10))
  await drainChangeTracking()
  await db.syncOutbox.clear()
})

describe('CRUD 훅 → 아웃박스: 기본 기록', () => {
  it('create: {key, tableName, recordId, op:upsert}를 기록한다', async () => {
    await db.transactions.add(makeTxn('t-create'))
    await waitForOutboxCount(1)

    const row = (await db.syncOutbox.toArray())[0]
    expect(row.key).toBe('transactions:t-create')
    expect(row.tableName).toBe('transactions')
    expect(row.recordId).toBe('t-create')
    expect(row.op).toBe('upsert')
    // queuedAt은 유효한 ISO 타임스탬프
    expect(new Date(row.queuedAt).toISOString()).toBe(row.queuedAt)
  })

  it('update: 기존 행 수정을 upsert로 기록한다', async () => {
    await seedSilently(async () => { await db.transactions.add(makeTxn('t-upd')) })
    await expectOutboxStaysEmpty() // 시드는 미기록 확인

    await db.transactions.update('t-upd', { amount: 9999 })
    await waitForOutboxCount(1)

    const row = (await db.syncOutbox.toArray())[0]
    expect(row).toMatchObject({
      key: 'transactions:t-upd', tableName: 'transactions', recordId: 't-upd', op: 'upsert',
    })
  })

  it('delete: op:delete를 기록한다', async () => {
    await seedSilently(async () => { await db.transactions.add(makeTxn('t-del')) })

    await db.transactions.delete('t-del')
    await waitForOutboxCount(1)

    const row = (await db.syncOutbox.toArray())[0]
    expect(row).toMatchObject({
      key: 'transactions:t-del', tableName: 'transactions', recordId: 't-del', op: 'delete',
    })
  })

  it('put(새 행 upsert)도 기록되고, countPendingOutbox가 대기 건수를 반환한다', async () => {
    await db.transactions.put(makeTxn('t-put'))
    await waitForOutboxCount(1)
    expect(await countPendingOutbox()).toBe(1)
  })
})

describe('CRUD 훅 → 아웃박스: 레코드당 1행 + 마지막 op 승리', () => {
  it('같은 트랜잭션 안의 연속 변경: add→update→delete는 delete 1행, add→update는 upsert 1행', async () => {
    await db.transaction('rw', db.transactions, async () => {
      // t-a: 생성 후 같은 트랜잭션에서 삭제 → 최종 delete
      await db.transactions.add(makeTxn('t-a'))
      await db.transactions.update('t-a', { amount: 2 })
      await db.transactions.delete('t-a')
      // t-b: 생성 후 수정 → 최종 upsert
      await db.transactions.add(makeTxn('t-b'))
      await db.transactions.update('t-b', { amount: 3 })
    })
    await waitForOutboxCount(2)

    const byKey = new Map((await db.syncOutbox.toArray()).map((r) => [r.key, r]))
    expect(byKey.get('transactions:t-a')?.op).toBe('delete')
    expect(byKey.get('transactions:t-b')?.op).toBe('upsert')
  })

  it('별도 트랜잭션의 연속 변경도 같은 key 1행으로 수렴하고 마지막 op가 이긴다', async () => {
    await db.transactions.add(makeTxn('t-seq'))
    await waitForOutboxCount(1)
    expect((await db.syncOutbox.get('transactions:t-seq'))?.op).toBe('upsert')

    await db.transactions.delete('t-seq')
    await vi.waitFor(async () => {
      expect((await db.syncOutbox.get('transactions:t-seq'))?.op).toBe('delete')
    }, { timeout: 2000 })
    expect(await db.syncOutbox.count()).toBe(1) // 여전히 레코드당 1행
  })
})

describe('CRUD 훅 → 아웃박스: echo 억제', () => {
  it('runSyncWrite(트랜잭션 마커) 안의 create/update/delete는 기록되지 않는다', async () => {
    await runSyncWrite([db.transactions], async () => {
      await db.transactions.add(makeTxn('t-sync'))
      await db.transactions.update('t-sync', { amount: 5 })
      await db.transactions.delete('t-sync')
      await db.transactions.add(makeTxn('t-sync-2'))
    })
    expect(await db.transactions.count()).toBe(1)
    await expectOutboxStaysEmpty()
  })

  it('setSyncWritingFlag(전역 플래그) 중의 쓰기는 기록되지 않는다', async () => {
    setSyncWritingFlag(true)
    try {
      await db.transactions.add(makeTxn('t-flag'))
      await db.transactions.update('t-flag', { amount: 7 })
    } finally {
      setSyncWritingFlag(false)
    }
    expect(await db.transactions.count()).toBe(1)
    await expectOutboxStaysEmpty()
  })

  it('동기화 인제스트가 진행 중이어도 끼어든 사용자 쓰기는 정확히 기록된다', async () => {
    // 전역 플래그 방식이라면 인제스트 도중의 사용자 쓰기가 동기화 쓰기로
    // 오인돼 아웃박스가 조용히 누락된다 — 트랜잭션 마커의 핵심 가치.
    const ingest = runSyncWrite([db.transactions], async () => {
      for (let i = 0; i < 20; i++) {
        await db.transactions.add(makeTxn(`t-ingest-${i}`))
      }
    })
    const userWrite = db.transactions.add(makeTxn('t-user'))
    await Promise.all([ingest, userWrite])

    expect(await db.transactions.count()).toBe(21)
    await waitForOutboxCount(1) // 사용자 쓰기 1건만
    expect((await db.syncOutbox.toArray())[0].recordId).toBe('t-user')
  })
})

describe('CRUD 훅 → 아웃박스: projected dailyValues 제외', () => {
  it('projected 행의 생성/수정/삭제는 모두 기록되지 않는다', async () => {
    await db.dailyValues.add(makeDv('dv-p', '2026-07-01', 'projected'))
    await db.dailyValues.update('dv-p', { value: 200 }) // source 무변경 → 여전히 projected
    await db.dailyValues.delete('dv-p')
    await expectOutboxStaysEmpty()
  })

  it('projected→manual 전환(앵커 승격)은 사용자 쓰기로 기록된다', async () => {
    await seedSilently(async () => {
      await db.dailyValues.add(makeDv('dv-t', '2026-07-02', 'projected'))
    })

    await db.dailyValues.update('dv-t', { source: 'manual', value: 300 })
    await waitForOutboxCount(1)
    expect((await db.syncOutbox.toArray())[0]).toMatchObject({
      key: 'dailyValues:dv-t', op: 'upsert',
    })
  })

  it('manual/무표기 행은 정상 기록된다', async () => {
    await db.dailyValues.add(makeDv('dv-m', '2026-07-03', 'manual'))
    await db.dailyValues.add(makeDv('dv-u', '2026-07-04')) // source 미지정 = 앵커 취급
    await waitForOutboxCount(2)
  })
})

describe('CRUD 훅 → 아웃박스: dailyValues 좌표 메타', () => {
  it('업서트 항목에 assetItemId/date 좌표가 동반된다', async () => {
    await db.dailyValues.add(makeDv('dv-c', '2026-07-05', 'manual'))
    await waitForOutboxCount(1)

    const row = (await db.syncOutbox.toArray())[0]
    expect(row).toMatchObject({
      key: 'dailyValues:dv-c',
      tableName: 'dailyValues',
      recordId: 'dv-c',
      op: 'upsert',
      assetItemId: 'asset-1',
      date: '2026-07-05',
    })
  })

  it('삭제 항목에도 좌표가 동반된다 — 번들 업로드가 행 없이 좌표를 복원할 유일한 출처', async () => {
    await seedSilently(async () => {
      await db.dailyValues.add(makeDv('dv-d', '2026-07-06', 'manual'))
    })

    await db.dailyValues.delete('dv-d')
    await waitForOutboxCount(1)
    expect((await db.syncOutbox.toArray())[0]).toMatchObject({
      key: 'dailyValues:dv-d', op: 'delete', assetItemId: 'asset-1', date: '2026-07-06',
    })
  })

  it('dailyValues 외 테이블 항목에는 좌표 메타가 없다', async () => {
    await db.transactions.add(makeTxn('t-nometa'))
    await waitForOutboxCount(1)
    const row = (await db.syncOutbox.toArray())[0] as unknown as Record<string, unknown>
    expect(row.assetItemId).toBeUndefined()
    expect(row.date).toBeUndefined()
  })
})

describe('onUserWritePersisted 신호', () => {
  it('사용자 쓰기 시 발화하고, 동기화 쓰기 시엔 발화하지 않으며, 해지 후 중단된다', async () => {
    let signals = 0
    const unsub = onUserWritePersisted(() => { signals++ })
    try {
      await db.transactions.add(makeTxn('t-signal'))
      await vi.waitFor(() => { expect(signals).toBeGreaterThan(0) }, { timeout: 2000 })
      const afterUserWrite = signals

      // 동기화 쓰기(마커) — 신호 없음
      await runSyncWrite([db.transactions], async () => {
        await db.transactions.add(makeTxn('t-signal-sync'))
      })
      await new Promise((r) => setTimeout(r, 50))
      expect(signals).toBe(afterUserWrite)

      // 해지 후 — 신호 없음
      unsub()
      await db.transactions.add(makeTxn('t-signal-after'))
      await new Promise((r) => setTimeout(r, 50))
      expect(signals).toBe(afterUserWrite)
    } finally {
      unsub()
    }
  })
})

describe('drainChangeTracking', () => {
  it('드레인 후에는 폴링 없이 아웃박스 행이 즉시 보인다', async () => {
    await db.transaction('rw', db.transactions, async () => {
      await db.transactions.add(makeTxn('t-drain-1'))
      await db.transactions.add(makeTxn('t-drain-2'))
    })
    // 커밋 직후 'complete' 리스너가 post-commit 기록을 시작할 한 틱을 준 뒤
    // 드레인 — 이후에는 대기 없이 전량 가시.
    await new Promise((r) => setTimeout(r, 0))
    await drainChangeTracking()
    expect(await db.syncOutbox.count()).toBe(2)
  })
})

describe('clearAllData', () => {
  it('로컬 전용 리셋 — 아웃박스도 비우고, wipe 자체는 delete를 큐잉하지 않는다', async () => {
    // 직전 사용자 쓰기의 in-flight post-commit 기록과 경합해도
    // clearAllData 내부의 drain이 잔존 행을 막아야 한다.
    await db.transactions.add(makeTxn('t-wipe'))
    await clearAllData()

    expect(await db.transactions.count()).toBe(0)
    await drainChangeTracking()
    await new Promise((r) => setTimeout(r, 30))
    await drainChangeTracking()
    // wipe의 per-row 삭제 훅이 큐잉했다면 여기 delete 행이 잔존한다
    expect(await db.syncOutbox.count()).toBe(0)
    expect(await countPendingOutbox()).toBe(0)
    // 기본 멤버 재시드 확인 (리셋 의미론 유지) — 이 시드도 아웃박스 미기록
    expect(await db.members.count()).toBeGreaterThan(0)
  })

  it('createId는 전역 고유 문자열 id를 생성한다 (Firestore 문서 id 겸용)', () => {
    const a = createId()
    const b = createId()
    expect(typeof a).toBe('string')
    expect(a.length).toBeGreaterThan(0)
    expect(a).not.toBe(b)
  })
})
