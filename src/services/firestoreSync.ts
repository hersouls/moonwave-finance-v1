// ═══ Firestore Sync v2 — SDK-native 실시간 동기화 ═══════════════════
//
// 설계 원칙 (구 엔진 2,500줄 → 이 파일):
//
//   쓰기: Dexie CRUD 훅 → syncOutbox(레코드 단위 마커) → 즉시 setDoc/deleteDoc.
//        오프라인 내구성·재시도·순서는 Firestore SDK persistentLocalCache가
//        소유한다 (firebase.ts). 수동 changelog·서킷브레이커·타임아웃 없음.
//        아웃박스는 "앱이 setDoc 호출 전에 죽는" 밀리초 창만 메운다
//        (at-least-once — 서버 ack 후에만 지운다).
//
//   읽기: onSnapshot 리스너 단일 경로. persistentLocalCache의 resume token이
//        네이티브 델타를 제공한다 — 로그인 머지/체크포인트/전량 다운로드 없음.
//        삭제는 실제 deleteDoc → 'removed' 이벤트로 전파.
//
//   ID:  로컬 PK == 클라우드 문서 id == 레코드 id (전역 문자열). FK도 문자열
//        id라 부모 도착 순서와 무관하게 그대로 저장한다 — FK 리맵 레이어 없음.
//
//   충돌: updatedAt LWW ±500ms 시계오차 허용 + deviceId 타이브레이커
//        (shouldApplyCloudUpdate — v1에서 검증된 그대로).
//
//   전환기 호환 (구버전 기기가 남아있는 동안):
//        - 문서에 syncId(=id)와 <fk>_syncId 컴패니언을 계속 쓴다
//        - 삭제 시 syncTombstones 문서를 계속 쓴다 (구버전의 오프라인 삭제 수신)
//        - __uploadedAt 서버 스탬프 유지 (구버전 델타 체크포인트가 의존)
//        전 기기가 v2로 업데이트되면 이 셋은 제거해도 된다.

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
  onSnapshot,
  query,
  limit,
  where,
  serverTimestamp,
  getDocsFromServer,
  type Unsubscribe,
} from 'firebase/firestore'
import { firestore } from '@/lib/firebase'
import {
  db,
  runSyncWrite,
  onUserWritePersisted,
  countPendingOutbox,
  SYNCABLE_TABLE_NAMES,
  type SyncableTableName,
} from '@/services/database'
import {
  DV_BUNDLE_COLLECTION,
  buildBundlePatches,
  buildFullBundles,
  explodeBundleDoc,
  type DvBundlePatch,
} from '@/services/dailyValueBundles'
import { useAuthStore } from '@/stores/authStore'
import { getDeviceId } from '@/lib/deviceId'
import type { DailyValue, SyncOutboxEntry } from '@/lib/types'

export type SyncableTable = SyncableTableName

const ALL_TABLES: SyncableTable[] = [...SYNCABLE_TABLE_NAMES]

/** Firestore 배치 상한(500)보다 여유 있게 — 삭제는 톰스톤 동반 시 2op. */
const BATCH_OPS_LIMIT = 400

/** v3 = Sync v2 (문자열 id/FK). v2 문서(숫자 FK + 컴패니언)는 인제스트가 정규화. */
const CLOUD_SCHEMA_VERSION = 3

// ─── 문서 주소/페이로드 ────────────────────────────────────────────

/**
 * id를 Firestore 문서 id로 안전하게 인코딩한다. 문서 id에 '/'가 올 수 없는데
 * 결정적 시드 id는 레코드 이름을 포함한다 (예: 'default:txnCat:expense:마트/편의점').
 * 인코딩은 단사('~'를 먼저 이스케이프)라 서로 다른 id가 충돌하지 않고,
 * '/'와 '~'가 없는 id는 바이트 동일 — 기존 클라우드 문서가 이동하지 않는다.
 */
export function encodeDocId(id: string): string {
  return id.replace(/~/g, '~7e').replace(/\//g, '~2f')
}

const colPath = (uid: string, tableName: string) => `users/${uid}/${tableName}`
const docPath = (uid: string, tableName: string, id: string) =>
  `users/${uid}/${tableName}/${encodeDocId(id)}`

/**
 * FK 필드 목록 — 업로드 시 구버전 호환 컴패니언(<field>_syncId)을 붙이고,
 * 구버전 문서(숫자 FK) 인제스트 시 컴패니언으로 문자열 id를 복원하는 데 쓴다.
 * mode는 복원 불가 시 처리: nullable→null, optional→필드 제거, required→''.
 */
const TABLE_FK_FIELDS: Partial<Record<SyncableTable, Array<{
  field: string
  mode: 'required' | 'nullable' | 'optional'
}>>> = {
  assetItems: [
    { field: 'memberId', mode: 'required' },
    { field: 'categoryId', mode: 'required' },
  ],
  dailyValues: [{ field: 'assetItemId', mode: 'required' }],
  transactions: [
    { field: 'memberId', mode: 'nullable' },
    { field: 'categoryId', mode: 'nullable' },
    { field: 'paymentMethodItemId', mode: 'optional' },
    { field: 'recurSourceId', mode: 'optional' },
    { field: 'subscriptionId', mode: 'optional' },
  ],
  budgets: [{ field: 'categoryId', mode: 'required' }],
  paymentMethodItems: [{ field: 'linkedAssetItemId', mode: 'optional' }],
  subscriptions: [
    { field: 'paymentMethodItemId', mode: 'optional' },
    { field: 'linkedTransactionCategoryId', mode: 'optional' },
  ],
  loans: [{ field: 'linkedAssetItemId', mode: 'optional' }],
  investmentTrades: [{ field: 'memberId', mode: 'nullable' }],
  dividends: [{ field: 'memberId', mode: 'nullable' }],
  accountInterests: [{ field: 'memberId', mode: 'nullable' }],
  merchantAliases: [
    { field: 'categoryId', mode: 'required' },
    { field: 'subscriptionId', mode: 'optional' },
  ],
}

/**
 * 자연 유니크 키(& 인덱스) 테이블 — 두 기기가 같은 논리 레코드를 독립 생성하면
 * 키는 같고 id는 다르다. 인제스트가 id 미스 + 유니크 키 히트를 "같은 행"으로
 * 보고 피어 id를 입양해야 ConstraintError 없이 수렴한다.
 */
const TABLE_UNIQUE_KEYS: Partial<Record<SyncableTable, string>> = {
  merchantAliases: 'merchantKey',
}

/** 클라우드 전용 필드 — Dexie에 저장하지 않는다. */
const INTERNAL_CLOUD_FIELDS = new Set(['__deviceId', '__schemaV', '__uploadedAt', 'syncId'])

/** 로컬 레코드 → 클라우드 페이로드 (undefined 제거 + 스탬프 + 구버전 호환 필드). */
function toCloudPayload(tableName: SyncableTable, record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (value === undefined) continue
    if (key === 'id') continue // 문서 id가 곧 id — syncId 필드로만 노출(구버전 호환)
    out[key] = value
  }
  out.syncId = record.id // 구버전 기기는 syncId 필드로 매칭한다
  const fkDefs = TABLE_FK_FIELDS[tableName]
  if (fkDefs) {
    for (const { field } of fkDefs) {
      const v = record[field]
      // 구버전 호환 컴패니언 — 구버전 resolveFksOnRecord의 Path 1이 이걸 읽는다.
      out[`${field}_syncId`] = typeof v === 'string' && v !== '' ? v : null
    }
  }
  out.__deviceId = getDeviceId()
  out.__schemaV = CLOUD_SCHEMA_VERSION
  // 서버 업로드 시각 — 구버전 기기의 델타 다운로드가 의존한다 (전환기 호환).
  out.__uploadedAt = serverTimestamp()
  return out
}

