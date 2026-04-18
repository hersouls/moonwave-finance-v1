import { useMemberBreakdown } from '@/hooks/useAssetStats'
import { Card } from '@/components/ui/Card'
import { Amount } from '@/components/ui/Amount'
import { clsx } from 'clsx'

export function MemberSummaryCards() {
  const breakdown = useMemberBreakdown()

  if (breakdown.length === 0) return null

  return (
    <div className="member-cards-container">
      <h3 className="text-body3-semi text-heading mb-3">구성원별 현황</h3>
      <div className="member-cards-grid grid gap-3">
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

              <Amount
                as="p"
                value={mb.netWorth}
                size="title"
                className={clsx(mb.netWorth >= 0 ? 'text-heading' : 'text-status-danger')}
              />

              {/* Asset/Liability bar */}
              <div className="mt-3">
                <div className="flex h-2 rounded-full overflow-hidden bg-surface-tertiary">
                  <div
                    className="transition-all"
                    style={{ width: `${assetPct}%`, backgroundColor: 'var(--value-positive)' }}
                  />
                  <div
                    className="transition-all"
                    style={{ width: `${100 - assetPct}%`, backgroundColor: 'var(--value-negative)' }}
                  />
                </div>
                <div className="mt-1.5 flex justify-between text-caption text-sub">
                  <span>자산 <Amount value={mb.totalAssets} size="caption" className="text-value-positive font-medium" unit="" /></span>
                  <span>부채 <Amount value={mb.totalLiabilities} size="caption" className="text-value-negative font-medium" unit="" /></span>
                </div>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
