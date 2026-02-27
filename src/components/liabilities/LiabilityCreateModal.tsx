import { useState, useEffect } from 'react'
import { Dialog, DialogHeader, DialogBody, DialogFooter } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { useUIStore } from '@/stores/uiStore'
import { useAssetStore } from '@/stores/assetStore'
import { useMemberStore } from '@/stores/memberStore'

export function LiabilityCreateModal() {
  const isOpen = useUIStore((s) => s.isLiabilityCreateModalOpen)
  const close = useUIStore((s) => s.closeLiabilityCreateModal)
  const addItem = useAssetStore((s) => s.addItem)
  const categories = useAssetStore((s) => s.categories)
  const members = useMemberStore((s) => s.members)

  const liabilityCategories = categories.filter(c => c.type === 'liability')

  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [memberId, setMemberId] = useState<number | ''>('')
  const [memo, setMemo] = useState('')

  useEffect(() => {
    if (isOpen) {
      setName('')
      setCategoryId('')
      setMemberId(members[0]?.id || '')
      setMemo('')
    }
  }, [isOpen, members])

  const handleSubmit = async () => {
    if (!name.trim() || categoryId === '' || memberId === '') return
    await addItem({
      memberId: memberId as number,
      categoryId: categoryId as number,
      name: name.trim(),
      type: 'liability',
      memo: memo.trim() || undefined,
    })
    close()
  }

  return (
    <Dialog open={isOpen} onClose={close} size="md">
      <DialogHeader title="새 부채 항목 추가" onClose={close} />
      <DialogBody>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">항목명</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 아파트 대출"
              className="w-full px-3 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">카테고리</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : '')}
              className="w-full px-3 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">카테고리 선택</option>
              {liabilityCategories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">구성원</label>
            <select
              value={memberId}
              onChange={(e) => setMemberId(e.target.value ? Number(e.target.value) : '')}
              className="w-full px-3 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">구성원 선택</option>
              {members.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">메모 (선택)</label>
            <input
              type="text"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="메모를 입력하세요"
              className="w-full px-3 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
            />
          </div>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={close}>취소</Button>
        <Button
          variant="primary"
          onClick={handleSubmit}
          disabled={!name.trim() || categoryId === '' || memberId === ''}
        >
          추가
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
