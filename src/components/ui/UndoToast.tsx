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
        'toast-container-center',
        isExiting ? 'animate-slide-out-bottom' : 'animate-[slideInFromBottom_0.3s_ease-out]'
      )}
    >
      <div className="toast-base">
        <span className="text-body3">{currentToast.label}</span>
        <button
          type="button"
          onClick={async () => {
            await undo()
          }}
          className="toast-action"
        >
          <Undo2 className="w-3.5 h-3.5" />
          실행 취소
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className="text-disabled hover:text-heading text-caption ml-1"
        >
          닫기
        </button>
      </div>
    </div>
  )
}
