import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type CurrentView = 'dashboard' | 'assets' | 'ledger' | 'subscriptions' | 'investments' | 'reports' | 'profile'

interface UIState {
  isSidebarOpen: boolean
  currentView: CurrentView
  isMobileMenuOpen: boolean

  isSettingsModalOpen: boolean
  isFAQModalOpen: boolean
  isTermsModalOpen: boolean
  isAssetCreateModalOpen: boolean
  isLiabilityCreateModalOpen: boolean
  isTransactionCreateModalOpen: boolean
  transactionPrefillDate: string | null

  isTransactionEditModalOpen: boolean
  editingTransactionId: number | null

  activeMemberFilter: number | null
  activeCategoryFilter: number | null

  isSearchModalOpen: boolean

  isCommandPaletteOpen: boolean
  isShortcutsModalOpen: boolean

  isSubscriptionCreateModalOpen: boolean
  isSubscriptionEditModalOpen: boolean
  editingSubscriptionId: number | null

  isAssetEditModalOpen: boolean
  editingAssetItemId: number | null

  isAssetCategoryManagerOpen: boolean
  assetQuickValueItemId: number | null

  isSelectionMode: boolean
  selectedItemIds: Set<number>

  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  setCurrentView: (view: CurrentView) => void
  openMobileMenu: () => void
  closeMobileMenu: () => void
  toggleMobileMenu: () => void

  openSettingsModal: () => void
  closeSettingsModal: () => void
  openFAQModal: () => void
  closeFAQModal: () => void
  openTermsModal: () => void
  closeTermsModal: () => void

  openSearchModal: () => void
  closeSearchModal: () => void

  openCommandPalette: () => void
  closeCommandPalette: () => void
  toggleCommandPalette: () => void
  openShortcutsModal: () => void
  closeShortcutsModal: () => void

  openSubscriptionCreateModal: () => void
  closeSubscriptionCreateModal: () => void
  openSubscriptionEditModal: (id: number) => void
  closeSubscriptionEditModal: () => void

  openAssetEditModal: (id: number) => void
  closeAssetEditModal: () => void

  openAssetCategoryManager: () => void
  closeAssetCategoryManager: () => void
  openAssetQuickValue: (id: number) => void
  closeAssetQuickValue: () => void

  openAssetCreateModal: () => void
  closeAssetCreateModal: () => void
  openLiabilityCreateModal: () => void
  closeLiabilityCreateModal: () => void
  openTransactionCreateModal: () => void
  closeTransactionCreateModal: () => void
  openTransactionCreateModalWithDate: (date: string) => void
  openTransactionEditModal: (id: number) => void
  closeTransactionEditModal: () => void

  setActiveMemberFilter: (id: number | null) => void
  setActiveCategoryFilter: (id: number | null) => void

  toggleSelectionMode: () => void
  toggleItemSelection: (id: number) => void
  clearSelection: () => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      isSidebarOpen: true,
      currentView: 'dashboard' as CurrentView,
      isMobileMenuOpen: false,

      isSettingsModalOpen: false,
      isFAQModalOpen: false,
      isTermsModalOpen: false,
      isSearchModalOpen: false,
      isCommandPaletteOpen: false,
      isShortcutsModalOpen: false,
      isSubscriptionCreateModalOpen: false,
      isSubscriptionEditModalOpen: false,
      editingSubscriptionId: null,
      isAssetEditModalOpen: false,
      editingAssetItemId: null,
      isAssetCategoryManagerOpen: false,
      assetQuickValueItemId: null,
      isAssetCreateModalOpen: false,
      isLiabilityCreateModalOpen: false,
      isTransactionCreateModalOpen: false,
      transactionPrefillDate: null,

      isTransactionEditModalOpen: false,
      editingTransactionId: null,

      activeMemberFilter: null,
      activeCategoryFilter: null,

      isSelectionMode: false,
      selectedItemIds: new Set<number>(),

