import { useState, useEffect } from 'react'
import { Download, Trash2, Smartphone, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { clearAllData } from '@/services/database'
import { useToastStore } from '@/stores/toastStore'
import { useUIStore } from '@/stores/uiStore'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function SystemTab() {
  const addToast = useToastStore((s) => s.addToast)
  const closeSettingsModal = useUIStore((s) => s.closeSettingsModal)

  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    setIsStandalone(
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true
    )

    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') {
      setInstallPrompt(null)
      setIsStandalone(true)
    }
  }

  const handleResetData = async () => {
    await clearAllData()
    localStorage.removeItem('finance-settings')
    addToast('모든 데이터가 초기화되었습니다.', 'info')
    setShowResetConfirm(false)
    closeSettingsModal()
    setTimeout(() => window.location.reload(), 500)
  }

  return (
    <div className="space-y-8">
      {/* PWA Install */}
      <section>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
          <Smartphone className="w-4 h-4" />
          앱 설치
        </h3>
        <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
          {isStandalone ? (
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <span className="text-sm text-green-700 dark:text-green-400 font-medium">
                앱이 이미 설치되어 있습니다
              </span>
            </div>
          ) : installPrompt ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">앱으로 설치하기</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  홈 화면에 추가하여 더 빠르게 사용할 수 있습니다
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={handleInstall}
                leftIcon={<Download className="w-4 h-4" />}
              >
                설치하기
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                앱 설치를 위해 브라우저 메뉴에서 설치 옵션을 사용하세요
              </p>
              <div className="text-xs text-zinc-500 dark:text-zinc-400 space-y-1">
                <p>• Chrome: 주소줄 오른쪽 설치 아이콘 또는 메뉴 → 앱 설치</p>
                <p>• Safari: 공유 → 홈 화면에 추가</p>
                <p>• Samsung: 메뉴 → 페이지를 다음에 추가 → 홈 화면</p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Danger Zone */}
      <section>
        <h3 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-3 flex items-center gap-2">
          <Trash2 className="w-4 h-4" />
          위험 구역
        </h3>
        <div className="p-4 border border-red-200 dark:border-red-800/50 bg-red-50/50 dark:bg-red-950/10 rounded-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-red-700 dark:text-red-400">모든 데이터 삭제</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                모든 데이터를 삭제하고 초기 상태로 되돌립니다. 이 작업은 되돌릴 수 없습니다.
              </p>
            </div>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setShowResetConfirm(true)}
              leftIcon={<Trash2 className="w-4 h-4" />}
            >
              초기화
            </Button>
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        onConfirm={handleResetData}
        title="데이터 초기화"
        description="정말로 모든 데이터를 삭제하시겠습니까? 모든 자산, 부채, 거래 데이터가 영구적으로 삭제됩니다. 기본 구성원과 카테고리만 남습니다. 이 작업은 되돌릴 수 없습니다."
        confirmText="초기화"
        variant="danger"
      />
    </div>
  )
}
