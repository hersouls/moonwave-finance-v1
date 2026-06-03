import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ThemeMode, ColorPalette, Settings, NotificationSettings, Density } from '@/lib/types'

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
  updateNotificationSettings: (updates: Partial<NotificationSettings>) => void
  setExchangeRate: (rate: number) => void
  setDensity: (density: Density) => void
  toggleOledMode: () => void
  toggleHideAmounts: () => void
  toggleTimeBasedTheme: () => void
  toggleAutoCarryForward: () => void
  setDeviceWriteEnabled: (enabled: boolean) => void
}

let themeListenerAdded = false

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

export function applyDensity(density: Density | undefined) {
  const root = document.documentElement
  if (!density || density === 'comfortable') {
    root.removeAttribute('data-density')
  } else {
    root.setAttribute('data-density', density)
  }
}

export function applyOledMode(enabled: boolean) {
  const root = document.documentElement
  if (enabled) root.setAttribute('data-oled', 'true')
  else root.removeAttribute('data-oled')
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      _hasHydrated: false,
      settings: {
        theme: 'light' as ThemeMode,
        colorPalette: 'purple' as ColorPalette,
        currencyUnit: 'won' as const,
        userProfile: { name: '사용자' },
        hasCompletedOnboarding: false,
        lastBackupDate: undefined,
        googleDrive: { isConnected: false, autoBackup: false },
        highContrastMode: false,
        notifications: {
          budgetAlert: false,
          budgetThreshold: 80,
          transactionReminder: false,
          reminderTime: '21:00',
          subscriptionBillingAlert: false,
          subscriptionAlertDaysBefore: [0, 1, 3],
        },
        exchangeRate: {
          usdToKrw: 1350,
        },
      },

      initialize: () => {
        const state = get()
        const { theme } = state.settings
        const newSettings = { ...state.settings }
        let hasChanges = false

        // BORA 디자인 이식: 미설정(default) 팔레트는 BORA 보라(purple)를 기본으로.
        // 사용자가 명시적으로 고른 ocean/rose/forest 는 존중.
        if (newSettings.colorPalette === undefined || newSettings.colorPalette === 'default') {
          newSettings.colorPalette = 'purple'
          hasChanges = true
        }

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
        if (newSettings.notifications === undefined) {
          newSettings.notifications = {
            budgetAlert: false,
            budgetThreshold: 80,
            transactionReminder: false,
            reminderTime: '21:00',
            subscriptionBillingAlert: false,
            subscriptionAlertDaysBefore: [0, 1, 3],
          }
          hasChanges = true
        }
        if (newSettings.notifications.subscriptionBillingAlert === undefined) {
          newSettings.notifications = {
            ...newSettings.notifications,
            subscriptionBillingAlert: false,
            subscriptionAlertDaysBefore: [0, 1, 3],
          }
          hasChanges = true
        }
        if (!newSettings.exchangeRate) {
          newSettings.exchangeRate = { usdToKrw: 1350 }
          hasChanges = true
        }
        if (newSettings.density === undefined) {
          newSettings.density = 'comfortable'
          hasChanges = true
        }
        if (newSettings.oledMode === undefined) {
          newSettings.oledMode = false
          hasChanges = true
        }
        if (newSettings.hideAmounts === undefined) {
          newSettings.hideAmounts = false
          hasChanges = true
        }
        if (newSettings.timeBasedTheme === undefined) {
          newSettings.timeBasedTheme = false
          hasChanges = true
        }
        if (newSettings.autoCarryForward === undefined) {
          newSettings.autoCarryForward = true
          hasChanges = true
        }
        if (newSettings.deviceWriteEnabled === undefined) {
          newSettings.deviceWriteEnabled = true
          hasChanges = true
        }
        if (hasChanges) set({ settings: newSettings })

        applyTheme(theme)
        applyColorPalette(newSettings.colorPalette)
        applyDensity(newSettings.density)
        applyOledMode(!!newSettings.oledMode)

        if (!themeListenerAdded) {
          themeListenerAdded = true
          window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
            if (get().settings.theme === 'system') applyTheme('system')
          })
        }
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

      updateNotificationSettings: (updates) => {
        set((state) => ({
          settings: {
            ...state.settings,
            notifications: { ...state.settings.notifications, ...updates },
          },
        }))
      },

      setExchangeRate: (rate) => {
        set((state) => ({
          settings: {
            ...state.settings,
            exchangeRate: {
              usdToKrw: rate,
              lastUpdated: new Date().toISOString(),
            },
          },
        }))
      },

      setDensity: (density) => {
        set((state) => ({ settings: { ...state.settings, density } }))
        applyDensity(density)
      },

      toggleOledMode: () => {
        set((state) => {
          const next = !state.settings.oledMode
          applyOledMode(next)
          return { settings: { ...state.settings, oledMode: next } }
        })
      },

      toggleHideAmounts: () => {
        set((state) => ({ settings: { ...state.settings, hideAmounts: !state.settings.hideAmounts } }))
      },

      toggleTimeBasedTheme: () => {
        set((state) => ({ settings: { ...state.settings, timeBasedTheme: !state.settings.timeBasedTheme } }))
      },

      toggleAutoCarryForward: () => {
        set((state) => ({ settings: { ...state.settings, autoCarryForward: state.settings.autoCarryForward === false } }))
      },

      setDeviceWriteEnabled: (enabled) => {
        set((state) => ({ settings: { ...state.settings, deviceWriteEnabled: enabled } }))
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