/**
 * 클라우드 문서 → 로컬 레코드 정규화. 신(v3: 문자열 FK)·구(v2: 숫자 FK +
 * 컴패니언) 형식을 모두 받는다. id를 결정하지 못하면 null.
 */
export function fromCloudDoc(
  tableName: SyncableTable,
  data: Record<string, unknown>,
): Record<string, unknown> | null {
  const id = typeof data.syncId === 'string' && data.syncId ? data.syncId : undefined
  if (!id) return null
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (INTERNAL_CLOUD_FIELDS.has(key)) continue
    if (key.endsWith('_syncId')) continue
    if (key === 'id') continue // 구버전 페이로드의 숫자 로컬 id — 폐기
    out[key] = value
  }
  out.id = id
  const fkDefs = TABLE_FK_FIELDS[tableName]
  if (fkDefs) {
    for (const { field, mode } of fkDefs) {
      const v = out[field]
      if (typeof v === 'string' || v === null) continue // v3 형식 그대로
      // v2 형식: 숫자 FK — 컴패니언(부모의 전역 id)으로 복원
      const companion = data[`${field}_syncId`]
      if (typeof companion === 'string' && companion) {
        out[field] = companion
      } else if (mode === 'nullable') {
        out[field] = null
      } else if (mode === 'optional') {
        delete out[field]
      } else {
        out[field] = ''
      }
    }
  }
  return out
}

// ─── 오류 분류 / 상태 보고 ─────────────────────────────────────────

/**
 * Firestore/네트워크 오류를 사용자가 원인을 알 수 있는 한국어 메시지로 분류한다.
 */
export function classifySyncError(err: unknown): string {
  const code = (err as { code?: string })?.code
  if (code === 'resource-exhausted') {
    return '클라우드 사용량 한도 초과 — 한도가 리셋되면 자동으로 다시 동기화됩니다.'
  }
  if (code === 'permission-denied' || code === 'unauthenticated') {
    return '클라우드 접근 권한 오류 — 로그아웃 후 다시 로그인해 보세요.'
  }
  return '동기화 중 오류가 발생했습니다 — 다음 변경 또는 재접속 시 다시 시도합니다.'
}

function setStatus(status: 'idle' | 'syncing' | 'synced' | 'error' | 'offline', errMessage?: string) {
  const s = useAuthStore.getState()
  s.setSyncStatus(status)
  if (status === 'error') s.setSyncError(errMessage ?? null)
  if (status === 'synced') s.setLastSyncTime(new Date().toISOString())
}

async function refreshPendingCount(): Promise<void> {
  try {
    const count = await countPendingOutbox()
    useAuthStore.getState().setPendingChangesCount(count)
  } catch { /* DB not ready — ignore */ }
}

/** 미푸시 변경 수 — UI '대기 N건'. */
export async function getPendingChangesCount(): Promise<number> {
  return countPendingOutbox()
}

// ─── LWW 충돌 판정 ─────────────────────────────────────────────────

/**
 * 클라우드 버전이 로컬 버전을 덮어써야 하는가 — updatedAt LWW + deviceId
 * 타이브레이커. 시계 오차 허용(±500ms): updatedAt은 기기 로컬 시계로 찍히므로
 * 오차 범위 내 차이는 '동시 기록'으로 보고 deviceId로 결정적으로 판정한다 —
 * 그렇지 않으면 시계 오차만큼 어긋난 동시 기록이 기기마다 다르게 판정되어
 * 발산한다. 창을 좁게 잡은 이유: 사용자가 2초 안에 같은 레코드를 연속 수정하는
 * 일이 흔한데, 넓은 창은 그 '진짜 나중' 수정을 deviceId 순서로 패배시킨다.
 */
const CLOCK_SKEW_TOLERANCE_MS = 500

/** @internal Exported for unit tests (LWW + 시계오차 + echo 억제 회귀). */
export function shouldApplyCloudUpdate(
  cloudUpdatedAt: string | undefined,
  cloudDeviceId: string | undefined,
  localUpdatedAt: string | undefined,
): boolean {
  if (!cloudUpdatedAt) return false
  const cAt = cloudUpdatedAt
  const lAt = localUpdatedAt || ''

  const tiebreak = () => {
    // Echo of our own write (same deviceId) returns false. Higher deviceId wins.
    const peer = cloudDeviceId || ''
    const self = getDeviceId()
    return peer !== '' && peer !== self && peer > self
  }

  const cMs = Date.parse(cAt)
  const lMs = lAt ? Date.parse(lAt) : NaN
  if (!Number.isNaN(cMs) && !Number.isNaN(lMs) && Math.abs(cMs - lMs) <= CLOCK_SKEW_TOLERANCE_MS) {
    return tiebreak()
  }

  if (cAt > lAt) return true
  if (cAt < lAt) return false
  return tiebreak()
}

// ─── Dexie 테이블 매핑 ─────────────────────────────────────────────

type DexieTable = typeof db.members | typeof db.assetCategories | typeof db.assetItems |
  typeof db.dailyValues | typeof db.transactionCategories | typeof db.transactions |
  typeof db.budgets | typeof db.goals | typeof db.paymentMethodItems | typeof db.subscriptions |
  typeof db.loans | typeof db.investmentTrades | typeof db.dividends | typeof db.accountInterests |
  typeof db.merchantAliases

function getLocalTable(tableName: SyncableTable): DexieTable {
  const map: Record<SyncableTable, DexieTable> = {
    members: db.members,
    assetCategories: db.assetCategories,
    assetItems: db.assetItems,
    dailyValues: db.dailyValues,
    transactionCategories: db.transactionCategories,
    transactions: db.transactions,
    budgets: db.budgets,
    goals: db.goals,
    paymentMethodItems: db.paymentMethodItems,
    subscriptions: db.subscriptions,
    loans: db.loans,
    investmentTrades: db.investmentTrades,
    dividends: db.dividends,
    accountInterests: db.accountInterests,
    merchantAliases: db.merchantAliases,
  }
  return map[tableName]
}

// ─── 아웃박스 푸시 엔진 (업로드 경로) ──────────────────────────────
//
// 사용자 쓰기 커밋 → onUserWritePersisted 신호 → requestPush() 디바운스(250ms,
// 연속 입력 마이크로배칭) → flushOutbox(). 페이로드는 푸시 시점의 로컬 최신
// 행에서 읽고(아웃박스는 마커일 뿐), 서버 ack 후 아웃박스 행을 지운다 —
// 단, ack 대기 중 같은 레코드가 또 바뀌었으면(queuedAt 변경) 보존해 재푸시.
// 오프라인이면 commit()이 온라인 복귀까지 pending — SDK 큐가 전송을 보장하고
// 아웃박스 카운트가 '대기 N건'으로 정직하게 표시된다.

