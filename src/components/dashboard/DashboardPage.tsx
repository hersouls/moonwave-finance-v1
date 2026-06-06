import { useEffect, useState, useMemo } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  staggerContainer,
  staggerItem,
  reducedStaggerContainer,
  reducedStaggerItem,
  motionVariants,
} from '@/lib/motionConfig'
import { useNavigate } from 'react-router-dom'
import { Plus, ArrowRight } from 'lucide-react'
import { useAssetStore } from '@/stores/assetStore'
import { useDailyValueStore } from '@/stores/dailyValueStore'
import { useMemberStore } from '@/stores/memberStore'
import { useGoalStore } from '@/stores/goalStore'
import { useTransactionStore } from '@/stores/transactionStore'
import { useAssetStats, useCategoryBreakdown } from '@/hooks/useAssetStats'
import { DashboardHero } from './DashboardHero'
import { AssetLiabilityBreakdown } from './AssetLiabilityBreakdown'
import { LedgerSummaryCard } from './LedgerSummaryCard'
import { NetWorthTracker } from './NetWorthTracker'
import { NetWorthTrendChart } from './NetWorthTrendChart'
import { AssetAllocationChart } from './AssetAllocationChart'
import { DailyChangeChart } from './DailyChangeChart'
import { MemberSummaryCards } from './MemberSummaryCards'
import { DashboardSkeleton } from './DashboardSkeleton'
import { SubscriptionWidget } from './SubscriptionWidget'
import { GoalCard } from '@/components/goals/GoalCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { Card } from '@/components/ui/Card'
import { Amount } from '@/components/ui/Amount'
import { useUIStore } from '@/stores/uiStore'
import { formatPercent } from '@/utils/format'
import { ErrorEmptyState } from '@/components/ui/EmptyState'
import { useSyncListener } from '@/hooks/useSyncListener'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'
import { PullToRefreshIndicator } from '@/components/ui/PullToRefreshIndicator'

