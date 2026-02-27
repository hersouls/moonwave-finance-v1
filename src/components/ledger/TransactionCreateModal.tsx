import { useState, useEffect } from 'react'
import { Dialog, DialogHeader, DialogBody, DialogFooter } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { useUIStore } from '@/stores/uiStore'
import { useTransactionStore } from '@/stores/transactionStore'
import { useMemberStore } from '@/stores/memberStore'
import { getTodayString } from '@/lib/dateUtils'
import type { TransactionType, RepeatType } from '@/lib/types'

export function TransactionCreateModal() {
  const isOpen = useUIStore((s) => s.isTransactionCreateModalOpen)
  const close = useUIStore((s) => s.closeTransactionCreateModal)
  const addTransaction = useTransactionStore((s) => s.addTransaction)
  const categories = useTransactionStore((s) => s.categories)
  const members = useMemberStore((s) => s.members)

  const [type, setType] = useState<TransactionType>('expense')
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [memberId, setMemberId] = useState<number | ''>('')
  const [date, setDate] = useState(getTodayString())
  const [memo, setMemo] = useState('')
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurType, setRecurType] = useState<RepeatType>('monthly')
  const [recurEndDate, setRecurEndDate] = useState('')

  const currentCategories = categories.filter(c => c.type === type)

  useEffect(() => {
    if (isOpen) {
      setType('expense')
      setAmount('')
      setCategoryId('')
      setMemberId(members[0]?.id || '')
      setDate(getTodayString())
      setMemo('')
      setIsRecurring(false)
      setRecurType('monthly')
      setRecurEndDate('')
    }
  }, [isOpen, members])

  useEffect(() => {
    setCategoryId('')
  }, [type])

  const handleSubmit = async () => {
    const numAmount = Number(amount.replace(/,/g, ''))
    if (!numAmount || numAmount <= 0) return
    await addTransaction({
      memberId: memberId ? (memberId as number) : null,
      type,
      amount: numAmount,
      categoryId: categoryId ? (categoryId as number) : null,
      date,
      memo: memo.trim() || undefined,
      isRecurring,
      recurPattern: isRecurring ? { type: recurType, interval: 1, endDate: recurEndDate || undefined } : undefined,
    })
    close()
  }

  return (
    <Dialog open={isOpen} onClose={close} size="md">
      <DialogHeader title="새 거래 기록" onClose={close} />
      <DialogBody>
        <div className="space-y-4">
          {/* Type Toggle */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">유형</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setType('expense')}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                  type === 'expense'
                    ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                }`}
              >
                지출
              </button>
              <button
                type="button"
                onClick={() => setType('income')}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                  type === 'income'
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                    : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                }`}
              >
                수입
              </button>
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">금액</label>
            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2.5 pr-8 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent placeholder:text-zinc-400"
                autoFocus
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">원</span>
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">카테고리</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : '')}
              className="w-full px-3 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">카테고리 선택</option>
              {currentCategories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">날짜</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          {/* Member */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">구성원 (선택)</label>
            <select
              value={memberId}
              onChange={(e) => setMemberId(e.target.value ? Number(e.target.value) : '')}
              className="w-full px-3 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">선택 안함</option>
              {members.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          {/* Memo */}
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

          {/* Recurring Toggle */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-300 dark:border-zinc-600 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">반복 거래</span>
            </label>
          </div>

          {isRecurring && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">반복 주기</label>
                <select
                  value={recurType}
                  onChange={(e) => setRecurType(e.target.value as RepeatType)}
                  className="w-full px-3 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="monthly">매월</option>
                  <option value="weekly">매주</option>
                  <option value="daily">매일</option>
                  <option value="yearly">매년</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">종료일 (선택)</label>
                <input
                  type="date"
                  value={recurEndDate}
                  onChange={(e) => setRecurEndDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            </div>
          )}
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={close}>취소</Button>
        <Button
          variant="primary"
          onClick={handleSubmit}
          disabled={!amount || Number(amount.replace(/,/g, '')) <= 0}
        >
          기록
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
