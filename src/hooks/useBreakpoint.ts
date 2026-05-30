import { useCallback, useSyncExternalStore } from 'react'

/**
 * Canonical responsive breakpoint min-widths (px).
 * MUST stay in sync with src/styles/tokens/breakpoints.css and the Tailwind
 * @theme --breakpoint-* values in src/index.css. This is the single TS mirror
 * so every JS responsive decision uses the same boundaries (no ad-hoc 640/767).
 */
export const BREAKPOINTS = {
  xs: 360, // Galaxy S small
  sm: 390, // iPhone 14/15/16
  md: 600, // large phone / small tablet
  lg: 768, // tablet portrait — canonical MOBILE | PC split
  xl: 1024, // desktop — dense / power-user unlock
  '2xl': 1280, // wide desktop
  '3xl': 1920, // ultra-wide
} as const

export type BreakpointKey = keyof typeof BREAKPOINTS

/** Device tier derived from the canonical set. */
export type DeviceClass = 'mobile' | 'tablet' | 'desktop' | 'wide' | 'ultrawide'

/**
 * SSR-safe reactive media query. Uses useSyncExternalStore so it never tears
 * during concurrent rendering and cleans up its listener correctly.
 *
 * @param query  A CSS media query string, e.g. '(min-width: 768px)'.
 * @param defaultValue  Value used during SSR / before hydration.
 */
export function useMediaQuery(query: string, defaultValue = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {}
      const mql = window.matchMedia(query)
      // Modern browsers
      if (mql.addEventListener) {
        mql.addEventListener('change', onChange)
        return () => mql.removeEventListener('change', onChange)
      }
      // Safari < 14 fallback
      mql.addListener(onChange)
      return () => mql.removeListener(onChange)
    },
    [query],
  )

  const getSnapshot = () =>
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia(query).matches
      : defaultValue

  const getServerSnapshot = () => defaultValue

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

const min = (px: number) => `(min-width: ${px}px)`
const max = (px: number) => `(max-width: ${px - 1}px)`

/**
 * The one hook for responsive rendering decisions.
 *
 * Tiers (off the canonical set):
 *   mobile     < 768            touch-first, BottomNav + sheets
 *   tablet     768 – 1023       intermediate: 2-col grids, no inspector
 *   desktop    >= 1024          sidebar, dense, master-detail, keyboard
 *   wide       >= 1280          3rd column / 12-col
 *   ultrawide  >= 1920          content clamps via .content-container
 *
 * `isMobile` / `isTablet` are exclusive bands; `isDesktop` / `isWide` /
 * `isUltrawide` are "at least" flags (desktop is true at wide & ultrawide too).
 */
export function useBreakpoint() {
  const isMobile = useMediaQuery(max(BREAKPOINTS.lg)) // < 768
  const atLeastLg = useMediaQuery(min(BREAKPOINTS.lg)) // >= 768
  const isDesktop = useMediaQuery(min(BREAKPOINTS.xl)) // >= 1024
  const isWide = useMediaQuery(min(BREAKPOINTS['2xl'])) // >= 1280
  const isUltrawide = useMediaQuery(min(BREAKPOINTS['3xl'])) // >= 1920

  const isTablet = atLeastLg && !isDesktop // 768 – 1023

  const bp: DeviceClass = isUltrawide
    ? 'ultrawide'
    : isWide
      ? 'wide'
      : isDesktop
        ? 'desktop'
        : isTablet
          ? 'tablet'
          : 'mobile'

  return { bp, isMobile, isTablet, isDesktop, isWide, isUltrawide }
}

/** True on coarse (touch) pointers — phones/tablets, not mouse desktops. */
export function useIsTouch(): boolean {
  return useMediaQuery('(pointer: coarse)')
}

/** Convenience: true below the canonical mobile|PC split (< 768px). */
export function useIsMobile(): boolean {
  return useMediaQuery(max(BREAKPOINTS.lg))
}