let activeUid: string | null = null
let pushTimer: ReturnType<typeof setTimeout> | null = null
let pushInFlight = false
let pushQueued = false
let consecutivePushFailures = 0
const PUSH_DEBOUNCE_MS = 250
const MAX_PUSH_BACKOFF_MS = 5 * 60_000

// poison 레코드(batch.set이 동기 throw — 중첩 undefined/1MB 초과 등) 키 → 그때의
// queuedAt. 같은 queuedAt인 동안은 flush에서 건너뛰어 250ms 핫 루프를 막고,
// 사용자가 그 레코드를 다시 고치면(queuedAt 변경) 자동으로 재시도 대상이 된다.
const _poisonKeys = new Map<string, string>()

/**
 * 아웃박스 푸시를 요청한다 (디바운스 + 실패 시 지수 백오프). 세션이 없으면 no-op.
 * 연속 실패가 쌓이면 재시도 간격을 250ms→…→5분으로 늘려, 쿼터 소진·오프라인
 * 등 지속 오류에서 250ms 핫 루프로 배터리·네트워크·쿼터를 태우지 않는다.
 * 성공(consecutivePushFailures=0) 시에는 즉시(디바운스) 재시도한다.
 */
export function requestPush(): void {
  if (!activeUid) return
  if (pushTimer) return
  const delay = consecutivePushFailures === 0
    ? PUSH_DEBOUNCE_MS
    : Math.min(PUSH_DEBOUNCE_MS * 2 ** consecutivePushFailures, MAX_PUSH_BACKOFF_MS)
  pushTimer = setTimeout(() => {
    pushTimer = null
    const uid = activeUid
    if (uid) void flushOutbox(uid)
  }, delay)
}

// 사용자 쓰기 신호 → 푸시. 모듈 로드 시 1회 구독 (세션 없으면 requestPush가 no-op).
onUserWritePersisted(requestPush)

// ─── 재-주장(re-assert) 큐 ─────────────────────────────────────────
//
// 인제스트에서 "로컬이 더 새로워 클라우드 업데이트를 거부"했는데 그 클라우드
// 문서가 자기 에코가 아니면, 로컬 최신본을 아웃박스에 다시 넣어 재업로드한다.
// 이것이 이 아키텍처의 정확성 축이다: SDK 오프라인 큐가 스테일 setDoc을 서버에
// 그대로 전달해 최신 클라우드를 회귀시킬 수 있는데(fire-and-forget의 본질적
// 대가), 최신본을 가진 기기가 재주장하지 않으면 아무도 회귀를 복구하지 못한다.
// 수렴 보장: 재주장은 max(updatedAt) 또는 (동시 기록 시) 최고 deviceId 재주장자
// 로 종료된다. 에코(cloudDeviceId===self)에는 절대 재주장하지 않으므로 자기
// 푸시가 무한 핑퐁을 만들지 않는다.
const _reassertQueue: SyncOutboxEntry[] = []

function queueReassert(tableName: SyncableTable, localRow: Record<string, unknown>): void {
  const id = localRow.id as string | undefined
  if (!id) return
  const entry: SyncOutboxEntry = {
    key: `${tableName}:${id}`,
    tableName,
    recordId: id,
    op: 'upsert',
    queuedAt: new Date().toISOString(),
  }
  if (tableName === 'dailyValues') {
    entry.assetItemId = localRow.assetItemId as string
    entry.date = localRow.date as string
  }
  _reassertQueue.push(entry)
}

/**
 * 인제스트 후 누적된 재주장 항목을 아웃박스에 반영하고 푸시를 요청한다.
 * @internal Exported for unit tests (재주장 경로 검증용).
 */
export async function drainReassertQueue(): Promise<void> {
  if (_reassertQueue.length === 0) return
  const rows = _reassertQueue.splice(0)
  try {
    // 아웃박스에 이미 더 최신(사용자가 방금 또 고침) 항목이 있으면 덮지 않는다.
    await db.transaction('rw', db.syncOutbox, async () => {
      for (const r of rows) {
        const existing = await db.syncOutbox.get(r.key)
        if (!existing) await db.syncOutbox.put(r)
      }
    })
    requestPush()
  } catch (err) {
    console.error('[sync] re-assert enqueue failed:', err)
  }
}

interface FlushItem {
  entry: SyncOutboxEntry
  /** 업서트 페이로드 (삭제/행 소실이면 undefined) */
  record?: Record<string, unknown>
}

/**
 * 아웃박스 전량을 클라우드로 푸시한다. 동시 실행은 1개로 직렬화하고,
 * 실행 중 재요청은 완료 후 한 번 더 돈다.
 */
