import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ThemeMode, ColorPalette, Settings } from '@/lib/types'

interface SettingsState {
  settings: Settings
  _hasHydrated: boolean
  initialize: () => void
  setTheme: (theme: ThemeMode) => void
  setColorPalette: (palette: ColorPalette) => void
  setLastBackupDate: (date: Date) => void
  setGoogleDriveStatus: (isConnected: boolean) => void
  toggleAutoBackup: () => void
  setLastSyncDate: (date: Date) => void
  setHasCompletedOnboarding: (completed: boolean) => void
  updateProfile: (profile: Partial<{ name: string; avatarUrl?: string }>) => void
  setCurrencyUnit: (unit: 'won' | 'dollar') => void
  toggleHighContrast: () => void
}

export function applyTheme(theme: ThemeMode) {
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', isDark)
}

export function applyColorPalette(palette: ColorPalette) {
  const root = document.documentElement
  if (palette === 'default') {
    root.removeAttribute('data-palette')
  } else {
    root.setAttribute('data-palette', palette)
  }
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      _hasHydrated: false,
      settings: {
        theme: 'light' as ThemeMode,
        colorPalette: 'default' as ColorPalette,
        currencyUnit: 'won' as const,
        userProfile: { name: '사용자' },
        hasCompletedOnboarding: false,
        lastBackupDate: undefined,
        googleDrive: { isConnected: false, autoBackup: false },
        highContrastMode: false,
      },

      initialize: () => {
        const state = get()
        const { theme, colorPalette } = state.settings
        const newSettings = { ...state.settings }
        let hasChanges = false

        if (!newSettings.googleDrive) {
          newSettings.googleDrive = { isConnected: false, autoBackup: false }
          hasChanges = true
        }
        if (newSettings.userProfile === undefined) {
          newSettings.userProfile = { name: '사용자' }
          hasChanges = true
        }
        if (newSettings.currencyUnit === undefined) {
          newSettings.currencyUnit = 'won'
          hasChanges = true
        }
        if (newSettings.highContrastMode === undefined) {
          newSettings.highContrastMode = false
          hasChanges = true
        }
        if (hasChanges) set({ settings: newSettings })

        applyTheme(theme)
        applyColorPalette(colorPalette)

        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
          if (get().settings.theme === 'system') applyTheme('system')
        })
      },

      setTheme: (theme) => {
        set((state) => ({ settings: { ...state.settings, theme } }))
        applyTheme(theme)
      },

      setColorPalette: (palette) => {
        set((state) => ({ settings: { ...state.settings, colorPalette: palette } }))
        applyColorPalette(palette)
      },

      setLastBackupDate: (date) => {
        set((state) => ({ settings: { ...state.settings, lastBackupDate: date.toISOString() } }))
      },

      setGoogleDriveStatus: (isConnected) => {
        set((state) => ({
          settings: {
            ...state.settings,
            googleDrive: { ...(state.settings.googleDrive || { autoBackup: false }), isConnected },
          },
        }))
      },

      toggleAutoBackup: () => {
        set((state) => ({
          settings: {
            ...state.settings,
            googleDrive: { ...(state.settings.googleDrive || { isConnected: false }), autoBackup: !state.settings.googleDrive?.autoBackup },
          },
        }))
      },

      setLastSyncDate: (date) => {
        set((state) => ({
          settings: { ...state.settings, googleDrive: { ...state.settings.googleDrive, lastSyncDate: date.toISOString() } },
        }))
      },

      setHasCompletedOnboarding: (completed) => {
        set((state) => ({ settings: { ...state.settings, hasCompletedOnboarding: completed } }))
      },

      updateProfile: (profile) => {
        set((state) => ({
          settings: { ...state.settings, userProfile: { ...state.settings.userProfile, ...profile } },
        }))
      },

      setCurrencyUnit: (unit) => {
        set((state) => ({ settings: { ...state.settings, currencyUnit: unit } }))
      },

      toggleHighContrast: () => {
        set((state) => ({ settings: { ...state.settings, highContrastMode: !state.settings.highContrastMode } }))
      },
    }),
    {
      name: 'finance-settings',
      onRehydrateStorage: () => () => {
        useSettingsStore.setState({ _hasHydrated: true })
      },
    }
  )
)
