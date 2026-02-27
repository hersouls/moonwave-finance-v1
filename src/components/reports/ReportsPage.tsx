import { useEffect, useState } from 'react'
import { BarChart3 } from 'lucide-react'
import { useAssetStore } from '@/stores/assetStore'
import { useDailyValueStore } from '@/stores/dailyValueStore'
import { useMemberStore } from '@/stores/memberStore'
import { useAssetStats } from '@/hooks/useAssetStats'
import { NetWorthTrendChart } from '@/components/dashboard/NetWorthTrendChart'
import { AssetAllocationChart } from '@/components/dashboard/AssetAllocationChart'
import { DailyChangeChart } from '@/components/dashboard/DailyChangeChart'
import { MemberSummaryCards } from '@/components/dashboard/MemberSummaryCards'
import { IncomeExpenseTrendChart } from './IncomeExpenseTrendChart'
import { SavingsRateChart } from './SavingsRateChart'
import { PeriodComparisonCard } from './PeriodComparisonCard'
import { ReportsSkeleton } from './ReportsSkeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { Card } from '@/components/ui/Card'
import { formatKoreanUnit, formatPercent } from '@/utils/format'
import { clsx } from 'clsx'

export function ReportsPage() {
  const [isLoading, setIsLoading] = useState(true)

  const loadAll = useAssetStore((s) => s.loadAll)
  const loadValues = useDailyValueStore((s) => s.loadValues)
  const loadMembers = useMemberStore((s) => s.loadMembers)
  const items = useAssetStore((s) => s.items)

  const stats = useAssetStats()

  useEffect(() => {
    const init = async () => {
      await Promise.all([loadAll(), loadValues(), loadMembers()])
      setIsLoading(false)
    }
    init()
  }, [])

  if (isLoading) return <ReportsSkeleton />

  if (items.length === 0) {
    return (
      <div className="p-4 lg:p-6">
        <EmptyState
          icon={<BarChart3 className="w-full h-full" />}
          title="분석할 데이터가 없습니다"
          description="자산을 등록하고 값을 입력하면 분석 리포트를 확인할 수 있습니다."
        />
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="!p-4 text-center">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">순자산</span>
          <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tabular-nums mt-1">
            {formatKoreanUnit(stats.netWorth)}
          </p>
        </Card>
        <Card className="!p-4 text-center">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">총 자산</span>
          <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums mt-1">
            {formatKoreanUnit(stats.totalAssets)}
          </p>
        </Card>
        <Card className="!p-4 text-center">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">총 부채</span>
          <p className="text-lg font-bold text-red-600 dark:text-red-400 tabular-nums mt-1">
            {formatKoreanUnit(stats.totalLiabilities)}
          </p>
        </Card>
        <Card className="!p-4 text-center">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">부채비율</span>
          <p className={clsx(
            'text-lg font-bold tabular-nums mt-1',
            stats.debtRatio < 30 ? 'text-emerald-600 dark:text-emerald-400'
              : stats.debtRatio < 60 ? 'text-amber-600 dark:text-amber-400'
              : 'text-red-600 dark:text-red-400'
          )}>
            {formatPercent(stats.debtRatio)}
          </p>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <NetWorthTrendChart />
        <AssetAllocationChart />
      </div>

      <DailyChangeChart />

      {/* Income/Expense Trend + Savings Rate */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <IncomeExpenseTrendChart />
        <SavingsRateChart />
      </div>

      {/* Period Comparison */}
      <PeriodComparisonCard />

      {/* Member Summary */}
      <MemberSummaryCards />
    </div>
  )
}