export async function flushOutbox(uid: string): Promise<void> {
  if (pushInFlight) { pushQueued = true; return }
  pushInFlight = true
  try {
    const allEntries = await db.syncOutbox.toArray()
    void refreshPendingCount()
    // 같은 queuedAt인 동안 poison 격리된 항목은 건너뛴다 (핫 루프 방지).
    // 편집으로 queuedAt이 바뀌면 격리 해제하고 재시도한다.
    const entries = allEntries.filter(e => {
      const pq = _poisonKeys.get(e.key)
      if (pq === undefined) return true
      if (pq === e.queuedAt) return false
      _poisonKeys.delete(e.key)
      return true
    })
    if (entries.length === 0) return

    const offline = typeof navigator !== 'undefined' && navigator.onLine === false
    setStatus(offline ? 'offline' : 'syncing')

    const dvEntries = entries.filter(e => e.tableName === 'dailyValues')
    const restEntries = entries.filter(e => e.tableName !== 'dailyValues')

    // ① 일반 테이블: 최신 로컬 행 조회 → set / delete(+톰스톤)
    const items: FlushItem[] = []
    const deletedAssetIds: string[] = []
    for (const entry of restEntries) {
      if (entry.op === 'upsert') {
        const row = await (getLocalTable(entry.tableName as SyncableTable) as typeof db.members)
          .get(entry.recordId) as Record<string, unknown> | undefined
        // 행이 그새 삭제됨 → 삭제로 처리 (아웃박스 op는 마지막 훅 기준이라
        // 정상 흐름에선 이미 delete지만, 방어적으로 한 번 더 본다)
        items.push({ entry, record: row })
      } else {
        items.push({ entry })
      }
      if (entry.tableName === 'assetItems' && entry.op === 'delete') {
        deletedAssetIds.push(entry.recordId)
      }
    }

    const now = new Date().toISOString()
    const commits: Promise<void>[] = []
    let batch = writeBatch(firestore)
    let ops = 0
    const flushBatch = () => {
      if (ops > 0) { commits.push(batch.commit()); batch = writeBatch(firestore); ops = 0 }
    }
    // poison 레코드(중첩 undefined/1MB 초과 등으로 batch.set이 동기 throw)가
    // 뒤의 정상 레코드까지 막지 않도록 항목별로 격리한다. 격리된 키는 ack
    // 삭제 대상에서 빼서 아웃박스에 남기지만(대기 N건에 노출), 다음 flush의
    // 다른 항목 진행은 보장한다.
    const poisonedThisRun = new Set<string>()
    const isolate = (entry: SyncOutboxEntry, fn: () => void): void => {
      try { fn() } catch (err) {
        poisonedThisRun.add(entry.key)
        _poisonKeys.set(entry.key, entry.queuedAt)
        console.error(`[sync] poison record isolated (${entry.key}):`, err)
      }
    }

    for (const { entry, record } of items) {
      const table = entry.tableName as SyncableTable
      const before = ops
      if (entry.op === 'upsert' && record) {
        isolate(entry, () => {
          batch.set(doc(firestore, docPath(uid, table, entry.recordId)), toCloudPayload(table, record))
          ops += 1
        })
      } else {
        isolate(entry, () => {
          batch.delete(doc(firestore, docPath(uid, table, entry.recordId)))
          // 전환기 호환: 구버전 기기의 오프라인 삭제 수신용 톰스톤
          batch.set(doc(firestore, docPath(uid, 'syncTombstones', `${table}_${entry.recordId}`)), {
            tableName: table,
            syncId: entry.recordId,
            deletedAt: entry.queuedAt || now,
            __deviceId: getDeviceId(),
            __schemaV: CLOUD_SCHEMA_VERSION,
            __uploadedAt: serverTimestamp(),
          })
          ops += 2
        })
      }
      if (ops > before && ops >= BATCH_OPS_LIMIT) flushBatch()
    }

    // ② dailyValues: (자산×월) 번들 패치 + 삭제 톰스톤(구버전 호환)
    if (dvEntries.length > 0) {
      const upsertIds = dvEntries.filter(e => e.op !== 'delete').map(e => e.recordId)
      const rows = upsertIds.length > 0
        ? (await db.dailyValues.bulkGet(upsertIds)).filter((r): r is DailyValue => !!r)
        : []
      const rowById = new Map(rows.map(r => [r.id, r]))
      const coordPairs: Array<[string, string]> = []
      for (const e of dvEntries) {
        if (e.assetItemId && e.date) coordPairs.push([e.assetItemId, e.date])
      }
      const coordRows = coordPairs.length > 0
        ? await db.dailyValues.where('[assetItemId+date]').anyOf(coordPairs).toArray()
        : []
      const rowByAssetDate = new Map(coordRows.map(r => [`${r.assetItemId}|${r.date}`, r]))

      // projected 행에 매달린 업서트는 드롭 — 동기화 대상이 아니다.
      // (신규 projected는 훅에서 차단되므로 여기 닿는 건 경계 사례뿐)
      const liveDvEntries = dvEntries.filter(e => {
        if (e.op === 'delete') return true
        const row = rowById.get(e.recordId)
          ?? (e.assetItemId && e.date ? rowByAssetDate.get(`${e.assetItemId}|${e.date}`) : undefined)
        return row?.source !== 'projected'
      })

      const { patches, unresolved } = buildBundlePatches(liveDvEntries, rowById, rowByAssetDate, getDeviceId())
      if (unresolved > 0) {
        console.info(`[sync] dailyValues ${unresolved}건은 번들 패치 생략 (자산 삭제/좌표 미상)`)
      }
      for (const p of patches) {
        batch.set(doc(firestore, `users/${uid}/${DV_BUNDLE_COLLECTION}/${encodeDocId(p.bundleKey)}`), {
          bundleKey: p.bundleKey,
          assetItem_syncId: p.assetId,
          month: p.month,
          days: p.days,
          updatedAt: p.maxUpdatedAt,
          __deviceId: getDeviceId(),
          __schemaV: CLOUD_SCHEMA_VERSION,
          __uploadedAt: serverTimestamp(),
        }, { merge: true })
        ops += 1
        if (ops >= BATCH_OPS_LIMIT) flushBatch()
      }
      for (const e of dvEntries) {
        if (e.op !== 'delete') continue
        batch.set(doc(firestore, docPath(uid, 'syncTombstones', `dailyValues_${e.recordId}`)), {
          tableName: 'dailyValues',
          syncId: e.recordId,
          deletedAt: e.queuedAt || now,
          __deviceId: getDeviceId(),
          __schemaV: CLOUD_SCHEMA_VERSION,
          __uploadedAt: serverTimestamp(),
        })
        ops += 1
        if (ops >= BATCH_OPS_LIMIT) flushBatch()
      }
    }

    flushBatch()

    // ③ 자산 삭제 → 그 자산의 번들 문서 cascade 삭제 (오프라인이어도 캐시로 조회됨)
    for (const assetId of deletedAssetIds) {
      commits.push(deleteDvBundlesForAsset(uid, assetId))
    }

    // 서버 ack까지 대기 (오프라인이면 온라인 복귀 시 resolve — SDK 큐가 전송 보장)
    await Promise.all(commits)

    // ④ ack된 항목의 아웃박스 행 제거 — 단, (a) 전송 후 또 바뀐 레코드(queuedAt
    // 변경)와 (b) poison 격리 레코드는 보존한다. 검사+삭제를 단일 트랜잭션으로
    // 묶어, 훅의 post-commit put과의 경쟁으로 새 항목을 지워버리는 창을 없앤다.
    await db.transaction('rw', db.syncOutbox, async () => {
      for (const e of entries) {
        if (poisonedThisRun.has(e.key)) continue
        const current = await db.syncOutbox.get(e.key)
        if (current && current.queuedAt === e.queuedAt && current.op === e.op) {
          await db.syncOutbox.delete(e.key)
        }
      }
    })

    consecutivePushFailures = 0
    setStatus(poisonedThisRun.size > 0 ? 'error' : 'synced',
      poisonedThisRun.size > 0 ? `일부 항목(${poisonedThisRun.size})을 업로드할 수 없어 건너뛰었습니다.` : undefined)
  } catch (err) {
    // batch.commit 실패(네트워크/쿼터 등) — 아웃박스는 통째로 보존되어 다음
    // 백오프 재시도에서 다시 올린다. persistentLocalCache가 이미 오프라인 큐를
    // 소유하므로 대개 온라인 복귀 시 SDK가 스스로 전송한다.
    consecutivePushFailures++
    console.error('[sync] outbox flush failed:', err)
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false
    setStatus(offline ? 'offline' : 'error', offline ? undefined : classifySyncError(err))
  } finally {
    pushInFlight = false
    void refreshPendingCount()
    if (pushQueued) {
      pushQueued = false
      requestPush()
    } else {
      // 아직 미완 항목이 남아있으면 재예약(성공=즉시 디바운스, 실패=지수 백오프).
      // poison 격리 항목만 남았으면 재예약하지 않는다(핫 루프 방지) — 그 레코드가
      // 다시 편집되면 훅이 requestPush를 새로 부른다.
      void db.syncOutbox.toArray().then((rows) => {
        const live = rows.some(r => _poisonKeys.get(r.key) !== r.queuedAt)
        if (live) requestPush()
      }).catch(() => {})
    }
  }
}

