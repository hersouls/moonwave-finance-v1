import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { X } from 'lucide-react'
import { clsx } from 'clsx'
import type { ReactNode } from 'react'
import { useBreakpoint } from '@/hooks/useBreakpoint'

interface InspectorPanelProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  className?: string
  /** Optional actions rendered in the panel header (right of the title). */
  actions?: ReactNode
}

/**
 * Desktop (>=xl / 1024px) master-detail right inspector.
 *
 * Non-modal: it lives in the second column of a `.master-detail.has-inspector`
 * grid, stays sticky with its own scroll, and slides in from the right.
 * Below xl it renders NOTHING — callers should fall back to a Dialog / bottom
 * sheet (which on mobile is already a drag-to-dismiss sheet) for the same data.
 *
 * Usage:
 *   const { isDesktop } = useBreakpoint()
 *   <div className={clsx('master-detail', isDesktop && selected && 'has-inspector')}>
 *     <ListColumn ... />
 *     <InspectorPanel open={!!selected} onClose={...} title={selected?.name}>
 *       <DetailBody item={selected} />
 *     </InspectorPanel>
 *   </div>
 */
export function InspectorPanel({
  open,
  onClose,
  title,
  children,
  className,
  actions,
}: InspectorPanelProps) {
  const { isDesktop } = useBreakpoint()
  const reduce = useReducedMotion()

  // Mobile/tablet: the inspector is not used — caller renders a sheet instead.
  if (!isDesktop) return null

  return (
    <AnimatePresence mode="wait">
      {open && (
        <motion.aside
          key="inspector"
          role="complementary"
          aria-label={title || '상세 정보'}
          initial={reduce ? { opacity: 0 } : { opacity: 0, x: 24 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, x: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, x: 24 }}
          transition={{ type: 'spring', stiffness: 360, damping: 32 }}
          className={clsx('inspector-panel inspector-panel--docked el-card', className)}
        >
          {(title || actions) && (
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-base bg-surface-primary px-5 py-4">
              <h2 className="text-title2 text-heading truncate">{title}</h2>
              <div className="flex items-center gap-1">
                {actions}
                <button
                  onClick={onClose}
                  className="touch-target rounded-lg text-sub transition-colors hover:bg-[var(--hover-bg)] hover:text-heading focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring-focus)]"
                  aria-label="상세 패널 닫기"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
          )}
          <div className="p-5">{children}</div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
