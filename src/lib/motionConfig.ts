import type { Variants, Transition } from 'framer-motion'

// ─── Spring Configs ───────────────────────────────
export const springGentle: Transition = {
  type: 'spring',
  stiffness: 200,
  damping: 25,
  mass: 0.8,
}

export const springBouncy: Transition = {
  type: 'spring',
  stiffness: 400,
  damping: 15,
  mass: 0.6,
}

export const springStiff: Transition = {
  type: 'spring',
  stiffness: 500,
  damping: 30,
  mass: 0.5,
}

// ─── v2.0 Spring Presets (명명 규칙: 의도 기반) ────────
export const springSnappy: Transition = {
  type: 'spring',
  stiffness: 320,
  damping: 24,
  mass: 0.8,
}

export const springPrecise: Transition = {
  type: 'spring',
  stiffness: 500,
  damping: 30,
  mass: 1,
}

export const springSoft: Transition = {
  type: 'spring',
  stiffness: 120,
  damping: 18,
  mass: 1,
}

export const springs = {
  gentle: springGentle,
  snappy: springSnappy,
  bouncy: springBouncy,
  stiff: springStiff,
  precise: springPrecise,
  soft: springSoft,
} as const

// ─── Easing (CSS 토큰과 sync) ─────────────────────
export const easeOutExpo = [0.16, 1, 0.3, 1] as const
export const easeOutBack = [0.34, 1.56, 0.64, 1] as const
export const easeInOutCirc = [0.85, 0, 0.15, 1] as const

// ─── Durations ────────────────────────────────────
export const durations = {
  instant: 0.08,
  fast: 0.16,
  base: 0.24,
  slow: 0.36,
  slower: 0.52,
} as const

// ─── Stagger Container ───────────────────────────
export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.02,
    },
  },
}

// ─── Stagger Item ─────────────────────────────────
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: springGentle,
  },
}

// ─── Fade In Up (single element) ──────────────────
export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: springGentle,
  },
}

// ─── Fade In (opacity only, safe for reduced motion) ─
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.2 },
  },
}

// ─── Scale In (for modals, popovers) ─────────────
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: springBouncy,
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: { duration: 0.15 },
  },
}

// ─── Slide In from Bottom (for bottom sheets) ────
export const slideUpSheet: Variants = {
  hidden: { y: '100%' },
  visible: {
    y: 0,
    transition: {
      type: 'spring',
      stiffness: 350,
      damping: 30,
    },
  },
  exit: {
    y: '100%',
    transition: { duration: 0.2 },
  },
}

// ─── Reduced Motion Variants ──────────────────────
// Use these when prefers-reduced-motion is active
export const reducedStaggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0 },
  },
}

export const reducedStaggerItem: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.15 },
  },
}

// ─── Helper: pick variants based on reduced motion ─
export function motionVariants(
  shouldReduce: boolean | null,
  full: Variants,
  reduced: Variants
): Variants {
  return shouldReduce ? reduced : full
}

// ─── Route Transition Variants ────────────────────
export const routeTransition: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: durations.base, ease: easeOutExpo },
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: { duration: durations.fast, ease: easeOutExpo },
  },
}

export const reducedRouteTransition: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.1 } },
  exit: { opacity: 0, transition: { duration: 0.08 } },
}

// ─── Hero Entry (hero cards stagger) ──────────────
export const heroContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.05,
    },
  },
}

export const heroItem: Variants = {
  hidden: { opacity: 0, y: 20, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: springSnappy,
  },
}
