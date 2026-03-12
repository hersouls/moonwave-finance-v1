import { type RefObject } from 'react'
import { Loader2, ArrowDown } from 'lucide-react'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'

interface PullToRefreshProps {
  onRefresh: () => Promise<void>
  scrollRef?: RefObject<HTMLElement | null>
}

export function PullToRefreshIndicator({ onRefresh, scrollRef }: PullToRefreshProps) {
  const { pullDistance, isRefreshing, isPulling } = usePullToRefresh({
    onRefresh,
    threshold: 80,
    scrollRef,
  })

  const showIndicator = isPulling || isRefreshing
  const progress = Math.min(pullDistance / 80, 1)
  const isReady = progress >= 1

  if (!showIndicator) return null

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[var(--z-toast)] flex justify-center pointer-events-none"
      style={{
        transform: `translateY(${isRefreshing ? 60 : pullDistance}px)`,
        transition: isPulling ? 'none' : 'transform 300ms ease-out',
      }}
    >
      <div className="bg-white dark:bg-zinc-800 rounded-full p-2 elevation-2 -mt-8">
        {isRefreshing ? (
          <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
        ) : (
          <ArrowDown
            className="w-6 h-6 text-primary-500 transition-transform"
            style={{
              transform: `rotate(${isReady ? 180 : 0}deg)`,
              opacity: progress,
            }}
          />
        )}
      </div>
    </div>
  )
}
