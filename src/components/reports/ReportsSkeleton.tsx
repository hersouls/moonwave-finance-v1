import { Skeleton } from '@/components/ui/Skeleton'

export function ReportsSkeleton() {
  return (
    <div className="p-4 lg:p-6 space-y-6 animate-pulse">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
          <Skeleton variant="text" width={140} height={16} />
          <div className="mt-4">
            <Skeleton variant="rectangular" width="100%" height={200} />
          </div>
        </div>
      ))}
    </div>
  )
}
