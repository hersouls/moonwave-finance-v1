import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js'
import { KOREAN_UNIT_EUK, KOREAN_UNIT_MAN } from '@/utils/format'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend
)

// ─── Theme Helpers ────────────────────────────────
function isDark(): boolean {
  return document.documentElement.classList.contains('dark')
}

/** Read a CSS custom property from :root; fallback if unavailable (SSR/test). */
function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    return v || fallback
  } catch {
    return fallback
  }
}

export function getGridColor(): string {
  return cssVar('--chart-grid-color', isDark() ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)')
}

export function getTextColor(): string {
  return cssVar('--chart-label-color', isDark() ? '#a1a1aa' : '#71717a')
}

export function getAxisColor(): string {
  return cssVar('--chart-axis-color', isDark() ? '#71717a' : '#a1a1aa')
}

export function getTooltipBg(): string {
  // Fallback to solid; CSS variable is translucent (glassmorphism)
  return cssVar('--chart-tooltip-bg', isDark() ? '#18181b' : '#ffffff')
}

export function getTooltipBorder(): string {
  return cssVar('--chart-tooltip-border', isDark() ? '#3f3f46' : '#e4e4e7')
}

export function getTooltipText(): string {
  return cssVar('--chart-tooltip-text', isDark() ? '#fafafa' : '#18181b')
}

// ─── Data-Viz Series (palette-aware via CSS vars) ──
export function getChartSeries(index: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8): string {
  const fallbacks: Record<number, string> = {
    1: '#3b82f6', 2: '#10b981', 3: '#f59e0b', 4: '#ef4444',
    5: '#8b5cf6', 6: '#06b6d4', 7: '#ec4899', 8: '#a16207',
  }
  return cssVar(`--chart-series-${index}`, fallbacks[index])
}

export function getPositiveColor(): string {
  return cssVar('--viz-positive', isDark() ? '#34d399' : '#10b981')
}

export function getNegativeColor(): string {
  return cssVar('--viz-negative', isDark() ? '#f87171' : '#ef4444')
}

// ─── Premium Tooltip Config (동적 생성) ───────────
// Chart.js는 options를 run-time에 해석하므로, getter로 감싸면 최신 CSS 변수 반영
export const premiumTooltip = {
  get backgroundColor() { return getTooltipBg() },
  get titleColor() { return getTooltipText() },
  get bodyColor() { return getTooltipText() },
  get borderColor() { return getTooltipBorder() },
  borderWidth: 1,
  cornerRadius: 10,
  padding: { top: 10, bottom: 10, left: 14, right: 14 },
  displayColors: true,
  boxWidth: 8,
  boxHeight: 8,
  boxPadding: 6,
  titleFont: { family: "'Pretendard', sans-serif", size: 13, weight: 'bold' as const },
  bodyFont: { family: "'Pretendard', sans-serif", size: 12, weight: 'normal' as const },
  caretSize: 6,
  caretPadding: 8,
}

// ─── Premium Animation ────────────────────────────
export const premiumAnimation = {
  duration: 800,
  easing: 'easeOutQuart' as const,
}

// ─── Gradient Factory ─────────────────────────────
export function createLineGradient(
  ctx: CanvasRenderingContext2D,
  chartArea: { top: number; bottom: number },
  color: string,
  opacity = 0.15
): CanvasGradient {
  const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom)
  gradient.addColorStop(0, color.replace(')', `, ${opacity})`).replace('rgb', 'rgba'))
  gradient.addColorStop(1, color.replace(')', ', 0)').replace('rgb', 'rgba'))
  return gradient
}

export function createLineGradientRGBA(
  ctx: CanvasRenderingContext2D,
  chartArea: { top: number; bottom: number },
  r: number, g: number, b: number,
  topOpacity = 0.2,
  bottomOpacity = 0
): CanvasGradient {
  const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom)
  gradient.addColorStop(0, `rgba(${r},${g},${b},${topOpacity})`)
  gradient.addColorStop(1, `rgba(${r},${g},${b},${bottomOpacity})`)
  return gradient
}

// ─── Chart Colors ─────────────────────────────────
export const chartColors = {
  income: { line: '#10b981', fill: [16, 185, 129] as const },
  expense: { line: '#ef4444', fill: [239, 68, 68] as const },
  netWorth: { line: '#3b82f6', fill: [59, 130, 246] as const },
  asset: { line: '#3b82f6', fill: [59, 130, 246] as const },
  liability: { line: '#f59e0b', fill: [245, 158, 11] as const },
  savings: { line: '#8b5cf6', fill: [139, 92, 246] as const },
  dark: {
    income: { line: '#34d399', fill: [52, 211, 153] as const },
    expense: { line: '#f87171', fill: [248, 113, 113] as const },
    netWorth: { line: '#60a5fa', fill: [96, 165, 250] as const },
    asset: { line: '#60a5fa', fill: [96, 165, 250] as const },
    liability: { line: '#fbbf24', fill: [251, 191, 36] as const },
    savings: { line: '#a78bfa', fill: [167, 139, 250] as const },
  },
}

type ChartColorKey = Exclude<keyof typeof chartColors, 'dark'>

export function getChartColor(key: ChartColorKey): { line: string; fill: readonly [number, number, number] } {
  return isDark() ? chartColors.dark[key] : chartColors[key]
}

// ─── Common Options (getter로 다크모드/팔레트 동적 반영) ─
export const commonLineOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: {
    mode: 'index' as const,
    intersect: false,
  },
  animation: premiumAnimation,
  plugins: {
    legend: {
      display: false,
    },
    tooltip: {
      ...premiumTooltip,
    },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: {
        get color() { return getTextColor() },
        font: { family: "'Pretendard', sans-serif", size: 11 },
      },
      border: { display: false },
    },
    y: {
      grid: {
        get color() { return getGridColor() },
        lineWidth: 0.5,
      },
      ticks: {
        get color() { return getTextColor() },
        font: { family: "'Pretendard', sans-serif", size: 11 },
        callback: function(value: number | string) {
          const num = typeof value === 'string' ? parseFloat(value) : value
          if (Math.abs(num) >= KOREAN_UNIT_EUK) return Math.round(num / KOREAN_UNIT_EUK) + '억'
          if (Math.abs(num) >= KOREAN_UNIT_MAN) return Math.round(num / KOREAN_UNIT_MAN) + '만'
          return String(num)
        },
      },
      border: { display: false },
    },
  },
  elements: {
    point: {
      radius: 0,
      hoverRadius: 5,
      hoverBorderWidth: 2,
      hoverBackgroundColor: '#fff',
    },
    line: {
      tension: 0.35,
      borderWidth: 2.5,
    },
    bar: {
      borderRadius: 6,
      borderSkipped: false as const,
    },
  },
}

export const commonBarOptions = {
  ...commonLineOptions,
  elements: {
    ...commonLineOptions.elements,
    bar: {
      borderRadius: 6,
      borderSkipped: false as const,
    },
  },
}

export function formatChartLabel(dateStr: string): string {
  const day = parseInt(dateStr.split('-')[2])
  return `${day}일`
}
