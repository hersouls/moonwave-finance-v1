import { useState, useEffect, useRef } from 'react'

function easeOutExpo(t: number): number {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)
}

/**
 * Animates a number from its previous value to the target with easeOutExpo.
 * Falls back to instant update when prefers-reduced-motion is enabled.
 */
export function useCountUp(target: number, duration = 800): number {
  const [value, setValue] = useState(target)
  const prevTarget = useRef(target)
  const rafId = useRef(0)

  useEffect(() => {
    const from = prevTarget.current
    prevTarget.current = target

    if (from === target) return

    // Respect reduced motion preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) {
      setValue(target)
      return
    }

    const start = performance.now()

    const animate = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = easeOutExpo(progress)

      setValue(Math.round(from + (target - from) * eased))

      if (progress < 1) {
        rafId.current = requestAnimationFrame(animate)
      }
    }

    rafId.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafId.current)
  }, [target, duration])

  return value
}
