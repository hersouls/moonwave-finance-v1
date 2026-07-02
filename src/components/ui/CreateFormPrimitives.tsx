import { clsx } from 'clsx'
import { motion, useReducedMotion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { formatKoreanUnit } from '@/utils/format'

/**
 * 자산/부채 생성 모달용 하이엔드 폼 프리미티브.
 * TransactionWizard의 디자인 언어(히어로 금액·필 세그먼트·아이콘 섹션)를
 * 재사용 가능한 형태로 추출 — purple/Health 시스템 토큰 기반.
 */

// ─── Section label (accent icon + title + hint) ────────
export function FormSectionLabel({
  icon: Icon,
  children,
  hint,
  htmlFor,
}: {
  icon?: LucideIcon
  children: React.ReactNode
  hint?: string
  htmlFor?: string
}) {
  return (
    <label htmlFor={htmlFor} className="flex items-center gap-2 text-label2 text-sub mb-2.5">
      {Icon && (
        <span className="w-7 h-7 rounded-lg bg-[color:var(--color-primary-50)] dark:bg-[color:var(--color-primary-900)]/30 flex items-center justify-center flex-shrink-0">
          <Icon className="w-3.5 h-3.5 text-[color:var(--color-primary-600)] dark:text-[color:var(--color-primary-300)]" />
        </span>
      )}
      <span className="font-medium text-heading">{children}</span>
      {hint && <span className="text-disabled font-normal text-caption">{hint}</span>}
    </label>
  )
}

// ─── Pill segmented control (layoutId morph) ───────────
export interface SegmentOption<T extends string> {
  value: T
  label: string
  /** 활성 배경 그라데이션 (CSS background). 미지정 시 primary 그라데이션. */
  gradient?: string
  /** 활성 그림자 */
  shadow?: string
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  layoutId,
  ariaLabel,
  size = 'md',
}: {
  options: ReadonlyArray<SegmentOption<T>>
  value: T
  onChange: (v: T) => void
  layoutId: string
  ariaLabel?: string
  /** md(기본): 풀폭 폼 세그먼트(min-h 44). sm: 컴팩트 페이지 컨트롤(뷰 토글 등) */
  size?: 'sm' | 'md'
}) {
  const reduce = useReducedMotion()
  const defaultGradient =
    'linear-gradient(135deg, var(--color-primary-500), color-mix(in srgb, var(--color-primary-500) 80%, black))'
  const defaultShadow =
    '0 6px 20px -4px color-mix(in srgb, var(--color-primary-500) 40%, transparent)'
  return (
    <div
      className={clsx(
        'relative inline-flex rounded-full bg-surface-tertiary ring-1 ring-base',
        size === 'sm' ? 'p-1' : 'w-full p-1.5',
      )}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {options.map((opt) => {
        const active = value === opt.value
        return (
          <motion.button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={clsx(
              'relative rounded-full font-bold z-10 transition-colors',
              size === 'sm'
                ? 'px-3.5 py-1.5 text-label3-medium'
                : 'flex-1 py-2.5 px-4 text-body3 min-h-[44px]',
              active ? 'text-white' : 'text-sub hover:text-heading',
            )}
            whileTap={reduce ? undefined : { scale: 0.97 }}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-full -z-10"
                style={{ background: opt.gradient ?? defaultGradient, boxShadow: opt.shadow ?? defaultShadow }}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
            {opt.label}
          </motion.button>
        )
      })}
    </div>
  )
}