/** 자산 삭제 시 그 자산의 번들 문서를 통째로 제거. */
async function deleteDvBundlesForAsset(uid: string, assetId: string): Promise<void> {
  const colRef = collection(firestore, `users/${uid}/${DV_BUNDLE_COLLECTION}`)
  const snap = await getDocs(query(colRef, where('assetItem_syncId', '==', assetId)))
  if (snap.empty) return
  const refs = snap.docs.map(d => d.ref)
  for (let i = 0; i < refs.length; i += BATCH_OPS_LIMIT) {
    const batch = writeBatch(firestore)
    for (const ref of refs.slice(i, i + BATCH_OPS_LIMIT)) batch.delete(ref)
    await batch.commit()
  }
}

// ─── 수동 전량 업로드 / 다운로드 (설정 → 데이터 버튼) ──────────────

/**
 * 로컬 전체를 클라우드로 업로드한다 — 첫 로그인 부트스트랩(빈 클라우드) 및
 * 수동 '로컬→클라우드' 버튼. 문서 단위 전체 교체(set)지만 컬렉션 단위로는
 * merge 의미론 (클라우드에만 있는 문서는 남는다 — 삭제 전파는 아웃박스가 담당).
 */
export async function fullUpload(uid: string): Promise<void> {
  setStatus('syncing')
  try {
    for (const tableName of ALL_TABLES) {
      if (tableName === 'dailyValues') continue // 번들로만 올린다
      const rows = await (getLocalTable(tableName) as typeof db.members).toArray() as unknown as Record<string, unknown>[]
      for (let i = 0; i < rows.length; i += BATCH_OPS_LIMIT) {
        const batch = writeBatch(firestore)
        for (const row of rows.slice(i, i + BATCH_OPS_LIMIT)) {
          if (typeof row.id !== 'string' || !row.id) continue
          batch.set(doc(firestore, docPath(uid, tableName, row.id)), toCloudPayload(tableName, row))
        }
        await batch.commit()
      }
    }
    await uploadAllDvBundles(uid)
    setStatus('synced')
  } catch (err) {
    setStatus('error', classifySyncError(err))
    throw err
  }
}

/**
 * 전량 번들 업로드 — 반드시 merge:true다. 통째 set은 이 기기가 아직
 * 다운로드하지 못한 피어의 일자를 클라우드에서 지워버린다.
 */
async function uploadAllDvBundles(uid: string): Promise<number> {
  // 파생(projected) 행은 클라우드에 올리지 않는다 — 각 기기가 로컬 재생성.
  const rows = (await db.dailyValues.toArray()).filter(r => r.source !== 'projected')
  const { bundles } = buildFullBundles(rows, getDeviceId())
  await commitBundles(uid, bundles)
  return bundles.length
}

async function commitBundles(uid: string, bundles: DvBundlePatch[]): Promise<void> {
  for (let i = 0; i < bundles.length; i += BATCH_OPS_LIMIT) {
    const batch = writeBatch(firestore)
    for (const b of bundles.slice(i, i + BATCH_OPS_LIMIT)) {
      batch.set(doc(firestore, `users/${uid}/${DV_BUNDLE_COLLECTION}/${encodeDocId(b.bundleKey)}`), {
        bundleKey: b.bundleKey,
        assetItem_syncId: b.assetId,
        month: b.month,
        days: b.days,
        updatedAt: b.maxUpdatedAt,
        __deviceId: getDeviceId(),
        __schemaV: CLOUD_SCHEMA_VERSION,
        __uploadedAt: serverTimestamp(),
      }, { merge: true })
    }
    await batch.commit()
  }
}

/**
 * 클라우드 전체를 내려받아 로컬을 교체한다 — 수동 '클라우드→로컬' 버튼.
 * 리스너가 정상일 땐 불필요하지만 복구 수단으로 유지한다.
 */
export async function fullDownload(uid: string): Promise<void> {
  setStatus('syncing')
  try {
    // ① 먼저 모든 컬렉션을 **서버에서** 읽어 메모리에 모은다 (아무 것도 아직
    //    변경하지 않는다). getDocsFromServer는 오프라인이면 throw하므로,
    //    캐시의 스테일/빈 스냅샷으로 로컬을 교체하는 사고가 원천 차단된다.
    //    한 컬렉션이라도 실패하면 예외로 abort — 로컬·아웃박스 무변경.
    const tableRecords = new Map<SyncableTable, Record<string, unknown>[]>()
    for (const tableName of ALL_TABLES) {
      if (tableName === 'dailyValues') continue // 아래 번들 경로에서 처리
      const snap = await getDocsFromServer(collection(firestore, colPath(uid, tableName)))
      const records: Record<string, unknown>[] = []
      for (const d of snap.docs) {
        const rec = fromCloudDoc(tableName, d.data())
        if (rec) records.push(rec)
      }
      tableRecords.set(tableName, records)
    }
    const bundleSnap = await getDocsFromServer(collection(firestore, `users/${uid}/${DV_BUNDLE_COLLECTION}`))
    const legacyDvRows: DailyValue[] = []
    if (legacyDvActive) {
      const legacySnap = await getDocsFromServer(collection(firestore, colPath(uid, 'dailyValues')))
      for (const d of legacySnap.docs) {
        const rec = fromCloudDoc('dailyValues', d.data()) as unknown as DailyValue | null
        if (rec && rec.source !== 'projected') legacyDvRows.push(rec)
      }
    }

    // ② 서버 조회가 전부 성공한 뒤에야 로컬을 교체한다. 로컬을 클라우드로
    //    교체하므로 미푸시 아웃박스도 비운다 — 잔여 upsert 마커가 "행 없음 →
    //    삭제"로 오판되어 방금 받은 클라우드 문서를 지우는 사고를 막는다.
    //    (이 버튼의 의미 자체가 "클라우드가 진실"이다)
    const { drainChangeTracking } = await import('@/services/database')
    await drainChangeTracking()
    await db.syncOutbox.clear()

    for (const [tableName, records] of tableRecords) {
      const table = getLocalTable(tableName)
      await runSyncWrite([table], async () => {
        await (table as typeof db.members).clear()
        if (records.length > 0) {
          await (table as typeof db.members).bulkPut(records as never[])
        }
      })
    }

    // dailyValues: 로컬 전체 재구성 (번들 + 레거시 비-projected)
    await runSyncWrite([db.dailyValues], async () => {
      await db.dailyValues.clear()
    })
    for (const d of bundleSnap.docs) {
      await ingestDvBundleDoc(d.data())
    }
    if (legacyDvRows.length > 0) {
      await runSyncWrite([db.dailyValues], async () => {
        for (const row of legacyDvRows) {
          const existing = await db.dailyValues
            .where('[assetItemId+date]').equals([row.assetItemId, row.date]).first()
          if (!existing) await db.dailyValues.put(row)
        }
      })
    }
    setStatus('synced')
  } catch (err) {
    setStatus('error', classifySyncError(err))
    throw err
  }
}

// ─── dailyValues 번들 / 레거시 마이그레이션 상태 ───────────────────

/**
 * 레거시 dailyValues 컬렉션이 아직 살아있는가. 마커 문서가 설정되기 전까지
 * true — 리스너가 레거시 컬렉션도 읽는다. 세션 시작 시 1회 갱신.
 */
let legacyDvActive = true
export function isLegacyDvActive(): boolean { return legacyDvActive }

const dvMigrationDocPath = (uid: string) => `users/${uid}/syncControl/dvMigration`

