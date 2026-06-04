import { Share, X, Plus } from 'lucide-react'
import { useIOSInstallPrompt } from '@/hooks/useIOSInstallPrompt'

export function IOSInstallBanner() {
  const { shouldShow, dismiss, dismissPermanently } = useIOSInstallPrompt()

  if (!shouldShow) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-[var(--z-overlay)] animate-[slideInFromTop_0.3s_ease-out]">
      <div className="mx-auto max-w-lg px-4 pt-3 pb-2">
        <div className="relative px-4 py-3 bg-primary-600 dark:bg-primary-700 text-white rounded-xl elevation-4">
          {/* Close button */}
          <button
            type="button"
            onClick={dismiss}
            className="absolute top-2 right-2 p-1.5 text-white/50 hover:text-white/90 rounded-lg transition-colors"
            aria-label="닫기"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Title */}
          <p className="text-body3-semi mb-2.5 pr-6">
            홈 화면에 추가하세요
          </p>

          {/* Step-by-step instructions */}
          <div className="space-y-2 text-body3 text-white/80">
            <div className="flex items-center gap-2.5">
              <span className="flex items-center justify-center w-6 h-6 rounded-md bg-white/10 shrink-0">
                <Share className="w-3.5 h-3.5" />
              </span>
              <span>
                하단의{' '}
                <Share className="inline-block w-3 h-3 mx-0.5 -mt-0.5 text-white" />
                {' '}공유 버튼을 누르세요
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="flex items-center justify-center w-6 h-6 rounded-md bg-white/10 shrink-0">
                <Plus className="w-3.5 h-3.5" />
              </span>
              <span>"홈 화면에 추가"를 선택하세요</span>
            </div>
          </div>

          {/* Permanent dismiss */}
          <button
            type="button"
            onClick={dismissPermanently}
            className="mt-3 text-label3-medium text-white/40 hover:text-white/70 underline underline-offset-2 transition-colors"
          >
            다시 보지 않기
          </button>
        </div>
      </div>
    </div>
  )
}
