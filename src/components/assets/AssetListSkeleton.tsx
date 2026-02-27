import { SkeletonCard } from '@/components/ui/Skeleton'

export function AssetListSkeleton() {
  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex gap-2 mb-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-9 w-20 bg-zinc-200 dark:bg-zinc-700 rounded-md animate-pulse" />
        ))}
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}
