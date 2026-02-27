import { clsx } from 'clsx'

interface SkeletonProps {
  className?: string
  variant?: 'text' | 'circular' | 'rectangular'
  width?: string | number
  height?: string | number
  animation?: 'pulse' | 'wave' | 'none'
}

export function Skeleton({
  className,
  variant = 'text',
  width,
  height,
  animation = 'pulse',
}: SkeletonProps) {
  const baseStyles = 'bg-zinc-200 dark:bg-zinc-700'

  const variantStyles = {
    text: 'rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-lg',
  }

  const animationStyles = {
    pulse: 'animate-pulse',
    wave: 'animate-shimmer',
    none: '',
  }

  const style: React.CSSProperties = {}
  if (width) style.width = typeof width === 'number' ? `${width}px` : width
  if (height) style.height = typeof height === 'number' ? `${height}px` : height

  // Default heights based on variant
  if (!height) {
    if (variant === 'text') style.height = '1em'
    if (variant === 'circular') style.height = style.width || '40px'
  }

  return (
    <span
      className={clsx(
        baseStyles,
        variantStyles[variant],
        animationStyles[animation],
        'inline-block',
        className
      )}
      style={style}
      aria-hidden="true"
    />
  )
}

interface SkeletonTextProps {
  lines?: number
  className?: string
}

export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  return (
    <div className={clsx('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          variant="text"
          width={i === lines - 1 ? '60%' : '100%'}
          height={16}
        />
      ))}
    </div>
  )
}

interface SkeletonCardProps {
  className?: string
}

export function SkeletonCard({ className }: SkeletonCardProps) {
  return (
    <div
      className={clsx(
        'p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900',
        className
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <Skeleton variant="circular" width={40} height={40} />
          <div className="space-y-2">
            <Skeleton variant="text" width={120} height={16} />
            <Skeleton variant="text" width={80} height={12} />
          </div>
        </div>
        <Skeleton variant="rectangular" width={60} height={24} />
      </div>
      <div className="space-y-2">
        <Skeleton variant="rectangular" width="100%" height={8} />
        <Skeleton variant="rectangular" width="70%" height={8} />
      </div>
    </div>
  )
}
