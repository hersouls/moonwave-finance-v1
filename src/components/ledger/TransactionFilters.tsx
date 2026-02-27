import { Search } from 'lucide-react'
import { Tabs } from '@/components/ui/Tabs'
import type { TransactionType } from '@/lib/types'

interface TransactionFiltersProps {
  activeType: TransactionType | 'all'
  onTypeChange: (type: TransactionType | 'all') => void
  searchQuery?: string
  onSearchChange?: (query: string) => void
}

const typeTabs = [
  { id: 'all', label: '전체' },
  { id: 'expense', label: '지출' },
  { id: 'income', label: '수입' },
]

export function TransactionFilters({ activeType, onTypeChange, searchQuery, onSearchChange }: TransactionFiltersProps) {
  return (
    <div className="space-y-3">
      {onSearchChange && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            value={searchQuery || ''}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="거래 메모 검색..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent placeholder:text-zinc-400"
          />
        </div>
      )}
      <Tabs
        tabs={typeTabs}
        activeTab={activeType}
        onChange={(id) => onTypeChange(id as TransactionType | 'all')}
      />
    </div>
  )
}
