import { Skeleton } from '@/components/ui/Skeleton'

export function CalendarSkeleton() {
  return (
    <div className="p-4 lg:p-6 space-y-4 animate-pulse">
      <div className="flex items-center justify-between">
        <Skeleton variant="text" width={120} height={24} />
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="aspect-square bg-zinc-200 dark:bg-zinc-700 rounded-lg" />
        ))}
      </div>
    </div>
  )
}
