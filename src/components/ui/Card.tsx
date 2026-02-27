import { clsx } from 'clsx'
import type { ReactNode, MouseEvent, KeyboardEvent } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  onClick?: (e: MouseEvent) => void
  variant?: 'default' | 'interactive'
}

export function Card({ children, className, onClick, variant = 'default' }: CardProps) {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (onClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      onClick(e as unknown as MouseEvent)
    }
  }

  return (
    <div
      className={clsx(
        'bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4',
        variant === 'interactive' && 'cursor-pointer hover:border-primary-300 dark:hover:border-primary-700 hover:shadow-md transition-all duration-200',
        onClick && 'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2',
        className
      )}
      onClick={onClick}
      onKeyDown={onClick ? handleKeyDown : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {children}
    </div>
  )
}
