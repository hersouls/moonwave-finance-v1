import { useState, useEffect } from 'react'
import { Dialog, DialogHeader, DialogBody, DialogFooter } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { useUIStore } from '@/stores/uiStore'
import { useAssetStore } from '@/stores/assetStore'
import { useMemberStore } from '@/stores/memberStore'
import { useToastStore } from '@/stores/toastStore'
import { useDailyValueStore } from '@/stores/dailyValueStore'
import { format } from 'date-fns'
import { Select } from '@/components/ui/Select'
import type { AssetLiabilityType } from '@/lib/types'

export function AssetCreateModal() {
  const isOpen = useUIStore((s) => s.isAssetCreateModalOpen)
  const close = useUIStore((s) => s.closeAssetCreateModal)
  const addItem = useAssetStore((s) => s.addItem)
  const categories = useAssetStore((s) => s.categories)
  const members = useMemberStore((s) => s.members)
  const setValue = useDailyValueStore((s) => s.setValue)

  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [memberId, setMemberId] = useState<number | ''>('')
  const [initialAmount, setInitialAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [type, setType] = useState<AssetLiabilityType>('asset')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const assetCategories = categories.filter(c => c.type === 'asset')
  const liabilityCategories = categories.filter(c => c.type === 'liability')
  const currentCategories = type === 'asset' ? assetCategories : liabilityCategories

  useEffect(() => {
    if (isOpen) {
      setName('')
      setCategoryId('')
      setMemberId(members[0]?.id || '')
      setInitialAmount('')
      setMemo('')
      setType('asset')
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
        type,
        memo: memo.trim() || undefined,
      })
      const amount = Number(initialAmount.replace(/,/g, ''))
      if (amount > 0) {
        await setValue(id, format(new Date(), 'yyyy-MM-dd'), amount)
      }
      close()
    } catch {
      useToastStore.getState().addToast('항목 추가에 실패했습니다.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onClose={close} size="md">
      <DialogHeader title="새 자산 항목 추가" onClose={close} />
      <DialogBody>
        <div className="space-y-4">
          {/* Type Toggle */}
          <div>
            <label className="block text-body3 text-zinc-700 dark:text-zinc-300 mb-2">유형</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setType('asset'); setCategoryId('') }}
                className={`flex-1 py-2 px-4 rounded-lg text-body3 transition-colors ${
                  type === 'asset'
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                    : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                }`}
              >
                자산
              </button>
              <button
                type="button"
                onClick={() => { setType('liability'); setCategoryId('') }}
                className={`flex-1 py-2 px-4 rounded-lg text-body3 transition-colors ${
                  type === 'liability'
                    ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                }`}
              >
                부채
              </button>
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-body3 text-zinc-700 dark:text-zinc-300 mb-1.5">항목명</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={type === 'asset' ? '예: 삼성전자 주식' : '예: 아파트 대출'}
              className="input-base"
              autoFocus
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-body3 text-zinc-700 dark:text-zinc-300 mb-1.5">카테고리</label>
            <Select
              value={String(categoryId)}
              onChange={(v) => setCategoryId(v ? Number(v) : '')}
              options={currentCategories.map(c => ({ value: String(c.id), label: c.name }))}
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

          {/* Member */}
          <div>
            <label className="block text-body3 text-zinc-700 dark:text-zinc-300 mb-1.5">구성원</label>
            <Select
              value={String(memberId)}
              onChange={(v) => setMemberId(v ? Number(v) : '')}
              options={members.map(m => ({ value: String(m.id), label: m.name }))}
              placeholder="구성원 선택"
            />
          </div>

          {/* Memo */}
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
