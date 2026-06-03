import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, Building, Calendar, Percent, Banknote } from 'lucide-react'
import { Dialog, DialogHeader, DialogBody, DialogFooter } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { FormSectionLabel, HeroAmountField } from '@/components/ui/CreateFormPrimitives'
import { useLoanStore } from '@/stores/loanStore'
import type { Loan, LoanRepaymentType } from '@/lib/types'

const REPAYMENT_OPTIONS: { value: LoanRepaymentType; label: string }[] = [
  { value: 'equal_principal', label: '원금균등상환' },
  { value: 'equal_installment', label: '원리금균등상환' },
  { value: 'bullet', label: '만기일시상환' },
  { value: 'custom', label: '기타' },
]

function formatAmount(value: number): string {
  return value.toLocaleString('ko-KR')
}

export function LoanTab() {
  const loans = useLoanStore((s) => s.loans)
  const loadLoans = useLoanStore((s) => s.loadLoans)
  const addLoan = useLoanStore((s) => s.addLoan)
  const updateLoan = useLoanStore((s) => s.updateLoan)
  const deleteLoan = useLoanStore((s) => s.deleteLoan)
  const getMonthlyInterest = useLoanStore((s) => s.getMonthlyInterest)

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null)
  const [deletingLoan, setDeletingLoan] = useState<Loan | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [lender, setLender] = useState('')
  const [loanDate, setLoanDate] = useState('')
  const [maturityDate, setMaturityDate] = useState('')
  const [principalAmount, setPrincipalAmount] = useState('')
  const [currentBalance, setCurrentBalance] = useState('')
  const [annualRate, setAnnualRate] = useState('')
  const [repaymentType, setRepaymentType] = useState<LoanRepaymentType>('equal_installment')
  const [paymentDay, setPaymentDay] = useState('')
  const [paymentAccount, setPaymentAccount] = useState('')
  const [memo, setMemo] = useState('')

  useEffect(() => {
    loadLoans()
  }, [loadLoans])

  const resetForm = () => {
    setName('')
    setLender('')
    setLoanDate('')
    setMaturityDate('')
    setPrincipalAmount('')
    setCurrentBalance('')
    setAnnualRate('')
    setRepaymentType('equal_installment')
    setPaymentDay('')
    setPaymentAccount('')
    setMemo('')
  }

  const openCreate = () => {
    setEditingLoan(null)
    resetForm()
    setIsDialogOpen(true)
  }

  const openEdit = (loan: Loan) => {
    setEditingLoan(loan)
    setName(loan.name)
    setLender(loan.lender || '')
    setLoanDate(loan.loanDate)
    setMaturityDate(loan.maturityDate)
    setPrincipalAmount(formatAmount(loan.principalAmount))
    setCurrentBalance(formatAmount(loan.currentBalance))
    setAnnualRate(String(loan.annualRate))
    setRepaymentType(loan.repaymentType)
    setPaymentDay(String(loan.paymentDay))
    setPaymentAccount(loan.paymentAccount || '')
    setMemo(loan.memo || '')
    setIsDialogOpen(true)
  }

  const openDelete = (loan: Loan) => {
    setDeletingLoan(loan)
    setIsDeleteConfirmOpen(true)
  }

  const handleSave = async () => {
    if (!name.trim() || !loanDate || !maturityDate) return
    const balanceNum = Number(currentBalance.replace(/,/g, ''))
    const principalNum = Number(principalAmount.replace(/,/g, ''))
    const rateNum = parseFloat(annualRate)
    const dayNum = parseInt(paymentDay)
    if (isNaN(balanceNum) || isNaN(principalNum) || isNaN(rateNum) || isNaN(dayNum)) return

    const data = {
      name: name.trim(),
      lender: lender.trim() || undefined,
      loanDate,
      maturityDate,
      principalAmount: principalNum,
      currentBalance: balanceNum,
      annualRate: rateNum,
      repaymentType,
      paymentDay: Math.min(Math.max(dayNum, 1), 31),
      paymentAccount: paymentAccount.trim() || undefined,
      memo: memo.trim() || undefined,
    }

    if (editingLoan?.id) {
      await updateLoan(editingLoan.id, data)
    } else {
      await addLoan(data)
    }
    setIsDialogOpen(false)
  }

  const handleDelete = async () => {
    if (deletingLoan?.id) {
      await deleteLoan(deletingLoan.id)
    }
    setIsDeleteConfirmOpen(false)
    setDeletingLoan(null)
  }

  // Calculate preview monthly interest from form
  const previewBalance = Number(currentBalance.replace(/,/g, '')) || 0
  const previewRate = parseFloat(annualRate) || 0
  const previewMonthlyInterest = Math.round(previewBalance * previewRate / 100 / 12)

  const activeLoans = loans.filter(l => l.isActive)
  const inactiveLoans = loans.filter(l => !l.isActive)

  const isFormValid = name.trim() && loanDate && maturityDate &&
    !isNaN(Number(currentBalance.replace(/,/g, ''))) &&
    !isNaN(Number(principalAmount.replace(/,/g, ''))) &&
    !isNaN(parseFloat(annualRate)) &&
    !isNaN(parseInt(paymentDay))

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-body3-semi text-heading">대출 관리</h3>
        <button
          onClick={openCreate}
          className="flex items-center gap-1 text-caption text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          대출 추가
        </button>
      </div>
      <p className="text-caption text-sub mb-4">
        대출 정보를 등록하면 부채 등록 및 가계부 이자 지출에 자동으로 연동할 수 있습니다.
      </p>

      {activeLoans.length > 0 ? (
        <div className="space-y-2">
          {activeLoans.map(loan => (
            <div
              key={loan.id}
              className="px-4 py-3 rounded-xl bg-surface-secondary group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-body3-semi text-heading truncate">
                      {loan.name}
                    </span>
                    {loan.lender && (
                      <span className="text-caption text-disabled flex items-center gap-0.5 shrink-0">
                        <Building className="w-3 h-3" />
                        {loan.lender}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-sub">
                    <span className="flex items-center gap-1">
                      <Banknote className="w-3 h-3" />
                      잔액 {formatAmount(loan.currentBalance)}원
                    </span>
                    <span className="flex items-center gap-1">
                      <Percent className="w-3 h-3" />
                      연 {loan.annualRate}%
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      매월 {loan.paymentDay}일
                    </span>
                  </div>
                  <div className="mt-1 text-caption text-primary-600 dark:text-primary-400">
                    월 예상이자: {formatAmount(getMonthlyInterest(loan))}원
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => openEdit(loan)}
                    className="touch-target-inset p-1.5 rounded-md text-disabled hover:text-body hover:bg-[var(--hover-bg)] opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-all"
                    aria-label="수정"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => openDelete(loan)}
                    className="touch-target-inset p-1.5 rounded-md text-disabled hover:text-status-danger hover:bg-status-danger-soft opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-all"
                    aria-label="삭제"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-caption text-disabled px-3 py-6 text-center">
          등록된 대출이 없습니다.
        </p>
      )}

      {inactiveLoans.length > 0 && (
        <div className="mt-6">
          <h4 className="text-caption text-disabled mb-2">비활성 대출</h4>
          <div className="space-y-1.5">
            {inactiveLoans.map(loan => (
              <div
                key={loan.id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-secondary opacity-60 group"
              >
                <span className="flex-1 text-sm text-sub truncate">{loan.name}</span>
                <button
                  onClick={() => openEdit(loan)}
                  className="touch-target-inset p-1.5 rounded-md text-disabled hover:text-body opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-all"
                  aria-label="수정"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onClose={() => setIsDialogOpen(false)} size="md">
        <DialogHeader
          title={editingLoan ? '대출 정보 수정' : '대출 추가'}
          onClose={() => setIsDialogOpen(false)}
        />
        <DialogBody>
          <div className="space-y-4">
            <div>
              <FormSectionLabel icon={Building} htmlFor="loan-name">대출상품명 *</FormSectionLabel>
              <input
                id="loan-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 주택담보대출"
                className="input-base"
                autoFocus
              />
            </div>

            <div>
              <FormSectionLabel icon={Building} htmlFor="loan-lender">대출기관</FormSectionLabel>
              <input
                id="loan-lender"
                type="text"
                value={lender}
                onChange={(e) => setLender(e.target.value)}
                placeholder="예: 우리은행, 삼성화재"
                className="input-base"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <FormSectionLabel icon={Calendar} htmlFor="loan-date">대출일 *</FormSectionLabel>
                <input
                  id="loan-date"
                  type="date"
                  value={loanDate}
                  onChange={(e) => setLoanDate(e.target.value)}
                  className="input-base"
                />
              </div>
              <div>
                <FormSectionLabel icon={Calendar} htmlFor="loan-maturity-date">만기일 *</FormSectionLabel>
                <input
                  id="loan-maturity-date"
                  type="date"
                  value={maturityDate}
                  onChange={(e) => setMaturityDate(e.target.value)}
                  className="input-base"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <FormSectionLabel icon={Banknote} htmlFor="loan-principal">대출원금 *</FormSectionLabel>
                <HeroAmountField
                  inputId="loan-principal"
                  value={principalAmount}
                  onChange={setPrincipalAmount}
                  caption="대출원금"
                />
              </div>
              <div>
                <FormSectionLabel icon={Banknote} htmlFor="loan-balance">현재 잔액 *</FormSectionLabel>
                <HeroAmountField
                  inputId="loan-balance"
                  value={currentBalance}
                  onChange={setCurrentBalance}
                  caption="현재 잔액"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <FormSectionLabel icon={Percent} htmlFor="loan-rate">연이율(%) *</FormSectionLabel>
                <input
                  id="loan-rate"
                  type="text"
                  inputMode="decimal"
                  value={annualRate}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^0-9.]/g, '')
                    setAnnualRate(v)
                  }}
                  placeholder="3.11"
                  className="input-base text-right tabular-nums"
                />
              </div>
              <div>
                <FormSectionLabel icon={Calendar} htmlFor="loan-payment-day">이자납입일 *</FormSectionLabel>
                <input
                  id="loan-payment-day"
                  type="text"
                  inputMode="numeric"
                  value={paymentDay}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^0-9]/g, '')
                    const num = parseInt(v)
                    if (v === '' || (num >= 1 && num <= 31)) setPaymentDay(v)
                  }}
                  placeholder="25"
                  className="input-base text-right tabular-nums"
                />
              </div>
            </div>

            <div>
              <FormSectionLabel icon={Banknote}>상환방식 *</FormSectionLabel>
              <Select
                value={repaymentType}
                onChange={(v) => setRepaymentType(v as LoanRepaymentType)}
                options={REPAYMENT_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
                placeholder="상환방식 선택"
              />
            </div>

            <div>
              <FormSectionLabel icon={Banknote} htmlFor="loan-payment-account">이자납입계좌</FormSectionLabel>
              <input
                id="loan-payment-account"
                type="text"
                value={paymentAccount}
                onChange={(e) => setPaymentAccount(e.target.value)}
                placeholder="예: 우리은행 1002-xxx-xxxxx"
                className="input-base"
              />
            </div>

            <div>
              <FormSectionLabel icon={Pencil} htmlFor="loan-memo">메모</FormSectionLabel>
              <input
                id="loan-memo"
                type="text"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="메모를 입력하세요"
                className="input-base"
              />
            </div>

            {/* Monthly interest preview */}
            {previewBalance > 0 && previewRate > 0 && (
              <div className="rounded-lg bg-primary-50 dark:bg-primary-900/20 px-4 py-3">
                <p className="text-caption text-sub mb-0.5">월 예상이자</p>
                <p className="text-body2-semi text-primary-700 dark:text-primary-300 tabular-nums">
                  {formatAmount(previewMonthlyInterest)}원
                </p>
                <p className="text-caption text-disabled mt-0.5">
                  = {formatAmount(previewBalance)}원 × {previewRate}% ÷ 12
                </p>
              </div>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setIsDialogOpen(false)}>취소</Button>
          <Button variant="primary" onClick={handleSave} disabled={!isFormValid}>
            {editingLoan ? '수정' : '추가'}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteConfirmOpen} onClose={() => setIsDeleteConfirmOpen(false)} size="sm">
        <DialogHeader title="대출 삭제" onClose={() => setIsDeleteConfirmOpen(false)} />
        <DialogBody>
          <p className="text-sm text-sub">
            <span className="font-medium text-heading">{deletingLoan?.name}</span>을(를) 삭제하시겠습니까?
          </p>
          <p className="mt-2 text-caption text-sub">
            연결된 부채 항목과 가계부 기록에는 영향이 없습니다.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setIsDeleteConfirmOpen(false)}>취소</Button>
          <Button variant="danger" onClick={handleDelete}>삭제</Button>
        </DialogFooter>
      </Dialog>
    </div>
  )
}
