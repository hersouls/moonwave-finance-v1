import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { clsx } from 'clsx'
import { formatKoreanUnit, formatChangeUnit } from '@/utils/format'
import type { AssetStats } from '@/lib/types'

interface NetWorthCardProps {
  stats: AssetStats
}

export function NetWorthCard({ stats }: NetWorthCardProps) {
  const { netWorth, dailyChange, monthlyChange } = stats
  const isPositiveDaily = dailyChange > 0
  const isNegativeDaily = dailyChange < 0
  const isPositiveMonthly = monthlyChange > 0
  const isNegativeMonthly = monthlyChange < 0

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">순자산</span>
      </div>
      <p className="text-3xl lg:text-4xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums tracking-tight">
        {formatKoreanUnit(netWorth)}
        <span className="text-lg text-zinc-400 dark:text-zinc-500 ml-1">원</span>
      </p>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
        <div className="flex items-center gap-1.5">
          {isPositiveDaily ? (
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          ) : isNegativeDaily ? (
            <TrendingDown className="w-4 h-4 text-red-500" />
          ) : (
            <Minus className="w-4 h-4 text-zinc-400" />
          )}
          <span className={clsx(
            'text-sm font-medium tabular-nums',
            isPositiveDaily && 'text-emerald-600 dark:text-emerald-400',
            isNegativeDaily && 'text-red-600 dark:text-red-400',
            !isPositiveDaily && !isNegativeDaily && 'text-zinc-500 dark:text-zinc-400'
          )}>
            {formatChangeUnit(dailyChange)}
          </span>
          <span className="text-xs text-zinc-400 dark:text-zinc-500">오늘</span>
        </div>
        <div className="flex items-center gap-1.5">
          {isPositiveMonthly ? (
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          ) : isNegativeMonthly ? (
            <TrendingDown className="w-4 h-4 text-red-500" />
          ) : (
            <Minus className="w-4 h-4 text-zinc-400" />
          )}
          <span className={clsx(
            'text-sm font-medium tabular-nums',
            isPositiveMonthly && 'text-emerald-600 dark:text-emerald-400',
            isNegativeMonthly && 'text-red-600 dark:text-red-400',
            !isPositiveMonthly && !isNegativeMonthly && 'text-zinc-500 dark:text-zinc-400'
          )}>
            {formatChangeUnit(monthlyChange)}
          </span>
          <span className="text-xs text-zinc-400 dark:text-zinc-500">이번달</span>
        </div>
      </div>
    </div>
  )
}
