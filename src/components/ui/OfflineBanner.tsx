import { WifiOff } from 'lucide-react'

export function OfflineBanner() {
  return (
    <div
      role="alert"
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 px-4 py-2 bg-warning-500 text-white text-sm font-medium"
    >
      <WifiOff className="w-4 h-4" />
      오프라인 상태입니다. 일부 기능이 제한될 수 있습니다.
    </div>
  )
}
