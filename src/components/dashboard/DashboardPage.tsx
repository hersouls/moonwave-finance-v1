import { useEffect, useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, ArrowRight, Pencil, ChevronUp, ChevronDown, Eye, EyeOff, Check } from 'lucide-react'
import { useAssetStore } from '@/stores/assetStore'
import { useDailyValueStore } from '@/stores/dailyValueStore'
import { useMemberStore } from '@/stores/memberStore'
import { useBudgetStore } from '@/stores/budgetStore'
import { useGoalStore } from '@/stores/goalStore'
import { useSubscriptionStore } from '@/stores/subscriptionStore'
import { useTransactionStore } from '@/stores/transactionStore'
import { useAssetStats, useCategoryBreakdown } from '@/hooks/useAssetStats'
import { NetWorthCard } from './NetWorthCard'
import { AssetLiabilityBreakdown } from './AssetLiabilityBreakdown'
import { LedgerSummaryCard } from './LedgerSummaryCard'
import { NetWorthTrendChart } from './NetWorthTrendChart'
import { AssetAllocationChart } from './AssetAllocationChart'
import { DailyChangeChart } from './DailyChangeChart'
import { MemberSummaryCards } from './MemberSummaryCards'
import { DashboardSkeleton } from './DashboardSkeleton'
import { BudgetOverviewCard } from '@/components/budget/BudgetOverviewCard'
import { SubscriptionWidget } from './SubscriptionWidget'
import { GoalCard } from '@/components/goals/GoalCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { Card } from '@/components/ui/Card'
import { ContentTransition } from '@/components/ui/ContentTransition'
import { CoachMark } from '@/components/ui/CoachMark'
import { useCoachMark, type CoachStep } from '@/hooks/useCoachMark'
import { useUIStore } from '@/stores/uiStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { formatKoreanUnit, formatPercent } from '@/utils/format'
import { ErrorEmptyState } from '@/components/ui/EmptyState'
import { IconButton, Button } from '@/components/ui/Button'
import { useSyncListener } from '@/hooks/useSyncListener'
import type { DashboardWidget } from '@/lib/types'

const DEFAULT_WIDGETS: DashboardWidget[] = [
  { id: 'net-worth', visible: true, order: 0 },
  { id: 'asset-ledger', visible: true, order: 1 },
  { id: 'subscription', visible: true, order: 2 },
  { id: 'budget', visible: true, order: 3 },
  { id: 'charts', visible: true, order: 4 },
  { id: 'daily-change', visible: true, order: 5 },
  { id: 'category-breakdown', visible: true, order: 6 },
  { id: 'goals', visible: true, order: 7 },
  { id: 'members', visible: true, order: 8 },
]

const WIDGET_LABELS: Record<string, string> = {
  'net-worth': '순자산 카드',
  'asset-ledger': '자산/부채 + 가계부 요약',
  'subscription': '구독 현황',
  'budget': '예산 현황',
  'charts': '추세 차트',
  'daily-change': '일일 변동 차트',
  'category-breakdown': '카테고리 구성',
  'goals': '목표 진행',
  'members': '구성원별 현황',
}

const coachSteps: CoachStep[] = [
  {
    target: '[data-coach="net-worth"]',
    title: '순자산 현황',
    description: '전체 자산과 부채를 합산한 순자산을 한눈에 확인하세요.',
    placement: 'bottom',
  },
  {
    target: '[data-coach="search"]',
    title: '빠른 검색',
    description: 'Ctrl+K로 자산, 거래, 구독을 빠르게 검색할 수 있습니다.',
    placement: 'bottom',
  },
  {
    target: '[data-coach="sync"]',
    title: '멀티디바이스 동기화',
    description: '로그인하면 여러 기기에서 실시간으로 데이터가 동기화됩니다.',
    placement: 'bottom',
  },
]

