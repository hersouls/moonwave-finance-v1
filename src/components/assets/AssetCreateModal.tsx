import { useState, useEffect, useMemo } from 'react'
import { Dialog, DialogHeader, DialogBody, DialogFooter } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { useUIStore } from '@/stores/uiStore'
import { useAssetStore } from '@/stores/assetStore'
import { useMemberStore } from '@/stores/memberStore'
import { useToastStore } from '@/stores/toastStore'
import { useDailyValueStore } from '@/stores/dailyValueStore'
import { useLoanStore } from '@/stores/loanStore'
import { Select } from '@/components/ui/Select'
import { Landmark, Plus, Wallet, Tag, Users, FileText, Coins } from 'lucide-react'
import type { AssetLiabilityType, AssetValueProjection } from '@/lib/types'
import { SeverancePayInputArea } from './SeverancePayInputArea'
import { RealEstateInputArea } from './RealEstateInputArea'
import { AssetProjectionFields } from './AssetProjectionFields'
import { generateSeverancePayValues } from '@/services/assetAnalytics'
import { isFlatProjection } from '@/services/valueProjection'
import { getTodayString } from '@/lib/dateUtils'
import { SegmentedControl, HeroAmountField, FormSectionLabel, MemberChips } from '@/components/ui/CreateFormPrimitives'

export function AssetCreateModal() {
  const isOpen = useUIStore((s) => s.isAssetCreateModalOpen)
  const close = useUIStore((s) => s.closeAssetCreateModal)
  const openAssetCategoryManager = useUIStore((s) => s.openAssetCategoryManager)
  const addItem = useAssetStore((s) => s.addItem)
  const categories = useAssetStore((s) => s.categories)
  const members = useMemberStore((s) => s.members)
  const applyValueSeries = useDailyValueStore((s) => s.applyValueSeries)
  const loans = useLoanStore((s) => s.loans)
  const updateLoan = useLoanStore((s) => s.updateLoan)
  const loadLoans = useLoanStore((s) => s.loadLoans)
  const activeLoans = useMemo(() => loans.filter(l => l.isActive), [loans])

  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState<string | ''>('')
  const [memberId, setMemberId] = useState<string | ''>('')
  const [initialAmount, setInitialAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [type, setType] = useState<AssetLiabilityType>('asset')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [severanceData, setSeveranceData] = useState<{ joinDate: string; monthlyAvgWage: number; estimatedAmount: number } | null>(null)
  const [realEstateAmount, setRealEstateAmount] = useState<number>(0)
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null)
  const [projection, setProjection] = useState<AssetValueProjection | undefined>(undefined)

  const assetCategories = categories.filter(c => c.type === 'asset')
  const liabilityCategories = categories.filter(c => c.type === 'liability')
  const currentCategories = type === 'asset' ? assetCategories : liabilityCategories

  const selectedCategory = categories.find(c => c.id === categoryId)
  const isSeverancePay = !!selectedCategory && selectedCategory.name.includes('퇴직금')
  const isRealEstate = !!selectedCategory && selectedCategory.name.includes('부동산')

  useEffect(() => {
    if (isOpen) {
      setName('')
      setCategoryId('')
      setMemberId(members[0]?.id || '')
      setInitialAmount('')
      setMemo('')
      setType('asset')
      setSeveranceData(null)
      setRealEstateAmount(0)
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
    // Try to match a liability category
    const liabCats = categories.filter(c => c.type === 'liability')
    const matchedCat = liabCats.find(c =>
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
        type,
        memo: memo.trim() || undefined,
        projection: isSeverancePay ? undefined : projection,
      })

      const today = getTodayString()
      if (isSeverancePay && severanceData && severanceData.estimatedAmount > 0) {
        // 퇴직금: 입사일~현재 일별 데이터 자동 생성 (별도 투영 규칙 사용 안 함)
        const values = generateSeverancePayValues(id, severanceData.joinDate, severanceData.monthlyAvgWage, today)
        if (values.length > 0) {
          await useDailyValueStore.getState().bulkSetValues(values.map(v => ({ ...v, assetItemId: id })))
        }
      } else if (isRealEstate && realEstateAmount > 0) {
        // 입력일부터 (Y+1)-12-31 까지 투영 저장 + (Y-1) 백필
        await applyValueSeries(id, realEstateAmount, today, projection)
      } else {
        const amount = Number(initialAmount.replace(/,/g, '')) || 0
        // 금액이 있거나(평탄 포함) 변동 규칙이 있으면 시리즈를 기록한다(규칙만 있어도 0 기준 투영).
        if (amount > 0 || !isFlatProjection(projection)) {
          await applyValueSeries(id, amount, today, projection)
        }
      }
      // Link loan to this liability item
      if (selectedLoanId && type === 'liability') {
        await updateLoan(selectedLoanId, { linkedAssetItemId: id })
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
        <div className="space-y-6">
          {/* Type Toggle — pill segment */}
          <div>
            <FormSectionLabel icon={Wallet}>유형</FormSectionLabel>
            <SegmentedControl
              layoutId="asset-create-type-pill"
              ariaLabel="유형"
              value={type}
              onChange={(v) => { setType(v); setCategoryId('') }}
              options={[
                { value: 'asset', label: '자산' },
                { value: 'liability', label: '부채' },
              ]}
            />
          </div>

          {/* Loan Import (liability only) */}
          {type === 'liability' && activeLoans.length > 0 && (
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
            <FormSectionLabel icon={Tag} htmlFor="asset-name">항목명</FormSectionLabel>
            <input
              id="asset-name"
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
            <FormSectionLabel icon={Tag}>카테고리</FormSectionLabel>
            {currentCategories.length === 0 ? (
              <button
                type="button"
                onClick={openAssetCategoryManager}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-base bg-surface-secondary px-3 py-3.5 text-body3 text-accent-primary transition-colors hover:bg-[var(--hover-bg)]"
              >
                <Plus className="h-4 w-4" /> {type === 'asset' ? '자산' : '부채'} 카테고리 추가하기
              </button>
            ) : (
              <Select
                value={categoryId}
                onChange={(v) => setCategoryId(v)}
                options={currentCategories.map(c => ({ value: c.id, label: c.name }))}
                placeholder="카테고리 선택"
              />
            )}
          </div>

          {/* Specialized Input Forms or Default Initial Amount */}
          {isSeverancePay ? (
            <SeverancePayInputArea onValuesChange={setSeveranceData} />
          ) : isRealEstate ? (
            <RealEstateInputArea onValuesChange={(v) => setRealEstateAmount(v.initialAmount)} />
          ) : (
            <div>
              <FormSectionLabel icon={Coins} hint="선택">초기 금액</FormSectionLabel>
              <HeroAmountField
                value={initialAmount}
                onChange={setInitialAmount}
                caption={type === 'asset' ? '자산 평가액' : '부채 잔액'}
              />
            </div>
          )}

          {/* Value projection rule (감가상각 / 월 불입 등) */}
          {!isSeverancePay && (
            <AssetProjectionFields value={projection} onChange={setProjection} />
          )}

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
