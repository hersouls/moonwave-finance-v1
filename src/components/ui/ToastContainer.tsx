import { useToastStore } from '@/stores/toastStore'
import { clsx } from 'clsx'
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react'

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)
  const removeToast = useToastStore((s) => s.removeToast)

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-24 lg:bottom-8 right-4 z-[var(--z-toast)] flex flex-col gap-2 pb-[env(safe-area-inset-bottom)]">
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
              'flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border min-w-[280px] max-w-[360px] animate-[slideInFromBottom_0.3s_ease-out]',
              toast.type === 'success' && 'bg-emerald-600 border-emerald-500 text-white',
              toast.type === 'error' && 'bg-red-600 border-red-500 text-white',
              toast.type === 'info' && 'bg-zinc-800 dark:bg-zinc-700 border-zinc-700 dark:border-zinc-600 text-white',
            )}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm flex-1">{toast.message}</span>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-white/60 hover:text-white/90 flex-shrink-0"
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
