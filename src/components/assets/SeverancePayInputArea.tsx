import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { calculateSeverancePay, calculateSeveranceTax, getServiceYears } from '@/services/assetAnalytics'

interface SeverancePayInputAreaProps {
  onValuesChange: (values: { joinDate: string; monthlyAvgWage: number; estimatedAmount: number }) => void
}

export function SeverancePayInputArea({ onValuesChange }: SeverancePayInputAreaProps) {
  const [joinDate, setJoinDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [wageStr, setWageStr] = useState('')
  const [estimatedAmount, setEstimatedAmount] = useState(0)

  const today = format(new Date(), 'yyyy-MM-dd')
  const wage = Number(wageStr.replace(/[^0-9]/g, ''))
  const serviceYears = joinDate && wage > 0 ? getServiceYears(joinDate, today) : 0
  const tax = estimatedAmount > 0 ? calculateSeveranceTax(estimatedAmount, serviceYears) : null

  useEffect(() => {
    if (joinDate && wage > 0) {
      const amount = calculateSeverancePay(joinDate, wage, today)
      setEstimatedAmount(amount)
      onValuesChange({ joinDate, monthlyAvgWage: wage, estimatedAmount: amount })
    } else {
      setEstimatedAmount(0)
      onValuesChange({ joinDate: '', monthlyAvgWage: 0, estimatedAmount: 0 })
    }
  }, [joinDate, wageStr, onValuesChange])

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
          <label className="block text-[13px] text-zinc-600 dark:text-zinc-400 mb-1.5">월 평균임금 (30일분)</label>
          <div className="relative">
            <input
              type="text"
              inputMode="numeric"
              value={wageStr}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9]/g, '')
                setWageStr(raw ? Number(raw).toLocaleString('ko-KR') : '')
              }}
              placeholder="0"
              className="input-base text-right pr-8 tabular-nums"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">원</span>
          </div>
          <p className="text-[12px] text-zinc-500 mt-1">최근 3개월 급여총액 / 해당 기간 총일수 x 30</p>
        </div>

        {estimatedAmount > 0 && (
          <div className="pt-3 border-t border-zinc-200 dark:border-zinc-700 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">퇴직금 예상액</span>
              <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {estimatedAmount.toLocaleString('ko-KR')} <span className="text-sm font-normal">원</span>
              </span>
            </div>
            {tax && tax.totalTax > 0 && (
              <>
                <div className="flex justify-between items-center text-[13px]">
                  <span className="text-zinc-500 dark:text-zinc-400">퇴직소득세</span>
                  <span className="text-zinc-600 dark:text-zinc-300 tabular-nums">
                    -{tax.incomeTax.toLocaleString('ko-KR')}원
                  </span>
                </div>
                <div className="flex justify-between items-center text-[13px]">
                  <span className="text-zinc-500 dark:text-zinc-400">퇴직주민세</span>
                  <span className="text-zinc-600 dark:text-zinc-300 tabular-nums">
                    -{tax.residentTax.toLocaleString('ko-KR')}원
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-zinc-200 dark:border-zinc-700">
                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">세후 예상 수령액</span>
                  <span className="text-base font-bold text-blue-600 dark:text-blue-400 tabular-nums">
                    {tax.netSeverance.toLocaleString('ko-KR')} <span className="text-sm font-normal">원</span>
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
