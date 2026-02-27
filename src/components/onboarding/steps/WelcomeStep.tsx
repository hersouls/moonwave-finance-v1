import { Wallet, TrendingUp, PieChart, Shield } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface WelcomeStepProps {
  onNext: () => void
}

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  const features = [
    { icon: <TrendingUp className="w-5 h-5" />, title: '자산 추적', desc: '일별 자산가치를 기록하고 변화를 추적합니다' },
    { icon: <PieChart className="w-5 h-5" />, title: '가계부', desc: '수입과 지출을 카테고리별로 관리합니다' },
    { icon: <Shield className="w-5 h-5" />, title: '오프라인 지원', desc: '인터넷 없이도 데이터를 안전하게 기록합니다' },
  ]

  return (
    <div className="flex flex-col items-center justify-center min-h-full px-6 py-12">
      <div className="w-16 h-16 bg-primary-500 rounded-2xl flex items-center justify-center mb-6">
        <Wallet className="w-8 h-8 text-white" />
      </div>
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">Moonwave Finance</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-8 text-center">가족 자산을 한눈에 관리하세요</p>

      <div className="w-full max-w-sm space-y-4 mb-10">
        {features.map((f, i) => (
          <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
            <div className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400 flex-shrink-0">
              {f.icon}
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{f.title}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{f.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <Button variant="primary" size="lg" onClick={onNext} className="w-full max-w-sm">
        시작하기
      </Button>
    </div>
  )
}
