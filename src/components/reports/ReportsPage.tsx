import { useEffect, useState } from 'react'
import { BarChart3 } from 'lucide-react'
import { useAssetStore } from '@/stores/assetStore'
import { useDailyValueStore } from '@/stores/dailyValueStore'
import { useMemberStore } from '@/stores/memberStore'
import { useTransactionStore } from '@/stores/transactionStore'
import { useAssetStats } from '@/hooks/useAssetStats'
import { NetWorthTrendChart } from '@/components/dashboard/NetWorthTrendChart'
import { AssetAllocationChart } from '@/components/dashboard/AssetAllocationChart'
import { DailyChangeChart } from '@/components/dashboard/DailyChangeChart'
import { MemberSummaryCards } from '@/components/dashboard/MemberSummaryCards'
import { IncomeExpenseTrendChart } from './IncomeExpenseTrendChart'
import { SavingsRateChart } from './SavingsRateChart'
import { PeriodComparisonCard } from './PeriodComparisonCard'
import { DailyNetWorthChart } from './DailyNetWorthChart'
import { SubscriptionAnalysis } from './SubscriptionAnalysis'
import { ReportsSkeleton } from './ReportsSkeleton'
import { LedgerAnalysisHero } from './LedgerAnalysisHero'
import { LedgerInsightsRow } from './LedgerInsightsRow'
import { CashFlowTimeline } from './CashFlowTimeline'
import { CategoryDeepDive } from './CategoryDeepDive'
import { useLedgerAnalysis, type InsightAnchor } from '@/hooks/useLedgerAnalysis'
import { EmptyState, ErrorEmptyState } from '@/components/ui/EmptyState'
import { Tabs } from '@/components/ui/Tabs'
import { Card } from '@/components/ui/Card'
import { formatKoreanUnit, formatPercent } from '@/utils/format'
import { clsx } from 'clsx'
import { useSyncListener } from '@/hooks/useSyncListener'

const REPORT_TABS = [
  { id: 'asset', label: '자산 분석' },
  { id: 'ledger', label: '가계부 분석' },
  { id: 'subscription', label: '구독 분석' },
]

export function ReportsPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('asset')

  const loadAll = useAssetStore((s) => s.loadAll)
  const loadValues = useDailyValueStore((s) => s.loadValues)
  const loadAllValues = useDailyValueStore((s) => s.loadAllValues)
  const loadMembers = useMemberStore((s) => s.loadMembers)
  const loadTransactions = useTransactionStore((s) => s.loadAll)
  const items = useAssetStore((s) => s.items)

  const stats = useAssetStats()

  const loadData = async () => {
    setError(null)
    setIsLoading(true)
    try {
      await Promise.all([loadAll(), loadValues(), loadAllValues(), loadMembers(), loadTransactions()])
    } catch {
      setError('데이터를 불러오는데 실패했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])
  useSyncListener(loadData)

  if (isLoading) return <ReportsSkeleton />

  if (error) {
    return (
      <div className="p-4 lg:p-6">
        <ErrorEmptyState description={error} onRetry={loadData} />
      </div>
    )
  }

  if (items.length === 0 && activeTab === 'asset') {
    return (
      <div className="p-4 lg:p-6 space-y-4">
        <Tabs tabs={REPORT_TABS} activeTab={activeTab} onChange={setActiveTab} />
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
      {/* Tab Navigation */}
      <Tabs tabs={REPORT_TABS} activeTab={activeTab} onChange={setActiveTab} />

      {/* Asset Analysis Tab */}
      {activeTab === 'asset' && (
        <div className="space-y-6">
          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="text-center">
              <span className="text-caption text-sub">순자산</span>
              <p className="text-title2 text-heading tabular-nums mt-1">
                {formatKoreanUnit(stats.netWorth)}
              </p>
            </Card>
            <Card className="text-center">
              <span className="text-caption text-sub">총 자산</span>
              <p className="text-title2 text-status-success tabular-nums mt-1">
                {formatKoreanUnit(stats.totalAssets)}
              </p>
            </Card>
            <Card className="text-center">
              <span className="text-caption text-sub">총 부채</span>
              <p className="text-title2 text-status-danger tabular-nums mt-1">
                {formatKoreanUnit(stats.totalLiabilities)}
              </p>
            </Card>
            <Card className="text-center">
              <span className="text-caption text-sub">부채비율</span>
              <p className={clsx(
                'text-title2 tabular-nums mt-1',
                stats.debtRatio < 30 ? 'text-status-success'
                  : stats.debtRatio < 60 ? 'text-status-warning'
                  : 'text-status-danger'
              )}>
                {formatPercent(stats.debtRatio)}
              </p>
            </Card>
          </div>

          {/* Daily Net Worth Chart (Forward Fill) */}
          <DailyNetWorthChart />

          {/* Charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <NetWorthTrendChart />
            <AssetAllocationChart />
          </div>

          <DailyChangeChart />

          {/* Member Summary */}
          <MemberSummaryCards />
        </div>
      )}

      {/* Ledger Analysis Tab */}
      {activeTab === 'ledger' && <LedgerAnalysisTab />}

      {/* Subscription Analysis Tab */}
      {activeTab === 'subscription' && (
        <SubscriptionAnalysis />
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════
// Ledger Analysis Tab
// ════════════════════════════════════════════════════════
//
// Layered narrative: Hero (3-card month summary) → Smart Insights
// (auto-detected chips) → CashFlow Timeline (daily burn) → Category
// Deep-Dive (donut + ranked list). The legacy IncomeExpenseTrend +
// Savings Rate + PeriodComparison + MemberSummary cards are kept below
// as supporting context — they answer "how does this month fit into
// the broader trend" once the user has the snapshot above.

function LedgerAnalysisTab() {
  const analysis = useLedgerAnalysis()

  const handleAnchor = (anchor: InsightAnchor) => {
    if (typeof document === 'undefined') return
    const el = document.getElementById(anchor === 'hero' ? 'ledger-hero' : anchor)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div id="ledger-hero">
        <LedgerAnalysisHero analysis={analysis} />
      </div>

      {/* Auto-detected insights */}
      <LedgerInsightsRow insights={analysis.insights} onAnchor={handleAnchor} />

      {/* Daily cumulative spending */}
      <CashFlowTimeline analysis={analysis} />

      {/* Category deep-dive */}
      <CategoryDeepDive analysis={analysis} />

      {/* Supporting: month-over-month context (collapsed visual weight) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <IncomeExpenseTrendChart />
        <SavingsRateChart />
      </div>

      <PeriodComparisonCard />
      <MemberSummaryCards />
    </div>
  )
}
