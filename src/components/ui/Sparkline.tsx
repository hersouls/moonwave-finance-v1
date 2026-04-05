import { useMemo } from 'react'

interface SparklineProps {
  data: number[]
  width?: number
  height?: number
  color?: string
  showFill?: boolean
  strokeWidth?: number
  className?: string
}

export function Sparkline({
  data,
  width = 80,
  height = 28,
  color = '#10b981',
  showFill = true,
  strokeWidth = 1.5,
  className,
}: SparklineProps) {
  const { polyline, fill } = useMemo(() => {
    if (data.length < 2) return { polyline: '', fill: '' }

    const min = Math.min(...data)
    const max = Math.max(...data)
    const range = max - min || 1
    const padding = 2

    const points = data.map((value, i) => {
      const x = padding + (i / (data.length - 1)) * (width - padding * 2)
      const y = padding + (1 - (value - min) / range) * (height - padding * 2)
      return `${x},${y}`
    })

    const polylinePath = points.join(' ')
    const fillPath = `${padding},${height - padding} ${polylinePath} ${width - padding},${height - padding}`

    return { polyline: polylinePath, fill: fillPath }
  }, [data, width, height])

  if (data.length < 2) return null

  const gradientId = `sparkline-${color.replace('#', '')}`

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {showFill && fill && (
        <polygon
          points={fill}
          fill={`url(#${gradientId})`}
        />
      )}
      {polyline && (
        <polyline
          points={polyline}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  )
}
