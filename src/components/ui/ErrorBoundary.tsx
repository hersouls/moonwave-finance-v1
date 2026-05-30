import { Component, type ReactNode, type ErrorInfo } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-surface-secondary p-4">
          <div className="text-center max-w-md">
            <div className="mx-auto mb-6 w-16 h-16 rounded-full bg-status-danger flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-title1 text-heading mb-2">
              오류가 발생했습니다
            </h1>
            <p className="text-body3 text-sub mb-6 leading-relaxed">
              {this.state.error?.message || '예상치 못한 오류가 발생했습니다. 다시 시도해 주세요.'}
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleRetry}
                className="px-4 py-2.5 rounded-lg text-body3 bg-primary-500 text-white hover:bg-primary-600 transition-colors"
              >
                다시 시도
              </button>
              <button
                onClick={this.handleReload}
                className="px-4 py-2.5 rounded-lg text-body3 bg-[var(--surface-tertiary)] text-body hover:bg-[var(--hover-bg)] transition-colors flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                새로고침
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
