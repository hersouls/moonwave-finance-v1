import { useState, useCallback, useEffect } from 'react'

const STORAGE_KEY = 'fin-coach-marks-completed'

export interface CoachStep {
  target: string // CSS selector
  title: string
  description: string
  placement?: 'top' | 'bottom' | 'left' | 'right'
}

export function useCoachMark(tourId: string, steps: CoachStep[]) {
  const [currentStep, setCurrentStep] = useState(-1)
  const [isActive, setIsActive] = useState(false)

  useEffect(() => {
    try {
      const completed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
      if (!completed[tourId]) {
        // Delay start to let the page render
        const timer = setTimeout(() => {
          setCurrentStep(0)
          setIsActive(true)
        }, 1000)
        return () => clearTimeout(timer)
      }
    } catch {
      // ignore
    }
  }, [tourId])

  const next = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((s) => s + 1)
    } else {
      complete()
    }
  }, [currentStep, steps.length])

  const skip = useCallback(() => {
    complete()
  }, [])

  const complete = useCallback(() => {
    setIsActive(false)
    setCurrentStep(-1)
    try {
      const completed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
      completed[tourId] = true
      localStorage.setItem(STORAGE_KEY, JSON.stringify(completed))
    } catch {
      // ignore
    }
  }, [tourId])

  const step = isActive && currentStep >= 0 ? steps[currentStep] : null

  return {
    isActive,
    currentStep,
    totalSteps: steps.length,
    step,
    next,
    skip,
    complete,
  }
}
