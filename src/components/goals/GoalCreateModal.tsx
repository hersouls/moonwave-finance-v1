import { useState, useEffect } from 'react'
import { Dialog, DialogHeader, DialogBody, DialogFooter } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { useGoalStore } from '@/stores/goalStore'
import { useToastStore } from '@/stores/toastStore'
import { formatNumber } from '@/utils/format'
import type { GoalType, FinancialGoal } from '@/lib/types'

interface GoalCreateModalProps {
  open: boolean
  onClose: () => void
  editGoal?: FinancialGoal | null
}

const GOAL_TYPES: { value: GoalType; label: string }[] = [
  { value: 'savings', label: '저축' },
  { value: 'debt', label: '부채 상환' },
  { value: 'investment', label: '투자' },
  { value: 'custom', label: '기타' },
]

const GOAL_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#6366F1']

export function GoalCreateModal({ open, onClose, editGoal }: GoalCreateModalProps) {
  const addGoal = useGoalStore((s) => s.addGoal)
  const updateGoal = useGoalStore((s) => s.updateGoal)

  const [name, setName] = useState('')
  const [type, setType] = useState<GoalType>('savings')
  const [targetAmount, setTargetAmount] = useState('')
  const [currentAmount, setCurrentAmount] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [color, setColor] = useState('#3B82F6')
  const [memo, setMemo] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      if (editGoal) {
        setName(editGoal.name)
        setType(editGoal.type)
        setTargetAmount(formatNumber(editGoal.targetAmount))
        setCurrentAmount(formatNumber(editGoal.currentAmount))
        setTargetDate(editGoal.targetDate)
        setColor(editGoal.color)
        setMemo(editGoal.memo || '')
      } else {
        setName('')
        setType('savings')
        setTargetAmount('')
        setCurrentAmount('')
        setTargetDate('')
        setColor('#3B82F6')
        setMemo('')
      }
    }
  }, [open, editGoal])

  const parseAmount = (s: string) => Number(s.replace(/[^0-9]/g, '') || '0')

  const formatAmountInput = (value: string) => {
    const num = value.replace(/[^0-9]/g, '')
    return num ? formatNumber(Number(num)) : ''
  }

  const handleSubmit = async () => {
    if (!name.trim() || !targetDate) return
    const target = parseAmount(targetAmount)
    const current = parseAmount(currentAmount)
    if (target <= 0) return

    setIsSubmitting(true)
    try {
      if (editGoal?.id) {
        await updateGoal(editGoal.id, {
          name: name.trim(),
          type,
          targetAmount: target,
          currentAmount: current,
          targetDate,
          color,
          memo: memo.trim() || undefined,
        })
      } else {
        await addGoal({
          name: name.trim(),
          type,
          targetAmount: target,
          currentAmount: current,
          targetDate,
          color,
          memo: memo.trim() || undefined,
        })
      }
      onClose()
    } catch {
      useToastStore.getState().addToast('목표 저장에 실패했습니다.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} size="md">
      <DialogHeader title={editGoal ? '목표 수정' : '새 목표 추가'} onClose={onClose} />
      <DialogBody>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">목표명</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 비상금 1000만원 모으기"
              className="w-full px-3 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent placeholder:text-zinc-400"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">유형</label>
            <div className="grid grid-cols-4 gap-2">
              {GOAL_TYPES.map(gt => (
                <button
                  key={gt.value}
                  type="button"
                  onClick={() => setType(gt.value)}
                  className={`py-2 rounded-lg text-xs font-medium transition-colors ${
                    type === gt.value
                      ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                      : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                  }`}
                >
                  {gt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">목표 금액</label>
              <div className="relative">
                <input
                  type="text" inputMode="numeric"
                  value={targetAmount}
                  onChange={(e) => setTargetAmount(formatAmountInput(e.target.value))}
                  placeholder="0"
                  className="w-full px-3 py-2.5 pr-8 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400">원</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">현재 금액</label>
              <div className="relative">
                <input
                  type="text" inputMode="numeric"
                  value={currentAmount}
                  onChange={(e) => setCurrentAmount(formatAmountInput(e.target.value))}
                  placeholder="0"
                  className="w-full px-3 py-2.5 pr-8 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400">원</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">목표 날짜</label>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">색상</label>
            <div className="flex gap-2 flex-wrap">
              {GOAL_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full transition-all ${color === c ? 'ring-2 ring-offset-2 ring-primary-500 scale-110' : 'hover:scale-105'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">메모 (선택)</label>
            <input
              type="text"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="메모를 입력하세요"
              className="w-full px-3 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent placeholder:text-zinc-400"
            />
          </div>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>취소</Button>
        <Button variant="primary" onClick={handleSubmit} disabled={isSubmitting || !name.trim() || !targetDate || parseAmount(targetAmount) <= 0}>
          {isSubmitting ? '저장 중...' : (editGoal ? '수정' : '추가')}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
