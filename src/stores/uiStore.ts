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
  editingTransactionId: string | null

  activeMemberFilter: string | null
  activeCategoryFilter: string | null

  isSearchModalOpen: boolean

  isCommandPaletteOpen: boolean
  isShortcutsModalOpen: boolean

  isSubscriptionCreateModalOpen: boolean
  isSubscriptionEditModalOpen: boolean
  editingSubscriptionId: string | null

  isAssetEditModalOpen: boolean
  editingAssetItemId: string | null

  isAssetCategoryManagerOpen: boolean
  assetQuickValueItemId: string | null

  isSelectionMode: boolean
  selectedItemIds: Set<string>

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
  openSubscriptionEditModal: (id: string) => void
  closeSubscriptionEditModal: () => void

  openAssetEditModal: (id: string) => void
  closeAssetEditModal: () => void

  openAssetCategoryManager: () => void
  closeAssetCategoryManager: () => void
  openAssetQuickValue: (id: string) => void
  closeAssetQuickValue: () => void

  openAssetCreateModal: () => void
  closeAssetCreateModal: () => void
  openLiabilityCreateModal: () => void
  closeLiabilityCreateModal: () => void
  openTransactionCreateModal: () => void
  closeTransactionCreateModal: () => void
  openTransactionCreateModalWithDate: (date: string) => void
  openTransactionEditModal: (id: string) => void
  closeTransactionEditModal: () => void

  setActiveMemberFilter: (id: string | null) => void
  setActiveCategoryFilter: (id: string | null) => void

  toggleSelectionMode: () => void
  toggleItemSelection: (id: string) => void
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
      selectedItemIds: new Set<string>(),

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
      openSubscriptionEditModal: (id: string) => set({ isSubscriptionEditModalOpen: true, editingSubscriptionId: id }),
      closeSubscriptionEditModal: () => set({ isSubscriptionEditModalOpen: false, editingSubscriptionId: null }),

      openAssetEditModal: (id: string) => set({ isAssetEditModalOpen: true, editingAssetItemId: id }),
      closeAssetEditModal: () => set({ isAssetEditModalOpen: false, editingAssetItemId: null }),

      openAssetCategoryManager: () => set({ isAssetCategoryManagerOpen: true }),
      closeAssetCategoryManager: () => set({ isAssetCategoryManagerOpen: false }),
      openAssetQuickValue: (id: string) => set({ assetQuickValueItemId: id }),
      closeAssetQuickValue: () => set({ assetQuickValueItemId: null }),

      openAssetCreateModal: () => set({ isAssetCreateModalOpen: true }),
      closeAssetCreateModal: () => set({ isAssetCreateModalOpen: false }),
      openLiabilityCreateModal: () => set({ isLiabilityCreateModalOpen: true }),
      closeLiabilityCreateModal: () => set({ isLiabilityCreateModalOpen: false }),
      openTransactionCreateModal: () => set({ isTransactionCreateModalOpen: true }),
      closeTransactionCreateModal: () => set({ isTransactionCreateModalOpen: false, transactionPrefillDate: null }),
      openTransactionCreateModalWithDate: (date: string) => set({ isTransactionCreateModalOpen: true, transactionPrefillDate: date }),
      openTransactionEditModal: (id: string) => set({ isTransactionEditModalOpen: true, editingTransactionId: id }),
      closeTransactionEditModal: () => set({ isTransactionEditModalOpen: false, editingTransactionId: null }),

      setActiveMemberFilter: (id) => set({ activeMemberFilter: id }),
      setActiveCategoryFilter: (id) => set({ activeCategoryFilter: id }),

      toggleSelectionMode: () => set((s) => ({
        isSelectionMode: !s.isSelectionMode,
        selectedItemIds: s.isSelectionMode ? new Set<string>() : s.selectedItemIds,
      })),
      toggleItemSelection: (id) => set((s) => {
        const next = new Set(s.selectedItemIds)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return { selectedItemIds: next }
      }),
      clearSelection: () => set({ selectedItemIds: new Set<string>() }),
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
