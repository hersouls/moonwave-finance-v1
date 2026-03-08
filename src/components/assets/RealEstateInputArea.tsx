import { useState, useEffect } from 'react'

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
    <div className="bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-xl space-y-4 border border-zinc-200 dark:border-zinc-700">
      <h4 className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500">
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
        부동산 자산 등록
      </h4>
      <p className="text-[12px] text-zinc-500 mb-2 leading-relaxed">
        부동산은 시세 변동이 적어, 입력하신 금액이 그대로 유지됩니다. 시세가 변동되었을 때에만 자산 상세 화면에서 실거래가나 시세를 다시 입력해주세요.
      </p>
      <div>
        <label className="block text-[13px] text-zinc-600 dark:text-zinc-400 mb-1.5">현재 시세 (또는 매입가)</label>
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
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">원</span>
        </div>
      </div>
    </div>
  )
}
