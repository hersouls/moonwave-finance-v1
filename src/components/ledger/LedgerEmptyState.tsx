import { Plus, Receipt } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { useUIStore } from '@/stores/uiStore'

export function LedgerEmptyState() {
  const openTransactionCreateModal = useUIStore((s) => s.openTransactionCreateModal)

  return (
    <EmptyState
      icon={<Receipt className="w-full h-full" />}
      title="기록된 거래가 없습니다"
      description="수입과 지출을 기록하면 월별 재정 현황을 확인할 수 있습니다."
      action={{
        label: '거래 기록',
        onClick: openTransactionCreateModal,
        icon: <Plus className="w-5 h-5" />,
      }}
    />
  )
}
