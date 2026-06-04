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
import { mergeOnLogin, startRealtimeSync, stopRealtimeSync, getPendingChangesCount } from '@/services/firestoreSync'

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error'

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
            await mergeOnLogin(authUser.uid)
            // After cloud merge, top up any missing defaults (idempotent).
            // Order matters: running this BEFORE merge would create
            // syncId-bearing local defaults that race with cloud defaults
            // having identical syncIds — harmless thanks to deterministic
            // syncIds, but post-merge is cheaper and avoids redundant uploads.
            const { ensureDefaultCategories } = await import('@/services/database')
            await ensureDefaultCategories()
            // One-time cleanup of pre-fix duplicate seed records.
            // Idempotent and guarded by localStorage; no-op once complete.
            try {
              const { dedupSeedCategories } = await import('@/services/dedupMigration')
              await dedupSeedCategories()
            } catch (err) {
              console.error('Dedup migration failed (non-fatal):', err)
            }
            await reloadStoresAfterSync()
            get().updatePendingCount()
          } catch (err) {
            console.error('Sync on login failed:', err)
            set({ syncStatus: 'error' })
          }
          // Start listeners only after first login merge
          startRealtimeSync(authUser.uid)
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
      // Firestore is preserved and re-merged on next login.
      try {
        const { clearAllData } = await import('@/services/database')
        // force: logout must wipe this device's local copy even when the
        // device is in read-only mode (cloud data is preserved + re-merged).
        await clearAllData({ force: true })
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
  updatePendingCount: async () => {
    try {
      const count = await getPendingChangesCount()
      set({ pendingChangesCount: count })
    } catch {
      // Ignore — table may not be ready yet
    }
  },
}))
