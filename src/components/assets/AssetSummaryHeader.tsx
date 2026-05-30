import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Minus, Layers } from 'lucide-react'
import { clsx } from 'clsx'
import type { AssetItem } from '@/lib/types'
import { useDailyValueStore } from '@/stores/dailyValueStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { groupValuesByItem, valueAsOf } from '@/services/assetAnalytics'
import { getTodayString } from '@/lib/dateUtils'
import { formatKoreanUnit, formatChangeUnit } from '@/utils/format'
import { Sparkline } from '@/components/ui/Sparkline'
import { getPositiveColor, getNegativeColor } from '@/lib/chartConfig'
import { springSnappy } from '@/lib/motionConfig'

interface AssetSummaryHeaderProps {
  /** 이미 필터링된(유형·구성원·카테고리) 항목 목록 */
  items: AssetItem[]
  type: 'asset' | 'liability'
}

// UTC 기준으로 날짜를 더한다. getTodayString()이 toISOString(UTC) 기반이므로
// 동일하게 UTC로 계산해야 KST 등 양수 오프셋 지역에서 하루 어긋남이 없다.
function addDaysStr(base: string, delta: number): string {
  const d = new Date(base + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().split('T')[0]
}

const SPARK_DAYS = 30

export function AssetSummaryHeader({ items, type }: AssetSummaryHeaderProps) {
  const allValues = useDailyValueStore((s) => s.allValues)
  const hideAmounts = useSettingsStore((s) => !!s.settings.hideAmounts)

  const { total, dailyChange, monthlyChange, trend } = useMemo(() => {
    const today = getTodayString()
    const yesterday = addDaysStr(today, -1)
    const monthStart = today.slice(0, 8) + '01'
    const byItem = groupValuesByItem(allValues)

    const sumAsOf = (date: string) =>
      items.reduce((acc, it) => (it.id == null ? acc : acc + valueAsOf(byItem.get(it.id), date)), 0)

    const total = sumAsOf(today)
    const totalYesterday = sumAsOf(yesterday)
    const totalMonthStart = sumAsOf(monthStart)

    // 최근 30일 추이 (Forward-Fill)
    const trend: number[] = []
    for (let i = SPARK_DAYS - 1; i >= 0; i--) {
      trend.push(sumAsOf(addDaysStr(today, -i)))
    }

    return {
      total,
      dailyChange: total - totalYesterday,
      monthlyChange: total - totalMonthStart,
      trend,
    }
  }, [items, allValues])

  const isAsset = type === 'asset'
  // 자산: 증가=긍정(green). 부채: 감소=긍정(green).
  const goodWhenUp = isAsset
  const deltaTone = (v: number) => {
    if (v === 0) return 'text-white/55'
    const positive = goodWhenUp ? v > 0 : v < 0
    return positive ? 'text-value-positive-on-dark' : 'text-value-negative-on-dark'
  }
  const sparkColor = (() => {
    const positive = goodWhenUp ? monthlyChange >= 0 : monthlyChange <= 0
    return positive ? getPositiveColor() : getNegativeColor()
  })()

  const heroClass = isAsset ? 'hero-gradient' : 'hero-gradient-warning'

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springSnappy}
      className={clsx(
        'relative overflow-hidden rounded-2xl p-5 sm:p-6 noise-overlay hero-shimmer',
        heroClass,
        'el-glow-primary',
      )}
    >
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-body3 text-white/70">{isAsset ? '총 자산' : '총 부채'}</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-caption text-white/80">
                <Layers className="w-3 h-3" />
                {items.length}개
              </span>
            </div>
            <p
              className={clsx('text-financial-fluid text-white tracking-tight', hideAmounts && 'amount-masked')}
              data-reveal={hideAmounts ? 'false' : undefined}
            >
              {formatKoreanUnit(total)}
              <span className="text-lg text-white/50 ml-1">원</span>
            </p>
          </div>

          {/* 추이 스파크라인 */}
          {trend.some((v, i) => i > 0 && v !== trend[0]) && (
            <div className="flex-shrink-0 pt-1" aria-hidden="true">
              <Sparkline
                data={trend}
                width={96}
                height={40}
                color={sparkColor}
                strokeWidth={2}
              />
              <p className="text-label4 text-white/40 text-right mt-0.5">최근 30일</p>
            </div>
          )}
        </div>

        {/* Deltas */}
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
          {([
            { value: dailyChange, label: '오늘' },
            { value: monthlyChange, label: '이번달' },
          ]).map((d, i) => {
            const Icon = d.value > 0 ? TrendingUp : d.value < 0 ? TrendingDown : Minus
            return (
              <div key={i} className="flex items-center gap-1.5">
                <span className={clsx('inline-flex', deltaTone(d.value))}>
                  <Icon className="w-4 h-4" />
                </span>
                <span className={clsx('text-body3 tabular-nums', deltaTone(d.value), hideAmounts && 'amount-masked')}>
                  {formatChangeUnit(d.value)}
                </span>
                <span className="text-caption text-white/40">{d.label}</span>
              </div>
            )
          })}
        </div>
      </div>
    </motion.div>
  )
}
