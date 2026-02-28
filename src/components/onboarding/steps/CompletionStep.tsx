import { useEffect, useRef } from 'react'
import { PartyPopper, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface CompletionStepProps {
  onComplete: () => void
}

export function CompletionStep({ onComplete }: CompletionStepProps) {
  const confettiFired = useRef(false)

  useEffect(() => {
    if (confettiFired.current) return
    confettiFired.current = true
    import('canvas-confetti').then(({ default: confetti }) => {
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } })
    }).catch(() => {})
  }, [])

  return (
    <div className="flex flex-col items-center justify-center min-h-full px-6 py-12">
      <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-6">
        <PartyPopper className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
      </div>
      <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">설정 완료!</h2>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-2 text-center">FIN을 시작할 준비가 되었습니다.</p>
      <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-10 text-center">대시보드에서 자산을 추가하고 매일 기록해보세요.</p>

      <Button variant="primary" size="lg" onClick={onComplete} className="w-full max-w-sm" rightIcon={<ArrowRight className="w-5 h-5" />}>
        시작하기
      </Button>
    </div>
  )
}