async function refreshDvMigrationState(uid: string): Promise<void> {
  try {
    const snap = await getDoc(doc(firestore, dvMigrationDocPath(uid)))
    legacyDvActive = !(snap.exists() && snap.data()?.legacyCleared === true)
  } catch {
    // 마커를 못 읽으면 보수적으로 레거시 읽기를 유지한다 (정확성 우선)
  }
}

/**
 * Phase B — 레거시 per-row dailyValues 컬렉션 정리. 순서가 안전의 전부다:
 * ① 전량 번들 업로드(완전한 진실 확보) → ② 레거시 문서 삭제 → ③ 마커.
 * ⚠️ 구버전 기기의 리스너는 레거시 문서 삭제를 'removed'로 받아 로컬 행을
 * 지운다 — 반드시 모든 기기가 신버전으로 업데이트된 후 실행할 것.
 */
export async function purgeLegacyDailyValues(uid: string): Promise<{ bundles: number; deleted: number }> {
  const bundles = await uploadAllDvBundles(uid)

  const colRef = collection(firestore, colPath(uid, 'dailyValues'))
  const snap = await getDocs(colRef)
  const refs = snap.docs.map(d => d.ref)
  for (let i = 0; i < refs.length; i += BATCH_OPS_LIMIT) {
    const batch = writeBatch(firestore)
    for (const ref of refs.slice(i, i + BATCH_OPS_LIMIT)) batch.delete(ref)
    await batch.commit()
  }

  await setDoc(doc(firestore, dvMigrationDocPath(uid)), {
    legacyCleared: true,
    clearedAt: new Date().toISOString(),
    __deviceId: getDeviceId(),
  })
  legacyDvActive = false
  // 레거시 dailyValues 리스너를 내리고 번들 리스너만 남긴다
  startRealtimeSync(uid, true)
  return { bundles, deleted: refs.length }
}

/**
 * 번들 문서 1개를 로컬 행으로 풀어 적용 (리스너/전량 다운로드 공용).
 *
 * 일자 단위 LWW는 shouldApplyCloudUpdate를 그대로 쓴다. v=null은 좌표 기반
 * 삭제 마커. 행의 id는 클라우드 sid를 입양한다 — 모든 기기가 같은 논리 행에
 * 같은 id를 갖게 되어 이후 갱신/삭제가 정확히 매칭된다.
 *
 * FK가 문자열이므로 부모 자산이 아직 로컬에 없어도 행을 쓸 수 있다 — UI 조인이
 * 자산 도착 시점부터 자연스럽게 표시한다 (보류 큐 불필요).
 * @internal Exported for unit tests.
 */
export async function ingestDvBundleDoc(data: Record<string, unknown>): Promise<void> {
  const exploded = explodeBundleDoc(data)
  if (!exploded) return // malformed — 재시도 무의미
  const assetItemId = exploded.assetId

  await runSyncWrite([db.dailyValues], async () => {
    for (const day of exploded.days) {
      // 클라우드의 projected(파생) 값 튜플은 무시한다 — 각 기기가 로컬 재생성.
      // 삭제 마커(v===null)는 source와 무관하게 적용해야 하므로 v!==null일 때만.
      if (day.v !== null && day.s === 'projected') continue

      const existing = await db.dailyValues
        .where('[assetItemId+date]').equals([assetItemId, day.date]).first()

      if (day.v === null) {
        // 삭제 마커 — 좌표로 매칭, LWW로 보호 (로컬이 더 새로우면 보존)
        if (existing && shouldApplyCloudUpdate(day.u, day.d, existing.updatedAt)) {
          await db.dailyValues.delete(existing.id)
        }
        continue
      }

      if (!existing) {
        await db.dailyValues.put({
          id: day.sid,
          assetItemId,
          date: day.date,
          value: day.v,
          source: (day.s ?? undefined) as DailyValue['source'],
          createdAt: day.u,
          updatedAt: day.u,
        })
      } else {
        // 들어온 것은 앵커(여기 닿는 day.s는 projected가 아님: 위에서 스킵됨).
        // 로컬이 projected면 타임스탬프와 무관하게 앵커가 이긴다 — 로컬 재생성
        // projected의 새 타임스탬프가 더 오래된 피어 manual 앵커를 영구히
        // 가리는 것을 막는다. 앵커↔앵커는 일반 일자 LWW.
        const anchorOverProjected = existing.source === 'projected'
        if (anchorOverProjected || shouldApplyCloudUpdate(day.u, day.d, existing.updatedAt)) {
          if (existing.id !== day.sid) {
            // sid 입양 — PK 교체는 delete+put
            await db.dailyValues.delete(existing.id)
            await db.dailyValues.put({
              id: day.sid,
              assetItemId,
              date: day.date,
              value: day.v,
              source: (day.s ?? undefined) as DailyValue['source'],
              createdAt: existing.createdAt,
              updatedAt: day.u,
            })
          } else {
            await db.dailyValues.update(existing.id, {
              value: day.v,
              source: (day.s ?? undefined) as DailyValue['source'],
              updatedAt: day.u,
            })
          }
        } else if (existing.source !== 'projected' && day.d && day.d !== getDeviceId()) {
          // 로컬 앵커가 더 새로워 클라우드 앵커 튜플을 거부했고 에코가 아니면,
          // 로컬 최신 일자 값을 재주장해 번들을 수렴시킨다 (C2/H1의 dv 경로).
          queueReassert('dailyValues', existing as unknown as Record<string, unknown>)
        }
      }
    }
  })
}

// ─── 실시간 리스너 (다운로드 경로) ─────────────────────────────────

let unsubscribers: Unsubscribe[] = []
let realtimeSyncPaused = false
let syncGeneration = 0
let activeListenerUid: string | null = null

// 테이블별 마지막 스냅샷 시각. 전역 단일 타임스탬프를 쓰면 살아 있는 리스너
// 하나가 죽은 리스너의 staleness를 가려 헬스체크가 영원히 복구하지 못한다 —
// 최솟값(가장 오래된 테이블)으로 판정해야 한다.
const lastSnapshotByTable = new Map<string, number>()

export function pauseRealtimeSync() { realtimeSyncPaused = true }
export function resumeRealtimeSync() { realtimeSyncPaused = false }

/**
 * 가장 오래된(가장 stale한) 리스너의 마지막 스냅샷 시각(ms epoch).
 * 구독이 없으면 0 — 호출부는 Infinity age로 취급한다.
 */
export function getLastSnapshotAt() {
  if (lastSnapshotByTable.size === 0) return 0
  let min = Infinity
  for (const v of lastSnapshotByTable.values()) min = Math.min(min, v)
  return min
}

// 인제스트 트랜잭션 청크 크기 — 초기 스냅샷(수천 docChanges)을 단일 rw
// 트랜잭션으로 처리하면 그 테이블에 대한 사용자 쓰기가 전체 기간 동안 직렬
// 대기한다. 청크 단위로 쪼개 쓰기 락 점유를 짧게 유지한다.
const INGEST_CHUNK_SIZE = 300

/**
 * 클라우드 문서 변경 1건을 로컬에 적용한다 (runSyncWrite 트랜잭션 안에서 호출).
 * @returns true = 로컬에 실제 변경 적용됨 (echo/LWW 스킵이면 false)
 */
