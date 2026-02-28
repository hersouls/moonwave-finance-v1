import { Plus, Landmark } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { useUIStore } from '@/stores/uiStore'

export function AssetEmptyState() {
  const openAssetCreateModal = useUIStore((s) => s.openAssetCreateModal)

  return (
    <EmptyState
      icon={<Landmark className="w-full h-full" />}
      title="등록된 자산이 없습니다"
      description="자산 항목을 추가하면 일별 가치를 기록하고 추적할 수 있습니다."
      action={{
        label: '자산 추가',
        onClick: openAssetCreateModal,
        icon: <Plus className="w-5 h-5" />,
      }}
    />
  )
}
