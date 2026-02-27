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
import { syncOnLogin, startRealtimeSync, stopRealtimeSync } from '@/services/firestoreSync'

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
  error: string | null
  initialize: () => void
  login: () => Promise<void>
  logout: () => Promise<void>
  manualUpload: () => Promise<void>
  manualDownload: () => Promise<void>
  setSyncStatus: (status: SyncStatus) => void
  setLastSyncTime: (time: string) => void
}

function toAuthUser(u: User): AuthUser {
  return {
    uid: u.uid,
    email: u.email || '',
    displayName: u.displayName || '',
    photoURL: u.photoURL || '',
  }
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  isLoading: false,
  isSigningIn: false,
  syncStatus: 'idle',
  lastSyncTime: null,
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
        set({ user: authUser, isLoading: false, isSigningIn: false })

        // Sync on login: upload local if cloud empty, download cloud if exists
        try {
          await syncOnLogin(authUser.uid)
          startRealtimeSync(authUser.uid)
        } catch (err) {
          console.error('Sync on login failed:', err)
          set({ syncStatus: 'error' })
        }
      } else {
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
      set({ user: null, syncStatus: 'idle', lastSyncTime: null, error: null })
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
  },

  setSyncStatus: (status) => set({ syncStatus: status }),
  setLastSyncTime: (time) => set({ lastSyncTime: time }),
}))
