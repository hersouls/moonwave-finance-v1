import { create } from 'zustand'
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  GoogleAuthProvider,
  type User,
} from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { startSyncSession, stopRealtimeSync, getPendingChangesCount } from '@/services/firestoreSync'

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'offline'

interface AuthUser {
  uid: string
  email: string
  displayName: string
  photoURL: string
}

interface AuthState {
  user: AuthUser | null
  isLoading: boolean
  isSigningIn: boolean
  syncStatus: SyncStatus
  lastSyncTime: string | null
  pendingChangesCount: number
  /** syncStatus==='error'일 때 사용자에게 보여줄 분류된 원인 (쿼터/권한/네트워크). */
  syncErrorMessage: string | null
  error: string | null
  initialize: () => void
  login: () => Promise<void>
  /**
   * 로그아웃. 미동기화 변경이 남아 있으면 데이터 손실 방지를 위해:
   *   - 온라인이면 먼저 flushOutbox로 클라우드에 밀어낸 뒤 wipe한다.
   *   - 그래도(오프라인 등) 미동기화가 남으면 PendingSyncError를 throw해
   *     호출부가 사용자에게 확인을 받게 한다. force=true면 경고 없이 진행.
   */
  logout: (force?: boolean) => Promise<void>
  manualUpload: () => Promise<void>
  manualDownload: () => Promise<void>
  setSyncStatus: (status: SyncStatus) => void
  setSyncError: (message: string | null) => void
  setLastSyncTime: (time: string) => void
  setPendingChangesCount: (count: number) => void
  updatePendingCount: () => Promise<void>
}

function toAuthUser(u: User): AuthUser {
  return {
    uid: u.uid,
    email: u.email || '',
    displayName: u.displayName || '',
    photoURL: u.photoURL || '',
  }
}

/** 이 기기 로컬(Dexie) 데이터를 소유한 계정 uid 마커 — 교차 계정 오염 가드. */
const OWNER_UID_KEY = 'fin:ownerUid'

function readOwnerUid(): string | null {
  try {
    return localStorage.getItem(OWNER_UID_KEY)
  } catch {
    return null
  }
}

function writeOwnerUid(uid: string | null): void {
  try {
    if (uid === null) localStorage.removeItem(OWNER_UID_KEY)
    else localStorage.setItem(OWNER_UID_KEY, uid)
  } catch {
    // localStorage 접근 불가 환경 — 가드 없이 기존 동작으로 진행
  }
}

/**
 * 교차 계정 데이터 오염 가드. 저장된 소유자 uid가 현재 로그인 uid와 다르면
 * (비대화형 로그아웃 후 다른 계정 로그인 등) 이전 사용자의 로컬 데이터와
 * 동기화 아웃박스를 지운 뒤 마커를 갱신한다. 지우지 않으면 startSyncSession
 * 부트스트랩이 이전 계정의 데이터를 새 계정 클라우드로 전량 업로드할 수 있다.
 * auth-null 시점에는 지우지 않는다 — 같은 사용자가 다시 로그인할 수 있으므로,
 * 다음 로그인 시 이 불일치 검사가 가드 역할을 한다.
 */
async function ensureLocalDataOwner(uid: string): Promise<void> {
  const stored = readOwnerUid()
  if (stored && stored !== uid) {
    // clearAllData는 in-flight 기록을 드레인한 뒤 syncOutbox까지 비운다.
    const { clearAllData } = await import('@/services/database')
    await clearAllData()
  }
  if (stored !== uid) writeOwnerUid(uid)
}

