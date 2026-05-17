import { useState, useEffect } from 'react'
import { Download, Trash2, Smartphone, CheckCircle2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { clearAllData } from '@/services/database'
import { getApiKey, setApiKey, clearApiKey } from '@/services/aiCategorizeMerchants'
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
  const [apiKey, setApiKeyInput] = useState<string>('')
  const [apiKeySaved, setApiKeySaved] = useState<boolean>(false)
  const [showApiKey, setShowApiKey] = useState<boolean>(false)

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

    const existingKey = getApiKey()
    if (existingKey) {
      setApiKeySaved(true)
      setApiKeyInput(existingKey)
    }

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleSaveApiKey = () => {
    const trimmed = apiKey.trim()
    if (trimmed.length === 0) {
      addToast('API 키를 입력해주세요', 'error')
      return
    }
    if (!/^sk-ant-/.test(trimmed)) {
      addToast('Anthropic API 키 형식이 아닙니다 (sk-ant-...)', 'error')
      return
    }
    setApiKey(trimmed)
    setApiKeySaved(true)
    setShowApiKey(false)
    addToast('AI 분류 키가 저장되었습니다', 'success')
  }

  const handleClearApiKey = () => {
    clearApiKey()
    setApiKeyInput('')
    setApiKeySaved(false)
    addToast('AI 분류 키가 제거되었습니다', 'info')
  }

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
        <h3 className="text-body3-semi text-heading mb-3 flex items-center gap-2">
          <Smartphone className="w-4 h-4" />
          앱 설치
        </h3>
        <div className="p-4 bg-surface-secondary rounded-xl">
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
                <p className="text-body3 text-heading">앱으로 설치하기</p>
                <p className="text-caption text-sub">
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
              <p className="text-sm text-sub">
                앱 설치를 위해 브라우저 메뉴에서 설치 옵션을 사용하세요
              </p>
              <div className="text-caption text-sub space-y-1">
                <p>• Chrome: 주소줄 오른쪽 설치 아이콘 또는 메뉴 → 앱 설치</p>
                <p>• Safari: 공유 → 홈 화면에 추가</p>
                <p>• Samsung: 메뉴 → 페이지를 다음에 추가 → 홈 화면</p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* AI Classification */}
      <section>
        <h3 className="text-body3-semi text-heading mb-3 flex items-center gap-2">
          <Sparkles className="w-4 h-4" />
          AI 카테고리 분류
        </h3>
        <div className="p-4 bg-surface-secondary rounded-xl space-y-3">
          <p className="text-caption text-sub">
            카드 명세서 가져오기에서 인식 못 한 가맹점을 Claude API로 자동 분류합니다.
            API 키는 이 디바이스에만 저장되며 클라우드에 동기화되지 않습니다.
            가맹점 이름과 카테고리 목록만 Anthropic에 전송됩니다(금액/날짜/멤버 정보는 전송 안 됨).
          </p>
          <div className="flex items-center gap-2">
            <input
              type={showApiKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="sk-ant-..."
              className="input flex-1 text-sm"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(v => !v)}
              className="text-caption text-sub px-2 py-1 hover:underline"
            >
              {showApiKey ? '숨김' : '보기'}
            </button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-caption text-sub">
              {apiKeySaved ? '✓ 저장됨 — 카드 명세서 모달에서 "AI 분류" 버튼 사용 가능' : '아직 설정되지 않음'}
            </span>
            <div className="flex gap-2">
              {apiKeySaved && (
                <Button variant="ghost" size="sm" onClick={handleClearApiKey}>
                  제거
                </Button>
              )}
              <Button variant="primary" size="sm" onClick={handleSaveApiKey}>
                저장
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Danger Zone */}
      <section>
        <h3 className="text-body3-semi text-status-danger mb-3 flex items-center gap-2">
          <Trash2 className="w-4 h-4" />
          위험 구역
        </h3>
        <div className="p-4 border border-red-200 dark:border-red-800/50 bg-red-50/50 dark:bg-red-950/10 rounded-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-body3 text-red-700 dark:text-red-400">모든 데이터 삭제</p>
              <p className="text-caption text-sub">
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
