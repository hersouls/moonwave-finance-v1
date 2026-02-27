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

function isDark(): boolean {
  return document.documentElement.classList.contains('dark')
}

export function getGridColor(): string {
  return isDark() ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'
}

export function getTextColor(): string {
  return isDark() ? '#a1a1aa' : '#71717a'
}

export function getTooltipBg(): string {
  return isDark() ? '#27272a' : '#ffffff'
}

export function getTooltipBorder(): string {
  return isDark() ? '#3f3f46' : '#e4e4e7'
}

export function getTooltipText(): string {
  return isDark() ? '#fafafa' : '#18181b'
}

export const commonLineOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: {
    mode: 'index' as const,
    intersect: false,
  },
  plugins: {
    legend: {
      display: false,
    },
    tooltip: {
      backgroundColor: getTooltipBg(),
      titleColor: getTooltipText(),
      bodyColor: getTooltipText(),
      borderColor: getTooltipBorder(),
      borderWidth: 1,
      cornerRadius: 8,
      padding: 12,
      displayColors: false,
    },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { color: getTextColor(), font: { size: 11 } },
      border: { display: false },
    },
    y: {
      grid: { color: getGridColor() },
      ticks: {
        color: getTextColor(),
        font: { size: 11 },
        callback: function(value: number | string) {
          const num = typeof value === 'string' ? parseFloat(value) : value
          if (Math.abs(num) >= 100_000_000) return Math.round(num / 100_000_000) + '억'
          if (Math.abs(num) >= 10_000) return Math.round(num / 10_000) + '만'
          return String(num)
        },
      },
      border: { display: false },
    },
  },
}

export const commonBarOptions = {
  ...commonLineOptions,
  plugins: {
    ...commonLineOptions.plugins,
  },
}

export function formatChartLabel(dateStr: string): string {
  const day = parseInt(dateStr.split('-')[2])
  return `${day}일`
}