async function reloadStoresAfterSync() {
  const { useSubscriptionStore } = await import('@/stores/subscriptionStore')
  const { useTransactionStore } = await import('@/stores/transactionStore')
  const { useAssetStore } = await import('@/stores/assetStore')
  const { useMemberStore } = await import('@/stores/memberStore')
  const { useGoalStore } = await import('@/stores/goalStore')
  const { useDailyValueStore } = await import('@/stores/dailyValueStore')
  const { useLoanStore } = await import('@/stores/loanStore')
  await Promise.all([
    useSubscriptionStore.getState().loadSubscriptions(),
    useTransactionStore.getState().loadTransactions(),
    useTransactionStore.getState().loadPaymentMethodItems(),
    useTransactionStore.getState().loadCategories(),
    useAssetStore.getState().loadAll(),
    useMemberStore.getState().loadMembers(),
    useGoalStore.getState().loadGoals(),
    useDailyValueStore.getState().loadValues(),
    useLoanStore.getState().loadLoans(),
  ])
  // 동기화로 받은 앵커(manual/레거시)로 파생(projected) 시리즈를 로컬에서
  // 재구성한다 (projected는 클라우드에 없음). force=true로 첫 동기화 직후
  // 즉시 재생성(일일 가드 무시).
  try {
    await useDailyValueStore.getState().regenerateProjections(true)
  } catch (err) {
    console.error('[sync] projection regen after sync failed:', err)
  }
}

