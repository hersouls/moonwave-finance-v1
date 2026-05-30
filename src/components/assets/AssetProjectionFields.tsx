import { useState } from 'react'
import { clsx } from 'clsx'
import { Minus, TrendingDown, CalendarPlus } from 'lucide-react'
import type { AssetValueProjection } from '@/lib/types'

type Mode = 'flat' | 'daily' | 'monthly'

interface Props {
  value: AssetValueProjection | undefined
  onChange: (p: AssetValueProjection | undefined) => void
}

function deriveMode(p?: AssetValueProjection): Mode {
  if (p?.dailyDelta) return 'daily'
  if (p?.monthlyAmount && p?.monthlyDay) return 'monthly'
  return 'flat'
}

const fmt = (n: number) => (n ? n.toLocaleString('ko-KR') : '')
const parse = (s: string) => Number(s.replace(/[^0-9]/g, '')) || 0

/**
 * 자본 특성별 가치 변동 규칙 입력. flat(변동 없음) / 매일 ±(감가상각·일일이자) /
 * 매월 가산(연금 불입). 입력일부터 (Y+1)-12-31 까지 자동 투영에 사용된다.
 */
export function AssetProjectionFields({ value, onChange }: Props) {
  const [mode, setMode] = useState<Mode>(() => deriveMode(value))
  const [dailyMag, setDailyMag] = useState<string>(() => fmt(Math.abs(value?.dailyDelta ?? 0)))
  const [dailyDir, setDailyDir] = useState<'up' | 'down'>(() => ((value?.dailyDelta ?? 0) > 0 ? 'up' : 'down'))
  const [monthlyAmt, setMonthlyAmt] = useState<string>(() => fmt(value?.monthlyAmount ?? 0))
  const [monthlyDay, setMonthlyDay] = useState<number>(() => value?.monthlyDay ?? 1)

  const emit = (m: Mode, dMag: string, dDir: 'up' | 'down', mAmt: string, mDay: number) => {
    if (m === 'daily') {
      const mag = parse(dMag)
      onChange(mag > 0 ? { dailyDelta: dDir === 'down' ? -mag : mag } : undefined)
    } else if (m === 'monthly') {
      const amt = parse(mAmt)
      onChange(amt > 0 ? { monthlyAmount: amt, monthlyDay: mDay } : undefined)
    } else {
      onChange(undefined)
    }
  }

  const pickMode = (m: Mode) => { setMode(m); emit(m, dailyMag, dailyDir, monthlyAmt, monthlyDay) }

  const MODES: { key: Mode; label: string; icon: typeof Minus }[] = [
    { key: 'flat', label: '변동 없음', icon: Minus },
    { key: 'daily', label: '매일 변동', icon: TrendingDown },
    { key: 'monthly', label: '매월 가산', icon: CalendarPlus },
  ]

  return (
    <div>
      <label className="mb-1.5 block text-body3 text-body">가치 변동 규칙</label>
      <div className="grid grid-cols-3 gap-2">
        {MODES.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => pickMode(key)}
            aria-pressed={mode === key}
            className={clsx(
              'flex flex-col items-center gap-1 rounded-lg border-2 py-2.5 text-caption font-medium transition-all',
              mode === key ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300' : 'border-base text-sub hover:bg-[var(--hover-bg)]',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {mode === 'daily' && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-body3 text-sub">매일</span>
          <input
            type="text"
            inputMode="numeric"
            value={dailyMag}
            onChange={(e) => { const v = fmt(parse(e.target.value)); setDailyMag(v); emit('daily', v, dailyDir, monthlyAmt, monthlyDay) }}
            placeholder="0"
            className="input-base flex-1 text-right tabular-nums"
          />
          <span className="text-body3 text-sub">원</span>
          <div className="inline-flex rounded-lg bg-surface-tertiary p-0.5">
            {(['down', 'up'] as const).map((d) => (
              <button key={d} type="button" onClick={() => { setDailyDir(d); emit('daily', dailyMag, d, monthlyAmt, monthlyDay) }}
                className={clsx('rounded-md px-2.5 py-1.5 text-label3 font-medium transition-colors', dailyDir === d ? (d === 'down' ? 'bg-value-negative-soft text-value-negative' : 'bg-value-positive-soft text-value-positive') : 'text-sub')}>
                {d === 'down' ? '감소' : '증가'}
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === 'monthly' && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-body3 text-sub">매월</span>
          <select value={monthlyDay} onChange={(e) => { const d = Number(e.target.value); setMonthlyDay(d); emit('monthly', dailyMag, dailyDir, monthlyAmt, d) }}
            className="input-base w-20 tabular-nums">
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}일</option>)}
          </select>
          <input
            type="text"
            inputMode="numeric"
            value={monthlyAmt}
            onChange={(e) => { const v = fmt(parse(e.target.value)); setMonthlyAmt(v); emit('monthly', dailyMag, dailyDir, v, monthlyDay) }}
            placeholder="0"
            className="input-base flex-1 text-right tabular-nums"
          />
          <span className="text-body3 text-sub">원 가산</span>
        </div>
      )}

      <p className="mt-1.5 text-caption text-disabled">
        {mode === 'flat' && '입력일부터 내년 말까지 동일한 값으로 자동 저장됩니다.'}
        {mode === 'daily' && '매일 지정 금액만큼 자동 반영되어 저장됩니다 (예: 자동차 감가상각).'}
        {mode === 'monthly' && '매월 지정일에 지정 금액이 더해져 저장됩니다 (예: 연금 불입).'}
      </p>
    </div>
  )
}
