import type { AssetStats } from '@/lib/types'
import { HeroMetricCard } from '@/components/ui/HeroMetricCard'

interface NetWorthCardProps {
  stats: AssetStats
}

export function NetWorthCard({ stats }: NetWorthCardProps) {
  const { netWorth, dailyChange, monthlyChange } = stats

  return (
    <HeroMetricCard
      label="순자산"
      value={netWorth}
      variant="primary"
      layoutId="hero-networth"
      deltas={[
        { value: dailyChange, label: '오늘' },
        { value: monthlyChange, label: '이번달' },
      ]}
    />
  )
}
