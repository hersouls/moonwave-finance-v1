import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import type { AssetValueProjection } from '@/lib/types'

interface Props {
  value: AssetValueProjection | undefined
  onChange: (p: AssetValueProjection | undefined) => void
}

const fmtInt = (n: number) => (n ? Math.round(n).toLocaleString('ko-KR') : '')
const parseInt0 = (s: string) => Number(s.replace(/[^0-9]/g, '')) || 0
const parseRate = (s: string) => { const n = parseFloat(s.replace(/[^0-9.]/g, '')); return Number.isFinite(n) ? n : 0 }

/** 증가/감소 또는 가산/차감 방향 토글 */
function DirToggle({ dir, onChange, up, down }: { dir: 'up' | 'down'; onChange: (d: 'up' | 'down') => void; up: string; down: string }) {
  return (
    <div className="inline-flex flex-shrink-0 rounded-lg bg-surface-tertiary p-0.5">
      {(['up', 'down'] as const).map((d) => (
        <button key={d} type="button" onClick={() => onChange(d)}
          className={clsx('rounded-md px-2.5 py-1.5 text-label3 font-medium transition-colors',
            dir === d ? (d === 'up' ? 'bg-value-positive-soft text-value-positive' : 'bg-value-negative-soft text-value-negative') : 'text-sub')}>
          {d === 'up' ? up : down}
        </button>
      ))}
    </div>
  )
}

/**
 * 자본 특성별 가치 변동 규칙. 매일 정액 / 매월 정액 / 연 정률 을 **독립적으로 조합** 가능.
 * (예: 부채 = 매월 상환 + 연 이자, 연금 = 매월 불입 + 연 수익)
 */
