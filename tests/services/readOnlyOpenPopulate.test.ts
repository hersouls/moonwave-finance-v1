import { describe, it, expect } from 'vitest'
import { db } from '@/services/database'
import { useSettingsStore } from '@/stores/settingsStore'

// Regression: a read-only device must still be able to OPEN a fresh database.
// The seed in db.on('populate') runs inside db.open()'s versionchange transaction;
// before the fix its bulkAdd 'creating' hook called assertWritable() → ReadOnlyDeviceError
// → open() aborted → DB permanently closed → every later read threw DatabaseClosedError.
//
// This file must stay isolated (no beforeEach that opens db, no merging into another
// suite): read-only must be set BEFORE the first db.open(), or the bug is masked.
describe('읽기전용 기기: 신규 DB open(populate)', () => {
  it('읽기전용에서도 throw 없이 open되고 기본 시드가 존재하며 DB가 닫히지 않는다', async () => {
    useSettingsStore.setState((s) => ({ settings: { ...s.settings, deviceWriteEnabled: false } }))

    await expect(db.open()).resolves.toBeTruthy()
    expect(db.isOpen()).toBe(true)
    expect(await db.members.count()).toBeGreaterThan(0)
    expect(await db.assetCategories.count()).toBeGreaterThan(0)
    expect(await db.transactionCategories.count()).toBeGreaterThan(0)
    // Seeds bypass the gate AND skip the changelog (deterministic syncIds converge).
    expect(await db.syncChangeLog.count()).toBe(0)
  })
})
