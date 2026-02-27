import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type CurrentView = 'dashboard' | 'assets' | 'liabilities' | 'ledger' | 'calendar' | 'reports' | 'profile'

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

  activeMemberFilter: number | null
  activeCategoryFilter: number | null

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

  openAssetCreateModal: () => void
  closeAssetCreateModal: () => void
  openLiabilityCreateModal: () => void
  closeLiabilityCreateModal: () => void
  openTransactionCreateModal: () => void
  closeTransactionCreateModal: () => void

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
      isAssetCreateModalOpen: false,
      isLiabilityCreateModalOpen: false,
      isTransactionCreateModalOpen: false,

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

      openAssetCreateModal: () => set({ isAssetCreateModalOpen: true }),
      closeAssetCreateModal: () => set({ isAssetCreateModalOpen: false }),
      openLiabilityCreateModal: () => set({ isLiabilityCreateModalOpen: true }),
      closeLiabilityCreateModal: () => set({ isLiabilityCreateModalOpen: false }),
      openTransactionCreateModal: () => set({ isTransactionCreateModalOpen: true }),
      closeTransactionCreateModal: () => set({ isTransactionCreateModalOpen: false }),

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
