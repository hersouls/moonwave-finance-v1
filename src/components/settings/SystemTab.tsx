import { useState, useEffect } from 'react'
import { Download, Trash2, Smartphone, CheckCircle2, Sparkles, Lock, PencilLine, Eye, EyeOff } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/Button'
import { ToggleSwitch } from '@/components/settings/ToggleSwitch'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { clearAllData } from '@/services/database'
import { getApiKey, setApiKey, clearApiKey } from '@/services/aiCategorizeMerchants'
import { getDeviceId } from '@/lib/deviceId'
import { useToastStore } from '@/stores/toastStore'
import { useUIStore } from '@/stores/uiStore'
import { useSettingsStore } from '@/stores/settingsStore'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function SystemTab() {
  const addToast = useToastStore((s) => s.addToast)
  const closeSettingsModal = useUIStore((s) => s.closeSettingsModal)
  const deviceWriteEnabled = useSettingsStore((s) => s.settings.deviceWriteEnabled !== false)
  const setDeviceWriteEnabled = useSettingsStore((s) => s.setDeviceWriteEnabled)
  const deviceIdShort = getDeviceId().slice(0, 8)

  const handleToggleDeviceWrite = () => {
    const next = !deviceWriteEnabled
    setDeviceWriteEnabled(next)
    addToast(
      next ? '이 기기에서 쓰기가 활성화되었습니다' : '이 기기는 읽기 전용으로 전환되었습니다',
      next ? 'success' : 'info',
    )
  }

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
      {/* 기기 쓰기 권한 (per-device, not synced) */}
      <section>
        <h3 className="text-body3-semi text-heading mb-3 flex items-center gap-2">
          {deviceWriteEnabled ? <PencilLine className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
          기기 쓰기 권한
        </h3>
        <div className="p-4 bg-surface-secondary rounded-xl space-y-3">
          <ToggleSwitch
            checked={deviceWriteEnabled}
            onChange={handleToggleDeviceWrite}
            label="이 기기에서 쓰기 허용"
            description={
              deviceWriteEnabled
                ? '이 기기에서 거래·자산·예산 등 데이터를 추가, 수정, 삭제할 수 있습니다.'
                : '이 기기는 읽기 전용입니다. 데이터 변경·가져오기·클라우드 업로드가 차단됩니다.'
            }
          />

          {!deviceWriteEnabled && (
            <div className="rounded-lg p-3 bg-[color:var(--color-primary-50)] dark:bg-[color:var(--color-primary-900)]/20 ring-1 ring-[color:var(--color-primary-200)] dark:ring-[color:var(--color-primary-800)]">
              <p className="text-caption text-[color:var(--color-primary-700)] dark:text-[color:var(--color-primary-300)] leading-relaxed">
                읽기 전용으로 전환하면 이 기기에서는 모든 데이터 추가·수정·삭제와 가져오기(임포트)·클라우드 업로드가 차단됩니다.
                클라우드의 변경 내용은 계속 내려받아 최신 상태로 유지됩니다.
                이 설정은 이 기기에만 적용되며 다른 기기에 동기화되지 않습니다.
              </p>
            </div>
          )}

          <p className="text-label4 text-disabled tabular-nums">기기 ID: {deviceIdShort}</p>
        </div>
      </section>

      {/* PWA Install */}
      <section>
        <h3 className="text-body3-semi text-heading mb-3 flex items-center gap-2">
          <Smartphone className="w-4 h-4" />
          앱 설치
        </h3>
        <div className="p-4 bg-surface-secondary rounded-xl">
          {isStandalone ? (
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-status-success" />
              <span className="text-sm text-status-success font-medium">
                앱이 이미 설치되어 있습니다
              </span>
            </div>
          ) : installPrompt ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
                className="w-full sm:w-auto"
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
            거래 입력 마법사의 실시간 추천, 가계부 일괄 분류, 카드 명세서 가져오기에서
            로컬 추천이 실패한 가맹점을 Claude API로 자동 분류합니다.
            과거 거래·학습된 분류 기반의 추천은 키 없이도 동작하며, 키는 알 수 없는 가맹점에만 사용됩니다.
            API 키는 이 디바이스에만 저장되며 클라우드에 동기화되지 않습니다.
            가맹점 이름과 카테고리 목록만 Anthropic에 전송됩니다(금액/날짜/멤버 정보는 전송 안 됨).
          </p>
          <div className="flex items-center gap-2">
            <input
              type={showApiKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="sk-ant-..."
              className="input-base flex-1"
              autoComplete="off"
            />
            <IconButton
              type="button"
              color="secondary"
              plain
              size="sm"
              onClick={() => setShowApiKey(v => !v)}
              aria-label={showApiKey ? 'API 키 숨김' : 'API 키 보기'}
              title={showApiKey ? '숨김' : '보기'}
            >
              {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </IconButton>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-caption text-sub">
              {apiKeySaved ? '✓ 저장됨 — 입력 마법사·일괄 분류·카드 명세서에서 AI 분류 사용 가능' : '아직 설정되지 않음 (로컬 추천은 키 없이 동작)'}
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
        <div className="p-4 border border-status-danger bg-status-danger-soft rounded-xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-body3 text-status-danger">모든 데이터 삭제</p>
              <p className="text-caption text-sub">
                모든 데이터를 삭제하고 초기 상태로 되돌립니다. 이 작업은 되돌릴 수 없습니다.
              </p>
            </div>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setShowResetConfirm(true)}
              leftIcon={<Trash2 className="w-4 h-4" />}
              className="w-full sm:w-auto"
              disabled={!deviceWriteEnabled}
              title={deviceWriteEnabled ? undefined : '읽기 전용 모드'}
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
