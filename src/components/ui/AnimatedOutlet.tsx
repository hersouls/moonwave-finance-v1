import { useLocation, useOutlet } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { cloneElement } from 'react'

export function AnimatedOutlet() {
  const location = useLocation()
  const outlet = useOutlet()
  const shouldReduceMotion = useReducedMotion()

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
        transition={
          shouldReduceMotion
            ? { duration: 0.15 }
            : { type: 'spring', stiffness: 380, damping: 30, mass: 0.8 }
        }
      >
        {outlet && cloneElement(outlet, { key: location.pathname })}
      </motion.div>
    </AnimatePresence>
  )
}