      toggleSidebar: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),
      setSidebarOpen: (open) => set({ isSidebarOpen: open }),
      setCurrentView: (view) => set({ currentView: view }),
      openMobileMenu: () => set({ isMobileMenuOpen: true }),
      closeMobileMenu: () => set({ isMobileMenuOpen: false }),
      toggleMobileMenu: () => set((s) => ({ isMobileMenuOpen: !s.isMobileMenuOpen })),

      openSettingsModal: () => set({ isSettingsModalOpen: true }),
      closeSettingsModal: () => set({ isSettingsModalOpen: false }),
      openFAQModal: () => set({ isFAQModalOpen: true }),
      closeFAQModal: () => set({ isFAQModalOpen: false }),
      openTermsModal: () => set({ isTermsModalOpen: true }),
      closeTermsModal: () => set({ isTermsModalOpen: false }),

      openSearchModal: () => set({ isSearchModalOpen: true }),
      closeSearchModal: () => set({ isSearchModalOpen: false }),

      openCommandPalette: () => set({ isCommandPaletteOpen: true }),
      closeCommandPalette: () => set({ isCommandPaletteOpen: false }),
      toggleCommandPalette: () => set((s) => ({ isCommandPaletteOpen: !s.isCommandPaletteOpen })),
      openShortcutsModal: () => set({ isShortcutsModalOpen: true }),
      closeShortcutsModal: () => set({ isShortcutsModalOpen: false }),

      openSubscriptionCreateModal: () => set({ isSubscriptionCreateModalOpen: true }),
      closeSubscriptionCreateModal: () => set({ isSubscriptionCreateModalOpen: false }),
      openSubscriptionEditModal: (id: number) => set({ isSubscriptionEditModalOpen: true, editingSubscriptionId: id }),
      closeSubscriptionEditModal: () => set({ isSubscriptionEditModalOpen: false, editingSubscriptionId: null }),

      openAssetEditModal: (id: number) => set({ isAssetEditModalOpen: true, editingAssetItemId: id }),
      closeAssetEditModal: () => set({ isAssetEditModalOpen: false, editingAssetItemId: null }),

      openAssetCategoryManager: () => set({ isAssetCategoryManagerOpen: true }),
      closeAssetCategoryManager: () => set({ isAssetCategoryManagerOpen: false }),
      openAssetQuickValue: (id: number) => set({ assetQuickValueItemId: id }),
      closeAssetQuickValue: () => set({ assetQuickValueItemId: null }),

      openAssetCreateModal: () => set({ isAssetCreateModalOpen: true }),
      closeAssetCreateModal: () => set({ isAssetCreateModalOpen: false }),
      openLiabilityCreateModal: () => set({ isLiabilityCreateModalOpen: true }),
      closeLiabilityCreateModal: () => set({ isLiabilityCreateModalOpen: false }),
      openTransactionCreateModal: () => set({ isTransactionCreateModalOpen: true }),
      closeTransactionCreateModal: () => set({ isTransactionCreateModalOpen: false, transactionPrefillDate: null }),
      openTransactionCreateModalWithDate: (date: string) => set({ isTransactionCreateModalOpen: true, transactionPrefillDate: date }),
      openTransactionEditModal: (id: number) => set({ isTransactionEditModalOpen: true, editingTransactionId: id }),
      closeTransactionEditModal: () => set({ isTransactionEditModalOpen: false, editingTransactionId: null }),

      setActiveMemberFilter: (id) => set({ activeMemberFilter: id }),
      setActiveCategoryFilter: (id) => set({ activeCategoryFilter: id }),

      toggleSelectionMode: () => set((s) => ({
        isSelectionMode: !s.isSelectionMode,
        selectedItemIds: s.isSelectionMode ? new Set<number>() : s.selectedItemIds,
      })),
      toggleItemSelection: (id) => set((s) => {
        const next = new Set(s.selectedItemIds)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return { selectedItemIds: next }
      }),
      clearSelection: () => set({ selectedItemIds: new Set<number>() }),
    }),
    {
      name: 'finance-ui',
      partialize: (state) => ({
        isSidebarOpen: state.isSidebarOpen,
        activeMemberFilter: state.activeMemberFilter,
      }),
    }
  )
)
