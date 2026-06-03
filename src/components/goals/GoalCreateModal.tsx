import { useState, useEffect } from 'react'
import { Dialog, DialogHeader, DialogBody, DialogFooter } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { useGoalStore } from '@/stores/goalStore'
import { useToastStore } from '@/stores/toastStore'
import { formatNumber } from '@/utils/format'
import type { GoalType, FinancialGoal } from '@/lib/types'
import { FormSectionLabel, SegmentedControl, HeroAmountField } from '@/components/ui/CreateFormPrimitives'
import { Target, Flag, Coins, Wallet, Calendar, Palette, FileText } from 'lucide-react'

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

// 보라(BORA) 우선 — 신규 목표 기본 액센트. 나머지는 per-item 색 스와치(예외).
const DEFAULT_GOAL_COLOR = '#7c3aed'
const GOAL_COLORS = ['#7c3aed', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4', '#6366F1']

export function GoalCreateModal({ open, onClose, editGoal }: GoalCreateModalProps) {
  const addGoal = useGoalStore((s) => s.addGoal)
  const updateGoal = useGoalStore((s) => s.updateGoal)

  const [name, setName] = useState('')
  const [type, setType] = useState<GoalType>('savings')
  const [targetAmount, setTargetAmount] = useState('')
  const [currentAmount, setCurrentAmount] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [color, setColor] = useState(DEFAULT_GOAL_COLOR)
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
        setColor(DEFAULT_GOAL_COLOR)
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
        <div className="space-y-6">
          <div>
            <FormSectionLabel icon={Target} htmlFor="goal-name">목표명</FormSectionLabel>
            <input
              id="goal-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 비상금 1000만원 모으기"
              className="input-base"
              autoFocus
            />
          </div>

          <div>
            <FormSectionLabel icon={Flag}>유형</FormSectionLabel>
            <SegmentedControl
              layoutId="goal-type-pill"
              ariaLabel="목표 유형"
              value={type}
              onChange={setType}
              options={GOAL_TYPES}
            />
          </div>

          <div>
            <FormSectionLabel icon={Coins}>목표 금액</FormSectionLabel>
            <HeroAmountField value={targetAmount} onChange={setTargetAmount} caption="목표 금액" />
          </div>

          <div>
            <FormSectionLabel icon={Wallet}>현재 금액</FormSectionLabel>
            <div className="relative">
              <input
                type="text" inputMode="numeric"
                value={currentAmount}
                onChange={(e) => setCurrentAmount(formatAmountInput(e.target.value))}
                placeholder="0"
                className="input-base !pr-8 text-right tabular-nums"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-caption text-disabled">원</span>
            </div>
          </div>

          <div>
            <FormSectionLabel icon={Calendar} htmlFor="goal-date">목표 날짜</FormSectionLabel>
            <input
              id="goal-date"
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="input-base"
            />
          </div>

          <div>
            <FormSectionLabel icon={Palette}>색상</FormSectionLabel>
            <div className="flex gap-2 flex-wrap">
              {GOAL_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`색상 ${c}`}
                  aria-pressed={color === c}
                  className={`touch-target-inset w-8 h-8 rounded-full transition-all ${color === c ? 'ring-2 ring-offset-2 ring-primary-500 scale-110' : 'hover:scale-105'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div>
            <FormSectionLabel icon={FileText} hint="선택">메모</FormSectionLabel>
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
        <Button variant="secondary" onClick={onClose}>취소</Button>
        <Button variant="primary" onClick={handleSubmit} disabled={isSubmitting || !name.trim() || !targetDate || parseAmount(targetAmount) <= 0}>
          {isSubmitting ? '저장 중...' : (editGoal ? '수정' : '추가')}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