async function applyCloudChangeInTx(
  tableName: SyncableTable,
  changeType: 'added' | 'modified' | 'removed',
  cloudData: Record<string, unknown>,
): Promise<boolean> {
  const localTable = getLocalTable(tableName)

  if (changeType === 'removed') {
    // dailyValues 레거시 컬렉션의 removed는 무시한다 — 일별 가치의 삭제
    // 전파는 번들 v=null 마커가 담당하고, 레거시 문서 대량 제거는
    // '저장 구조 최적화'(purge)가 일으키는 이벤트다.
    if (tableName === 'dailyValues') return false
    const removedId = typeof cloudData.syncId === 'string' ? cloudData.syncId : null
    if (!removedId) return false
    const localRow = await (localTable as typeof db.members).get(removedId)
    if (!localRow) return false
    await (localTable as typeof db.members).delete(removedId)
    return true
  }

  // 레거시 dailyValues 컬렉션의 projected는 동기화 범위 밖.
  if (tableName === 'dailyValues'
      && (cloudData as { source?: string }).source === 'projected') return false
  const record = fromCloudDoc(tableName, cloudData)
  if (!record) return false
  // 좌표 복원 불가한 레거시 dv 행(컴패니언 소실)은 쓰레기 — 버린다.
  if (tableName === 'dailyValues'
      && (typeof record.assetItemId !== 'string' || record.assetItemId === '')) return false
  const id = record.id as string

  let existing = await (localTable as typeof db.members).get(id) as
    Record<string, unknown> | undefined
  let adoptFromId: string | null = null
  // id 미스 + 유니크 키 히트 ⇒ 다른 기기가 만든 같은 논리 행.
  // 피어 id를 입양해 수렴시킨다 (put 하면 유니크 인덱스 충돌).
  if (!existing) {
    const uniqueKeyField = TABLE_UNIQUE_KEYS[tableName]
    const keyVal = uniqueKeyField ? (record as Record<string, unknown>)[uniqueKeyField] : undefined
    if (uniqueKeyField && keyVal != null) {
      const byKey = await (localTable as typeof db.members)
        .where(uniqueKeyField).equals(keyVal as string).first() as
        Record<string, unknown> | undefined
      if (byKey) {
        existing = byKey
        adoptFromId = byKey.id as string
      }
    }
  }

  const cloudDeviceId = cloudData.__deviceId as string | undefined
  if (existing) {
    if (!shouldApplyCloudUpdate(cloudData.updatedAt as string, cloudDeviceId, existing.updatedAt as string)) {
      // 로컬을 유지했다. 이게 자기 에코가 아니면(다른 기기가 스테일 문서로
      // 클라우드를 회귀시킨 경우) 로컬 최신본을 재주장해 클라우드를 수렴시킨다.
      // 에코(cloudDeviceId===self)에는 재주장하지 않아 자기 푸시가 무한 핑퐁을
      // 만들지 않는다. (C2/H1: 업로드 방향 LWW 부재 복구)
      if (cloudDeviceId && cloudDeviceId !== getDeviceId()) {
        queueReassert(tableName, existing)
      }
      return false
    }
    if (adoptFromId && adoptFromId !== id) {
      await (localTable as typeof db.members).delete(adoptFromId)
    }
  }
  // put = 전체 교체 — 피어에서 지워진 필드가 로컬에 잔존하지 않는다.
  await (localTable as typeof db.members).put(record as never)
  return true
}

/**
 * 클라우드 문서 변경 1건을 자체 트랜잭션으로 적용한다.
 * @internal Exported for unit tests (리스너 인제스트 경로의 단위 검증용).
 */
export async function applyCloudChange(
  tableName: SyncableTable,
  changeType: 'added' | 'modified' | 'removed',
  cloudData: Record<string, unknown>,
): Promise<boolean> {
  return runSyncWrite([getLocalTable(tableName)], () =>
    applyCloudChangeInTx(tableName, changeType, cloudData))
}

function subscribeTable(uid: string, tableName: SyncableTable, generation: number, retryCount = 0): void {
  const colRef = collection(firestore, colPath(uid, tableName))
  let hadSnapshot = false
  const unsub = onSnapshot(colRef, { includeMetadataChanges: true }, async (snapshot) => {
    hadSnapshot = true
    // 서버가 확인한 스냅샷만 staleness 타이머를 리셋한다 — persistentLocalCache는
    // 재구독 직후 캐시 전용 스냅샷(fromCache=true)을 즉시 발화하는데, 이것까지
    // 신선함으로 치면 '캐시만 살아있는 죽은 서버 채널'을 헬스체크가 못 잡는다.
    if (!snapshot.metadata.fromCache) {
      lastSnapshotByTable.set(tableName, Date.now())
    }
    if (realtimeSyncPaused) return

    const docChanges = snapshot.docChanges()
    if (docChanges.length === 0) return // metadata-only 발화 등

    const localTable = getLocalTable(tableName)
    // 실제 로컬 변경이 있을 때만 UI에 알린다 — 자기 업로드의 echo(LWW 스킵)에
    // fin-sync-update를 쏘면 대량 업로드 동안 소비자가 전부 깜빡인다.
    let appliedCount = 0

    try {
      for (let chunkStart = 0; chunkStart < docChanges.length; chunkStart += INGEST_CHUNK_SIZE) {
        const chunk = docChanges.slice(chunkStart, chunkStart + INGEST_CHUNK_SIZE)
        await runSyncWrite([localTable], async () => {
          for (const change of chunk) {
            try {
              if (await applyCloudChangeInTx(tableName, change.type, change.doc.data())) {
                appliedCount++
              }
            } catch (err) {
              console.error(`[sync] real-time ${tableName} ${change.type} error:`, err)
            }
          }
        })
      }
    } catch (err) {
      // 트랜잭션 자체가 abort된 드문 경우 — 다음 스냅샷/재구독이 수습한다.
      console.error(`[sync] real-time ${tableName} ingest transaction failed:`, err)
    }

    // 스테일 클라우드 문서를 거부한 레코드를 재주장(로컬 최신본 재업로드).
    await drainReassertQueue()

    if (appliedCount > 0) {
      window.dispatchEvent(new CustomEvent('fin-sync-update', { detail: { table: tableName } }))
    }
  }, (err) => {
    console.error(`[sync] ${tableName} listener error:`, err)
    // 무한 재연결 (지수 백오프, 최대 30초). generation 가드로
    // stopRealtimeSync 이후의 유령 재구독은 차단.
    if (syncGeneration === generation) {
      const nextRetry = hadSnapshot ? 0 : retryCount + 1
      const delay = Math.min(Math.pow(2, nextRetry) * 1000, 30000)
      setTimeout(() => {
        if (syncGeneration === generation) {
          subscribeTable(uid, tableName, generation, nextRetry)
        }
      }, delay)
    }
  })
  unsubscribers.push(unsub)
}

