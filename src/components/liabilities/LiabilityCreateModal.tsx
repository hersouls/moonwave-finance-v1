import { useState, useEffect } from 'react'
import { Dialog, DialogHeader, DialogBody, DialogFooter } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { useUIStore } from '@/stores/uiStore'
import { useAssetStore } from '@/stores/assetStore'
import { useMemberStore } from '@/stores/memberStore'
import { useToastStore } from '@/stores/toastStore'
import { useDailyValueStore } from '@/stores/dailyValueStore'
import { Select } from '@/components/ui/Select'
import { format } from 'date-fns'

export function LiabilityCreateModal() {
  const isOpen = useUIStore((s) => s.isLiabilityCreateModalOpen)
  const close = useUIStore((s) => s.closeLiabilityCreateModal)
  const addItem = useAssetStore((s) => s.addItem)
  const categories = useAssetStore((s) => s.categories)
  const members = useMemberStore((s) => s.members)
  const setValue = useDailyValueStore((s) => s.setValue)

  const liabilityCategories = categories.filter(c => c.type === 'liability')

  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [memberId, setMemberId] = useState<number | ''>('')
  const [initialAmount, setInitialAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setName('')
      setCategoryId('')
      setMemberId(members[0]?.id || '')
      setInitialAmount('')
      setMemo('')
    }
  }, [isOpen, members])

  const handleSubmit = async () => {
    if (!name.trim() || categoryId === '' || memberId === '') return
    setIsSubmitting(true)
    try {
      const id = await addItem({
        memberId: memberId as number,
        categoryId: categoryId as number,
        name: name.trim(),
        type: 'liability',
        memo: memo.trim() || undefined,
      })
      const amount = Number(initialAmount.replace(/,/g, ''))
      if (amount > 0) {
        await setValue(id, format(new Date(), 'yyyy-MM-dd'), amount)
      }
      close()
    } catch {
      useToastStore.getState().addToast('부채 항목 추가에 실패했습니다.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onClose={close} size="md">
      <DialogHeader title="새 부채 항목 추가" onClose={close} />
      <DialogBody>
        <div className="space-y-4">
          <div>
            <label className="block text-body3 text-zinc-700 dark:text-zinc-300 mb-1.5">항목명</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 아파트 대출"
              className="input-base"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-body3 text-zinc-700 dark:text-zinc-300 mb-1.5">카테고리</label>
            <Select
              value={String(categoryId)}
              onChange={(v) => setCategoryId(v ? Number(v) : '')}
              options={liabilityCategories.map(c => ({ value: String(c.id), label: c.name }))}
              placeholder="카테고리 선택"
            />
          </div>

          {/* Initial Amount */}
          <div>
            <label className="block text-body3 text-zinc-700 dark:text-zinc-300 mb-1.5">초기 금액 (선택)</label>
            <input
              type="text"
              inputMode="numeric"
              value={initialAmount}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9]/g, '')
                setInitialAmount(raw ? Number(raw).toLocaleString('ko-KR') : '')
              }}
              placeholder="0"
              className="input-base text-right tabular-nums"
            />
          </div>

          <div>
            <label className="block text-body3 text-zinc-700 dark:text-zinc-300 mb-1.5">구성원</label>
            <Select
              value={String(memberId)}
              onChange={(v) => setMemberId(v ? Number(v) : '')}
              options={members.map(m => ({ value: String(m.id), label: m.name }))}
              placeholder="구성원 선택"
            />
          </div>

          <div>
            <label className="block text-body3 text-zinc-700 dark:text-zinc-300 mb-1.5">메모 (선택)</label>
            <input
              type="text"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="메모를 입력하세요"
              className="input-base"
            />
          </div>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={close}>취소</Button>
        <Button
          variant="primary"
          onClick={handleSubmit}
          disabled={isSubmitting || !name.trim() || categoryId === '' || memberId === ''}
        >
          {isSubmitting ? '저장 중...' : '추가'}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
