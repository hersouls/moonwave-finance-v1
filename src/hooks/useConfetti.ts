import { useCallback } from 'react'
import confetti from 'canvas-confetti'

export function useConfetti() {
  const fire = useCallback(() => {
    // Full celebration burst from both sides
    const defaults = {
      startVelocity: 30,
      spread: 360,
      ticks: 60,
      zIndex: 9999,
      colors: ['#2EFFB4', '#3B82F6', '#F59E0B', '#EC4899', '#8B5CF6', '#10B981'],
    }

    confetti({
      ...defaults,
      particleCount: 40,
      origin: { x: 0.3, y: 0.6 },
    })
    confetti({
      ...defaults,
      particleCount: 40,
      origin: { x: 0.7, y: 0.6 },
    })
  }, [])

  const celebrateGoal = useCallback(() => {
    // Bigger celebration for goal completion
    const duration = 2000
    const end = Date.now() + duration

    const frame = () => {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#10B981', '#2EFFB4', '#3B82F6'],
        zIndex: 9999,
      })
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#10B981', '#2EFFB4', '#3B82F6'],
        zIndex: 9999,
      })

      if (Date.now() < end) {
        requestAnimationFrame(frame)
      }
    }
    frame()
  }, [])

  const subtleSuccess = useCallback(() => {
    // Small, subtle confetti for minor achievements
    confetti({
      particleCount: 20,
      spread: 40,
      origin: { y: 0.7 },
      colors: ['#10B981', '#34D399'],
      startVelocity: 20,
      gravity: 1.2,
      ticks: 40,
      zIndex: 9999,
    })
  }, [])

  return { fire, celebrateGoal, subtleSuccess }
}
