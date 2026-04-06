import { useMemberBreakdown } from '@/hooks/useAssetStats'
import { Card } from '@/components/ui/Card'
import { formatKoreanUnit } from '@/utils/format'
import { clsx } from 'clsx'

export function MemberSummaryCards() {
  const breakdown = useMemberBreakdown()

  if (breakdown.length === 0) return null

  return (
    <div>
      <h3 className="text-body3-semi text-heading mb-3">구성원별 현황</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {breakdown.map((mb) => {
          const total = mb.totalAssets + mb.totalLiabilities
          const assetPct = total > 0 ? (mb.totalAssets / total) * 100 : 50

          return (
            <Card key={mb.memberId}>
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
                  style={{ backgroundColor: mb.memberColor }}
                >
                  {mb.memberName.charAt(0)}
                </div>
                <span className="text-body3 text-heading">{mb.memberName}</span>
              </div>

              <p className={clsx(
                'text-title1 tabular-nums',
                mb.netWorth >= 0
                  ? 'text-heading'
                  : 'text-status-danger'
              )}>
                {formatKoreanUnit(mb.netWorth)}
                <span className="text-caption text-disabled ml-1">원</span>
              </p>

              {/* Asset/Liability bar */}
              <div className="mt-3">
                <div className="flex h-2 rounded-full overflow-hidden bg-surface-tertiary">
                  <div
                    className="bg-emerald-500 transition-all"
                    style={{ width: `${assetPct}%` }}
                  />
                  <div
                    className="bg-red-500 transition-all"
                    style={{ width: `${100 - assetPct}%` }}
                  />
                </div>
                <div className="mt-1.5 flex justify-between text-caption text-sub">
                  <span>자산 <span className="text-status-success font-medium tabular-nums">{formatKoreanUnit(mb.totalAssets)}</span></span>
                  <span>부채 <span className="text-status-danger font-medium tabular-nums">{formatKoreanUnit(mb.totalLiabilities)}</span></span>
                </div>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
