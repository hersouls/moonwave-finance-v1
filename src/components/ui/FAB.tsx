import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { clsx } from 'clsx'
import { useScrollDirection } from '@/hooks/useScrollDirection'
import { useIsDeviceReadOnly } from '@/lib/writeGuard'

interface FABProps {
  onClick: () => void
  icon?: ReactNode
  label?: string
}

export function FAB({ onClick, icon, label = '새 항목 추가' }: FABProps) {
  const scrollDir = useScrollDirection()
  const readOnly = useIsDeviceReadOnly()

  // Read-only device: hide every create entry point. A global banner explains why.
  if (readOnly) return null

  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={clsx(
        'fixed z-[var(--z-fab)] mb-[env(safe-area-inset-bottom)] bottom-24 right-4 lg:bottom-8 lg:right-8 w-14 h-14 flex items-center justify-center bg-primary-500 hover:bg-primary-600 text-white rounded-full elevation-3 transition-all duration-300 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-primary)] el-fab',
        scrollDir === 'down' && 'translate-y-24 opacity-0 pointer-events-none'
      )}
    >
      {icon ?? <Plus className="w-6 h-6" />}
    </button>
  )
}
