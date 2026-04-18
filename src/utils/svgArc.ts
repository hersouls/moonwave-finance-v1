/**
 * SVG arc path 생성 유틸
 * Donut/Ring chart 용
 */

export function polarToCartesian(
  cx: number,
  cy: number,
  r: number,
  angleDeg: number,
): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

/**
 * 시작 각도에서 끝 각도까지 arc path (시계방향)
 */
export function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
): string {
  const start = polarToCartesian(cx, cy, r, endAngle)
  const end = polarToCartesian(cx, cy, r, startAngle)
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0
  const sweepFlag = 0
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArcFlag} ${sweepFlag} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`
}

/**
 * Donut segment 생성 (여러 개를 하나의 canvas에 그릴 때)
 */
export interface DonutSegment {
  startAngle: number
  endAngle: number
  color: string
  value: number
  label: string
}

/**
 * 값 배열 → 각도 배열 (360도 비율 매핑)
 */
export function valuesToSegments<T extends { value: number; color: string; label: string }>(
  items: T[],
  gapDegrees: number = 2,
): (T & { startAngle: number; endAngle: number })[] {
  const total = items.reduce((s, x) => s + x.value, 0)
  if (total === 0) return items.map((x, i) => ({ ...x, startAngle: i * 30, endAngle: i * 30 + 30 }))
  const availableAngle = 360 - gapDegrees * items.length
  let cumulative = 0
  return items.map(item => {
    const angle = (item.value / total) * availableAngle
    const segment = {
      ...item,
      startAngle: cumulative,
      endAngle: cumulative + angle,
    }
    cumulative += angle + gapDegrees
    return segment
  })
}
