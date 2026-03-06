import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { AssetCategory, AssetItem, AssetLiabilityType } from '@/lib/types'
import * as db from '@/services/database'
import { useUndoStore } from './undoStore'
import { useToastStore } from './toastStore'

interface AssetState {
  categories: AssetCategory[]
  items: AssetItem[]
  isLoading: boolean

  loadCategories: () => Promise<void>
  loadItems: () => Promise<void>
  loadAll: () => Promise<void>

  addCategory: (name: string, type: AssetLiabilityType, color: string, icon?: string) => Promise<number>
  updateCategory: (id: number, updates: Partial<AssetCategory>) => Promise<void>
  deleteCategory: (id: number) => Promise<void>

  addItem: (data: {
    memberId: number
    categoryId: number
    name: string
    type: AssetLiabilityType
    memo?: string
  }) => Promise<number>
  updateItem: (id: number, updates: Partial<AssetItem>) => Promise<void>
  deleteItem: (id: number) => Promise<void>

  getItemsByMember: (memberId: number) => AssetItem[]
  getItemsByCategory: (categoryId: number) => AssetItem[]
  getItemsByType: (type: AssetLiabilityType) => AssetItem[]
  getCategoriesByType: (type: AssetLiabilityType) => AssetCategory[]
}

export const useAssetStore = create<AssetState>()(
  devtools(
    (set, get) => ({
      categories: [],
      items: [],
      isLoading: false,

      loadCategories: async () => {
        const categories = await db.getAllAssetCategories()
        set({ categories })
      },

      loadItems: async () => {
        const items = await db.getAllAssetItems()
        set({ items })
      },

      loadAll: async () => {
        set({ isLoading: true })
        try {
          const [categories, items] = await Promise.all([
            db.getAllAssetCategories(),
            db.getAllAssetItems(),
          ])
          set({ categories, items, isLoading: false })
        } catch (err) {
          console.error('Failed to load assets:', err)
          useToastStore.getState().addToast('자산 데이터를 불러오는데 실패했습니다.', 'error')
          set({ isLoading: false })
        }
      },

      addCategory: async (name, type, color, icon) => {
        const now = new Date().toISOString()
        const cats = get().categories.filter(c => c.type === type)
        const maxOrder = cats.reduce((max, c) => Math.max(max, c.sortOrder), -1)
        const id = await db.addAssetCategory({
          name,
          type,
          color,
          icon,
          sortOrder: maxOrder + 1,
          syncId: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
        })
        await get().loadCategories()
        return id
      },

      updateCategory: async (id, updates) => {
        await db.updateAssetCategory(id, updates)
        await get().loadCategories()
      },

      deleteCategory: async (id) => {
        const cat = get().categories.find(c => c.id === id)
        if (!cat) return
        // Collect syncIds of cascaded records before deletion
        const cascadeItems = get().items.filter(i => i.categoryId === id)
        const cascadeItemSyncIds = cascadeItems.map(i => i.syncId).filter(Boolean) as string[]
        const cascadeDailyValueSyncIds: string[] = []
        for (const item of cascadeItems) {
          const values = await db.getDailyValuesByItem(item.id!)
          cascadeDailyValueSyncIds.push(...values.map(v => v.syncId).filter(Boolean) as string[])
        }
        await db.deleteAssetCategory(id)
        await get().loadAll()
        // Delete from Firestore
        import('@/services/firestoreSync').then(({ deleteFromCloud, deleteMultipleFromCloud }) => {
          import('./authStore').then(({ useAuthStore }) => {
            const user = useAuthStore.getState().user
            if (!user) return
            if (cat.syncId) deleteFromCloud(user.uid, 'assetCategories', cat.syncId)
            deleteMultipleFromCloud(user.uid, 'assetItems', cascadeItemSyncIds)
            deleteMultipleFromCloud(user.uid, 'dailyValues', cascadeDailyValueSyncIds)
          })
        }).catch(err => console.error('[asset] delete category sync failed:', err))
        useToastStore.getState().addToast(`${cat.name} 카테고리가 삭제되었습니다.`, 'info')
      },

      addItem: async (data) => {
        const now = new Date().toISOString()
        const items = get().items.filter(i => i.categoryId === data.categoryId)
        const maxOrder = items.reduce((max, i) => Math.max(max, i.sortOrder), -1)
        const id = await db.addAssetItem({
          ...data,
          isActive: true,
          sortOrder: maxOrder + 1,
          syncId: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
        })
        await get().loadItems()
        useToastStore.getState().addToast(`${data.name} 항목이 추가되었습니다.`, 'success')
        return id
      },

      updateItem: async (id, updates) => {
        const prev = get().items.find(i => i.id === id)
        await db.updateAssetItem(id, updates)
        await get().loadItems()

        if (prev) {
          useUndoStore.getState().pushAction({
            type: 'update',
            label: `${prev.name} 수정 취소`,
            undo: async () => {
              await db.updateAssetItem(id, {
                name: prev.name,
                memo: prev.memo,
                memberId: prev.memberId,
                categoryId: prev.categoryId,
              })
              await get().loadItems()
            },
            redo: async () => {
              await db.updateAssetItem(id, updates)
              await get().loadItems()
            },
          })
        }
      },

      deleteItem: async (id) => {
        const prev = get().items.find(i => i.id === id)
        if (!prev) return
        // Collect dailyValue syncIds before deletion
        const values = await db.getDailyValuesByItem(id)
        const valueSyncIds = values.map(v => v.syncId).filter(Boolean) as string[]
        await db.deleteAssetItem(id)
        await get().loadItems()
        // Delete from Firestore
        import('@/services/firestoreSync').then(({ deleteFromCloud, deleteMultipleFromCloud }) => {
          import('./authStore').then(({ useAuthStore }) => {
            const user = useAuthStore.getState().user
            if (!user) return
            if (prev.syncId) deleteFromCloud(user.uid, 'assetItems', prev.syncId)
            deleteMultipleFromCloud(user.uid, 'dailyValues', valueSyncIds)
          })
        }).catch(err => console.error('[asset] delete item sync failed:', err))
        useToastStore.getState().addToast(`${prev.name} 항목이 삭제되었습니다.`, 'info')
      },

      getItemsByMember: (memberId) => get().items.filter(i => i.memberId === memberId && i.isActive),
      getItemsByCategory: (categoryId) => get().items.filter(i => i.categoryId === categoryId && i.isActive),
      getItemsByType: (type) => get().items.filter(i => i.type === type && i.isActive),
      getCategoriesByType: (type) => get().categories.filter(c => c.type === type),
    }),
    { name: 'asset-store' }
  )
)
