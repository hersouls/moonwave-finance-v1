import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, ArrowRight } from 'lucide-react'
import { useAssetStore } from '@/stores/assetStore'
import { useDailyValueStore } from '@/stores/dailyValueStore'
import { useMemberStore } from '@/stores/memberStore'
import { useAssetStats, useCategoryBreakdown } from '@/hooks/useAssetStats'
import { NetWorthCard } from './NetWorthCard'
import { AssetLiabilityBreakdown } from './AssetLiabilityBreakdown'
import { NetWorthTrendChart } from './NetWorthTrendChart'
import { AssetAllocationChart } from './AssetAllocationChart'
import { DailyChangeChart } from './DailyChangeChart'
import { MemberSummaryCards } from './MemberSummaryCards'
import { DashboardSkeleton } from './DashboardSkeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { Card } from '@/components/ui/Card'
import { useUIStore } from '@/stores/uiStore'
import { formatKoreanUnit, formatPercent } from '@/utils/format'

export function DashboardPage() {
  const [isLoading, setIsLoading] = useState(true)
  const navigate = useNavigate()

  const loadAll = useAssetStore((s) => s.loadAll)
  const loadValues = useDailyValueStore((s) => s.loadValues)
  const loadMembers = useMemberStore((s) => s.loadMembers)
  const items = useAssetStore((s) => s.items)

  const stats = useAssetStats()
  const assetBreakdown = useCategoryBreakdown('asset')
  const liabilityBreakdown = useCategoryBreakdown('liability')
  const openAssetCreateModal = useUIStore((s) => s.openAssetCreateModal)

  useEffect(() => {
    const init = async () => {
      await Promise.all([loadAll(), loadValues(), loadMembers()])
      setIsLoading(false)
    }
    init()
  }, [])

  if (isLoading) return <DashboardSkeleton />

  if (items.length === 0) {
    return (
      <div className="p-4 lg:p-6">
        <EmptyState
          icon={
            <svg className="w-full h-full" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
            </svg>
          }
          title="자산을 등록해보세요"
          description="자산과 부채를 등록하면 순자산을 한눈에 확인할 수 있습니다."
          action={{
            label: '자산 추가하기',
            onClick: openAssetCreateModal,
            icon: <Plus className="w-5 h-5" />,
          }}
          secondaryAction={{
            label: '자산 목록으로',
            onClick: () => navigate('/assets'),
            variant: 'secondary',
          }}
        />
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Net Worth Hero */}
      <NetWorthCard stats={stats} />

      {/* Asset/Liability Summary */}
      <AssetLiabilityBreakdown stats={stats} />

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <NetWorthTrendChart />
        <AssetAllocationChart />
      </div>

      <DailyChangeChart />

      {/* Category Breakdown Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Asset Categories */}
        {assetBreakdown.length > 0 && (
          <Card className="!p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">자산 구성</h3>
              <button
                onClick={() => navigate('/assets')}
                className="text-xs text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-0.5"
              >
                전체보기 <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <div className="space-y-3">
              {assetBreakdown.slice(0, 5).map((bd) => (
                <div key={bd.categoryId} className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: bd.categoryColor }} />
                  <span className="text-sm text-zinc-700 dark:text-zinc-300 flex-1 truncate">{bd.categoryName}</span>
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 tabular-nums">
                    {formatKoreanUnit(bd.total)}
                  </span>
                  <span className="text-xs text-zinc-400 dark:text-zinc-500 w-12 text-right tabular-nums">
                    {formatPercent(bd.percentage, 0)}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Liability Categories */}
        {liabilityBreakdown.length > 0 && (
          <Card className="!p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">부채 구성</h3>
              <button
                onClick={() => navigate('/liabilities')}
                className="text-xs text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-0.5"
              >
                전체보기 <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <div className="space-y-3">
              {liabilityBreakdown.slice(0, 5).map((bd) => (
                <div key={bd.categoryId} className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: bd.categoryColor }} />
                  <span className="text-sm text-zinc-700 dark:text-zinc-300 flex-1 truncate">{bd.categoryName}</span>
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 tabular-nums">
                    {formatKoreanUnit(bd.total)}
                  </span>
                  <span className="text-xs text-zinc-400 dark:text-zinc-500 w-12 text-right tabular-nums">
                    {formatPercent(bd.percentage, 0)}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* Member Breakdown */}
      <MemberSummaryCards />
    </div>
  )
}
