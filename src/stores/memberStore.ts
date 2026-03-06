import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { Member } from '@/lib/types'
import * as db from '@/services/database'
import { useUndoStore } from './undoStore'
import { useToastStore } from './toastStore'

interface MemberState {
  members: Member[]
  isLoading: boolean
  loadMembers: () => Promise<void>
  addMember: (name: string, color: string) => Promise<number>
  updateMember: (id: number, updates: Partial<Member>) => Promise<void>
  deleteMember: (id: number) => Promise<void>
  reorderMembers: (members: Member[]) => Promise<void>
}

export const useMemberStore = create<MemberState>()(
  devtools(
    (set, get) => ({
      members: [],
      isLoading: false,

      loadMembers: async () => {
        set({ isLoading: true })
        try {
          const members = await db.getAllMembers()
          set({ members, isLoading: false })
        } catch (err) {
          console.error('Failed to load members:', err)
          set({ isLoading: false })
        }
      },

      addMember: async (name: string, color: string) => {
        const now = new Date().toISOString()
        const maxOrder = get().members.reduce((max, m) => Math.max(max, m.sortOrder), -1)
        const id = await db.addMember({
          name,
          color,
          isDefault: false,
          sortOrder: maxOrder + 1,
          syncId: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
        })
        await get().loadMembers()
        useToastStore.getState().addToast(`${name} 구성원이 추가되었습니다.`, 'success')
        return id
      },

      updateMember: async (id: number, updates: Partial<Member>) => {
        const prev = get().members.find(m => m.id === id)
        await db.updateMember(id, updates)
        await get().loadMembers()

        if (prev) {
          useUndoStore.getState().pushAction({
            type: 'update',
            label: `${prev.name} 수정 취소`,
            undo: async () => {
              await db.updateMember(id, { name: prev.name, color: prev.color })
              await get().loadMembers()
            },
            redo: async () => {
              await db.updateMember(id, updates)
              await get().loadMembers()
            },
          })
        }
      },

      deleteMember: async (id: number) => {
        const prev = get().members.find(m => m.id === id)
        if (!prev) return
        // Collect all cascaded syncIds before deletion
        const cascadeItems = await db.getAssetItemsByMember(id)
        const cascadeItemSyncIds = cascadeItems.map(i => i.syncId).filter(Boolean) as string[]
        const cascadeDailyValueSyncIds: string[] = []
        for (const item of cascadeItems) {
          const values = await db.getDailyValuesByItem(item.id!)
          cascadeDailyValueSyncIds.push(...values.map(v => v.syncId).filter(Boolean) as string[])
        }
        const cascadeTransactions = await db.getAllTransactions()
        const memberTxnSyncIds = cascadeTransactions
          .filter(t => t.memberId === id && t.syncId)
          .map(t => t.syncId) as string[]

        await db.deleteMember(id)
        await get().loadMembers()
        // Delete from Firestore
        import('@/services/firestoreSync').then(({ deleteFromCloud, deleteMultipleFromCloud }) => {
          import('./authStore').then(({ useAuthStore }) => {
            const user = useAuthStore.getState().user
            if (!user) return
            if (prev.syncId) deleteFromCloud(user.uid, 'members', prev.syncId)
            deleteMultipleFromCloud(user.uid, 'assetItems', cascadeItemSyncIds)
            deleteMultipleFromCloud(user.uid, 'dailyValues', cascadeDailyValueSyncIds)
            deleteMultipleFromCloud(user.uid, 'transactions', memberTxnSyncIds)
          })
        }).catch(err => console.error('[member] delete sync failed:', err))
        useToastStore.getState().addToast(`${prev.name} 구성원이 삭제되었습니다.`, 'info')
      },

      reorderMembers: async (members: Member[]) => {
        for (let i = 0; i < members.length; i++) {
          await db.updateMember(members[i].id!, { sortOrder: i })
        }
        await get().loadMembers()
      },
    }),
    { name: 'member-store' }
  )
)
