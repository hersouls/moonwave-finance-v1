import { useState, useEffect } from 'react'
import { Dialog, DialogHeader, DialogBody, DialogFooter } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { useUIStore } from '@/stores/uiStore'
import { useTransactionStore } from '@/stores/transactionStore'
import { useMemberStore } from '@/stores/memberStore'
import { getTodayString } from '@/lib/dateUtils'
import { useToastStore } from '@/stores/toastStore'
import { Select } from '@/components/ui/Select'
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
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [amountError, setAmountError] = useState('')

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
    if (!numAmount || numAmount <= 0) {
      setAmountError('금액을 입력해주세요')
      return
    }
    setAmountError('')
    setIsSubmitting(true)
    try {
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
    } catch {
      useToastStore.getState().addToast('거래 저장에 실패했습니다.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onClose={close} size="md">
      <DialogHeader title="새 거래 기록" onClose={close} />
      <DialogBody>
        <div className="space-y-4">
          {/* Type Toggle */}
          <div>
            <label className="block text-body3 text-body mb-2">유형</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setType('expense')}
                className={`flex-1 py-2 px-4 rounded-lg text-body3 transition-colors ${
                  type === 'expense'
                    ? 'bg-status-danger text-red-700 dark:text-red-400'
                    : 'bg-surface-tertiary text-sub'
                }`}
              >
                지출
              </button>
              <button
                type="button"
                onClick={() => setType('income')}
                className={`flex-1 py-2 px-4 rounded-lg text-body3 transition-colors ${
                  type === 'income'
                    ? 'bg-status-success text-emerald-700 dark:text-emerald-400'
                    : 'bg-surface-tertiary text-sub'
                }`}
              >
                수입
              </button>
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-body3 text-body mb-1.5">금액</label>
            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                value={amount}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^0-9]/g, '')
                  if (raw === '') { setAmount(''); setAmountError(''); return }
                  const num = parseInt(raw, 10)
                  setAmount(num.toLocaleString('ko-KR'))
                  setAmountError('')
                }}
                placeholder="0"
                className="input-base !pr-8 tabular-nums"
                autoFocus
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-disabled">원</span>
            </div>
            {amountError && (
              <p className="text-caption text-status-danger mt-1">{amountError}</p>
            )}
          </div>

          {/* Category */}
          <div>
            <label className="block text-body3 text-body mb-1.5">카테고리</label>
            <Select
              value={String(categoryId)}
              onChange={(v) => setCategoryId(v ? Number(v) : '')}
              options={currentCategories.map(c => ({ value: String(c.id), label: c.name }))}
              placeholder="카테고리 선택"
            />
          </div>

          {/* Date */}
          <div>
            <label className="block text-body3 text-body mb-1.5">날짜</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input-base"
            />
          </div>

          {/* Member */}
          <div>
            <label className="block text-body3 text-body mb-1.5">구성원 (선택)</label>
            <Select
              value={String(memberId)}
              onChange={(v) => setMemberId(v ? Number(v) : '')}
              options={members.map(m => ({ value: String(m.id), label: m.name }))}
              placeholder="선택 안함"
            />
          </div>

          {/* Memo */}
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

          {/* Recurring Toggle */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
                className="check"
              />
              <span className="text-body3 text-body">반복 거래</span>
            </label>
          </div>

          {isRecurring && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-body3 text-body mb-1.5">반복 주기</label>
                <Select
                  value={recurType}
                  onChange={(v) => setRecurType(v as RepeatType)}
                  options={[
                    { value: 'monthly', label: '매월' },
                    { value: 'weekly', label: '매주' },
                    { value: 'daily', label: '매일' },
                    { value: 'yearly', label: '매년' },
                  ]}
                />
              </div>
              <div>
                <label className="block text-body3 text-body mb-1.5">종료일 (선택)</label>
                <input
                  type="date"
                  value={recurEndDate}
                  onChange={(e) => setRecurEndDate(e.target.value)}
                  className="input-base"
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
          disabled={isSubmitting || !amount || Number(amount.replace(/,/g, '')) <= 0}
        >
          {isSubmitting ? '저장 중...' : '기록'}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
