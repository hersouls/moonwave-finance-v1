import { useState } from 'react'
import { motion, useReducedMotion, type PanInfo } from 'framer-motion'
import { clsx } from 'clsx'
import type { LucideIcon } from 'lucide-react'
import { useIsTouch } from '@/hooks/useBreakpoint'

export interface SwipeAction {
  icon: LucideIcon
  label: string
  onClick: () => void
  variant?: 'default' | 'primary' | 'danger'
}

interface SwipeableRowProps {
  actions: SwipeAction[]
  children: React.ReactNode
  className?: string
  /** Corner radius to match the wrapped card (default 2xl). */
  rounded?: string
}

const ACTION_W = 72

/**
 * Touch-first swipe-to-reveal row. Drag the front content left to expose the
 * action buttons (edit / delete / …) behind it. On non-touch (mouse) devices
 * it renders the children plainly — desktop uses hover / inspector instead.
 * Respects prefers-reduced-motion (no drag).
 */
export function SwipeableRow({ actions, children, className, rounded = 'rounded-2xl' }: SwipeableRowProps) {
  const isTouch = useIsTouch()
  const reduce = useReducedMotion()
  const [open, setOpen] = useState(false)
  const width = actions.length * ACTION_W

  if (!isTouch || actions.length === 0) {
    return <div className={className}>{children}</div>
  }

  const close = () => setOpen(false)
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -width / 2 || info.velocity.x < -350) setOpen(true)
    else setOpen(false)
  }

  return (
    <div className={clsx('relative overflow-hidden', rounded, className)}>
      {/* Revealed actions */}
      <div className="absolute inset-y-0 right-0 flex" style={{ width }}>
        {actions.map((a) => {
          const Icon = a.icon
          return (
            <button
              key={a.label}
              type="button"
              onClick={() => { a.onClick(); close() }}
              tabIndex={open ? 0 : -1}
              aria-hidden={!open}
              className={clsx(
                'flex flex-col items-center justify-center gap-1 transition-colors',
                a.variant === 'danger'
                  ? 'bg-[color:var(--value-negative)] text-white'
                  : a.variant === 'primary'
                    ? 'bg-primary-500 text-white'
                    : 'bg-surface-muted text-heading',
              )}
              style={{ width: ACTION_W }}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span className="text-micro font-semibold">{a.label}</span>
            </button>
          )
        })}
      </div>

      {/* Draggable front */}
      <motion.div
        drag={reduce ? false : 'x'}
        dragConstraints={{ left: -width, right: 0 }}
        dragElastic={0.06}
        dragMomentum={false}
        animate={{ x: open ? -width : 0 }}
        transition={{ type: 'spring', stiffness: 440, damping: 40 }}
        onDragEnd={onDragEnd}
        onClickCapture={(e) => {
          // When open, a tap closes the row instead of activating the child.
          if (open) {
            e.stopPropagation()
            e.preventDefault()
            close()
          }
        }}
        className="relative"
      >
        {children}
      </motion.div>
    </div>
  )
}
