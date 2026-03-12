import type { ReactNode } from 'react'
import { clsx } from 'clsx'

interface ContentTransitionProps {
  isLoading: boolean
  skeleton: ReactNode
  children: ReactNode
}

export function ContentTransition({ isLoading, skeleton, children }: ContentTransitionProps) {
  return (
    <div className="relative">
      <div
        className={clsx(
          'transition-opacity duration-300',
          isLoading ? 'opacity-100' : 'opacity-0 pointer-events-none absolute inset-0'
        )}
      >
        {skeleton}
      </div>
      <div
        className={clsx(
          'transition-opacity duration-300',
          isLoading ? 'opacity-0 absolute inset-0 pointer-events-none' : 'opacity-100'
        )}
      >
        {children}
      </div>
    </div>
  )
}
