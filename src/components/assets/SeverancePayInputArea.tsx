import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { calculateSeverancePay } from '@/services/assetAnalytics'

interface SeverancePayInputAreaProps {
  onValuesChange: (values: { joinDate: string; averageDailyWage: number; estimatedAmount: number }) => void
}

export function SeverancePayInputArea({ onValuesChange }: SeverancePayInputAreaProps) {
  const [joinDate, setJoinDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [averageDailyWageStr, setAverageDailyWageStr] = useState('')
  const [estimatedAmount, setEstimatedAmount] = useState(0)

  useEffect(() => {
    const wage = Number(averageDailyWageStr.replace(/[^0-9]/g, ''))
    if (joinDate && wage > 0) {
      const amount = calculateSeverancePay(joinDate, wage, format(new Date(), 'yyyy-MM-dd'))
      setEstimatedAmount(amount)
      onValuesChange({ joinDate, averageDailyWage: wage, estimatedAmount: amount })
    } else {
      setEstimatedAmount(0)
      onValuesChange({ joinDate: '', averageDailyWage: 0, estimatedAmount: 0 })
    }
  }, [joinDate, averageDailyWageStr, onValuesChange])

  return (
    <div className="bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-xl space-y-4 border border-zinc-200 dark:border-zinc-700">
      <h4 className="text-body3-semi text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500">
          <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
          <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
          <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
        </svg>
        예상 퇴직금 자동 계산
      </h4>
      <div className="space-y-3">
        <div>
          <label className="block text-[13px] text-zinc-600 dark:text-zinc-400 mb-1.5">입사일</label>
          <input
            type="date"
            value={joinDate}
            onChange={(e) => setJoinDate(e.target.value)}
            className="input-base"
          />
        </div>
        <div>
          <label className="block text-[13px] text-zinc-600 dark:text-zinc-400 mb-1.5">최근 3개월 1일 평균임금 (예상)</label>
          <div className="relative">
            <input
              type="text"
              inputMode="numeric"
              value={averageDailyWageStr}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9]/g, '')
                setAverageDailyWageStr(raw ? Number(raw).toLocaleString('ko-KR') : '')
              }}
              placeholder="0"
              className="input-base text-right pr-8 tabular-nums"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">원</span>
          </div>
          <p className="text-[12px] text-zinc-500 mt-1">예: (최근 3개월 임금총액) ÷ (그 기간의 총 일수)</p>
        </div>
        
        <div className="pt-2 border-t border-zinc-200 dark:border-zinc-700 mt-4 flex justify-between items-center">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">현재 누적 예상액</span>
          <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {estimatedAmount > 0 ? estimatedAmount.toLocaleString('ko-KR') : 0} <span className="text-sm font-normal">원</span>
          </span>
        </div>
      </div>
    </div>
  )
}
