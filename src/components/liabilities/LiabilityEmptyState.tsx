import { Plus, CreditCard } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { useUIStore } from '@/stores/uiStore'

export function LiabilityEmptyState() {
  const openLiabilityCreateModal = useUIStore((s) => s.openLiabilityCreateModal)

  return (
    <EmptyState
      icon={<CreditCard className="w-full h-full" />}
      title="등록된 부채가 없습니다"
      description="부채 항목을 추가하면 상환 현황을 추적할 수 있습니다."
      action={{
        label: '부채 추가',
        onClick: openLiabilityCreateModal,
        icon: <Plus className="w-5 h-5" />,
      }}
    />
  )
}
