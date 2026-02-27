import { Landmark, TrendingUp, Banknote, CreditCard, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface FirstAssetStepProps {
  onNext: () => void
  onBack: () => void
}

export function FirstAssetStep({ onNext, onBack }: FirstAssetStepProps) {
  const tips = [
    { icon: <Landmark className="w-5 h-5" />, text: '퇴직금, 예금 등 금융자산을 등록하세요' },
    { icon: <TrendingUp className="w-5 h-5" />, text: '주식, 암호화폐 등 투자자산도 추적할 수 있어요' },
    { icon: <Banknote className="w-5 h-5" />, text: '매일 자산 가치를 입력하면 변화를 한눈에 볼 수 있어요' },
    { icon: <CreditCard className="w-5 h-5" />, text: '부채도 함께 관리해서 순자산을 정확히 파악하세요' },
  ]

  return (
    <div className="flex flex-col items-center min-h-full px-6 py-12">
      <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-4">
        <TrendingUp className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
      </div>
      <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">자산 등록 가이드</h2>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-8 text-center">설정 완료 후 자산을 등록해보세요</p>

      <div className="w-full max-w-sm space-y-3 mb-10">
        {tips.map((tip, i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 flex-shrink-0">
              {tip.icon}
            </div>
            <p className="text-sm text-zinc-700 dark:text-zinc-300">{tip.text}</p>
          </div>
        ))}
      </div>

      <div className="w-full max-w-sm flex gap-3">
        <Button variant="secondary" onClick={onBack} className="flex-1">이전</Button>
        <Button variant="primary" onClick={onNext} className="flex-1" rightIcon={<ArrowRight className="w-4 h-4" />}>다음</Button>
      </div>
    </div>
  )
}
