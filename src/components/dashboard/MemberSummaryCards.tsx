import { useMemberBreakdown } from '@/hooks/useAssetStats'
import { Card } from '@/components/ui/Card'
import { formatKoreanUnit } from '@/utils/format'
import { clsx } from 'clsx'

export function MemberSummaryCards() {
  const breakdown = useMemberBreakdown()

  if (breakdown.length === 0) return null

  return (
    <div>
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3">구성원별 현황</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {breakdown.map((mb) => {
          const total = mb.totalAssets + mb.totalLiabilities
          const assetPct = total > 0 ? (mb.totalAssets / total) * 100 : 50

          return (
            <Card key={mb.memberId} className="!p-4">
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
                  style={{ backgroundColor: mb.memberColor }}
                >
                  {mb.memberName.charAt(0)}
                </div>
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{mb.memberName}</span>
              </div>

              <p className={clsx(
                'text-xl font-bold tabular-nums',
                mb.netWorth >= 0
                  ? 'text-zinc-900 dark:text-zinc-100'
                  : 'text-red-600 dark:text-red-400'
              )}>
                {formatKoreanUnit(mb.netWorth)}
                <span className="text-xs text-zinc-400 ml-1">원</span>
              </p>

              {/* Asset/Liability bar */}
              <div className="mt-3">
                <div className="flex h-2 rounded-full overflow-hidden bg-zinc-100 dark:bg-zinc-800">
                  <div
                    className="bg-emerald-500 transition-all"
                    style={{ width: `${assetPct}%` }}
                  />
                  <div
                    className="bg-red-500 transition-all"
                    style={{ width: `${100 - assetPct}%` }}
                  />
                </div>
                <div className="mt-1.5 flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
                  <span>자산 <span className="text-emerald-600 dark:text-emerald-400 font-medium tabular-nums">{formatKoreanUnit(mb.totalAssets)}</span></span>
                  <span>부채 <span className="text-red-600 dark:text-red-400 font-medium tabular-nums">{formatKoreanUnit(mb.totalLiabilities)}</span></span>
                </div>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