export function AssetProjectionFields({ value, onChange }: Props) {
  // 매일 정액
  const [dailyOn, setDailyOn] = useState(() => !!value?.dailyDelta)
  const [dailyMag, setDailyMag] = useState(() => fmtInt(Math.abs(value?.dailyDelta ?? 0)))
  const [dailyDir, setDailyDir] = useState<'up' | 'down'>(() => ((value?.dailyDelta ?? 0) >= 0 ? 'up' : 'down'))
  // 매월 정액
  const [monthlyOn, setMonthlyOn] = useState(() => !!value?.monthlyAmount)
  const [monthlyAmt, setMonthlyAmt] = useState(() => fmtInt(Math.abs(value?.monthlyAmount ?? 0)))
  const [monthlyDir, setMonthlyDir] = useState<'up' | 'down'>(() => ((value?.monthlyAmount ?? 0) >= 0 ? 'up' : 'down'))
  const [monthlyDay, setMonthlyDay] = useState(() => value?.monthlyDay ?? 1)
  // 연 정률
  const [rateOn, setRateOn] = useState(() => !!value?.annualRatePct)
  const [ratePct, setRatePct] = useState(() => (value?.annualRatePct ? String(Math.abs(value.annualRatePct)) : ''))
  const [rateDir, setRateDir] = useState<'up' | 'down'>(() => ((value?.annualRatePct ?? 0) >= 0 ? 'up' : 'down'))
  const [compound, setCompound] = useState(() => !!value?.compound)

  // 로컬 상태 → projection (현재 커밋된 상태 기준)
  const composeLocal = (): AssetValueProjection | undefined => {
    const p: AssetValueProjection = {}
    if (dailyOn && parseInt0(dailyMag) > 0) p.dailyDelta = (dailyDir === 'down' ? -1 : 1) * parseInt0(dailyMag)
    if (monthlyOn && parseInt0(monthlyAmt) > 0) { p.monthlyAmount = (monthlyDir === 'down' ? -1 : 1) * parseInt0(monthlyAmt); p.monthlyDay = monthlyDay }
    if (rateOn && parseRate(ratePct) > 0) { p.annualRatePct = (rateDir === 'down' ? -1 : 1) * parseRate(ratePct); p.compound = compound }
    return Object.keys(p).length ? p : undefined
  }

  // value 가 외부에서 바뀌면(편집 모달 오픈 등) 로컬 입력 필드를 재동기화. 자체 입력 변경은 건너뜀(루프 방지).
  useEffect(() => {
    const norm = (x?: AssetValueProjection) => JSON.stringify(x ?? null)
    if (norm(value) === norm(composeLocal())) return
    setDailyOn(!!value?.dailyDelta)
    setDailyMag(fmtInt(Math.abs(value?.dailyDelta ?? 0)))
    setDailyDir((value?.dailyDelta ?? 0) >= 0 ? 'up' : 'down')
    setMonthlyOn(!!value?.monthlyAmount)
    setMonthlyAmt(fmtInt(Math.abs(value?.monthlyAmount ?? 0)))
    setMonthlyDir((value?.monthlyAmount ?? 0) >= 0 ? 'up' : 'down')
    setMonthlyDay(value?.monthlyDay ?? 1)
    setRateOn(!!value?.annualRatePct)
    setRatePct(value?.annualRatePct ? String(Math.abs(value.annualRatePct)) : '')
    setRateDir((value?.annualRatePct ?? 0) >= 0 ? 'up' : 'down')
    setCompound(!!value?.compound)
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  // 현재 로컬 상태로 projection 을 구성해 emit
  const emit = (o: Partial<{ dOn: boolean; dMag: string; dDir: 'up' | 'down'; mOn: boolean; mAmt: string; mDir: 'up' | 'down'; mDay: number; rOn: boolean; rPct: string; rDir: 'up' | 'down'; comp: boolean }>) => {
    const dOn = o.dOn ?? dailyOn, dMag = o.dMag ?? dailyMag, dDir = o.dDir ?? dailyDir
    const mOn = o.mOn ?? monthlyOn, mAmt = o.mAmt ?? monthlyAmt, mDir = o.mDir ?? monthlyDir, mDay = o.mDay ?? monthlyDay
    const rOn = o.rOn ?? rateOn, rPct = o.rPct ?? ratePct, rDir = o.rDir ?? rateDir, comp = o.comp ?? compound
    const p: AssetValueProjection = {}
    if (dOn && parseInt0(dMag) > 0) p.dailyDelta = (dDir === 'down' ? -1 : 1) * parseInt0(dMag)
    if (mOn && parseInt0(mAmt) > 0) { p.monthlyAmount = (mDir === 'down' ? -1 : 1) * parseInt0(mAmt); p.monthlyDay = mDay }
    if (rOn && parseRate(rPct) > 0) { p.annualRatePct = (rDir === 'down' ? -1 : 1) * parseRate(rPct); p.compound = comp }
    onChange(Object.keys(p).length ? p : undefined)
  }

  return (
    <div>
      <label className="mb-1.5 block text-body3 text-body">가치 변동 규칙 <span className="text-disabled">(선택 · 조합 가능)</span></label>
      <div className="space-y-2.5 rounded-xl bg-surface-secondary p-3">
        {/* 매일 정액 */}
        <div>
          <button type="button" onClick={() => { const v = !dailyOn; setDailyOn(v); emit({ dOn: v }) }} aria-pressed={dailyOn}
            className="flex w-full items-center justify-between text-body3 font-medium text-heading">
            <span>매일 정액 변동 <span className="text-caption text-disabled">감가상각 등</span></span>
            <span className={clsx('h-4 w-4 rounded-full border-2', dailyOn ? 'border-primary-500 bg-primary-500' : 'border-base')} />
          </button>
          {dailyOn && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-caption text-sub">매일</span>
              <input type="text" inputMode="numeric" value={dailyMag} onChange={(e) => { const v = fmtInt(parseInt0(e.target.value)); setDailyMag(v); emit({ dMag: v }) }} placeholder="0" className="input-base flex-1 text-right tabular-nums" />
              <span className="text-caption text-sub">원</span>
              <DirToggle dir={dailyDir} onChange={(d) => { setDailyDir(d); emit({ dDir: d }) }} up="증가" down="감소" />
            </div>
          )}
        </div>

        {/* 매월 정액 */}
        <div className="border-t border-base pt-2.5">
          <button type="button" onClick={() => { const v = !monthlyOn; setMonthlyOn(v); emit({ mOn: v }) }} aria-pressed={monthlyOn}
            className="flex w-full items-center justify-between text-body3 font-medium text-heading">
            <span>매월 정액 변동 <span className="text-caption text-disabled">연금 불입·부채 상환</span></span>
            <span className={clsx('h-4 w-4 rounded-full border-2', monthlyOn ? 'border-primary-500 bg-primary-500' : 'border-base')} />
          </button>
          {monthlyOn && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-caption text-sub">매월</span>
              <select value={monthlyDay} onChange={(e) => { const d = Number(e.target.value); setMonthlyDay(d); emit({ mDay: d }) }} className="input-base w-20 tabular-nums">
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}일</option>)}
              </select>
              <input type="text" inputMode="numeric" value={monthlyAmt} onChange={(e) => { const v = fmtInt(parseInt0(e.target.value)); setMonthlyAmt(v); emit({ mAmt: v }) }} placeholder="0" className="input-base flex-1 text-right tabular-nums" />
              <span className="text-caption text-sub">원</span>
              <DirToggle dir={monthlyDir} onChange={(d) => { setMonthlyDir(d); emit({ mDir: d }) }} up="가산" down="상환" />
            </div>
          )}
        </div>

        {/* 연 정률 */}
        <div className="border-t border-base pt-2.5">
          <button type="button" onClick={() => { const v = !rateOn; setRateOn(v); emit({ rOn: v }) }} aria-pressed={rateOn}
            className="flex w-full items-center justify-between text-body3 font-medium text-heading">
            <span>연 정률 <span className="text-caption text-disabled">예금이자·기대수익·물가</span></span>
            <span className={clsx('h-4 w-4 rounded-full border-2', rateOn ? 'border-primary-500 bg-primary-500' : 'border-base')} />
          </button>
          {rateOn && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-caption text-sub">연</span>
              <input type="text" inputMode="decimal" value={ratePct} onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, ''); setRatePct(v); emit({ rPct: v }) }} placeholder="0" className="input-base w-20 text-right tabular-nums" />
              <span className="text-caption text-sub">%</span>
              <DirToggle dir={rateDir} onChange={(d) => { setRateDir(d); emit({ rDir: d }) }} up="증가" down="감소" />
              <div className="inline-flex flex-shrink-0 rounded-lg bg-surface-tertiary p-0.5">
                {([['단리', false], ['복리', true]] as const).map(([lbl, c]) => (
                  <button key={lbl} type="button" onClick={() => { setCompound(c); emit({ comp: c }) }}
                    className={clsx('rounded-md px-2.5 py-1.5 text-label3 font-medium transition-colors', compound === c ? 'bg-surface-primary text-heading elevation-1' : 'text-sub')}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
