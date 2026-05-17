// Stable per-install device identifier. Used as a tiebreaker when two devices
// write the same record at the same `updatedAt` millisecond, and stamped on
// every cloud upload so receivers can detect echo-from-self vs. peer writes.
//
// Persisted in localStorage so it survives reloads. If localStorage is
// unavailable (private mode, SSR), falls back to a per-session UUID.

const KEY = 'fin:deviceId'
let cached: string | null = null

export function getDeviceId(): string {
  if (cached) return cached
  try {
    if (typeof localStorage !== 'undefined') {
      const existing = localStorage.getItem(KEY)
      if (existing) {
        cached = existing
        return existing
      }
      const fresh = crypto.randomUUID()
      localStorage.setItem(KEY, fresh)
      cached = fresh
      return fresh
    }
  } catch {
    // localStorage blocked — fall through to in-memory id
  }
  cached = crypto.randomUUID()
  return cached
}
