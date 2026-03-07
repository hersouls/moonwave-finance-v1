import { useToastStore } from '@/stores/toastStore'
import { clsx } from 'clsx'
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react'

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)
  const removeToast = useToastStore((s) => s.removeToast)

  if (toasts.length === 0) return null

  return (
    <div className="toast-container">
      {toasts.map((toast) => {
        const Icon = toast.type === 'success' ? CheckCircle2
          : toast.type === 'error' ? AlertCircle
          : Info
        return (
          <div
            key={toast.id}
            role="status"
            aria-live="polite"
            className={clsx(
              'toast-base',
              toast.type === 'success' && 'toast-success',
              toast.type === 'error' && 'toast-error',
              toast.type === 'info' && 'toast-info',
            )}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm flex-1">{toast.message}</span>
            <button
              onClick={() => removeToast(toast.id)}
              className="touch-target-icon text-white/60 hover:text-white/90 -mr-2 flex-shrink-0"
              aria-label="닫기"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
