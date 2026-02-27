import { clsx } from 'clsx'
import type { ReactNode } from 'react'

interface BadgeProps {
  children: ReactNode
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger'
  size?: 'sm' | 'md'
  className?: string
}

const variantStyles = {
  default: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  primary: 'bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300',
  success: 'bg-success-50 text-success-700 dark:bg-success-900/50 dark:text-success-300',
  warning: 'bg-warning-50 text-warning-700 dark:bg-warning-900/50 dark:text-warning-300',
  danger: 'bg-danger-50 text-danger-700 dark:bg-danger-900/50 dark:text-danger-300',
}

const sizeStyles = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
}

export function Badge({ children, variant = 'default', size = 'sm', className }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center justify-center rounded-full font-medium',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
    >
      {children}
    </span>
  )
}

interface CategoryBadgeProps {
  name: string
  color: string
  size?: 'sm' | 'md'
}

export function CategoryBadge({ name, color, size = 'sm' }: CategoryBadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'
      )}
      style={{ backgroundColor: `${color}20`, color }}
    >
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
      {name}
    </span>
  )
}
