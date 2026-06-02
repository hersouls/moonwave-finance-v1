// ─── Per-device write guard ─────────────────────────────
//
// Enforces the "이 기기에서 쓰기 허용" setting: a device toggled OFF becomes
// fully read-only — it never writes to local Dexie (user-initiated) nor to
// Firestore, but still receives cloud changes via sync download/merge/realtime.
//
// The flag lives in settingsStore (localStorage, NOT synced), so each of the
// user's devices controls its own write capability independently. This is a
// client-side guard for a single-owner multi-device PWA (preventing accidental
// edits from a "viewer" device), not a server-enforced ACL.
//
// Two enforcement layers consume this:
//   1. Soft guard (`guardWrite`)  — store actions / background engines call it
//      and early-return gracefully with a toast.
//   2. Hard guard (`assertWritable`) — the data layer (database.ts write
//      helpers) and the cloud layer (firestoreSync uploads) throw / no-op so
//      a write can never slip through even if a UI affordance is missed.
//
// Sync DOWNLOAD writes go through `db.table.*` directly (flagged via
// setSyncWritingFlag) and never call these guards — so a read-only device
// still stays current with the cloud.

import { useSettingsStore } from '@/stores/settingsStore'
import { useToastStore } from '@/stores/toastStore'

export class ReadOnlyDeviceError extends Error {
  constructor(message = '읽기 전용 기기에서는 데이터를 변경할 수 없습니다') {
    super(message)
    this.name = 'ReadOnlyDeviceError'
  }
}

/** True when this device may write (the default). */
export function canDeviceWrite(): boolean {
  return useSettingsStore.getState().settings.deviceWriteEnabled !== false
}

/** Convenience inverse for UI (hide/disable write affordances, show banner). */
export function isDeviceReadOnly(): boolean {
  return !canDeviceWrite()
}

/** Reactive hook — re-renders consumers when the toggle changes. */
export function useIsDeviceReadOnly(): boolean {
  return useSettingsStore((s) => s.settings.deviceWriteEnabled === false)
}

const READONLY_MSG = '읽기 전용 기기입니다. 설정 → 시스템에서 "이 기기에서 쓰기"를 켜면 변경할 수 있어요.'
let lastToastAt = 0

/** Rate-limited toast so a burst of blocked writes doesn't storm the UI. */
function notifyReadOnly(): void {
  const now = Date.now()
  if (now - lastToastAt < 3000) return
  lastToastAt = now
  try {
    useToastStore.getState().addToast(READONLY_MSG, 'error')
  } catch {
    // toast store unavailable (e.g. non-UI context) — silently ignore
  }
}

/**
 * Soft guard. Returns true when writable; otherwise shows a toast and returns
 * false so callers can `if (!guardWrite()) return`.
 */
export function guardWrite(): boolean {
  if (canDeviceWrite()) return true
  notifyReadOnly()
  return false
}

/**
 * Hard guard. Throws ReadOnlyDeviceError when the device is read-only.
 * Used at the data layer as the enforcement net of last resort.
 */
export function assertWritable(): void {
  if (canDeviceWrite()) return
  notifyReadOnly()
  throw new ReadOnlyDeviceError()
}
