import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'

interface FABProps {
  onClick: () => void
  icon?: ReactNode
  label?: string
}

export function FAB({ onClick, icon, label = '새 항목 추가' }: FABProps) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="fixed z-[var(--z-fab)] mb-[env(safe-area-inset-bottom)] bottom-24 right-4 lg:bottom-8 lg:right-8 w-14 h-14 flex items-center justify-center bg-primary-500 hover:bg-primary-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
    >
      {icon ?? <Plus className="w-6 h-6" />}
    </button>
  )
}
