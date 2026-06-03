import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { Briefcase } from 'lucide-react'
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
    <div className="rounded-2xl bg-[color:var(--color-primary-50)] dark:bg-[color:var(--color-primary-900)]/20 ring-1 ring-[color:var(--color-primary-200)] dark:ring-[color:var(--color-primary-800)] p-4 space-y-4">
      <h4 className="text-body3-semi text-heading flex items-center gap-2">
        <span className="w-7 h-7 rounded-lg bg-[color:var(--color-primary-100)] dark:bg-[color:var(--color-primary-900)]/40 flex items-center justify-center flex-shrink-0">
          <Briefcase className="w-3.5 h-3.5 text-[color:var(--color-primary-600)] dark:text-[color:var(--color-primary-300)]" />
        </span>
        예상 퇴직금 자동 계산
      </h4>
      <div className="space-y-3">
        <div>
          <label className="block text-label2 text-sub mb-1.5">입사일</label>
          <input
            type="date"
            value={joinDate}
            onChange={(e) => setJoinDate(e.target.value)}
            className="input-base"
          />
        </div>
        <div>
          <label className="block text-label2 text-sub mb-1.5">월 평균임금 (30일분)</label>
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
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-disabled">원</span>
          </div>
          <p className="text-caption text-sub mt-1">최근 3개월 급여총액 / 해당 기간 총일수 x 30</p>
        </div>

        {estimatedAmount > 0 && (
          <div className="pt-3 border-t border-base space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-body">퇴직금 예상액</span>
              <span className="text-lg font-bold text-status-success tabular-nums">
                {estimatedAmount.toLocaleString('ko-KR')} <span className="text-sm font-normal">원</span>
              </span>
            </div>
            {tax && tax.totalTax > 0 && (
              <>
                <div className="flex justify-between items-center text-label2 leading-none">
                  <span className="text-sub">퇴직소득세</span>
                  <span className="text-sub tabular-nums">
                    -{tax.incomeTax.toLocaleString('ko-KR')}원
                  </span>
                </div>
                <div className="flex justify-between items-center text-label2 leading-none">
                  <span className="text-sub">퇴직주민세</span>
                  <span className="text-sub tabular-nums">
                    -{tax.residentTax.toLocaleString('ko-KR')}원
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-base">
                  <span className="text-sm font-medium text-body">세후 예상 수령액</span>
                  <span className="text-body1 font-bold text-accent-primary tabular-nums">
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
