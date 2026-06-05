// Shared premium modal chrome for the ledger "AI 카테고리 자동 분류" and
// "중복 거래 정리" flows so both surfaces are visually identical.

import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { X } from 'lucide-react'
import { clsx } from 'clsx'
import { springSnappy } from '@/lib/motionConfig'

/** Aurora-gradient header with an icon tile, title, subtitle and close button. */
export function PremiumModalHeader({
  icon, title, subtitle, onClose, canClose = true,
}: {
  icon: ReactNode
  title: string
  subtitle: string
  onClose: () => void
  canClose?: boolean
}) {
  return (
    <div className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(circle at 16% 0%, oklch(0.62 0.18 280 / 0.20), transparent 50%),
            radial-gradient(circle at 90% 10%, oklch(0.70 0.16 287 / 0.16), transparent 46%)
          `,
        }}
      />
      <div className="relative px-5 sm:px-7 pt-5 pb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, color-mix(in srgb, var(--color-primary-500) 24%, transparent), color-mix(in srgb, var(--color-primary-500) 8%, transparent))',
              boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--color-primary-500) 30%, transparent), inset 0 1px 0 0 rgba(255,255,255,0.5)',
            }}
          >
            {icon}
          </div>
          <div className="min-w-0">
            <h2 className="text-title2 font-bold text-heading tracking-tight truncate">{title}</h2>
            <p className="text-body3 text-sub font-medium mt-0.5 truncate">{subtitle}</p>
          </div>
        </div>
        {canClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="w-9 h-9 rounded-full flex items-center justify-center text-sub hover:text-heading hover:bg-[var(--hover-bg)] transition-colors flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  )
}

export function ModalFooterButton({
  variant, onClick, disabled, fullWidth, children,
}: {
  variant: 'primary' | 'ghost' | 'danger'
  onClick?: () => void
  disabled?: boolean
  fullWidth?: boolean
  children: ReactNode
}) {
  const shouldReduceMotion = useReducedMotion()
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileHover={shouldReduceMotion || disabled ? undefined : { y: -1 }}
      whileTap={shouldReduceMotion || disabled ? undefined : { scale: 0.97 }}
      transition={springSnappy}
      className={clsx(
        'h-12 px-5 rounded-2xl text-body3 font-bold inline-flex items-center justify-center gap-1.5 transition-all',
        'disabled:opacity-50 disabled:pointer-events-none',
        fullWidth && 'w-full',
        variant === 'primary' || variant === 'danger'
          ? 'text-white'
          : 'text-sub bg-surface-tertiary ring-1 ring-base hover:bg-[var(--hover-bg)]',
      )}
      style={
        variant === 'primary' && !disabled
          ? {
              background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-700))',
              boxShadow: '0 6px 20px color-mix(in oklch, var(--color-primary-500) 38%, transparent), inset 0 1px 0 0 rgba(255,255,255,0.3)',
            }
          : variant === 'danger' && !disabled
            ? {
                background: 'linear-gradient(135deg, var(--value-negative), color-mix(in srgb, var(--value-negative) 78%, black))',
                boxShadow: '0 6px 20px color-mix(in srgb, var(--value-negative) 38%, transparent), inset 0 1px 0 0 rgba(255,255,255,0.25)',
              }
            : undefined
      }
    >
      {children}
    </motion.button>
  )
}

export function ResultStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-2xl p-3 bg-surface-primary ring-1 ring-base text-center">
      <p className="text-label4 text-sub font-semibold uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-title2 font-extrabold tabular-nums" style={{ color }}>{value}</p>
    </div>
  )
}
