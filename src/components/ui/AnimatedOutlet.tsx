import { useLocation, useOutlet } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { cloneElement } from 'react'
import { easeOutExpo, durations } from '@/lib/motionConfig'

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
            ? { duration: durations.fast }
            : { duration: durations.base, ease: easeOutExpo }
        }
      >
        {outlet && cloneElement(outlet, { key: location.pathname })}
      </motion.div>
    </AnimatePresence>
  )
}
