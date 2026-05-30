import { useState, useEffect } from 'react'
import { Dialog, DialogHeader, DialogBody, DialogFooter } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { useUIStore } from '@/stores/uiStore'
import { useAssetStore } from '@/stores/assetStore'
import { useMemberStore } from '@/stores/memberStore'
import { useDailyValueStore } from '@/stores/dailyValueStore'
import { useToastStore } from '@/stores/toastStore'
import { AssetProjectionFields } from './AssetProjectionFields'
import { valueAsOf } from '@/services/assetAnalytics'
import { getTodayString } from '@/lib/dateUtils'
import type { AssetValueProjection } from '@/lib/types'

export function AssetEditModal() {
  const isOpen = useUIStore((s) => s.isAssetEditModalOpen)
  const editingId = useUIStore((s) => s.editingAssetItemId)
  const close = useUIStore((s) => s.closeAssetEditModal)

  const items = useAssetStore((s) => s.items)
  const categories = useAssetStore((s) => s.categories)
  const updateItem = useAssetStore((s) => s.updateItem)
  const members = useMemberStore((s) => s.members)
  const allValues = useDailyValueStore((s) => s.allValues)
  const applyValueSeries = useDailyValueStore((s) => s.applyValueSeries)

  const item = editingId ? items.find(i => i.id === editingId) : null

  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [memberId, setMemberId] = useState<number | ''>('')
  const [memo, setMemo] = useState('')
  const [projection, setProjection] = useState<AssetValueProjection | undefined>(undefined)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen && item) {
      setName(item.name)
      setCategoryId(item.categoryId)
      setMemberId(item.memberId)
      setMemo(item.memo || '')
      setProjection(item.projection)
    }
  }, [isOpen, item])

  const typeCategories = item
    ? categories.filter(c => c.type === item.type)
    : []

  const handleSubmit = async () => {
    if (!item || !name.trim() || categoryId === '' || memberId === '') return
    setIsSubmitting(true)
    try {
      await updateItem(item.id!, {
        name: name.trim(),
        categoryId: categoryId as number,
        memberId: memberId as number,
        memo: memo.trim() || undefined,
        projection,
      })
      // 규칙이 바뀌면 현재 값 기준으로 미래 값을 재투영한다.
      const series = allValues.filter((v) => v.assetItemId === item.id).sort((a, b) => b.date.localeCompare(a.date))
      const current = valueAsOf(series, getTodayString())
      if (current > 0) await applyValueSeries(item.id!, current, getTodayString(), projection)
      useToastStore.getState().addToast(`${name.trim()} 항목이 수정되었습니다.`, 'success')
      close()
    } catch {
      useToastStore.getState().addToast('항목 수정에 실패했습니다.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const title = item?.type === 'liability' ? '부채 항목 편집' : '자산 항목 편집'

  return (
    <Dialog open={isOpen} onClose={close} size="md">
      <DialogHeader title={title} onClose={close} />
      <DialogBody>
        <div className="space-y-4">
          <div>
            <label className="block text-body3 text-body mb-1.5">항목명</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="항목명을 입력하세요"
              className="input-base"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-body3 text-body mb-1.5">카테고리</label>
            <Select
              value={String(categoryId)}
              onChange={(v) => setCategoryId(v ? Number(v) : '')}
              options={typeCategories.map(c => ({ value: String(c.id), label: c.name }))}
              placeholder="카테고리 선택"
            />
          </div>

          <div>
            <label className="block text-body3 text-body mb-1.5">구성원</label>
            <Select
              value={String(memberId)}
              onChange={(v) => setMemberId(v ? Number(v) : '')}
              options={members.map(m => ({ value: String(m.id), label: m.name }))}
              placeholder="구성원 선택"
            />
          </div>

          <div>
            <label className="block text-body3 text-body mb-1.5">메모 (선택)</label>
            <input
              type="text"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="메모를 입력하세요"
              className="input-base"
            />
          </div>

          <AssetProjectionFields value={projection} onChange={setProjection} />
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={close}>취소</Button>
        <Button
          variant="primary"
          onClick={handleSubmit}
          disabled={isSubmitting || !name.trim() || categoryId === '' || memberId === ''}
        >
          {isSubmitting ? '저장 중...' : '저장'}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
