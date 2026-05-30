import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { clsx } from 'clsx'
import { Dialog, DialogHeader, DialogBody, DialogFooter } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Amount } from '@/components/ui/Amount'
import { useUIStore } from '@/stores/uiStore'
import { useAssetStore } from '@/stores/assetStore'
import { useDailyValueStore } from '@/stores/dailyValueStore'
import { useToastStore } from '@/stores/toastStore'
import { formatChange } from '@/utils/format'

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
  const setValue = useDailyValueStore((s) => s.setValue)

  const item = itemId != null ? items.find((i) => i.id === itemId) : null
  const isLiability = item?.type === 'liability'

  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [busy, setBusy] = useState(false)

  // Latest recorded value (for delta hint + prefill)
  const latest = useMemo(() => {
    if (itemId == null) return 0
    const vals = allValues.filter((v) => v.assetItemId === itemId).sort((a, b) => b.date.localeCompare(a.date))
    return vals[0]?.value ?? 0
  }, [allValues, itemId])

  useEffect(() => {
    if (itemId != null) {
      setDate(format(new Date(), 'yyyy-MM-dd'))
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
      await setValue(itemId, date, numeric)
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
        <div className="space-y-4">
          {/* Current value reference */}
          <div className="flex items-center justify-between rounded-xl bg-surface-secondary px-3 py-2.5">
            <span className="text-caption text-sub">현재 기록값</span>
            <Amount value={latest} size="emphasis" className="text-heading" />
          </div>

          {/* Amount */}
          <div>
            <label className="mb-1.5 block text-body3 text-body">{isLiability ? '잔액' : '평가 금액'}</label>
            <input
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9]/g, '')
                setAmount(raw ? Number(raw).toLocaleString('ko-KR') : '')
              }}
              placeholder="0"
              className="input-base wizard-amount-glow text-right text-title2 tabular-nums"
              autoFocus
            />
            {numeric > 0 && delta !== 0 && (
              <p className={clsx('mt-1.5 flex items-center justify-end gap-1 text-caption tabular-nums', good ? 'text-value-positive' : 'text-value-negative')}>
                {good ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {formatChange(delta)} {isLiability ? (delta < 0 ? '감소' : '증가') : '전 기록 대비'}
              </p>
            )}
          </div>

          {/* Date */}
          <div>
            <label className="mb-1.5 block text-body3 text-body">기록일</label>
            <input type="date" value={date} max={format(new Date(), 'yyyy-MM-dd')} onChange={(e) => setDate(e.target.value)} className="input-base tabular-nums" />
          </div>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={close} disabled={busy}>취소</Button>
        <Button variant="primary" onClick={handleSave} disabled={busy || numeric <= 0}>{busy ? '저장 중…' : '기록'}</Button>
      </DialogFooter>
    </Dialog>
  )
}
