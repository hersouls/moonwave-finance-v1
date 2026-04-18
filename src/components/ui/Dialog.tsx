import {
  Description,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
  Dialog as HeadlessDialog,
} from '@headlessui/react'
import { clsx } from 'clsx'
import { X } from 'lucide-react'
import { useRef, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react'

interface DialogProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl'
  noPadding?: boolean
  role?: 'dialog' | 'alertdialog'
}

/**
 * Hook: touch drag-to-dismiss handler for the sheet handle (mobile only).
 * Returns pointer handlers to attach to the handle.
 */
function useSheetDismissGesture(onDismiss: () => void) {
  const state = useRef<{ startY: number; startT: number } | null>(null)
  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.pointerType !== 'touch') return
    state.current = { startY: e.clientY, startT: performance.now() }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onPointerUp = (e: ReactPointerEvent<HTMLElement>) => {
    if (!state.current) return
    const dy = e.clientY - state.current.startY
    const dt = performance.now() - state.current.startT
    const velocity = dy / Math.max(dt, 1) // px/ms
    state.current = null
    if (dy > 60 || (dy > 20 && velocity > 0.6)) {
      onDismiss()
    }
  }
  const onPointerCancel = () => {
    state.current = null
  }
  return { onPointerDown, onPointerUp, onPointerCancel }
}

const sizeStyles = {
  xs: 'sm:max-w-xs',
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-xl',
  '2xl': 'sm:max-w-2xl',
  '3xl': 'sm:max-w-3xl',
  '4xl': 'sm:max-w-4xl',
  '5xl': 'sm:max-w-5xl',
}

export function Dialog({ open, onClose, children, size = 'lg', noPadding = false, role }: DialogProps) {
  const dismiss = useSheetDismissGesture(onClose)
  return (
    <HeadlessDialog open={open} onClose={onClose} className="relative z-[var(--z-overlay)]" role={role}>
      <DialogBackdrop
        transition
        className={clsx(
          'fixed inset-0 bg-black/40 dark:bg-black/60',
          'backdrop-blur-[12px] saturate-[1.4]',
          'transition data-[closed]:opacity-0 data-[enter]:duration-300 data-[leave]:duration-200 data-[enter]:ease-out data-[leave]:ease-in'
        )}
      />

      <div className="fixed inset-0 overflow-y-auto pt-6 sm:pt-0">
        <div className="grid min-h-full grid-rows-[1fr_auto] justify-items-center sm:grid-rows-[1fr_auto_3fr] sm:p-4">
          <DialogPanel
            transition
            className={clsx(
              'row-start-2 w-full min-w-0 rounded-t-2xl bg-surface-primary elevation-4 ring-1 ring-[var(--border-default)] el-dialog',
              'overflow-hidden', // 내부 자식이 rounded 모서리를 덮는 문제 방지
              noPadding
                ? 'pb-[env(safe-area-inset-bottom,0px)]'
                : 'fold:p-4 fold:pb-[max(1rem,env(safe-area-inset-bottom,0px))] p-6 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] sm:p-8 sm:pb-8',
              'sm:mb-auto sm:rounded-2xl',
              sizeStyles[size],
              'transition duration-300 data-[closed]:translate-y-12 data-[closed]:opacity-0 data-[enter]:ease-out data-[leave]:ease-in',
              'sm:data-[closed]:translate-y-0 sm:data-[closed]:scale-95 sm:data-[closed]:data-[enter]:duration-300 sm:data-[closed]:data-[leave]:duration-200'
            )}
          >
            {/* Mobile drag handle — tap or swipe-down to dismiss */}
            <button
              type="button"
              className="sm:hidden sheet-handle w-full touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring-focus)] rounded-full"
              aria-label="시트 닫기"
              onClick={onClose}
              onPointerDown={dismiss.onPointerDown}
              onPointerUp={dismiss.onPointerUp}
              onPointerCancel={dismiss.onPointerCancel}
            />
            {children}
          </DialogPanel>
        </div>
      </div>
    </HeadlessDialog>
  )
}

interface DialogHeaderProps {
  title: string
  description?: string
  onClose?: () => void
}

export function DialogHeader({ title, description, onClose }: DialogHeaderProps) {
  return (
    <div className="relative">
      <DialogTitle className="text-balance text-title2 text-heading sm:text-base/6">
        {title}
      </DialogTitle>
      {description && (
        <Description className="mt-2 text-pretty text-sm/6 text-sub">
          {description}
        </Description>
      )}
      {onClose && (
        <div className="absolute right-0 top-0">
          <button
            onClick={onClose}
            className="touch-target-icon text-sub hover:text-heading hover:bg-[var(--hover-bg)] transition-colors"
            aria-label="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  )
}

interface DialogBodyProps {
  children: ReactNode
  className?: string
}

export function DialogBody({ children, className }: DialogBodyProps) {
  return <div className={clsx('mt-6', className)}>{children}</div>
}

interface DialogFooterProps {
  children: ReactNode
  className?: string
}

export function DialogFooter({ children, className }: DialogFooterProps) {
  return (
    <div
      className={clsx(
        'mt-6 flex flex-col-reverse items-center justify-end gap-3 *:w-full sm:flex-row sm:*:w-auto',
        className
      )}
    >
      {children}
    </div>
  )
}