// ─── Hero amount input (gradient + glow + 한국어 단위) ──
export function HeroAmountField({
  value,
  onChange,
  caption,
  placeholder = '0',
  autoFocus,
  inputId,
}: {
  /** 콤마 포맷된 문자열 (예: "1,000") */
  value: string
  /** 콤마 포맷된 문자열을 돌려줌 */
  onChange: (formatted: string) => void
  caption?: string
  placeholder?: string
  autoFocus?: boolean
  inputId?: string
}) {
  const num = Number(value.replace(/,/g, '')) || 0
  const active = num > 0
  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, '')
    onChange(raw ? Number(raw).toLocaleString('ko-KR') : '')
  }
  return (
    <motion.div
      className={clsx(
        'relative overflow-hidden rounded-2xl px-5 py-5 transition-all',
        active ? 'ring-1 ring-[color:var(--color-primary-400)]/40' : 'ring-1 ring-base',
      )}
      style={{
        background: active
          ? `linear-gradient(135deg,
              color-mix(in srgb, var(--color-primary-500) 10%, var(--surface-primary)) 0%,
              color-mix(in srgb, var(--color-primary-500) 4%, var(--surface-primary)) 100%)`
          : 'var(--surface-tertiary)',
        boxShadow: active
          ? '0 16px 40px -12px color-mix(in srgb, var(--color-primary-500) 22%, transparent), inset 0 1px 0 0 color-mix(in srgb, white 50%, transparent)'
          : 'inset 0 1px 0 0 color-mix(in srgb, white 40%, transparent)',
      }}
    >
      {active && (
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none opacity-[0.025]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
            backgroundSize: '128px 128px',
          }}
        />
      )}
      <div className="relative">
        {caption && (
          <p className="text-caption text-sub mb-2 font-semibold tracking-wide uppercase opacity-80">
            {caption}
          </p>
        )}
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <input
            id={inputId}
            type="text"
            inputMode="numeric"
            value={value}
            onChange={handle}
            placeholder={placeholder}
            autoFocus={autoFocus}
            aria-label="금액"
            className={clsx(
              'bg-transparent tabular-nums outline-none font-extrabold min-w-0 max-w-full text-financial-fluid',
              active ? 'text-heading' : 'text-disabled',
            )}
            style={{ letterSpacing: '-0.025em', lineHeight: 1.15, width: `${Math.max(value.length || 1, 1)}ch`, flexShrink: 0 }}
          />
          <span
            className={clsx('text-title3 font-bold tabular-nums flex-shrink-0', active ? 'text-heading/80' : 'text-disabled')}
            style={{ lineHeight: 1.2 }}
          >
            원
          </span>
        </div>
        {active && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-2 text-caption text-[color:var(--color-primary-700)] dark:text-[color:var(--color-primary-300)] tabular-nums font-medium"
          >
            {formatKoreanUnit(num)}원
          </motion.p>
        )}
      </div>
    </motion.div>
  )
}

// ─── Member pill chips (≤4 → chips, else null) ─────────
export function MemberChips({
  members,
  value,
  onChange,
  allowUnassigned = true,
}: {
  members: ReadonlyArray<{ id: string; name: string; color?: string }>
  value: string
  onChange: (id: string) => void
  allowUnassigned?: boolean
}) {
  const reduce = useReducedMotion()
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="구성원 선택">
      {allowUnassigned && (
        <motion.button
          type="button"
          onClick={() => onChange('')}
          className={clsx(
            'px-5 py-3 rounded-full text-body3 font-semibold ring-1 min-h-[44px]',
            value === ''
              ? 'bg-surface-primary text-heading ring-[color:var(--border-strong)] elevation-1'
              : 'bg-surface-tertiary text-sub ring-transparent hover:bg-[var(--hover-bg)]',
          )}
          whileTap={reduce ? undefined : { scale: 0.97 }}
        >
          미지정
        </motion.button>
      )}
      {members.map((m) => {
        const active = value === m.id
        return (
          <motion.button
            key={m.id}
            type="button"
            onClick={() => onChange(m.id)}
            className={clsx(
              'flex-1 py-3 px-4 rounded-full text-body3 font-semibold ring-1 min-w-[72px] min-h-[44px]',
              active ? 'text-white ring-transparent' : 'bg-surface-tertiary text-sub ring-transparent hover:bg-[var(--hover-bg)]',
            )}
            style={active && m.color
              ? {
                  background: `linear-gradient(135deg, ${m.color}, color-mix(in srgb, ${m.color} 82%, #000))`,
                  boxShadow: `0 6px 20px -4px color-mix(in srgb, ${m.color} 40%, transparent)`,
                }
              : undefined}
            whileTap={reduce ? undefined : { scale: 0.97 }}
            animate={{ scale: active ? 1.03 : 1 }}
          >
            {m.name}
          </motion.button>
        )
      })}
    </div>
  )
}
