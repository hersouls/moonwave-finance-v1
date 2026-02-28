import { clsx } from 'clsx'
import type { ReactNode, ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  leftIcon?: ReactNode
  rightIcon?: ReactNode
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  color?: 'primary' | 'secondary' | 'danger'
  plain?: boolean
  size?: 'sm' | 'md' | 'lg'
}

const variantStyles = {
  primary: 'bg-primary-500 hover:bg-primary-600 text-white border-transparent',
  secondary: 'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 border-transparent',
  danger: 'bg-danger-500 hover:bg-danger-600 text-white border-transparent',
  ghost: 'bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-transparent',
}

const sizeStyles = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
}

export function Button({ children, variant = 'primary', size = 'md', leftIcon, rightIcon, className, disabled, ...props }: ButtonProps) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium',
        'border transition-all active:scale-95',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-900',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      disabled={disabled}
      {...props}
    >
      {leftIcon}
      {children}
      {rightIcon}
    </button>
  )
}

const iconButtonColors = {
  primary: {
    solid: 'bg-primary-500 hover:bg-primary-600 text-white',
    plain: 'text-primary-600 hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-900/30',
  },
  secondary: {
    solid: 'bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-200',
    plain: 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800',
  },
  danger: {
    solid: 'bg-danger-500 hover:bg-danger-600 text-white',
    plain: 'text-danger-600 hover:bg-danger-50 dark:text-danger-400 dark:hover:bg-danger-900/30',
  },
}

const iconButtonSizes = {
  sm: 'p-2 min-w-[40px] min-h-[40px]',
  md: 'p-2.5 min-w-[44px] min-h-[44px]',
  lg: 'p-3 min-w-[48px] min-h-[48px]',
}

export function IconButton({ children, color = 'secondary', plain = false, size = 'md', className, disabled, ...props }: IconButtonProps) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center rounded-lg transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-900',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        iconButtonColors[color][plain ? 'plain' : 'solid'],
        iconButtonSizes[size],
        className
      )}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  )
}
