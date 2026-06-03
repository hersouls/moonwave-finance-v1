import { useState, useEffect } from 'react'
import { Home } from 'lucide-react'

interface RealEstateInputAreaProps {
  onValuesChange: (values: { initialAmount: number }) => void
}

export function RealEstateInputArea({ onValuesChange }: RealEstateInputAreaProps) {
  const [initialAmountStr, setInitialAmountStr] = useState('')

  useEffect(() => {
    const amount = Number(initialAmountStr.replace(/[^0-9]/g, ''))
    onValuesChange({ initialAmount: amount })
  }, [initialAmountStr, onValuesChange])

  return (
    <div className="rounded-2xl bg-[color:var(--color-primary-50)] dark:bg-[color:var(--color-primary-900)]/20 ring-1 ring-[color:var(--color-primary-200)] dark:ring-[color:var(--color-primary-800)] p-4 space-y-4">
      <h4 className="text-body3-semi text-heading flex items-center gap-2">
        <span className="w-7 h-7 rounded-lg bg-[color:var(--color-primary-100)] dark:bg-[color:var(--color-primary-900)]/40 flex items-center justify-center flex-shrink-0">
          <Home className="w-3.5 h-3.5 text-[color:var(--color-primary-600)] dark:text-[color:var(--color-primary-300)]" />
        </span>
        부동산 자산 등록
      </h4>
      <p className="text-caption text-sub mb-2 leading-relaxed">
        부동산은 시세 변동이 적어, 입력하신 금액이 그대로 유지됩니다. 시세가 변동되었을 때에만 자산 상세 화면에서 실거래가나 시세를 다시 입력해주세요.
      </p>
      <div>
        <label className="block text-label2 text-sub mb-1.5">현재 시세 (또는 매입가)</label>
        <div className="relative">
          <input
            type="text"
            inputMode="numeric"
            value={initialAmountStr}
            onChange={(e) => {
              const raw = e.target.value.replace(/[^0-9]/g, '')
              setInitialAmountStr(raw ? Number(raw).toLocaleString('ko-KR') : '')
            }}
            placeholder="0"
            className="input-base text-right pr-8 tabular-nums"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-disabled">원</span>
        </div>
      </div>
    </div>
  )
}
