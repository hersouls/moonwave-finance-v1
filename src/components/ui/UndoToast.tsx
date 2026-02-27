import { clsx } from 'clsx'
import { useState, useEffect } from 'react'
import { Undo2 } from 'lucide-react'
import { useUndoStore } from '@/stores/undoStore'

export function UndoToast() {
  const currentToast = useUndoStore((s) => s.currentToast)
  const undo = useUndoStore((s) => s.undo)
  const dismissToast = useUndoStore((s) => s.dismissToast)
  const [isExiting, setIsExiting] = useState(false)

  useEffect(() => {
    setIsExiting(false)
  }, [currentToast])

  if (!currentToast) return null

  const handleDismiss = () => {
    setIsExiting(true)
    setTimeout(dismissToast, 200)
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={clsx(
        'fixed bottom-24 lg:bottom-8 left-1/2 -translate-x-1/2',
        'z-50 pb-[env(safe-area-inset-bottom)]', /* --z-toast */
        isExiting ? 'animate-slide-out-bottom' : 'animate-[slideInFromBottom_0.3s_ease-out]'
      )}
    >
      <div className="flex items-center gap-3 px-4 py-3 bg-zinc-800 dark:bg-zinc-700 text-white rounded-xl shadow-2xl border border-zinc-700 dark:border-zinc-600">
        <span className="text-sm">{currentToast.label}</span>
        <button
          type="button"
          onClick={async () => {
            await undo()
          }}
          className="flex items-center gap-1.5 px-3 py-1 text-sm font-medium text-primary-400 hover:text-primary-300 bg-zinc-700 dark:bg-zinc-600 hover:bg-zinc-600 dark:hover:bg-zinc-500 rounded-lg transition-colors"
        >
          <Undo2 className="w-3.5 h-3.5" />
          실행 취소
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className="text-zinc-400 hover:text-zinc-200 text-xs ml-1"
        >
          닫기
        </button>
      </div>
    </div>
  )
}
