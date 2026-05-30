import { useId, useMemo } from 'react'
import { getPositiveColor } from '@/lib/chartConfig'

interface SparklineProps {
  data: number[]
  width?: number
  height?: number
  color?: string
  showFill?: boolean
  strokeWidth?: number
  className?: string
  /** 이 인덱스 이후 구간을 점선으로(미래 예측선). 미지정이면 전체 실선. */
  dashFrom?: number
}

export function Sparkline({
  data,
  width = 80,
  height = 28,
  color = getPositiveColor(),
  showFill = true,
  strokeWidth = 1.5,
  className,
  dashFrom,
}: SparklineProps) {
  const reactId = useId()
  const { pts, fill } = useMemo(() => {
    if (data.length < 2) return { pts: [] as string[], fill: '' }

    const min = Math.min(...data)
    const max = Math.max(...data)
    const range = max - min || 1
    const padding = 2

    const points = data.map((value, i) => {
      const x = padding + (i / (data.length - 1)) * (width - padding * 2)
      const y = padding + (1 - (value - min) / range) * (height - padding * 2)
      return `${x},${y}`
    })

    const fillPath = `${padding},${height - padding} ${points.join(' ')} ${width - padding},${height - padding}`
    return { pts: points, fill: fillPath }
  }, [data, width, height])

  if (data.length < 2) return null

  const gradientId = `sparkline-${reactId.replace(/[^a-zA-Z0-9]/g, '')}`
  const hasDash = dashFrom != null && dashFrom >= 0 && dashFrom < pts.length - 1
  const solid = hasDash ? pts.slice(0, dashFrom + 1) : pts
  const dashed = hasDash ? pts.slice(dashFrom) : []

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {showFill && fill && <polygon points={fill} fill={`url(#${gradientId})`} />}
      {solid.length >= 2 && (
        <polyline points={solid.join(' ')} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      )}
      {dashed.length >= 2 && (
        <polyline points={dashed.join(' ')} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="3 3" strokeOpacity={0.7} />
      )}
    </svg>
  )
}
