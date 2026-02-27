import { useState, useMemo } from 'react'
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isToday, format } from 'date-fns'

export interface CalendarDay {
  date: Date
  dateStr: string
  day: number
  isCurrentMonth: boolean
  isToday: boolean
}

export function useCalendar(initialMonth?: string) {
  const [currentDate, setCurrentDate] = useState(() => {
    if (initialMonth) {
      const [y, m] = initialMonth.split('-').map(Number)
      return new Date(y, m - 1)
    }
    return new Date()
  })

  const days = useMemo(() => {
    const monthStart = startOfMonth(currentDate)
    const monthEnd = endOfMonth(currentDate)
    const calStart = startOfWeek(monthStart, { weekStartsOn: 0 })
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })

    return eachDayOfInterval({ start: calStart, end: calEnd }).map(date => ({
      date,
      dateStr: format(date, 'yyyy-MM-dd'),
      day: date.getDate(),
      isCurrentMonth: isSameMonth(date, currentDate),
      isToday: isToday(date),
    }))
  }, [currentDate])

  const monthLabel = useMemo(() => {
    return `${currentDate.getFullYear()}년 ${currentDate.getMonth() + 1}월`
  }, [currentDate])

  const monthString = useMemo(() => {
    return format(currentDate, 'yyyy-MM')
  }, [currentDate])

  const goToPreviousMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1))
  }

  const goToNextMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1))
  }

  const goToToday = () => {
    setCurrentDate(new Date())
  }

  return {
    days,
    monthLabel,
    monthString,
    currentDate,
    goToPreviousMonth,
    goToNextMonth,
    goToToday,
  }
}
