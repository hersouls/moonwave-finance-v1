import type { ReactNode } from 'react'
import { clsx } from 'clsx'
import { Button } from './Button'

interface EmptyStateAction {
  label: string
  onClick: () => void
  variant?: 'primary' | 'secondary'
  icon?: ReactNode
}

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description?: string
  action?: EmptyStateAction
  secondaryAction?: EmptyStateAction
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  size = 'md',
}: EmptyStateProps) {
  const sizeStyles = {
    sm: {
      container: 'py-8',
      iconWrapper: 'p-3 mb-3',
      iconSize: 'w-8 h-8',
      title: 'text-lg',
      description: 'text-sm',
    },
    md: {
      container: 'py-12',
      iconWrapper: 'p-5 mb-4',
      iconSize: 'w-10 h-10',
      title: 'text-xl',
      description: 'text-base',
    },
    lg: {
      container: 'py-16',
      iconWrapper: 'p-6 mb-6',
      iconSize: 'w-12 h-12',
      title: 'text-2xl',
      description: 'text-base',
    },
  }

  const styles = sizeStyles[size]

  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center text-center',
        styles.container,
        className
      )}
    >
      <div
        className={clsx(
          'rounded-full bg-primary-100 dark:bg-primary-900/30',
          styles.iconWrapper
        )}
      >
        <div className={clsx('text-primary-600 dark:text-primary-400', styles.iconSize)}>
          {icon}
        </div>
      </div>

      <h3
        className={clsx(
          'font-bold text-zinc-900 dark:text-zinc-100 mb-2',
          styles.title
        )}
      >
        {title}
      </h3>

      {description && (
        <p
          className={clsx(
            'text-zinc-500 dark:text-zinc-400 max-w-md mb-6',
            styles.description
          )}
        >
          {description}
        </p>
      )}

      {(action || secondaryAction) && (
        <div className="flex flex-col sm:flex-row gap-3">
          {action && (
            <Button
              variant={action.variant || 'primary'}
              onClick={action.onClick}
              leftIcon={action.icon}
            >
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button
              variant={secondaryAction.variant || 'secondary'}
              onClick={secondaryAction.onClick}
              leftIcon={secondaryAction.icon}
            >
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

// Preset variants for common use cases
interface SearchEmptyStateProps {
  query: string
  onClear?: () => void
}

export function SearchEmptyState({ query, onClear }: SearchEmptyStateProps) {
  return (
    <EmptyState
      icon={
        <svg className="w-full h-full" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      }
      title="검색 결과가 없습니다"
      description={`"${query}"에 대한 결과를 찾을 수 없습니다. 다른 키워드로 검색해보세요.`}
      action={onClear ? { label: '검색어 지우기', onClick: onClear, variant: 'secondary' } : undefined}
      size="sm"
    />
  )
}

interface ErrorEmptyStateProps {
  title?: string
  description?: string
  onRetry?: () => void
}

export function ErrorEmptyState({
  title = '오류가 발생했습니다',
  description = '잠시 후 다시 시도해주세요.',
  onRetry,
}: ErrorEmptyStateProps) {
  return (
    <EmptyState
      icon={
        <svg className="w-full h-full" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      }
      title={title}
      description={description}
      action={onRetry ? { label: '다시 시도', onClick: onRetry } : undefined}
      size="sm"
    />
  )
}
