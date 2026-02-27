import { clsx } from 'clsx'
import type { ReactNode } from 'react'
import { useState, useId } from 'react'

type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right'

interface TooltipProps {
  content: ReactNode
  children: ReactNode
  placement?: TooltipPlacement
  className?: string
}

const placementStyles: Record<TooltipPlacement, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
}

export function Tooltip({
  content,
  children,
  placement = 'top',
  className,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false)
  const tooltipId = useId()

  if (!content) {
    return <>{children}</>
  }

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onFocus={() => setIsVisible(true)}
      onBlur={() => setIsVisible(false)}
      aria-describedby={isVisible ? tooltipId : undefined}
    >
      {children}
      {isVisible && (
        <div
          id={tooltipId}
          role="tooltip"
          className={clsx(
            'absolute z-50 px-2.5 py-1.5 text-xs font-medium rounded-lg shadow-lg whitespace-nowrap',
            'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900',
            'border border-zinc-700 dark:border-zinc-300',
            'animate-in fade-in-0 zoom-in-95 duration-150',
            placementStyles[placement],
            className
          )}
        >
          {content}
        </div>
      )}
    </div>
  )
}
