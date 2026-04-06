import { useUIStore } from '@/stores/uiStore'
import { ExternalLink } from 'lucide-react'

export function Footer() {
  const openTermsModal = useUIStore((state) => state.openTermsModal)

  return (
    <footer className="hidden lg:flex mt-auto py-4 px-6 border-t border-base bg-[var(--surface-elevated)] justify-center items-center" role="contentinfo">
      <nav className="flex items-center gap-4 text-caption text-sub" aria-label="푸터 링크">
        <span>Copyright&copy; Moonwave All rights reserved.</span>
        <span aria-hidden="true">|</span>
        <button onClick={openTermsModal} className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded" aria-label="서비스 약관 열기">이용약관</button>
        <span aria-hidden="true">|</span>
        <a href="mailto:her_soul@naver.com" className="inline-flex items-center gap-1 hover:text-primary-600 dark:hover:text-primary-400 transition-colors underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded" aria-label="문의하기">
          문의하기 <ExternalLink className="w-3 h-3" aria-hidden="true" />
        </a>
      </nav>
    </footer>
  )
}
