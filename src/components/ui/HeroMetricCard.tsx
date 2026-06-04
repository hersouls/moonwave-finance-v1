import { type ReactNode, useEffect, useRef } from 'react'
import { motion, useSpring, useTransform, useReducedMotion } from 'framer-motion'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { clsx } from 'clsx'
import { formatKoreanUnit, formatChangeUnit } from '@/utils/format'
import { springSnappy } from '@/lib/motionConfig'
import { useSettingsStore } from '@/stores/settingsStore'

export type HeroVariant = 'primary' | 'success' | 'warning' | 'accent'

/* v3 플랫: 그라디언트 배경 → 플랫 카드 + 변형별 액센트 도트 (Health 문법).
 * 카드 표면은 전부 동일(card-base), 변형 정체성은 라벨 옆 도트로만 표현. */
const VARIANT_DOT: Record<HeroVariant, string> = {
  primary: 'bg-[color:var(--color-primary-500)]',
  success: 'bg-[color:var(--color-success-500)]',
  warning: 'bg-[color:var(--color-warning-500)]',
  accent: 'bg-[color:var(--color-primary-400)]',
}

interface Delta {
  value: number
  label?: string
  /** true(기본): 증가=긍정(초록). 부채처럼 증가가 나쁜 지표는 false → 증가=빨강. 아이콘 방향(↑/↓)은 실제 증감 유지. */
  goodWhenUp?: boolean
}

export interface HeroMetricCardProps {
  label: string
  value: number
  suffix?: string
  /** Optional secondary label (e.g. "원", "%") appended in muted style */
  unit?: string
  variant?: HeroVariant
  /** Deltas rendered in a row below the main value */
  deltas?: Delta[]
  /** Framer layoutId for shared morph transitions */
  layoutId?: string
  /** Clickable — shows pointer + onClick */
  onClick?: () => void
  /** Leading icon / decoration */
  leading?: ReactNode
  className?: string
  /** Format override: pass function or use default formatKoreanUnit */
  formatValue?: (v: number) => string
}

function AnimatedNumber({
  value,
  format,
}: {
  value: number
  format: (v: number) => string
}) {
  const shouldReduceMotion = useReducedMotion()
  const spring = useSpring(0, shouldReduceMotion ? { duration: 0 } : { stiffness: 60, damping: 20, mass: 1 })
  const display = useTransform(spring, (v) => format(Math.round(v)))

  useEffect(() => {
    spring.set(value)
  }, [value, spring])

  return <motion.span>{display}</motion.span>
}

function TrendIcon({ value, goodWhenUp = true }: { value: number; goodWhenUp?: boolean }) {
  const Icon = value > 0 ? TrendingUp : value < 0 ? TrendingDown : Minus
  const good = goodWhenUp ? value > 0 : value < 0
  const bad = goodWhenUp ? value < 0 : value > 0
  const color = good ? 'value-positive' : bad ? 'value-negative' : 'text-disabled'
  return (
    <motion.span
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 15 }}
      className={clsx('inline-flex', color)}
    >
      <Icon className="w-4 h-4" />
    </motion.span>
  )
}

export function HeroMetricCard({
  label,
  value,
  suffix,
  unit = '원',
  variant = 'primary',
  deltas,
  layoutId,
  onClick,
  leading,
  className,
  formatValue,
}: HeroMetricCardProps) {
  const hideAmounts = useSettingsStore((s) => !!s.settings.hideAmounts)
  const ref = useRef<HTMLDivElement | null>(null)
  const format = formatValue ?? formatKoreanUnit

  return (
    <motion.div
      ref={ref}
      layoutId={layoutId}
      onClick={onClick}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springSnappy}
      whileHover={onClick ? { y: -2 } : undefined}
      whileTap={onClick ? { scale: 0.985 } : undefined}
      className={clsx(
        'card-base relative overflow-hidden rounded-2xl p-6',
        onClick && 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--surface-primary)]',
        className,
      )}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick()
              }
            }
          : undefined
      }
    >
      <div className="relative">
        <div className="flex items-center justify-between mb-1">
          <span className="flex items-center gap-2 text-body3 text-sub">
            <span className={clsx('h-1.5 w-1.5 rounded-full', VARIANT_DOT[variant])} aria-hidden="true" />
            {label}
          </span>
          {leading}
        </div>
        <p
          className={clsx(
            'text-financial-fluid text-heading tracking-tight',
            hideAmounts && 'amount-masked',
          )}
          data-reveal={hideAmounts ? 'false' : undefined}
        >
          <AnimatedNumber value={value} format={format} />
          {unit && <span className="text-title3 text-sub ml-1">{unit}</span>}
          {suffix && <span className="text-title3 text-sub ml-1">{suffix}</span>}
        </p>
        {deltas && deltas.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
            {deltas.map((d, i) => {
              const goodWhenUp = d.goodWhenUp ?? true
              const good = goodWhenUp ? d.value > 0 : d.value < 0
              const bad = goodWhenUp ? d.value < 0 : d.value > 0
              return (
                <div key={i} className="flex items-center gap-1.5">
                  <TrendIcon value={d.value} goodWhenUp={goodWhenUp} />
                  <span
                    className={clsx(
                      'text-body3 tabular-nums',
                      good && 'value-positive',
                      bad && 'value-negative',
                      !good && !bad && 'text-disabled',
                      hideAmounts && 'amount-masked',
                    )}
                  >
                    {formatChangeUnit(d.value)}
                  </span>
                  {d.label && <span className="text-caption text-disabled">{d.label}</span>}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </motion.div>
  )
}
