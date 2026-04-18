import { useToastStore } from '@/stores/toastStore'
import { clsx } from 'clsx'
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)
  const removeToast = useToastStore((s) => s.removeToast)
  const shouldReduceMotion = useReducedMotion()

  return (
    <div className="toast-container">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => {
          const Icon = toast.type === 'success' ? CheckCircle2
            : toast.type === 'error' ? AlertCircle
            : Info
          return (
            <motion.div
              key={toast.id}
              layout
              role="status"
              aria-live="polite"
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 80, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              drag={shouldReduceMotion ? false : 'x'}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.5}
              onDragEnd={(_e, info) => {
                if (Math.abs(info.offset.x) > 80) {
                  removeToast(toast.id)
                }
              }}
              className={clsx(
                'toast-base el-toast',
                toast.type === 'success' && 'toast-success',
                toast.type === 'error' && 'toast-error',
                toast.type === 'info' && 'toast-info',
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="text-body3 flex-1">{toast.message}</span>
              <button
                onClick={() => removeToast(toast.id)}
                className="touch-target-icon text-white/60 hover:text-white/90 -mr-2 flex-shrink-0"
                aria-label="닫기"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