export function DashboardPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isEditMode, setIsEditMode] = useState(false)
  const navigate = useNavigate()
  const hasCompletedOnboarding = useSettingsStore((s) => s.settings.hasCompletedOnboarding)
  const savedWidgets = useSettingsStore((s) => s.settings.dashboardWidgets)
  const setDashboardWidgets = useSettingsStore((s) => s.setDashboardWidgets)

  const loadAll = useAssetStore((s) => s.loadAll)
  const loadValues = useDailyValueStore((s) => s.loadValues)
  const loadMembers = useMemberStore((s) => s.loadMembers)
  const loadBudgets = useBudgetStore((s) => s.loadBudgets)
  const loadGoals = useGoalStore((s) => s.loadGoals)
  const loadSubscriptions = useSubscriptionStore((s) => s.loadSubscriptions)
  const loadTransactions = useTransactionStore((s) => s.loadAll)
  const items = useAssetStore((s) => s.items)
  const activeGoals = useGoalStore((s) => s.getActiveGoals)()

  const stats = useAssetStats()
  const assetBreakdown = useCategoryBreakdown('asset')
  const liabilityBreakdown = useCategoryBreakdown('liability')
  const openAssetCreateModal = useUIStore((s) => s.openAssetCreateModal)

  const coach = useCoachMark('dashboard-tour', coachSteps)

  const widgets = useMemo(() => {
    if (savedWidgets && savedWidgets.length > 0) return [...savedWidgets].sort((a, b) => a.order - b.order)
    return DEFAULT_WIDGETS
  }, [savedWidgets])

  const isWidgetVisible = useCallback((id: string) => {
    const w = widgets.find(w => w.id === id)
    return w ? w.visible : true
  }, [widgets])

  const moveWidget = useCallback((id: string, direction: 'up' | 'down') => {
    const sorted = [...widgets].sort((a, b) => a.order - b.order)
    const idx = sorted.findIndex(w => w.id === id)
    if (direction === 'up' && idx > 0) {
      const prev = sorted[idx - 1].order
      sorted[idx - 1] = { ...sorted[idx - 1], order: sorted[idx].order }
      sorted[idx] = { ...sorted[idx], order: prev }
    } else if (direction === 'down' && idx < sorted.length - 1) {
      const next = sorted[idx + 1].order
      sorted[idx + 1] = { ...sorted[idx + 1], order: sorted[idx].order }
      sorted[idx] = { ...sorted[idx], order: next }
    }
    setDashboardWidgets(sorted)
  }, [widgets, setDashboardWidgets])

  const toggleWidget = useCallback((id: string) => {
    const updated = widgets.map(w => w.id === id ? { ...w, visible: !w.visible } : w)
    setDashboardWidgets(updated)
  }, [widgets, setDashboardWidgets])

  const loadData = async () => {
    setError(null)
    setIsLoading(true)
    try {
      await Promise.all([loadAll(), loadValues(), loadMembers(), loadBudgets(), loadGoals(), loadSubscriptions(), loadTransactions()])
    } catch {
      setError('데이터를 불러오는데 실패했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])
  useSyncListener(loadData)

  if (error) {
    return (
      <div className="p-4 lg:p-6">
        <ErrorEmptyState description={error} onRetry={loadData} />
      </div>
    )
  }

  if (!isLoading && items.length === 0) {
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

  const widgetContent: Record<string, React.ReactNode> = {
    'net-worth': (
      <div className="stagger-item" data-coach="net-worth">
        <NetWorthCard stats={stats} />
      </div>
    ),
    'asset-ledger': (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 stagger-item">
        <AssetLiabilityBreakdown stats={stats} />
        <LedgerSummaryCard />
      </div>
    ),
    'subscription': (
      <div className="stagger-item">
        <SubscriptionWidget />
      </div>
    ),
    'budget': (
      <div className="stagger-item">
        <BudgetOverviewCard />
      </div>
    ),
    'charts': (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 stagger-item">
        <NetWorthTrendChart />
        <AssetAllocationChart />
      </div>
    ),
    'daily-change': (
      <div className="stagger-item">
        <DailyChangeChart />
      </div>
    ),
    'category-breakdown': (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 stagger-item">
        {assetBreakdown.length > 0 && (
          <Card className="card-pad-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-body3-semi text-zinc-900 dark:text-zinc-100">자산 구성</h3>
              <button
                onClick={() => navigate('/assets')}
                className="text-caption text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-0.5"
              >
                전체보기 <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <div className="space-y-3">
              {assetBreakdown.slice(0, 5).map((bd) => (
                <div key={bd.categoryId} className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: bd.categoryColor }} />
                  <span className="text-sm text-zinc-700 dark:text-zinc-300 flex-1 truncate">{bd.categoryName}</span>
                  <span className="text-body3 text-zinc-900 dark:text-zinc-100 tabular-nums">
                    {formatKoreanUnit(bd.total)}
                  </span>
                  <span className="text-caption text-zinc-400 dark:text-zinc-500 w-12 text-right tabular-nums">
                    {formatPercent(bd.percentage, 0)}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}
        {liabilityBreakdown.length > 0 && (
          <Card className="card-pad-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-body3-semi text-zinc-900 dark:text-zinc-100">부채 구성</h3>
              <button
                onClick={() => navigate('/liabilities')}
                className="text-caption text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-0.5"
              >
                전체보기 <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <div className="space-y-3">
              {liabilityBreakdown.slice(0, 5).map((bd) => (
                <div key={bd.categoryId} className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: bd.categoryColor }} />
                  <span className="text-sm text-zinc-700 dark:text-zinc-300 flex-1 truncate">{bd.categoryName}</span>
                  <span className="text-body3 text-zinc-900 dark:text-zinc-100 tabular-nums">
                    {formatKoreanUnit(bd.total)}
                  </span>
                  <span className="text-caption text-zinc-400 dark:text-zinc-500 w-12 text-right tabular-nums">
                    {formatPercent(bd.percentage, 0)}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    ),
    'goals': activeGoals.length > 0 ? (
      <div className="stagger-item">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-body3-semi text-zinc-900 dark:text-zinc-100">진행 중인 목표</h3>
          <button
            onClick={() => navigate('/profile')}
            className="text-caption text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-0.5"
          >
            전체보기 <ArrowRight className="w-3 h-3" />
          </button>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {activeGoals.slice(0, 4).map((goal) => (
            <GoalCard key={goal.id} goal={goal} />
          ))}
        </div>
      </div>
    ) : null,
    'members': (
      <div className="stagger-item">
        <MemberSummaryCards />
      </div>
    ),
  }

  return (
    <ContentTransition isLoading={isLoading} skeleton={<DashboardSkeleton />}>
      <div className="p-4 lg:p-6 space-y-6">
        {/* Edit Mode Toggle */}
        <div className="flex justify-end">
          <Button
            variant={isEditMode ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setIsEditMode(!isEditMode)}
            leftIcon={isEditMode ? <Check className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
          >
            {isEditMode ? '완료' : '편집'}
          </Button>
        </div>

        {/* Edit Mode Panel */}
        {isEditMode && (
          <Card className="card-pad-lg">
            <h3 className="text-body3-semi text-zinc-900 dark:text-zinc-100 mb-3">위젯 순서 및 표시 설정</h3>
            <div className="space-y-1">
              {widgets.map((w, idx) => (
                <div key={w.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  <button
                    onClick={() => toggleWidget(w.id)}
                    className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                    aria-label={w.visible ? '숨기기' : '표시'}
                  >
                    {w.visible ? <Eye className="w-4 h-4 text-primary-500" /> : <EyeOff className="w-4 h-4 text-zinc-400" />}
                  </button>
                  <span className={`text-sm flex-1 ${w.visible ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-400 dark:text-zinc-600 line-through'}`}>
                    {WIDGET_LABELS[w.id] || w.id}
                  </span>
                  <IconButton plain size="sm" onClick={() => moveWidget(w.id, 'up')} disabled={idx === 0} aria-label="위로">
                    <ChevronUp className="w-4 h-4" />
                  </IconButton>
                  <IconButton plain size="sm" onClick={() => moveWidget(w.id, 'down')} disabled={idx === widgets.length - 1} aria-label="아래로">
                    <ChevronDown className="w-4 h-4" />
                  </IconButton>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Widgets */}
        {widgets.map((w) => (
          isWidgetVisible(w.id) && widgetContent[w.id] ? (
            <div key={w.id}>{widgetContent[w.id]}</div>
          ) : null
        ))}
      </div>

      {/* Coach Mark Tour */}
      {hasCompletedOnboarding && !isEditMode && (
        <CoachMark
          step={coach.step}
          currentStep={coach.currentStep}
          totalSteps={coach.totalSteps}
          onNext={coach.next}
          onSkip={coach.skip}
        />
      )}
    </ContentTransition>
  )
}
