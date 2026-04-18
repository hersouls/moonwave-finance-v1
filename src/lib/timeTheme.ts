/**
 * Time-Based Theme Controller
 * 시간대에 따라 primary hue 를 자동 변경 (morning/day/evening/night)
 * 토큰은 이미 index.css 에 정의됨 (html[data-time-period="..."])
 */

export type TimePeriod = 'morning' | 'day' | 'evening' | 'night'

export function getTimePeriod(date: Date = new Date()): TimePeriod {
  const h = date.getHours()
  if (h >= 5 && h < 10) return 'morning'
  if (h >= 10 && h < 17) return 'day'
  if (h >= 17 && h < 21) return 'evening'
  return 'night'
}

export function applyTimePeriod(period: TimePeriod | null) {
  const root = document.documentElement
  if (!period || period === 'day') {
    root.removeAttribute('data-time-period')
  } else {
    root.setAttribute('data-time-period', period)
  }
}

let intervalId: number | null = null

/** Start auto-updating time period every 15 minutes. Returns disposer. */
export function startTimePeriodWatcher(enabled: boolean): () => void {
  if (!enabled) {
    applyTimePeriod(null)
    if (intervalId !== null) {
      window.clearInterval(intervalId)
      intervalId = null
    }
    return () => {}
  }

  const sync = () => applyTimePeriod(getTimePeriod())
  sync()

  if (intervalId !== null) window.clearInterval(intervalId)
  intervalId = window.setInterval(sync, 15 * 60 * 1000)

  return () => {
    if (intervalId !== null) {
      window.clearInterval(intervalId)
      intervalId = null
    }
    applyTimePeriod(null)
  }
}
