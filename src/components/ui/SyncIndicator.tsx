import { Loader2, Check, AlertTriangle, Cloud } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { Tooltip } from '@/components/ui/Tooltip'
import { IconButton } from '@/components/ui/Button'

export function SyncIndicator() {
  const user = useAuthStore((s) => s.user)
  const syncStatus = useAuthStore((s) => s.syncStatus)
  const lastSyncTime = useAuthStore((s) => s.lastSyncTime)

  if (!user) return null

  const getIcon = () => {
    switch (syncStatus) {
      case 'syncing':
        return <Loader2 className="w-5 h-5 animate-spin text-primary-500" />
      case 'synced':
        return <Check className="w-5 h-5 text-emerald-500" />
      case 'error':
        return <AlertTriangle className="w-5 h-5 text-warning-500" />
      default:
        return <Cloud className="w-5 h-5" />
    }
  }

  const getLabel = () => {
    switch (syncStatus) {
      case 'syncing':
        return '동기화 중...'
      case 'synced':
        return lastSyncTime ? `마지막 동기화: ${lastSyncTime}` : '동기화 완료'
      case 'error':
        return '동기화 오류'
      default:
        return '동기화 대기'
    }
  }

  return (
    <Tooltip content={getLabel()} placement="bottom">
      <IconButton plain color="secondary" aria-label={getLabel()}>
        {getIcon()}
      </IconButton>
    </Tooltip>
  )
}
