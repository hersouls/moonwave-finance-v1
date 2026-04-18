/**
 * Sparkline SVG path generator
 * 일별 값 배열 → SVG polyline path 문자열
 */

export interface SparklineOptions {
  /** viewBox width */
  width: number
  /** viewBox height */
  height: number
  /** 상단 여백 (0-1 비율) */
  paddingTop?: number
  /** 하단 여백 */
  paddingBottom?: number
  /** smooth curve (cubic bezier) 사용 여부 */
  smooth?: boolean
  /** 비어있는 값(0)도 포함 여부 (기본 true) */
  includeZeros?: boolean
}

/**
 * 일별 숫자 배열 → SVG path 'd' 속성
 */
export function generateSparklinePath(
  values: number[],
  options: SparklineOptions,
): string {
  const { width, height, paddingTop = 0.1, paddingBottom = 0.1, smooth = false } = options
  if (values.length === 0) return ''
  if (values.length === 1) {
    // 단일 점 → 가로선
    const y = height / 2
    return `M 0 ${y.toFixed(1)} L ${width.toFixed(1)} ${y.toFixed(1)}`
  }

  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = Math.max(max - min, 1)
  const innerTop = height * paddingTop
  const innerHeight = height * (1 - paddingTop - paddingBottom)
  const xStep = width / (values.length - 1)

  const points = values.map((v, i) => ({
    x: i * xStep,
    y: innerTop + innerHeight - ((v - min) / range) * innerHeight,
  }))

  if (smooth) {
    return toSmoothPath(points)
  }

  return 'M ' + points.map(p => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ')
}

/**
 * Sparkline 을 area fill 용도로 path 변환
 * (하단 baseline 닫은 closed path)
 */
export function generateSparklineAreaPath(
  values: number[],
  options: SparklineOptions,
): string {
  const { width, height } = options
  const line = generateSparklinePath(values, options)
  if (!line) return ''
  // line 끝점 → (width, height) → (0, height) → close
  return `${line} L ${width.toFixed(1)} ${height.toFixed(1)} L 0 ${height.toFixed(1)} Z`
}

/**
 * Cardinal spline smoothing (simple cubic bezier)
 */
function toSmoothPath(points: Array<{ x: number; y: number }>): string {
  if (points.length < 2) return ''
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] ?? p2
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`
  }
  return d
}
