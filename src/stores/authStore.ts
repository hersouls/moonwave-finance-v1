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
  logout: () => Promise<void>
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

  logout: async () => {
    try {
      stopRealtimeSync()
      await signOut(auth)
      // Wipe local Dexie data so the previously signed-in user's financial
      // records aren't visible on this device after logout. Cloud data in
      // Firestore is preserved and re-synced on next login.
      try {
        const { clearAllData } = await import('@/services/database')
        await clearAllData()
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
