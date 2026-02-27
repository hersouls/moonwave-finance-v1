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
        await db.deleteMember(id)
        await get().loadMembers()
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
