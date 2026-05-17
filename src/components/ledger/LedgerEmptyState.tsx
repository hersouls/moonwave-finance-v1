import { motion, useReducedMotion } from 'framer-motion'
import { Plus, Receipt, Coins, Sparkles, Wallet } from 'lucide-react'
import { useUIStore } from '@/stores/uiStore'
import { easeOutExpo } from '@/lib/motionConfig'

export function LedgerEmptyState() {
  const openTransactionCreateModal = useUIStore((s) => s.openTransactionCreateModal)
  const shouldReduceMotion = useReducedMotion()

  const float = (delay: number) =>
    shouldReduceMotion
      ? {}
      : {
          y: [0, -6, 0],
          transition: {
            duration: 3.2,
            repeat: Infinity,
            ease: 'easeInOut' as const,
            delay,
          },
        }

  return (
    <section
      aria-label="거래 기록 없음"
      className="relative overflow-hidden rounded-3xl bg-surface-primary"
      style={{
        boxShadow:
          'inset 0 0 0 1px var(--border-default), inset 0 1px 0 0 rgba(255,255,255,0.5), 0 2px 12px rgba(0,0,0,0.04)',
      }}
    >
      {/* Aurora background */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(circle at 20% 20%, oklch(0.62 0.18 250 / 0.12), transparent 45%),
            radial-gradient(circle at 80% 30%, oklch(0.72 0.18 155 / 0.10), transparent 40%),
            radial-gradient(circle at 50% 100%, oklch(0.78 0.16 25 / 0.08), transparent 55%)
          `,
        }}
      />

      <div className="relative flex flex-col items-center text-center px-6 py-14 sm:py-16">
        {/* Illustrative cluster — 떠다니는 영수증/코인 */}
        <div className="relative w-32 h-32 mb-6">
          {/* Halo */}
          <motion.div
            aria-hidden="true"
            className="absolute inset-0 rounded-full"
            style={{
              background:
                'radial-gradient(circle, color-mix(in srgb, var(--color-primary-500) 22%, transparent) 0%, transparent 70%)',
              filter: 'blur(8px)',
            }}
            initial={shouldReduceMotion ? undefined : { scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.8, ease: easeOutExpo }}
          />

          {/* Center — primary receipt icon */}
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            initial={shouldReduceMotion ? undefined : { scale: 0.7, opacity: 0, rotate: -8 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ duration: 0.6, ease: easeOutExpo, delay: 0.1 }}
          >
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center"
              style={{
                background:
                  'linear-gradient(135deg, color-mix(in srgb, var(--color-primary-500) 14%, var(--surface-primary)) 0%, var(--surface-primary) 100%)',
                boxShadow:
                  '0 8px 28px color-mix(in srgb, var(--color-primary-500) 20%, transparent), inset 0 0 0 1px color-mix(in srgb, var(--color-primary-500) 28%, transparent), inset 0 1px 0 0 rgba(255,255,255,0.6)',
              }}
            >
              <Receipt className="w-9 h-9 text-[color:var(--color-primary-600)] dark:text-[color:var(--color-primary-300)]" />
            </div>
          </motion.div>

          {/* Floating coin (top-right) */}
          <motion.div
            className="absolute -top-1 right-0 w-9 h-9 rounded-xl flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, oklch(0.85 0.16 95) 0%, oklch(0.72 0.16 65) 100%)',
              boxShadow: '0 6px 14px oklch(0.72 0.16 65 / 0.35), inset 0 1px 0 0 rgba(255,255,255,0.5)',
            }}
            initial={shouldReduceMotion ? undefined : { scale: 0, opacity: 0 }}
            animate={shouldReduceMotion ? undefined : { scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, ease: easeOutExpo, delay: 0.3 }}
          >
            <motion.div animate={float(0)}>
              <Coins className="w-4 h-4 text-white" />
            </motion.div>
          </motion.div>

          {/* Floating wallet (bottom-left) */}
          <motion.div
            className="absolute -bottom-1 left-0 w-9 h-9 rounded-xl flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, oklch(0.78 0.16 195) 0%, oklch(0.62 0.16 220) 100%)',
              boxShadow: '0 6px 14px oklch(0.62 0.16 220 / 0.35), inset 0 1px 0 0 rgba(255,255,255,0.5)',
            }}
            initial={shouldReduceMotion ? undefined : { scale: 0, opacity: 0 }}
            animate={shouldReduceMotion ? undefined : { scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, ease: easeOutExpo, delay: 0.45 }}
          >
            <motion.div animate={float(0.8)}>
              <Wallet className="w-4 h-4 text-white" />
            </motion.div>
          </motion.div>

          {/* Sparkle */}
          <motion.div
            aria-hidden="true"
            className="absolute top-3 -left-1 text-[color:var(--color-primary-400)]"
            initial={shouldReduceMotion ? undefined : { scale: 0, opacity: 0 }}
            animate={shouldReduceMotion ? undefined : { scale: [1, 1.3, 1], opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut', delay: 0.7 }}
          >
            <Sparkles className="w-4 h-4" />
          </motion.div>
        </div>

        <motion.h3
          className="text-title2 font-bold text-heading mb-2 tracking-tight"
          initial={shouldReduceMotion ? undefined : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: easeOutExpo, delay: 0.2 }}
        >
          첫 거래를 기록해보세요
        </motion.h3>
        <motion.p
          className="text-body3 text-sub max-w-[280px] mb-7 leading-relaxed"
          initial={shouldReduceMotion ? undefined : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: easeOutExpo, delay: 0.3 }}
        >
          작은 지출 하나가 한 달의 재정 흐름을 만들어요.
          <br />
          오늘의 첫 기록부터 시작해볼까요?
        </motion.p>

        {/* Premium CTA button with edge-lighting */}
        <motion.button
          type="button"
          onClick={openTransactionCreateModal}
          initial={shouldReduceMotion ? undefined : { opacity: 0, y: 8, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: easeOutExpo, delay: 0.4 }}
          whileHover={shouldReduceMotion ? undefined : { y: -2, scale: 1.02 }}
          whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
          className="inline-flex items-center gap-2 px-6 h-12 rounded-full text-body3 font-bold text-white el-fab"
          style={{
            background:
              'linear-gradient(135deg, var(--color-primary-500) 0%, var(--color-primary-600) 50%, var(--color-primary-700) 100%)',
          }}
        >
          <Plus className="w-5 h-5" strokeWidth={2.5} />
          첫 거래 기록하기
        </motion.button>
      </div>
    </section>
  )
}
