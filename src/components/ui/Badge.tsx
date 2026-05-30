import { clsx } from 'clsx'
import type { ReactNode } from 'react'

interface BadgeProps {
  children: ReactNode
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger'
  size?: 'sm' | 'md'
  className?: string
}

const variantStyles = {
  default: 'badge-default',
  primary: 'badge-primary',
  success: 'badge-success',
  warning: 'badge-warning',
  danger: 'badge-danger',
}

const sizeStyles = {
  sm: 'badge-sm',
  md: 'badge-md',
}

export function Badge({ children, variant = 'default', size = 'sm', className }: BadgeProps) {
  return (
    <span
      className={clsx(
        'badge',
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
        'badge-category',
        size === 'sm' ? 'badge-sm' : 'badge-md'
      )}
      style={{ backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`, color }}
    >
      <span className="badge-category-dot" style={{ backgroundColor: color }} />
      {name}
    </span>
  )
}
