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
