import { useState, useEffect, useMemo } from 'react'
import { Dialog, DialogHeader, DialogBody, DialogFooter } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { useUIStore } from '@/stores/uiStore'
import { useAssetStore } from '@/stores/assetStore'
import { useMemberStore } from '@/stores/memberStore'
import { useToastStore } from '@/stores/toastStore'
import { useDailyValueStore } from '@/stores/dailyValueStore'
import { useLoanStore } from '@/stores/loanStore'
import { format } from 'date-fns'
import { Select } from '@/components/ui/Select'
import { Landmark } from 'lucide-react'
import type { AssetLiabilityType } from '@/lib/types'
import { SeverancePayInputArea } from './SeverancePayInputArea'
import { RealEstateInputArea } from './RealEstateInputArea'
import { generateSeverancePayValues } from '@/services/assetAnalytics'

export function AssetCreateModal() {
  const isOpen = useUIStore((s) => s.isAssetCreateModalOpen)
  const close = useUIStore((s) => s.closeAssetCreateModal)
  const addItem = useAssetStore((s) => s.addItem)
  const categories = useAssetStore((s) => s.categories)
  const members = useMemberStore((s) => s.members)
  const setValue = useDailyValueStore((s) => s.setValue)
  const loans = useLoanStore((s) => s.loans)
  const updateLoan = useLoanStore((s) => s.updateLoan)
  const loadLoans = useLoanStore((s) => s.loadLoans)
  const activeLoans = useMemo(() => loans.filter(l => l.isActive), [loans])

  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [memberId, setMemberId] = useState<number | ''>('')
  const [initialAmount, setInitialAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [type, setType] = useState<AssetLiabilityType>('asset')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [severanceData, setSeveranceData] = useState<{ joinDate: string; monthlyAvgWage: number; estimatedAmount: number } | null>(null)
  const [realEstateAmount, setRealEstateAmount] = useState<number>(0)
  const [selectedLoanId, setSelectedLoanId] = useState<number | null>(null)

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
      loadLoans()
    }
  }, [isOpen, members, loadLoans])

  const handleLoanSelect = (loanId: string) => {
    const loan = activeLoans.find(l => l.id === Number(loanId))
    if (!loan) return
    setSelectedLoanId(loan.id!)
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
        memberId: memberId as number,
        categoryId: categoryId as number,
        name: name.trim(),
        type,
        memo: memo.trim() || undefined,
      })

      if (isSeverancePay && severanceData && severanceData.estimatedAmount > 0) {
        // 일별 초기 데이터 자동 생성 및 저장
        const targetEndDate = format(new Date(), 'yyyy-MM-dd')
        const values = generateSeverancePayValues(id, severanceData.joinDate, severanceData.monthlyAvgWage, targetEndDate)
        if (values.length > 0) {
          await useDailyValueStore.getState().bulkSetValues(values.map(v => ({ ...v, assetItemId: id })))
        }
      } else if (isRealEstate && realEstateAmount > 0) {
        // 부동산 금액 저장 (현재일 기준 단건, 이후 가격 수정 전까지 유지됨)
        await setValue(id, format(new Date(), 'yyyy-MM-dd'), realEstateAmount)
      } else {
        const amount = Number(initialAmount.replace(/,/g, ''))
        if (amount > 0) {
          await setValue(id, format(new Date(), 'yyyy-MM-dd'), amount)
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
        <div className="space-y-4">
          {/* Type Toggle */}
          <div>
            <label className="block text-body3 text-body mb-2">유형</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setType('asset'); setCategoryId('') }}
                className={`flex-1 py-2 px-4 rounded-lg text-body3 transition-colors ${
                  type === 'asset'
                    ? 'bg-status-success text-emerald-700 dark:text-emerald-400'
                    : 'bg-surface-tertiary text-zinc-600 dark:text-zinc-400'
                }`}
              >
                자산
              </button>
              <button
                type="button"
                onClick={() => { setType('liability'); setCategoryId('') }}
                className={`flex-1 py-2 px-4 rounded-lg text-body3 transition-colors ${
                  type === 'liability'
                    ? 'bg-status-danger text-red-700 dark:text-red-400'
                    : 'bg-surface-tertiary text-zinc-600 dark:text-zinc-400'
                }`}
              >
                부채
              </button>
            </div>
          </div>

          {/* Loan Import (liability only) */}
          {type === 'liability' && activeLoans.length > 0 && (
            <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Landmark className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="text-body3-semi text-blue-700 dark:text-blue-300">대출정보 불러오기</span>
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
            <label className="block text-body3 text-body mb-1.5">항목명</label>
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
            <label className="block text-body3 text-body mb-1.5">카테고리</label>
            <Select
              value={String(categoryId)}
              onChange={(v) => setCategoryId(v ? Number(v) : '')}
              options={currentCategories.map(c => ({ value: String(c.id), label: c.name }))}
              placeholder="카테고리 선택"
            />
          </div>

          {/* Specialized Input Forms or Default Initial Amount */}
          {isSeverancePay ? (
            <SeverancePayInputArea onValuesChange={setSeveranceData} />
          ) : isRealEstate ? (
            <RealEstateInputArea onValuesChange={(v) => setRealEstateAmount(v.initialAmount)} />
          ) : (
            <div>
              <label className="block text-body3 text-body mb-1.5">초기 금액 (선택)</label>
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
          )}

          {/* Member */}
          <div>
            <label className="block text-body3 text-body mb-1.5">구성원</label>
            <Select
              value={String(memberId)}
              onChange={(v) => setMemberId(v ? Number(v) : '')}
              options={members.map(m => ({ value: String(m.id), label: m.name }))}
              placeholder="구성원 선택"
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
