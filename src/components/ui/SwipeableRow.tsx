import type { ReactNode } from 'react'
import { Trash2, Pencil } from 'lucide-react'
import { useSwipeAction } from '@/hooks/useSwipeAction'
import { clsx } from 'clsx'

interface SwipeableRowProps {
  children: ReactNode
  onDelete?: () => void
  onEdit?: () => void
  className?: string
  disabled?: boolean
}

export function SwipeableRow({ children, onDelete, onEdit, className, disabled }: SwipeableRowProps) {
  const { offsetX, isSwiping, onTouchStart, onTouchMove, onTouchEnd } = useSwipeAction({
    onSwipeLeft: onDelete,
    onSwipeRight: onEdit,
    threshold: 80,
  })

  if (disabled) return <div className={className}>{children}</div>

  const showDelete = offsetX < -20
  const showEdit = offsetX > 20
  const deleteProgress = Math.min(Math.abs(offsetX) / 80, 1)
  const editProgress = Math.min(offsetX / 80, 1)

  return (
    <div className={clsx('relative overflow-hidden touch-pan-y', className)}>
      {/* Background actions */}
      {showDelete && (
        <div
          className="absolute inset-y-0 right-0 flex items-center justify-end bg-danger-500 transition-opacity"
          style={{ width: Math.abs(offsetX), opacity: deleteProgress }}
        >
          <Trash2 className="w-5 h-5 text-white mr-4" />
        </div>
      )}
      {showEdit && (
        <div
          className="absolute inset-y-0 left-0 flex items-center justify-start bg-primary-500 transition-opacity"
          style={{ width: offsetX, opacity: editProgress }}
        >
          <Pencil className="w-5 h-5 text-white ml-4" />
        </div>
      )}

      {/* Content */}
      <div
        className={clsx('relative bg-white dark:bg-zinc-900', isSwiping && 'select-none')}
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: isSwiping ? 'none' : 'transform 200ms ease-out',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {children}
      </div>
    </div>
  )
}
