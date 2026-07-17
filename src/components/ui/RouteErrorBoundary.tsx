import { useEffect } from 'react'
import { isRouteErrorResponse, useRouteError } from 'react-router-dom'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'

// 배포 직후 남아 있는 옛 해시 청크의 동적 import 실패 패턴 (브라우저별 메시지)
function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return (
    /Failed to fetch dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /Unable to preload CSS/i.test(message) ||
    /module script.*MIME type/i.test(message)
  )
}

const RELOAD_GUARD_KEY = 'fin-chunk-reloaded'

/**
 * 라우트 크래시용 errorElement — ErrorBoundary 의 시각 스타일을 재사용한 한국어 오류 화면.
 * 새 배포로 옛 청크가 사라져 동적 import 가 실패한 경우 세션당 1회 자동 새로고침으로 회복한다.
 */
export function RouteErrorBoundary() {
  const error = useRouteError()
  const chunkError = isChunkLoadError(error)

  useEffect(() => {
    console.error('[RouteErrorBoundary]', error)
  }, [error])

  useEffect(() => {
    if (!chunkError) return
    let guarded = false
    try {
      if (!sessionStorage.getItem(RELOAD_GUARD_KEY)) {
        sessionStorage.setItem(RELOAD_GUARD_KEY, '1')
        guarded = true
      }
    } catch {
      // sessionStorage 사용 불가 → 무한 새로고침 루프 방지를 위해 자동 재시도 생략
    }
    if (guarded) window.location.reload()
  }, [chunkError])

  const message = chunkError
    ? '앱이 새 버전으로 업데이트되어 페이지를 다시 불러와야 합니다.'
    : isRouteErrorResponse(error)
      ? `요청을 처리하지 못했습니다 (${error.status})`
      : error instanceof Error && error.message
        ? error.message
        : '예상치 못한 오류가 발생했습니다. 다시 시도해 주세요.'

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-secondary p-4">
      <div className="text-center max-w-md">
        <div className="mx-auto mb-6 w-16 h-16 rounded-full bg-status-danger flex items-center justify-center">
          <AlertTriangle className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-title1 text-heading mb-2">
          {chunkError ? '업데이트가 필요합니다' : '오류가 발생했습니다'}
        </h1>
        <p className="text-body3 text-sub mb-6 leading-relaxed">{message}</p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2.5 rounded-lg text-body3 bg-primary-500 text-white hover:bg-primary-600 transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            새로고침
          </button>
          <button
            onClick={() => window.location.assign('/')}
            className="px-4 py-2.5 rounded-lg text-body3 bg-[var(--surface-tertiary)] text-body hover:bg-[var(--hover-bg)] transition-colors flex items-center gap-1.5"
          >
            <Home className="w-3.5 h-3.5" />
            홈으로
          </button>
        </div>
      </div>
    </div>
  )
}
