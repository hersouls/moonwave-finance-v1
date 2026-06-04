import { useEffect, useMemo, useState } from 'react'
import { TrendingUp, TrendingDown, Coins, Banknote, CalendarDays } from 'lucide-react'
import { clsx } from 'clsx'
import { Dialog, DialogHeader, DialogBody, DialogFooter } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Amount } from '@/components/ui/Amount'
import { useUIStore } from '@/stores/uiStore'
import { useAssetStore } from '@/stores/assetStore'
import { useDailyValueStore } from '@/stores/dailyValueStore'
import { useToastStore } from '@/stores/toastStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { valueAsOf } from '@/services/assetAnalytics'
import { getTodayString } from '@/lib/dateUtils'
import { formatChange } from '@/utils/format'
import { FormSectionLabel, HeroAmountField } from '@/components/ui/CreateFormPrimitives'

/**
 * Quick value-recording modal — the core recurring asset action. Record/update
 * an item's value as of a date (default today). Triggered globally via
 * uiStore.openAssetQuickValue(itemId); mounted once per asset/liability page.
 */
export function QuickValueModal() {
  const itemId = useUIStore((s) => s.assetQuickValueItemId)
  const close = useUIStore((s) => s.closeAssetQuickValue)
  const items = useAssetStore((s) => s.items)
  const allValues = useDailyValueStore((s) => s.allValues)
  const applyValueSeries = useDailyValueStore((s) => s.applyValueSeries)

  const autoCarry = useSettingsStore((s) => s.settings.autoCarryForward !== false)

  const item = itemId != null ? items.find((i) => i.id === itemId) : null
  const isLiability = item?.type === 'liability'

  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(() => getTodayString())
  const [busy, setBusy] = useState(false)

  // 현재 유효값(오늘 기준 forward-fill) — delta 힌트 + 프리필
  const latest = useMemo(() => {
    if (itemId == null) return 0
    const vals = allValues.filter((v) => v.assetItemId === itemId).sort((a, b) => b.date.localeCompare(a.date))
    return valueAsOf(vals, getTodayString())
  }, [allValues, itemId])

  useEffect(() => {
    if (itemId != null) {
      setDate(getTodayString())
      setAmount(latest ? latest.toLocaleString('ko-KR') : '')
    }
  }, [itemId, latest])

  const numeric = Number(amount.replace(/,/g, '')) || 0
  const delta = numeric - latest
  const good = isLiability ? delta < 0 : delta > 0

  const handleSave = async () => {
    if (itemId == null || numeric <= 0) return
    setBusy(true)
    try {
      // 입력일 기준으로 전방 재투영(항목 규칙 적용) + 과거 백필
      await applyValueSeries(itemId, numeric, date, item?.projection)
      useToastStore.getState().addToast('가치가 기록되었습니다.', 'success')
      close()
    } catch {
      useToastStore.getState().addToast('저장에 실패했습니다.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={itemId != null} onClose={busy ? () => {} : close} size="sm">
      <DialogHeader title="가치 기록" description={item?.name} onClose={busy ? undefined : close} />
      <DialogBody>
        <div className="space-y-6">
          {/* Current value reference */}
          <div className="flex items-center justify-between rounded-2xl bg-surface-secondary ring-1 ring-base px-4 py-3">
            <span className="text-caption text-sub">현재 기록값</span>
            <Amount value={latest} size="emphasis" className="text-heading" />
          </div>

          {/* Amount — hero */}
          <div>
            <FormSectionLabel icon={isLiability ? Banknote : Coins}>기록할 금액</FormSectionLabel>
            <HeroAmountField
              value={amount}
              onChange={setAmount}
              caption={isLiability ? '부채 잔액' : '자산 평가액'}
              autoFocus
            />
            {numeric > 0 && delta !== 0 && (
              <p className={clsx('mt-2 flex items-center justify-end gap-1 text-caption tabular-nums', good ? 'text-value-positive' : 'text-value-negative')}>
                {good ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {formatChange(delta)} {isLiability ? (delta < 0 ? '감소' : '증가') : '전 기록 대비'}
              </p>
            )}
          </div>

          {/* Date */}
          <div>
            <FormSectionLabel icon={CalendarDays} htmlFor="quick-value-date">기록일</FormSectionLabel>
            <input id="quick-value-date" type="date" value={date} max={getTodayString()} onChange={(e) => setDate(e.target.value)} className="input-base tabular-nums" />
          </div>

          {autoCarry && (
            <p className="text-body3 text-disabled">입력하지 않아도 어제 값이 오늘로 자동 저장됩니다. 값이 바뀔 때만 기록하세요.</p>
          )}
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={close} disabled={busy}>취소</Button>
        <Button variant="primary" onClick={handleSave} disabled={busy || numeric <= 0}>{busy ? '저장 중…' : '기록'}</Button>
      </DialogFooter>
    </Dialog>
  )
}
