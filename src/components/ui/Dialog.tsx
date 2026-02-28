import {
  Description,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
  Dialog as HeadlessDialog,
} from '@headlessui/react'
import { clsx } from 'clsx'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'

interface DialogProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl'
  noPadding?: boolean
  role?: 'dialog' | 'alertdialog'
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
  return (
    <HeadlessDialog open={open} onClose={onClose} className="relative z-[var(--z-overlay)]" role={role}>
      <DialogBackdrop
        transition
        className={clsx(
          'fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-[2px]',
          'transition data-[closed]:opacity-0 data-[enter]:duration-300 data-[leave]:duration-200 data-[enter]:ease-out data-[leave]:ease-in'
        )}
      />

      <div className="fixed inset-0 overflow-y-auto pt-6 sm:pt-0">
        <div className="grid min-h-full grid-rows-[1fr_auto] justify-items-center sm:grid-rows-[1fr_auto_3fr] sm:p-4">
          <DialogPanel
            transition
            className={clsx(
              'row-start-2 w-full min-w-0 rounded-t-2xl bg-white shadow-2xl ring-1 ring-zinc-200',
              noPadding
                ? 'pb-[env(safe-area-inset-bottom,0px)]'
                : 'p-6 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] sm:p-8 sm:pb-8',
              'dark:bg-zinc-900 dark:ring-zinc-700',
              'sm:mb-auto sm:rounded-xl',
              sizeStyles[size],
              'transition duration-300 data-[closed]:translate-y-12 data-[closed]:opacity-0 data-[enter]:ease-out data-[leave]:ease-in',
              'sm:data-[closed]:translate-y-0 sm:data-[closed]:scale-95 sm:data-[closed]:data-[enter]:duration-300 sm:data-[closed]:data-[leave]:duration-200'
            )}
          >
            {/* Mobile drag handle indicator */}
            <div className="sm:hidden flex justify-center pt-2 pb-1" aria-hidden="true">
              <div className="w-10 h-1 rounded-full bg-zinc-300 dark:bg-zinc-600" />
            </div>
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
      <DialogTitle className="text-balance text-lg/6 font-semibold text-zinc-950 dark:text-white sm:text-base/6">
        {title}
      </DialogTitle>
      {description && (
        <Description className="mt-2 text-pretty text-sm/6 text-zinc-500 dark:text-zinc-400">
          {description}
        </Description>
      )}
      {onClose && (
        <div className="absolute right-0 top-0">
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
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
