// Shared visual primitives for the AI category-suggestion surfaces
// (wizard inline recommendation + bulk auto-categorize modal).

import { clsx } from 'clsx'
import type { CategoryConfidence } from '@/services/cardStatementImport'

export const CONFIDENCE_META: Record<
  CategoryConfidence,
  { label: string; dots: number; color: string }
> = {
  high: { label: '확실', dots: 3, color: 'var(--value-positive)' },
  medium: { label: '추정', dots: 2, color: 'var(--color-primary-500)' },
  low: { label: '낮음', dots: 1, color: 'var(--status-warning)' },
  none: { label: '미해결', dots: 0, color: 'var(--text-muted)' },
}

/** Three-dot confidence meter with an optional Korean label. */
export function ConfidenceMeter({
  confidence,
  showLabel = true,
  className,
}: {
  confidence: CategoryConfidence
  showLabel?: boolean
  className?: string
}) {
  const meta = CONFIDENCE_META[confidence]
  return (
    <span
      className={clsx('inline-flex items-center gap-1.5', className)}
      aria-label={`신뢰도 ${meta.label}`}
    >
      <span className="inline-flex items-center gap-0.5" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full transition-colors"
            style={{
              backgroundColor:
                i < meta.dots ? meta.color : 'color-mix(in srgb, var(--text-muted) 26%, transparent)',
            }}
          />
        ))}
      </span>
      {showLabel && (
        <span className="text-label4 font-bold leading-none" style={{ color: meta.color }}>
          {meta.label}
        </span>
      )}
    </span>
  )
}
