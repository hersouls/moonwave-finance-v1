import { Landmark, CreditCard } from 'lucide-react'
import { clsx } from 'clsx'
import { formatPercent } from '@/utils/format'
import { Amount } from '@/components/ui/Amount'
import type { AssetStats } from '@/lib/types'

interface AssetLiabilityBreakdownProps {
  stats: AssetStats
}

export function AssetLiabilityBreakdown({ stats }: AssetLiabilityBreakdownProps) {
  const { totalAssets, totalLiabilities, debtRatio } = stats

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* Total Assets Card */}
      <div className="card-base card-pad-lg el-card-elevated surface-inset-top">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2.5 rounded-lg bg-status-success">
            <Landmark className="w-5 h-5 text-success-600" />
          </div>
          <span className="text-body3 text-sub">총 자산</span>
        </div>
        <p className="text-heading2 text-status-success">
          <Amount value={totalAssets} size="title" className="text-status-success" />
        </p>
      </div>

      {/* Total Liabilities Card */}
      <div className="card-base card-pad-lg el-card-elevated surface-inset-top">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2.5 rounded-lg bg-status-danger">
            <CreditCard className="w-5 h-5 text-danger-600" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-body3 text-sub">총 부채</span>
            <span className={clsx(
              'text-caption px-2 py-0.5 rounded-full font-medium',
              debtRatio < 30
                ? 'bg-status-success-soft text-status-success'
                : debtRatio < 60
                ? 'bg-status-warning-soft text-status-warning'
                : 'bg-status-danger-soft text-status-danger'
            )}>
              {formatPercent(debtRatio)}
            </span>
          </div>
        </div>
        <p className="text-heading2 text-status-danger">
          <Amount value={totalLiabilities} size="title" className="text-status-danger" />
        </p>
      </div>
    </div>
  )
}
