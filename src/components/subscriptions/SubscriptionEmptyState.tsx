import { Repeat } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { useUIStore } from '@/stores/uiStore'

export function SubscriptionEmptyState() {
  const openCreate = useUIStore((s) => s.openSubscriptionCreateModal)

  return (
    <EmptyState
      icon={<Repeat className="w-full h-full" />}
      title="등록된 구독이 없습니다"
      description="구독 서비스를 등록하여 월별 지출을 관리해보세요."
      action={{
        label: '구독 추가',
        onClick: openCreate,
      }}
    />
  )
}
