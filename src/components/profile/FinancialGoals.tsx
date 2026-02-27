import { Target } from 'lucide-react'
import { Card } from '@/components/ui/Card'

export function FinancialGoals() {
  return (
    <Card className="!p-5">
      <div className="flex items-center gap-3 mb-3">
        <Target className="w-5 h-5 text-primary-600 dark:text-primary-400" />
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">재정 목표</h3>
      </div>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        재정 목표 설정 기능은 향후 업데이트에서 제공될 예정입니다.
      </p>
    </Card>
  )
}
