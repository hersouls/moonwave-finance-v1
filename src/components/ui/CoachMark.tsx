import { useEffect, useState, useCallback } from 'react'
import type { CoachStep } from '@/hooks/useCoachMark'

interface CoachMarkProps {
  step: CoachStep | null
  currentStep: number
  totalSteps: number
  onNext: () => void
  onSkip: () => void
}

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

export function CoachMark({ step, currentStep, totalSteps, onNext, onSkip }: CoachMarkProps) {
  const [targetRect, setTargetRect] = useState<Rect | null>(null)

  const updateRect = useCallback(() => {
    if (!step) return
    const el = document.querySelector(step.target)
    if (el) {
      const rect = el.getBoundingClientRect()
      setTargetRect({
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
        height: rect.height,
      })
    }
  }, [step])

  useEffect(() => {
    updateRect()
    window.addEventListener('resize', updateRect)
    window.addEventListener('scroll', updateRect)
    return () => {
      window.removeEventListener('resize', updateRect)
      window.removeEventListener('scroll', updateRect)
    }
  }, [updateRect])

  if (!step || !targetRect) return null

  const padding = 8
  const popoverWidth = 280

  // Position popover below target by default
  const placement = step.placement || 'bottom'
  let popoverStyle: React.CSSProperties = {}

  switch (placement) {
    case 'bottom':
      popoverStyle = {
        top: targetRect.top + targetRect.height + padding + 8,
        left: Math.max(8, Math.min(targetRect.left, window.innerWidth - popoverWidth - 8)),
      }
      break
    case 'top':
      popoverStyle = {
        top: targetRect.top - padding - 8 - 140,
        left: Math.max(8, Math.min(targetRect.left, window.innerWidth - popoverWidth - 8)),
      }
      break
    case 'right':
      popoverStyle = {
        top: targetRect.top,
        left: targetRect.left + targetRect.width + padding + 8,
      }
      break
    case 'left':
      popoverStyle = {
        top: targetRect.top,
        left: targetRect.left - padding - popoverWidth - 8,
      }
      break
  }

  return (
    <div className="fixed inset-0 z-[var(--z-overlay)]" style={{ pointerEvents: 'auto' }}>
      {/* Overlay with spotlight cutout using box-shadow */}
      <div
        className="fixed"
        style={{
          top: targetRect.top - padding,
          left: targetRect.left - padding,
          width: targetRect.width + padding * 2,
          height: targetRect.height + padding * 2,
          borderRadius: 8,
          boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
          pointerEvents: 'none',
        }}
      />

      {/* Click blocker outside spotlight */}
      <div className="fixed inset-0" onClick={onSkip} />

      {/* Popover */}
      <div
        className="fixed bg-white dark:bg-zinc-800 rounded-xl elevation-4 p-4 page-enter"
        style={{ ...popoverStyle, width: popoverWidth, zIndex: 1 }}
      >
        <h4 className="text-body3-semi text-zinc-900 dark:text-zinc-100 mb-1">{step.title}</h4>
        <p className="text-caption text-zinc-500 dark:text-zinc-400 mb-4">{step.description}</p>
        <div className="flex items-center justify-between">
          <span className="text-caption text-zinc-400">
            {currentStep + 1} / {totalSteps}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onSkip}
              className="text-caption text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 px-2 py-1"
            >
              건너뛰기
            </button>
            <button
              onClick={onNext}
              className="text-caption font-medium text-white bg-primary-500 hover:bg-primary-600 px-3 py-1 rounded-lg transition-colors"
            >
              {currentStep < totalSteps - 1 ? '다음' : '완료'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
