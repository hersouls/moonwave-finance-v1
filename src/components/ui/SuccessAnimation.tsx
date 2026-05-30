import { motion, useReducedMotion } from 'framer-motion'
import { getPositiveColor } from '@/lib/chartConfig'

interface SuccessAnimationProps {
  size?: number
  color?: string
  strokeWidth?: number
  className?: string
}

export function SuccessAnimation({
  size = 64,
  color = getPositiveColor(),
  strokeWidth = 3,
  className,
}: SuccessAnimationProps) {
  const shouldReduceMotion = useReducedMotion()
  const center = size / 2
  const radius = (size - strokeWidth * 2) / 2

  return (
    <div className={className}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Circle */}
        <motion.circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={shouldReduceMotion
            ? { duration: 0 }
            : { duration: 0.5, ease: 'easeOut' }
          }
        />
        {/* Checkmark */}
        <motion.path
          d={`M${size * 0.28} ${size * 0.5} L${size * 0.44} ${size * 0.65} L${size * 0.72} ${size * 0.35}`}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={shouldReduceMotion
            ? { duration: 0 }
            : { duration: 0.35, delay: 0.4, ease: 'easeOut' }
          }
        />
        {/* Glow pulse */}
        <motion.circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={1}
          initial={{ opacity: 0, scale: 1 }}
          animate={{ opacity: [0, 0.3, 0], scale: [1, 1.3, 1.3] }}
          transition={shouldReduceMotion
            ? { duration: 0 }
            : { duration: 0.8, delay: 0.6, ease: 'easeOut' }
          }
          style={{ transformOrigin: 'center' }}
        />
      </svg>
    </div>
  )
}
