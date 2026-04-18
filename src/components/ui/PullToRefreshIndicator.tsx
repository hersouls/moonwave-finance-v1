import { RefreshCw } from 'lucide-react'
import { clsx } from 'clsx'

interface Props {
  distance: number
  progress: number
  refreshing: boolean
}

/** Top-anchored indicator that reveals as user pulls down. */
export function PullToRefreshIndicator({ distance, progress, refreshing }: Props) {
  if (distance <= 0) return null
  return (
    <div
      aria-hidden="true"
      className="fixed top-0 inset-x-0 z-[var(--z-toast,40)] flex justify-center pointer-events-none"
      style={{
        transform: `translateY(${Math.max(0, distance - 40)}px)`,
        transition: refreshing ? 'transform 200ms var(--ease-out-expo, ease)' : undefined,
      }}
    >
      <div
        className={clsx(
          'surface-haze-heavy rounded-full p-2.5 mt-2',
          'shadow-[0_8px_24px_var(--glow-primary)]',
          'el-soft',
        )}
      >
        <RefreshCw
          className={clsx(
            'w-5 h-5 text-primary-500',
            refreshing && 'animate-spin',
          )}
          style={{
            transform: refreshing ? undefined : `rotate(${progress * 270}deg)`,
            opacity: 0.5 + progress * 0.5,
          }}
        />
      </div>
    </div>
  )
}
