import { Landmark, CreditCard } from 'lucide-react'
import { clsx } from 'clsx'
import { formatPercent } from '@/utils/format'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import type { AssetStats } from '@/lib/types'

interface AssetLiabilityBreakdownProps {
  stats: AssetStats
}

export function AssetLiabilityBreakdown({ stats }: AssetLiabilityBreakdownProps) {
  const { totalAssets, totalLiabilities, debtRatio } = stats

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* Total Assets Card */}
      <div className="card-base card-pad-lg">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
            <Landmark className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <span className="text-body3 text-zinc-500 dark:text-zinc-400">총 자산</span>
        </div>
        <p className="text-heading2 text-emerald-600 dark:text-emerald-400 tabular-nums">
          <AnimatedNumber value={totalAssets} />
          <span className="text-sm text-zinc-400 dark:text-zinc-500 ml-1">원</span>
        </p>
      </div>

      {/* Total Liabilities Card */}
      <div className="card-base card-pad-lg">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2.5 rounded-lg bg-red-100 dark:bg-red-900/30">
            <CreditCard className="w-5 h-5 text-red-600 dark:text-red-400" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-body3 text-zinc-500 dark:text-zinc-400">총 부채</span>
            <span className={clsx(
              'text-caption px-2 py-0.5 rounded-full font-medium',
              debtRatio < 30
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                : debtRatio < 60
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
            )}>
              {formatPercent(debtRatio)}
            </span>
          </div>
        </div>
        <p className="text-heading2 text-red-600 dark:text-red-400 tabular-nums">
          <AnimatedNumber value={totalLiabilities} />
          <span className="text-sm text-zinc-400 dark:text-zinc-500 ml-1">원</span>
        </p>
      </div>
    </div>
  )
}