let hasSyncedOnLogin = false

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  isLoading: false,
  isSigningIn: false,
  syncStatus: 'idle',
  lastSyncTime: null,
  pendingChangesCount: 0,
  syncErrorMessage: null,
  error: null,

  initialize: () => {
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) set({ isSigningIn: false })
      })
      .catch((err) => {
        console.error('Redirect result error:', err)
        set({ isSigningIn: false, error: 'Google 로그인에 실패했습니다.' })
      })

    onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const authUser = toAuthUser(firebaseUser)

        // 교차 계정 가드: 이전 계정의 로컬 데이터가 남아 있으면 동기화·스토어
        // 로드보다 먼저 wipe를 완료한다 (아래 startSyncSession 부트스트랩이
        // 잔존 데이터를 새 계정 클라우드로 업로드하는 것을 차단).
        try {
          await ensureLocalDataOwner(authUser.uid)
        } catch (ownerErr) {
          console.error('이전 계정 로컬 데이터 정리 실패:', ownerErr)
          // wipe 실패 상태로 동기화를 시작하면 교차 계정 업로드 위험이
          // 그대로이므로 로그인 진행을 중단한다 (마커는 갱신하지 않음 —
          // 새로고침/재로그인 시 재시도).
          set({
            isLoading: false,
            isSigningIn: false,
            error: '이전 계정의 로컬 데이터 정리에 실패했습니다. 페이지를 새로고침한 뒤 다시 로그인해주세요.',
          })
          return
        }

        const currentUser = get().user

        // Only update state if user actually changed (skip token refreshes)
        if (!currentUser || currentUser.uid !== authUser.uid) {
          set({ user: authUser, isLoading: false, isSigningIn: false })
        } else if (get().isSigningIn) {
          set({ isSigningIn: false })
        }

        // Sync on login: only run once per session (skip token refreshes)
        if (!hasSyncedOnLogin) {
          hasSyncedOnLogin = true
          try {
            // 동기화 세션 시작 — 빈 클라우드 부트스트랩 + 리스너 + 아웃박스 푸시.
            // 다운로드는 리스너 초기 스냅샷이 담당한다 (resume token = 델타).
            await startSyncSession(authUser.uid)
            // 클라우드 스냅샷 수신 후 누락 기본값 보충 (idempotent).
            const { ensureDefaultCategories } = await import('@/services/database')
            await ensureDefaultCategories()
            await reloadStoresAfterSync()
            get().updatePendingCount()
          } catch (err) {
            console.error('Sync on login failed:', err)
            set({ syncStatus: 'error' })
          }
          // 기기 presence 등록 (설정 → 내 기기 목록) — 실패해도 무해.
          void import('@/services/deviceRegistry')
            .then(({ registerDevicePresence }) => registerDevicePresence(authUser.uid))
            .catch(() => {})
        }
      } else {
        hasSyncedOnLogin = false
        stopRealtimeSync()
        set({ user: null, isLoading: false, syncStatus: 'idle', lastSyncTime: null })
      }
    })
  },

  login: async () => {
    const provider = new GoogleAuthProvider()
    set({ error: null, isSigningIn: true })
    try {
      await signInWithPopup(auth, provider)
    } catch (err: unknown) {
      const firebaseErr = err as { code?: string }
      if (
        firebaseErr.code === 'auth/popup-blocked' ||
        firebaseErr.code === 'auth/popup-closed-by-user' ||
        firebaseErr.code === 'auth/cancelled-popup-request' ||
        firebaseErr.code === 'auth/internal-error'
      ) {
        try {
          await signInWithRedirect(auth, provider)
          return
        } catch (redirectErr) {
          const message = redirectErr instanceof Error ? redirectErr.message : '로그인에 실패했습니다.'
          set({ error: message, isSigningIn: false })
        }
      } else {
        const message = err instanceof Error ? err.message : '로그인에 실패했습니다.'
        set({ error: message, isSigningIn: false })
      }
    }
  },

  logout: async (force = false) => {
    const { user } = get()
    // 데이터 손실 방지 가드: wipe 전에 미동기화 변경을 클라우드로 밀어낸다.
    if (!force && user) {
      const { flushOutbox, getPendingChangesCount } = await import('@/services/firestoreSync')
      let pending = await getPendingChangesCount().catch(() => 0)
      if (pending > 0) {
        const online = typeof navigator === 'undefined' || navigator.onLine !== false
        if (online) {
          try { await flushOutbox(user.uid) } catch { /* 아래에서 재확인 */ }
          pending = await getPendingChangesCount().catch(() => pending)
        }
        if (pending > 0) {
          // 온라인 flush로도 남았거나 오프라인 — 조용히 파괴하지 않는다.
          const err = new Error(`동기화되지 않은 변경 ${pending}건이 있습니다.`) as Error & { code?: string; pending?: number }
          err.code = 'auth/pending-sync'
          err.pending = pending
          throw err
        }
      }
    }
    try {
      stopRealtimeSync()
      await signOut(auth)
      // Wipe local Dexie data so the previously signed-in user's financial
      // records aren't visible on this device after logout. Cloud data in
      // Firestore is preserved and re-synced on next login.
      try {
        const { clearAllData } = await import('@/services/database')
        await clearAllData()
        // wipe 성공 시에만 소유자 마커 해제 — 실패하면 마커가 남아
        // 다음 로그인의 교차 계정 검사가 잔존 데이터를 정리한다.
        writeOwnerUid(null)
      } catch (clearErr) {
        console.error('Failed to clear local data on logout:', clearErr)
      }
      set({
        user: null,
        syncStatus: 'idle',
        lastSyncTime: null,
        error: null,
        pendingChangesCount: 0,
        syncErrorMessage: null,
      })
      // Hard reload to reset every in-memory Zustand store and React tree
      // so no UI keeps rendering stale data from before logout.
      window.location.reload()
    } catch (err) {
      const message = err instanceof Error ? err.message : '로그아웃에 실패했습니다.'
      set({ error: message })
    }
  },

  manualUpload: async () => {
    const { user } = get()
    if (!user) return
    const { fullUpload } = await import('@/services/firestoreSync')
    await fullUpload(user.uid)
  },

  manualDownload: async () => {
    const { user } = get()
    if (!user) return
    const { fullDownload } = await import('@/services/firestoreSync')
    await fullDownload(user.uid)
    await reloadStoresAfterSync()
  },

  // error가 아닌 상태로 전이하면 이전 오류 메시지는 더 이상 사실이 아니므로 함께 지운다.
  setSyncStatus: (status) =>
    set(status === 'error' ? { syncStatus: status } : { syncStatus: status, syncErrorMessage: null }),
  setSyncError: (message) => set({ syncErrorMessage: message }),
  setLastSyncTime: (time) => set({ lastSyncTime: time }),
  setPendingChangesCount: (count) => set({ pendingChangesCount: count }),
  updatePendingCount: async () => {
    try {
      const count = await getPendingChangesCount()
      set({ pendingChangesCount: count })
    } catch {
      // Ignore — table may not be ready yet
    }
  },
}))
