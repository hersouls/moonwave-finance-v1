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
        'card-base',
        variant === 'interactive' && 'card-interactive',
        onClick && 'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 active:scale-[0.98]',
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
