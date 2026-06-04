import { Lock } from 'lucide-react'
import { useIsDeviceReadOnly } from '@/lib/writeGuard'

/**
 * Global banner shown when this device is in read-only mode. Explains why
 * write controls (FAB, save/delete) are hidden/blocked. The setting is
 * per-device — toggle it in 설정 → 시스템 → "이 기기에서 쓰기".
 */
export function ReadOnlyBanner() {
  const readOnly = useIsDeviceReadOnly()
  if (!readOnly) return null

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 px-4 py-2 text-body3 font-medium text-white"
      style={{ background: 'linear-gradient(90deg, var(--color-primary-600), var(--color-primary-500))' }}
    >
      <Lock className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="text-center">
        읽기 전용 모드 — 이 기기에서는 데이터를 추가·수정·삭제할 수 없습니다. 변경은 쓰기 허용 기기에서만 가능합니다.
      </span>
    </div>
  )
}
