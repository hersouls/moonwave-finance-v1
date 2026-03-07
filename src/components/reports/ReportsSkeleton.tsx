import { Skeleton } from '@/components/ui/Skeleton'

export function ReportsSkeleton() {
  return (
    <div className="p-4 lg:p-6 space-y-6 animate-pulse">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="card-base card-pad-xl">
          <Skeleton variant="text" width={140} height={16} />
          <div className="mt-4">
            <Skeleton variant="rectangular" width="100%" height={200} />
          </div>
        </div>
      ))}
    </div>
  )
}
