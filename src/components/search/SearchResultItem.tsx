import { TrendingUp, Receipt, Tag } from 'lucide-react'
import type { SearchResult } from '@/hooks/useSearch'

interface SearchResultItemProps {
  result: SearchResult
  onClick: () => void
  isActive?: boolean
}

export function SearchResultItem({ result, onClick, isActive }: SearchResultItemProps) {
  const icon = result.type === 'asset'
    ? <TrendingUp className="w-4 h-4" />
    : result.type === 'transaction'
      ? <Receipt className="w-4 h-4" />
      : <Tag className="w-4 h-4" />

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
        isActive
          ? 'bg-primary-50 dark:bg-primary-900/20'
          : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
      }`}
    >
      <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 dark:text-zinc-400 flex-shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{result.title}</p>
        {result.subtitle && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{result.subtitle}</p>
        )}
      </div>
    </button>
  )
}
