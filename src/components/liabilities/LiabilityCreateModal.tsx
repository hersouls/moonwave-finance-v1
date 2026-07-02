import { useState, useEffect, useMemo, useCallback } from 'react'
import { Dialog, DialogHeader, DialogBody, DialogFooter } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { useUIStore } from '@/stores/uiStore'
import { useAssetStore } from '@/stores/assetStore'
import { useMemberStore } from '@/stores/memberStore'
import { useToastStore } from '@/stores/toastStore'
import { useDailyValueStore } from '@/stores/dailyValueStore'
import { useLoanStore } from '@/stores/loanStore'
import { useSyncListener } from '@/hooks/useSyncListener'
import { Select } from '@/components/ui/Select'
import { AssetProjectionFields } from '@/components/assets/AssetProjectionFields'
import { isFlatProjection } from '@/services/valueProjection'
import { getTodayString } from '@/lib/dateUtils'
import type { AssetValueProjection } from '@/lib/types'
import { Landmark, Tag, Users, FileText, Coins } from 'lucide-react'
import { HeroAmountField, FormSectionLabel, MemberChips } from '@/components/ui/CreateFormPrimitives'

export function LiabilityCreateModal() {
  const isOpen = useUIStore((s) => s.isLiabilityCreateModalOpen)
  const close = useUIStore((s) => s.closeLiabilityCreateModal)
  const addItem = useAssetStore((s) => s.addItem)
  const categories = useAssetStore((s) => s.categories)
  const members = useMemberStore((s) => s.members)
  const applyValueSeries = useDailyValueStore((s) => s.applyValueSeries)
  const loans = useLoanStore((s) => s.loans)
  const updateLoan = useLoanStore((s) => s.updateLoan)
  const loadLoans = useLoanStore((s) => s.loadLoans)
  const activeLoans = useMemo(() => loans.filter(l => l.isActive), [loans])

  const reloadLoans = useCallback(() => { loadLoans() }, [loadLoans])
  useSyncListener(reloadLoans, ['loans'])

  const liabilityCategories = categories.filter(c => c.type === 'liability')

  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState<string | ''>('')
  const [memberId, setMemberId] = useState<string | ''>('')
  const [initialAmount, setInitialAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null)
  const [projection, setProjection] = useState<AssetValueProjection | undefined>(undefined)

  useEffect(() => {
    if (isOpen) {
      setName('')
      setCategoryId('')
      setMemberId(members[0]?.id || '')
      setInitialAmount('')
      setMemo('')
      setSelectedLoanId(null)
      setProjection(undefined)
      loadLoans()
    }
  }, [isOpen, members, loadLoans])

  const handleLoanSelect = (loanId: string) => {
    const loan = activeLoans.find(l => l.id === loanId)
    if (!loan) return
    setSelectedLoanId(loan.id)
    setName(loan.name)
    setInitialAmount(loan.currentBalance.toLocaleString('ko-KR'))
    // Try to match category by name
    const matchedCat = liabilityCategories.find(c =>
      c.name.includes('주택') && loan.name.includes('주택') ||
      c.name.includes('신용') && loan.name.includes('신용') ||
      c.name.includes('마이너스') && loan.name.includes('마이너스') ||
      c.name.includes('회사') && loan.name.includes('회사')
    )
    if (matchedCat?.id) setCategoryId(matchedCat.id)
    const memoStr = [
      loan.lender || '',
      `연 ${loan.annualRate}%`,
      `납입일 ${loan.paymentDay}일`,
    ].filter(Boolean).join(' | ')
    setMemo(memoStr)
  }

  const handleSubmit = async () => {
    if (!name.trim() || categoryId === '' || memberId === '') return
    setIsSubmitting(true)
    try {
      const id = await addItem({
        memberId,
        categoryId,
        name: name.trim(),
        type: 'liability',
        memo: memo.trim() || undefined,
        projection,
      })
      const amount = Number(initialAmount.replace(/,/g, '')) || 0
      // v2 통일: UTC 오늘 기준 시리즈 기록(과거 백필 앵커 포함 → forward-fill 이 항상 잡힘).
      // 잔액이 있거나(평탄 포함) 변동 규칙이 있으면 기록.
      if (amount > 0 || !isFlatProjection(projection)) {
        await applyValueSeries(id, amount, getTodayString(), projection)
      }
      // Link loan to this liability item
      if (selectedLoanId) {
        await updateLoan(selectedLoanId, { linkedAssetItemId: id })
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
        <div className="space-y-6">
          {/* Loan Import */}
          {activeLoans.length > 0 && (
            <div className="rounded-2xl bg-[color:var(--color-primary-50)] dark:bg-[color:var(--color-primary-900)]/20 ring-1 ring-[color:var(--color-primary-200)] dark:ring-[color:var(--color-primary-800)] p-3.5">
              <div className="flex items-center gap-2 mb-2.5">
                <span className="w-7 h-7 rounded-lg bg-[color:var(--color-primary-100)] dark:bg-[color:var(--color-primary-900)]/40 flex items-center justify-center flex-shrink-0">
                  <Landmark className="w-3.5 h-3.5 text-[color:var(--color-primary-600)] dark:text-[color:var(--color-primary-300)]" />
                </span>
                <span className="text-body3-semi text-[color:var(--color-primary-700)] dark:text-[color:var(--color-primary-300)]">대출정보 불러오기</span>
              </div>
              <Select
                value={String(selectedLoanId ?? '')}
                onChange={handleLoanSelect}
                options={activeLoans.map(l => ({
                  value: String(l.id),
                  label: `${l.name} (잔액 ${l.currentBalance.toLocaleString('ko-KR')}원)`,
                }))}
                placeholder="등록된 대출을 선택하세요"
              />
            </div>
          )}

          {/* Name */}
          <div>
            <FormSectionLabel icon={Tag} htmlFor="liability-name">항목명</FormSectionLabel>
            <input
              id="liability-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 아파트 대출"
              className="input-base"
              autoFocus
            />
          </div>

          {/* Category */}
          <div>
            <FormSectionLabel icon={Tag}>카테고리</FormSectionLabel>
            <Select
              value={categoryId}
              onChange={(v) => setCategoryId(v)}
              options={liabilityCategories.map(c => ({ value: c.id, label: c.name }))}
              placeholder="카테고리 선택"
            />
          </div>

          {/* Initial Amount — hero */}
          <div>
            <FormSectionLabel icon={Coins} hint="선택">초기 금액</FormSectionLabel>
            <HeroAmountField value={initialAmount} onChange={setInitialAmount} caption="부채 잔액" />
          </div>

          {/* 가치 변동 규칙 (매월 상환 / 연 이자 등) */}
          <AssetProjectionFields value={projection} onChange={setProjection} />

          {/* Member */}
          <div>
            <FormSectionLabel icon={Users}>구성원</FormSectionLabel>
            {members.length > 0 && members.length <= 4 ? (
              <MemberChips members={members} value={memberId} onChange={setMemberId} allowUnassigned={false} />
            ) : (
              <Select
                value={memberId}
                onChange={(v) => setMemberId(v)}
                options={members.map(m => ({ value: m.id, label: m.name }))}
                placeholder="구성원 선택"
              />
            )}
          </div>

          {/* Memo */}
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