/** 번들 컬렉션 실시간 구독 — subscribeTable과 동일한 생존/백오프 규약. */
function subscribeDvBundles(uid: string, generation: number, retryCount = 0): void {
  const colRef = collection(firestore, `users/${uid}/${DV_BUNDLE_COLLECTION}`)
  let hadSnapshot = false
  const unsub = onSnapshot(colRef, { includeMetadataChanges: true }, async (snapshot) => {
    hadSnapshot = true
    if (!snapshot.metadata.fromCache) {
      lastSnapshotByTable.set(DV_BUNDLE_COLLECTION, Date.now())
    }
    if (realtimeSyncPaused) return

    const docChanges = snapshot.docChanges()
    if (docChanges.length === 0) return

    let appliedCount = 0
    for (const change of docChanges) {
      const data = change.doc.data()
      try {
        if (change.type === 'added' || change.type === 'modified') {
          await ingestDvBundleDoc(data)
          appliedCount++
        } else if (change.type === 'removed') {
          // 번들 제거 = 자산 cascade 삭제(또는 빈 달 정리). 로컬의 해당
          // 자산×월 행을 제거한다.
          const assetId = data.assetItem_syncId as string | undefined
          const month = data.month as string | undefined
          if (assetId && month) {
            await runSyncWrite([db.dailyValues], async () => {
              await db.dailyValues
                .where('[assetItemId+date]')
                .between([assetId, `${month}-00`], [assetId, `${month}-99`])
                .delete()
            })
            appliedCount++
          }
        }
      } catch (err) {
        console.error(`[sync] dv bundle ${change.type} ingest error:`, err)
      }
    }

    // 스테일 클라우드 일자 튜플을 거부한 앵커를 재주장한다.
    await drainReassertQueue()

    if (appliedCount > 0) {
      window.dispatchEvent(new CustomEvent('fin-sync-update', { detail: { table: 'dailyValues' } }))
    }
  }, (err) => {
    console.error('[sync] dv bundles listener error:', err)
    if (syncGeneration === generation) {
      const nextRetry = hadSnapshot ? 0 : retryCount + 1
      const delay = Math.min(Math.pow(2, nextRetry) * 1000, 30000)
      setTimeout(() => {
        if (syncGeneration === generation) {
          subscribeDvBundles(uid, generation, nextRetry)
        }
      }, delay)
    }
  })
  unsubscribers.push(unsub)
}

/**
 * (Re)start Firestore real-time listeners.
 *
 * @param uid   Authenticated user id.
 * @param force Force a tear-down + re-subscribe even if listeners appear to
 *              already be active for this uid (silent-stale recovery).
 */
export function startRealtimeSync(uid: string, force: boolean = false): void {
  if (!force && activeListenerUid === uid && unsubscribers.length > 0) return

  stopRealtimeSync()
  activeListenerUid = uid
  activeUid = uid
  syncGeneration++
  realtimeSyncPaused = false
  const gen = syncGeneration

  // 구독 시점을 staleness baseline으로 깐다 — 초기 스냅샷이 아직 안 온
  // 테이블이 즉시 stale(Infinity age)로 판정되어 재시작 루프가 돌지 않게.
  const now = Date.now()
  for (const tableName of ALL_TABLES) {
    // 레거시 dailyValues는 정리(purge) 후 구독하지 않는다 — 일별가치
    // 실시간은 번들 리스너가 담당.
    if (tableName === 'dailyValues' && !legacyDvActive) continue
    lastSnapshotByTable.set(tableName, now)
    subscribeTable(uid, tableName, gen)
  }

  // 일별가치 번들 (자산×월 묶음) 실시간 구독
  lastSnapshotByTable.set(DV_BUNDLE_COLLECTION, now)
  subscribeDvBundles(uid, gen)
}

export function stopRealtimeSync(): void {
  activeListenerUid = null
  activeUid = null
  syncGeneration++
  for (const unsub of unsubscribers) {
    unsub()
  }
  unsubscribers = []
  lastSnapshotByTable.clear()
  if (pushTimer) { clearTimeout(pushTimer); pushTimer = null }
}

// ─── 로그인 오케스트레이션 ─────────────────────────────────────────

/**
 * 클라우드에 데이터가 하나라도 있는가 — 15개 컬렉션 + 번들 limit(1) 프로브.
 * **서버에서** 읽는다: 오프라인/빈 캐시를 '클라우드가 비었다'로 오판해 최초
 * 부트스트랩 fullUpload를 잘못 트리거하면, 재접속 시 로컬(구버전일 수 있음)이
 * 피어의 최신 클라우드를 덮어쓰는 churn 을 만든다. getDocsFromServer는
 * 오프라인이면 throw → 호출부가 부트스트랩을 건너뛴다(보수적: 확인 못 하면 안 함).
 */
async function cloudHasAnyData(uid: string): Promise<boolean> {
  const probes = [...ALL_TABLES.map(t => colPath(uid, t)), `users/${uid}/${DV_BUNDLE_COLLECTION}`]
  for (const path of probes) {
    const snap = await getDocsFromServer(query(collection(firestore, path), limit(1)))
    if (!snap.empty) return true
  }
  return false
}

/** 로컬에 사용자 데이터가 있는가 (시드 기본값 제외 휴리스틱). */
async function localHasUserData(): Promise<boolean> {
  const counts = await Promise.all([
    db.transactions.count(),
    db.assetItems.count(),
    db.dailyValues.count(),
    db.subscriptions.count(),
    db.loans.count(),
    db.budgets.count(),
    db.goals.count(),
  ])
  return counts.some(c => c > 0)
}

/**
 * 로그인 시 동기화 세션을 시작한다:
 *   1. dv 레거시 마커 확인
 *   2. 클라우드가 비었고 로컬에 데이터가 있으면 → 최초 부트스트랩 fullUpload
 *   3. 실시간 리스너 시작 (초기 스냅샷 = 베이스라인, resume token = 델타)
 *   4. 아웃박스 잔량 푸시 (지난 세션에서 못 보낸 변경)
 *
 * 구 엔진의 mergeOnLogin(전량/델타 다운로드 + 3-way 머지)은 폐기 —
 * persistentLocalCache 리스너가 같은 일을 SDK 수준에서 한다.
 */
export async function startSyncSession(uid: string): Promise<void> {
  setStatus('syncing')
  try {
    await refreshDvMigrationState(uid)

    // 최초 부트스트랩(빈 클라우드 + 로컬 데이터 → 전량 업로드)은 서버 확인이
    // 필수다. 오프라인이면 cloudHasAnyData가 throw → 부트스트랩을 건너뛰고
    // 정상 진행한다(리스너/아웃박스가 온라인 복귀 시 수렴시킨다). 확인 없이
    // 업로드하면 스테일 로컬이 피어 최신본을 덮을 수 있다.
    try {
      const localHas = await localHasUserData()
      if (localHas && !(await cloudHasAnyData(uid))) {
        console.info('[sync] 빈 클라우드 + 로컬 데이터 → 최초 전량 업로드')
        await fullUpload(uid)
      }
    } catch (bootErr) {
      console.info('[sync] 부트스트랩 프로브 생략 (오프라인/서버 미확인):', (bootErr as Error)?.message)
    }

    startRealtimeSync(uid)
    void flushOutbox(uid)
    setStatus('synced')
  } catch (err) {
    console.error('[sync] login session start failed:', err)
    setStatus('error', classifySyncError(err))
    // 리스너는 그래도 시작한다 — 부트스트랩 실패가 실시간 수신까지 막을 이유는 없다.
    startRealtimeSync(uid)
  }
}
