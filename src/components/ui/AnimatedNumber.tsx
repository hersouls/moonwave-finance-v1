import { useCountUp } from '@/hooks/useCountUp'
import { formatKoreanUnit } from '@/utils/format'

interface AnimatedNumberProps {
  value: number
  format?: (n: number) => string
  duration?: number
  className?: string
}

export function AnimatedNumber({ value, format = formatKoreanUnit, duration, className }: AnimatedNumberProps) {
  const animated = useCountUp(value, duration)
  return <span className={className}>{format(animated)}</span>
}
