import { Tabs } from '@/components/ui/Tabs'
import type { TransactionType } from '@/lib/types'

interface TransactionFiltersProps {
  activeType: TransactionType | 'all'
  onTypeChange: (type: TransactionType | 'all') => void
}

const typeTabs = [
  { id: 'all', label: '전체' },
  { id: 'expense', label: '지출' },
  { id: 'income', label: '수입' },
]

export function TransactionFilters({ activeType, onTypeChange }: TransactionFiltersProps) {
  return (
    <Tabs
      tabs={typeTabs}
      activeTab={activeType}
      onChange={(id) => onTypeChange(id as TransactionType | 'all')}
    />
  )
}