export function DashboardPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const loadAll = useAssetStore((s) => s.loadAll)
  const loadValues = useDailyValueStore((s) => s.loadValues)
  const loadAllValues = useDailyValueStore((s) => s.loadAllValues)
  const loadMembers = useMemberStore((s) => s.loadMembers)
  const loadGoals = useGoalStore((s) => s.loadGoals)
  const loadTransactions = useTransactionStore((s) => s.loadAll)
  const items = useAssetStore((s) => s.items)
  const goals = useGoalStore((s) => s.goals)
  const activeGoals = useMemo(() => goals.filter(g => !g.isCompleted), [goals])

  const stats = useAssetStats()
  const assetBreakdown = useCategoryBreakdown('asset')
  const liabilityBreakdown = useCategoryBreakdown('liability')
  const openAssetCreateModal = useUIStore((s) => s.openAssetCreateModal)

  // `silent` refreshes (sync echoes, pull-to-refresh) update data in place
  // without flipping back to the full skeleton — otherwise every background sync
  // event re-blanks the dashboard and flickers.
  const loadData = async ({ silent = false }: { silent?: boolean } = {}) => {
    setError(null)
    if (!silent) setIsLoading(true)
    try {
      await Promise.all([loadAll(), loadValues(), loadAllValues(), loadMembers(), loadGoals(), loadTransactions()])
    } catch {
      setError('데이터를 불러오는데 실패했습니다.')
    } finally {
      if (!silent) setIsLoading(false)
    }
  }

  const shouldReduceMotion = useReducedMotion()
  const containerV = motionVariants(shouldReduceMotion, staggerContainer, reducedStaggerContainer)
  const itemV = motionVariants(shouldReduceMotion, staggerItem, reducedStaggerItem)

  useEffect(() => { loadData() }, [])
  useSyncListener(() => loadData({ silent: true }))

  const ptr = usePullToRefresh({ onRefresh: () => loadData({ silent: true }) })

  if (isLoading) return (
    <AnimatePresence mode="wait">
      <motion.div
        key="skeleton"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        <DashboardSkeleton />
      </motion.div>
    </AnimatePresence>
  )

  if (error) {
    return (
      <div className="p-4 lg:p-6">
        <ErrorEmptyState description={error} onRetry={loadData} />
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="p-4 lg:p-6 space-y-6">
        <DashboardHero stats={stats} welcome />
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
    <motion.div
      className="p-4 lg:p-6 space-y-6"
      variants={containerV}
      initial="hidden"
      animate="visible"
      style={{
        transform: ptr.distance > 0 ? `translateY(${ptr.distance * 0.6}px)` : undefined,
        transition: ptr.pulling ? undefined : 'transform 220ms var(--ease-out-expo, ease)',
      }}
    >
      <PullToRefreshIndicator
        distance={ptr.distance}
        progress={ptr.progress}
        refreshing={ptr.refreshing}
      />
      {/* ── 히어로 밴드: 인사 + 예산 미션 + 핵심지표 글래스 칩 (Health dash-hero 포트) ── */}
      <motion.section variants={itemV} aria-label="재무 요약">
        <DashboardHero stats={stats} />
      </motion.section>

      {/* 자산증식 추세 — 순자산 일자별 증감 + 증가율(기울기) */}
      <motion.div variants={itemV}>
        <NetWorthTracker />
      </motion.div>

      {/* 3-Pillar Summary: Asset + Ledger */}
      <motion.div variants={itemV} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
        <AssetLiabilityBreakdown stats={stats} />
        <LedgerSummaryCard />
      </motion.div>

      {/* Subscription Widget (KRW/USD split) */}
      <motion.div variants={itemV}><SubscriptionWidget /></motion.div>

      {/* Budget Overview */}

      {/* Charts */}
      <motion.div variants={itemV} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
        <NetWorthTrendChart />
        <AssetAllocationChart />
      </motion.div>

      <motion.div variants={itemV}><DailyChangeChart /></motion.div>

      {/* Category Breakdown Cards */}
      <motion.div variants={itemV} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
        {/* Asset Categories */}
        {assetBreakdown.length > 0 && (
          <Card className="card-pad-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-body3-semi text-heading">자산 구성</h3>
              <button
                onClick={() => navigate('/assets')}
                className="text-label3-medium text-accent-primary hover:underline flex items-center gap-0.5 min-h-11 px-1 -mr-1"
              >
                전체보기 <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <div className="space-y-3">
              {assetBreakdown.slice(0, 5).map((bd) => (
                <div key={bd.categoryId} className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: bd.categoryColor }} />
                  <span className="text-body3 text-heading flex-1 truncate">{bd.categoryName}</span>
                  <Amount value={bd.total} size="emphasis" className="text-heading" />
                  <span className="text-caption text-disabled w-12 text-right tabular-nums">
                    {formatPercent(bd.percentage, 0)}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Liability Categories */}
        {liabilityBreakdown.length > 0 && (
          <Card className="card-pad-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-body3-semi text-heading">부채 구성</h3>
              <button
                onClick={() => navigate('/liabilities')}
                className="text-label3-medium text-accent-primary hover:underline flex items-center gap-0.5 min-h-11 px-1 -mr-1"
              >
                전체보기 <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <div className="space-y-3">
              {liabilityBreakdown.slice(0, 5).map((bd) => (
                <div key={bd.categoryId} className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: bd.categoryColor }} />
                  <span className="text-body3 text-heading flex-1 truncate">{bd.categoryName}</span>
                  <Amount value={bd.total} size="emphasis" className="text-heading" />
                  <span className="text-caption text-disabled w-12 text-right tabular-nums">
                    {formatPercent(bd.percentage, 0)}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </motion.div>

      {/* Active Goals */}
      {activeGoals.length > 0 && (
        <motion.div variants={itemV}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-body3-semi text-heading">진행 중인 목표</h3>
            <button
              onClick={() => navigate('/profile')}
              className="text-label3-medium text-accent-primary hover:underline flex items-center gap-0.5 min-h-11 px-1 -mr-1"
            >
              전체보기 <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-3">
            {activeGoals.slice(0, 4).map((goal) => (
              <GoalCard key={goal.id} goal={goal} />
            ))}
          </div>
        </motion.div>
      )}

      {/* Member Breakdown */}
      <motion.div variants={itemV}><MemberSummaryCards /></motion.div>
    </motion.div>
  )
}
