import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton'

export function DashboardSkeleton() {
  return (
    <div className="p-4 lg:p-6 space-y-6 animate-pulse">
      {/* Net worth card skeleton */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
        <Skeleton variant="text" width={80} height={14} />
        <div className="mt-2">
          <Skeleton variant="text" width={200} height={32} />
        </div>
        <div className="mt-3 flex gap-4">
          <Skeleton variant="text" width={120} height={16} />
          <Skeleton variant="text" width={120} height={16} />
        </div>
      </div>

      {/* Asset/Liability cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>

      {/* Chart skeletons */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
          <Skeleton variant="text" width={120} height={16} />
          <div className="mt-4">
            <Skeleton variant="rectangular" width="100%" height={200} />
          </div>
        </div>
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
          <Skeleton variant="text" width={120} height={16} />
          <div className="mt-4">
            <Skeleton variant="rectangular" width="100%" height={200} />
          </div>
        </div>
      </div>
    </div>
  )
}
