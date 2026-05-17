import { useMemo } from 'react'
import { Doughnut, Bar } from 'react-chartjs-2'
import { Card } from '@/components/ui/Card'
import { useSubscriptionData } from '@/hooks/useSubscriptionData'
import { formatKRW, formatKoreanUnit } from '@/utils/format'
import { commonBarOptions } from '@/lib/chartConfig'
import type { DetectedCycle } from '@/services/subscriptionDetection'

const CYCLE_LABEL: Record<DetectedCycle, string> = {
  weekly: '주간',
  biweekly: '격주',
  monthly: '월간',
  quarterly: '분기',
  'semi-annual': '반기',
  yearly: '연간',
  irregular: '비정기',
}

const CYCLE_ORDER: DetectedCycle[] = ['weekly', 'biweekly', 'monthly', 'quarterly', 'semi-annual', 'yearly', 'irregular']

export function SubscriptionAnalysis() {
  const { detected, stats } = useSubscriptionData()

  // Cycle distribution for bar chart — counts subscriptions per detected cycle.
  // Replaces the legacy currency split (which only made sense for the old
  // KRW/USD Subscription entity model).
  const cycleData = useMemo(() => {
    const counts = new Map<DetectedCycle, number>()
    const monthlySum = new Map<DetectedCycle, number>()
    for (const sub of detected) {
      counts.set(sub.cycle, (counts.get(sub.cycle) ?? 0) + 1)
      monthlySum.set(sub.cycle, (monthlySum.get(sub.cycle) ?? 0) + sub.monthlyEquivalent)
    }
    const ordered = CYCLE_ORDER.filter((c) => (counts.get(c) ?? 0) > 0)
    return {
      labels: ordered.map((c) => CYCLE_LABEL[c]),
      counts: ordered.map((c) => counts.get(c) ?? 0),
      monthly: ordered.map((c) => monthlySum.get(c) ?? 0),
    }
  }, [detected])

  if (detected.length === 0) {
    return (
      <div className="text-center py-12 text-disabled text-sm">
        활성 구독이 없습니다. 거래내역에서 구독 분류 라벨을 지정해 보세요.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="text-center">
          <span className="text-caption text-sub">활성 구독</span>
          <p className="text-title2 text-heading mt-1">
            {detected.length}개
          </p>
        </Card>
        <Card className="text-center">
          <span className="text-caption text-sub">월간 총액</span>
          <p className="text-title2 text-heading tabular-nums mt-1">
            {formatKoreanUnit(stats.totalMonthly)}
          </p>
        </Card>
        <Card className="text-center">
          <span className="text-caption text-sub">연간 총액</span>
          <p className="text-title2 text-heading tabular-nums mt-1">
            {formatKoreanUnit(stats.totalYearly)}
          </p>
        </Card>
        <Card className="text-center">
          <span className="text-caption text-sub">평균 구독료</span>
          <p className="text-title2 text-heading tabular-nums mt-1">
            {formatKoreanUnit(Math.round(stats.totalMonthly / Math.max(1, detected.length)))}
          </p>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Category Distribution */}
        <Card className="card-pad-lg">
          <h3 className="text-body3-semi text-heading mb-4">카테고리별 구독</h3>
          {stats.byCategory.length > 0 ? (
            <div className="h-64 flex items-center justify-center">
              <Doughnut
                data={{
                  labels: stats.byCategory.map((c) => c.name),
                  datasets: [{
                    data: stats.byCategory.map((c) => c.totalMonthly),
                    backgroundColor: stats.byCategory.map((c) => c.color),
                    borderWidth: 0,
                  }],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      position: 'bottom' as const,
                      labels: { padding: 16, font: { size: 11 } },
                    },
                  },
                  cutout: '60%',
                }}
              />
            </div>
          ) : (
            <p className="text-sm text-disabled text-center py-8">데이터 없음</p>
          )}
        </Card>

        {/* Cycle Distribution */}
        <Card className="card-pad-lg">
          <h3 className="text-body3-semi text-heading mb-4">주기별 월 환산액</h3>
          <div className="h-64">
            <Bar
              data={{
                labels: cycleData.labels,
                datasets: [{
                  label: '월 환산 (원)',
                  data: cycleData.monthly,
                  backgroundColor: 'rgba(59, 130, 246, 0.7)',
                  borderRadius: 6,
                }],
              }}
              options={{
                ...commonBarOptions,
                responsive: true,
                maintainAspectRatio: false,
              }}
            />
          </div>
        </Card>
      </div>

      {/* Subscription List */}
      <Card className="card-pad-lg">
        <h3 className="text-body3-semi text-heading mb-4">구독 목록</h3>
        <div className="space-y-2">
          {[...detected]
            .sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent)
            .map((sub) => {
              const pct = stats.totalMonthly > 0 ? (sub.monthlyEquivalent / stats.totalMonthly) * 100 : 0
              return (
                <div key={sub.key} className="flex items-center gap-3 py-2">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: sub.color }}
                  />
                  <span className="text-sm text-body flex-1 truncate">
                    {sub.name}
                  </span>
                  <span className="text-body3 text-heading tabular-nums">
                    {formatKRW(sub.monthlyEquivalent)}/월
                  </span>
                  <span className="text-caption text-disabled w-12 text-right tabular-nums">
                    {pct.toFixed(0)}%
                  </span>
                </div>
              )
            })}
        </div>
      </Card>
    </div>
  )
}
