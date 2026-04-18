import { clsx } from 'clsx'

function SkeletonBlock({
  className,
  variant = 'wave',
  style,
}: {
  className?: string
  variant?: 'wave' | 'breath' | 'diagonal'
  style?: React.CSSProperties
}) {
  return (
    <div
      aria-hidden="true"
      style={style}
      className={clsx(
        'rounded-lg',
        variant === 'wave' && 'skeleton-wave',
        variant === 'breath' && 'skeleton-breath',
        variant === 'diagonal' && 'skeleton-shimmer-diagonal',
        className
      )}
    />
  )
}

export function DashboardSkeleton() {
  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Hero row — 3 cards (xl+), stack (md-) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="card-base card-pad-xl el-card relative overflow-hidden"
            style={{ minHeight: 148 }}
          >
            <SkeletonBlock variant="diagonal" className="absolute inset-0" />
            <div className="relative space-y-3">
              <SkeletonBlock variant="breath" className="h-3 w-20" />
              <SkeletonBlock variant="wave" className="h-8 w-40" />
              <SkeletonBlock variant="breath" className="h-4 w-28" />
            </div>
          </div>
        ))}
      </div>

      {/* Chart row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[0, 1].map((i) => (
          <div key={i} className="card-base card-pad-xl el-card">
            <SkeletonBlock variant="wave" className="h-4 w-32 mb-4" />
            <SkeletonBlock variant="wave" className="w-full" style={{ height: 200 }} />
          </div>
        ))}
      </div>

      {/* Summary grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card-base card-pad-lg el-card space-y-3">
            <SkeletonBlock variant="breath" className="h-3 w-16" />
            <SkeletonBlock variant="wave" className="h-6 w-24" />
          </div>
        ))}
      </div>
    </div>
  )
}
