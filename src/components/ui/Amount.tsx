import { clsx } from 'clsx'
import type { ReactNode } from 'react'
import { useSettingsStore } from '@/stores/settingsStore'
import { formatKRW, formatKoreanUnit, formatChangeUnit, formatUSD } from '@/utils/format'

type Sign = 'none' | 'positive' | 'negative' | 'auto'

interface AmountProps {
  value: number
  /** 'korean' (default) → `1,234,567` + unit. 'krw' → `1,234,567원`. 'usd' → `$1,234.56`. 'change' → with `+/-`. */
  format?: 'korean' | 'krw' | 'usd' | 'change' | 'raw'
  unit?: string
  /** Sign coloring strategy */
  sign?: Sign
  /** Override mask — if provided, this overrides settings.hideAmounts */
  masked?: boolean
  /** Semantic size class (mapped to fluid typography) */
  size?: 'caption' | 'body' | 'emphasis' | 'title' | 'display'
  /** Extra classnames */
  className?: string
  /** Trailing content (e.g. percent badge) */
  trailing?: ReactNode
  as?: 'span' | 'div' | 'p'
}

const SIZE_CLASS: Record<NonNullable<AmountProps['size']>, string> = {
  caption: 'text-caption tabular-nums',
  body: 'text-body3 tabular-nums',
  emphasis: 'text-body3-semi tabular-nums',
  title: 'text-title2 tabular-nums',
  display: 'text-financial-fluid',
}

function signClass(sign: Sign, value: number): string {
  if (sign === 'positive') return 'text-status-success'
  if (sign === 'negative') return 'text-status-danger'
  if (sign === 'auto') {
    if (value > 0) return 'text-status-success'
    if (value < 0) return 'text-status-danger'
    return ''
  }
  return ''
}

function renderFormatted(value: number, format: AmountProps['format']): string {
  switch (format) {
    case 'krw':
      return formatKRW(value)
    case 'usd':
      return formatUSD(value)
    case 'change':
      return formatChangeUnit(value)
    case 'raw':
      return String(Math.round(value))
    case 'korean':
    default:
      return formatKoreanUnit(value)
  }
}

export function Amount({
  value,
  format = 'korean',
  unit = '원',
  sign = 'none',
  masked,
  size = 'body',
  className,
  trailing,
  as = 'span',
}: AmountProps) {
  const hideAmounts = useSettingsStore((s) => !!s.settings.hideAmounts)
  const isMasked = masked ?? hideAmounts

  const Component = as
  const text = renderFormatted(value, format)
  const showUnit = (format === 'korean' || format === 'change' || format === 'raw') && unit

  return (
    <Component
      className={clsx(
        SIZE_CLASS[size],
        signClass(sign, value),
        isMasked && 'amount-masked',
        className,
      )}
      data-reveal={isMasked ? 'false' : undefined}
    >
      {text}
      {showUnit && <span className="text-disabled ml-0.5">{unit}</span>}
      {trailing}
    </Component>
  )
}
