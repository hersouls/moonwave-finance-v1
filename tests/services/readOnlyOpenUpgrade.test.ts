import { describe, it, expect } from 'vitest'
import Dexie from 'dexie'
import { db } from '@/services/database'
import { useSettingsStore } from '@/stores/settingsStore'

// Regression: a read-only device must still apply .upgrade() migrations when it
// opens an older DB after a PWA update that bumped the Dexie schema. The v9/v10
// migrations add() rows during db.open()'s versionchange transaction; before the
// fix the 'creating' hook called assertWritable() → ReadOnlyDeviceError → open()
// aborted → DB permanently closed.
//
// Strategy: pre-install a v8 DB under the production name with a *separate* Dexie
// instance (writable, no hooks), then open the real singleton read-only so it runs
// the real v9..v13 upgrades + the real CRUD hooks. Must stay isolated — no prior op
// may open the singleton while writable.

// Mirrors database.ts version(8) .stores() exactly.
const V8_STORES = {
  members: '++id, syncId, name, sortOrder',
  assetCategories: '++id, syncId, name, type, sortOrder',
  assetItems: '++id, syncId, memberId, categoryId, type, isActive, sortOrder',
  dailyValues: '++id, syncId, assetItemId, date, [assetItemId+date]',
  transactionCategories: '++id, syncId, name, type, sortOrder',
  transactions: '++id, syncId, memberId, type, categoryId, date, isRecurring, recurSourceId, paymentMethod, paymentMethodItemId, subscriptionId',
  budgets: '++id, syncId, categoryId, month',
  goals: '++id, syncId, targetDate',
  paymentMethodItems: '++id, syncId, type, name, sortOrder, linkedAssetItemId',
  subscriptions: '++id, syncId, currency, category, status, billingDay, cycle, sortOrder, paymentMethodItemId',
  syncChangeLog: '++id, tableName, syncId, processed, timestamp, [tableName+syncId]',
  syncTombstones: '++id, tableName, syncId, deletedAt, [tableName+syncId]',
}

describe('읽기전용 기기: .upgrade() 마이그레이션', () => {
  it('읽기전용에서도 throw 없이 업그레이드 open되고 마이그레이션 행이 생성된다', async () => {
    const now = new Date().toISOString()

    // 1) Pre-install a v8 DB under the production name (writable, no hooks).
    const legacy = new Dexie('MoonwaveFinance')
    legacy.version(8).stores(V8_STORES)
    await legacy.open()
    // Seed WITHOUT 부동산/대출이자 so v9/v10 actually perform add().
    await legacy.table('assetCategories').add({ name: '주식', type: 'asset', color: '#3B82F6', icon: 'TrendingUp', sortOrder: 0, syncId: 'seed-asset-stock', createdAt: now, updatedAt: now })
    await legacy.table('transactionCategories').add({ name: '식비', type: 'expense', color: '#F59E0B', icon: 'UtensilsCrossed', isDefault: true, sortOrder: 0, syncId: 'seed-txn-food', createdAt: now, updatedAt: now })
    legacy.close()

    // 2) Go read-only, then open the singleton → runs real v9..v13 upgrades + real hooks.
    useSettingsStore.setState((s) => ({ settings: { ...s.settings, deviceWriteEnabled: false } }))

    await expect(db.open()).resolves.toBeTruthy()
    expect(db.isOpen()).toBe(true)

    const assetCats = await db.assetCategories.toArray()
    expect(assetCats.some((c) => c.name === '부동산')).toBe(true) // v9
    const realEstate = assetCats.find((c) => c.name === '부동산')
    expect(realEstate?.syncId).toBe('default:assetCat:asset:부동산') // deterministic

    const txnCats = await db.transactionCategories.toArray()
    expect(txnCats.some((c) => c.name === '대출이자')).toBe(true) // v10
    const loanInterest = txnCats.find((c) => c.name === '대출이자')
    expect(loanInterest?.syncId).toBe('default:txnCat:expense:대출이자') // deterministic

    // Migration rows skip the changelog (marked as sync writes).
    expect(await db.syncChangeLog.count()).toBe(0)
  })
})
