import { useState, useEffect, useCallback } from 'react'
import { useSettingsStore, applyTheme, applyColorPalette } from '@/stores/settingsStore'
import type { Settings } from '@/lib/types'

export function useSettingsModal(isOpen: boolean) {
  const storeSettings = useSettingsStore((s) => s.settings)
  const [draft, setDraft] = useState<Settings>(() => ({ ...storeSettings }))
  const [snapshot, setSnapshot] = useState<Settings>(() => ({ ...storeSettings }))

  // Capture snapshot when modal opens
  useEffect(() => {
    if (isOpen) {
      const current = useSettingsStore.getState().settings
      const copy = { ...current, notifications: { ...current.notifications } }
      setDraft(copy)
      setSnapshot({ ...current, notifications: { ...current.notifications } })
    }
  }, [isOpen])

  // Live preview for theme and palette
  useEffect(() => {
    if (isOpen) {
      applyTheme(draft.theme)
    }
  }, [draft.theme, isOpen])

  useEffect(() => {
    if (isOpen) {
      applyColorPalette(draft.colorPalette)
    }
  }, [draft.colorPalette, isOpen])

  const updateDraft = useCallback((updates: Partial<Settings>) => {
    setDraft(prev => ({ ...prev, ...updates }))
  }, [])

  const save = useCallback(() => {
    const store = useSettingsStore.getState()
    store.setTheme(draft.theme)
    store.setColorPalette(draft.colorPalette)
    store.setCurrencyUnit(draft.currencyUnit)
    if (draft.highContrastMode !== snapshot.highContrastMode) {
      store.toggleHighContrast()
    }
    store.updateNotificationSettings(draft.notifications)
  }, [draft, snapshot.highContrastMode])

  const cancel = useCallback(() => {
    applyTheme(snapshot.theme)
    applyColorPalette(snapshot.colorPalette)
  }, [snapshot])

  const isDirty =
    draft.theme !== snapshot.theme ||
    draft.colorPalette !== snapshot.colorPalette ||
    draft.currencyUnit !== snapshot.currencyUnit ||
    draft.highContrastMode !== snapshot.highContrastMode ||
    draft.notifications.budgetAlert !== snapshot.notifications.budgetAlert ||
    draft.notifications.budgetThreshold !== snapshot.notifications.budgetThreshold ||
    draft.notifications.transactionReminder !== snapshot.notifications.transactionReminder ||
    draft.notifications.reminderTime !== snapshot.notifications.reminderTime

  return { draft, updateDraft, save, cancel, isDirty }
}
