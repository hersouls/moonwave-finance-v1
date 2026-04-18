import { useState, useEffect, useMemo } from 'react'
import { Dialog, DialogHeader, DialogBody, DialogFooter } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { useTransactionStore } from '@/stores/transactionStore'
import { useMemberStore } from '@/stores/memberStore'
import { useLoanStore } from '@/stores/loanStore'
import { getTodayString } from '@/lib/dateUtils'
import { PAYMENT_METHOD_OPTIONS } from '@/utils/paymentMethod'
import { formatKoreanUnit } from '@/utils/format'
import { useToastStore } from '@/stores/toastStore'
import { RECUR_OPTIONS, LOAN_INTEREST_CATEGORY_NAME, UNCATEGORIZED_LABEL } from '@/lib/ledgerConstants'
import { useTransactionTemplates } from '@/hooks/useTransactionTemplates'
import { clsx } from 'clsx'
import { Select } from '@/components/ui/Select'
import { Landmark } from 'lucide-react'
import type { Transaction, TransactionType, RepeatType, PaymentMethod } from '@/lib/types'

interface TransactionFormModalProps {
  mode: 'create' | 'edit'
  open: boolean
  onClose: () => void
  initialData?: Transaction
  initialDate?: string | null
}

export function TransactionFormModal({ mode, open, onClose, initialData, initialDate }: TransactionFormModalProps) {
  const addTransaction = useTransactionStore((s) => s.addTransaction)
  const updateTransaction = useTransactionStore((s) => s.updateTransaction)
  const categories = useTransactionStore((s) => s.categories)
  const paymentMethodItems = useTransactionStore((s) => s.paymentMethodItems)
  const members = useMemberStore((s) => s.members)
  const transactions = useTransactionStore((s) => s.transactions)
  const loans = useLoanStore((s) => s.loans)
  const getMonthlyInterest = useLoanStore((s) => s.getMonthlyInterest)
  const loadLoans = useLoanStore((s) => s.loadLoans)
  const activeLoans = useMemo(() => loans.filter(l => l.isActive), [loans])

  const [type, setType] = useState<TransactionType>('expense')
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [memberId, setMemberId] = useState<number | ''>('')
  const [date, setDate] = useState(getTodayString())
  const [memo, setMemo] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('')
  const [paymentMethodDetail, setPaymentMethodDetail] = useState('')
  const [paymentMethodItemId, setPaymentMethodItemId] = useState<number | ''>('')
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurType, setRecurType] = useState<RepeatType>('monthly')
  const [recurEndDate, setRecurEndDate] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const currentCategories = categories.filter(c => c.type === type)

  // Items for selected payment method type
  const itemsForType = useMemo(() => {
    if (!paymentMethod || paymentMethod === 'cash') return []
    return paymentMethodItems.filter(i => i.type === paymentMethod && i.isActive)
  }, [paymentMethod, paymentMethodItems])

  const templates = useTransactionTemplates(transactions, mode === 'create')


  useEffect(() => {
    if (open) loadLoans()
  }, [open, loadLoans])

  const applyLoanInterest = (loanId: number) => {
    const loan = activeLoans.find(l => l.id === loanId)
    if (!loan) return
    const interest = getMonthlyInterest(loan)
    setType('expense')
    setAmount(interest.toLocaleString('ko-KR'))
    // Find "대출이자" category
    const interestCat = categories.find(c => c.type === 'expense' && c.name.includes(LOAN_INTEREST_CATEGORY_NAME))
    if (interestCat?.id) setCategoryId(interestCat.id)
    setMemo(`${loan.name} 이자 (잔액 ${loan.currentBalance.toLocaleString('ko-KR')}원 × 연 ${loan.annualRate}%)`)
  }

  useEffect(() => {
    if (!open) return
    if (mode === 'edit' && initialData) {
      setType(initialData.type)
      setAmount(initialData.amount.toLocaleString('ko-KR'))
      setCategoryId(initialData.categoryId ?? '')
      setMemberId(initialData.memberId ?? '')
      setDate(initialData.date)
      setMemo(initialData.memo || '')
      setPaymentMethod(initialData.paymentMethod || '')
      setPaymentMethodDetail(initialData.paymentMethodDetail || '')
      setPaymentMethodItemId(initialData.paymentMethodItemId ?? '')
      setIsRecurring(initialData.isRecurring)
      setRecurType(initialData.recurPattern?.type || 'monthly')
      setRecurEndDate(initialData.recurPattern?.endDate || '')
    } else {
      setType('expense')
      setAmount('')
      setCategoryId('')
      setMemberId(members[0]?.id || '')
      setDate(initialDate || getTodayString())
      setMemo('')
      setPaymentMethod('')
      setPaymentMethodDetail('')
      setPaymentMethodItemId('')
      setIsRecurring(false)
      setRecurType('monthly')
      setRecurEndDate('')
    }
  }, [open, mode, initialData, initialDate, members])

  useEffect(() => {
    setCategoryId('')
  }, [type])

  // Reset payment method item when payment method type changes
  useEffect(() => {
    setPaymentMethodItemId('')
    setPaymentMethodDetail('')
  }, [paymentMethod])

  const applyTemplate = (tmpl: typeof templates[0]) => {
    setType(tmpl.type)
    setAmount(tmpl.amount.toLocaleString('ko-KR'))
    setCategoryId(tmpl.categoryId ?? '')
    setMemo(tmpl.memo || '')
    if (tmpl.paymentMethod) setPaymentMethod(tmpl.paymentMethod)
    if (tmpl.memberId) setMemberId(tmpl.memberId)
  }

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, '')
    if (raw === '') {
      setAmount('')
      return
    }
    const num = parseInt(raw, 10)
    setAmount(num.toLocaleString('ko-KR'))
  }

  const handleSubmit = async () => {
    const numAmount = Number(amount.replace(/,/g, ''))
    if (!numAmount || numAmount <= 0) return

    setIsSubmitting(true)
    try {
      const txnData = {
        type,
        amount: numAmount,
        categoryId: categoryId ? (categoryId as number) : null,
        memberId: memberId ? (memberId as number) : null,
        date,
        memo: memo.trim() || undefined,
        paymentMethod: paymentMethod || undefined,
        paymentMethodDetail: paymentMethodDetail.trim() || undefined,
        paymentMethodItemId: paymentMethodItemId ? (paymentMethodItemId as number) : undefined,
      }

      if (mode === 'edit' && initialData?.id) {
        await updateTransaction(initialData.id, txnData)
      } else {
        await addTransaction({
          ...txnData,
          isRecurring,
          recurPattern: isRecurring ? { type: recurType, interval: 1, endDate: recurEndDate || undefined } : undefined,
        })
      }
      onClose()
    } catch {
      useToastStore.getState().addToast('거래 저장에 실패했습니다.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSelectPaymentMethodItem = (itemId: number, itemName: string) => {
    setPaymentMethodItemId(itemId)
    setPaymentMethodDetail(itemName)
  }

  return (
    <Dialog open={open} onClose={onClose} size="md">
      <DialogHeader title={mode === 'edit' ? '거래 수정' : '새 거래 기록'} onClose={onClose} />
      <DialogBody>
        <div className="space-y-4">
          {/* Templates */}
          {mode === 'create' && templates.length > 0 && (
            <div>
              <label className="block text-caption text-sub mb-1.5">자주 쓰는 거래</label>
              <div className="flex gap-2 overflow-x-auto scrollbar-none -my-1 py-1">
                {templates.map((tmpl, i) => {
                  const cat = tmpl.categoryId ? categories.find(c => c.id === tmpl.categoryId) : null
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => applyTemplate(tmpl)}
                      className="flex-shrink-0 px-3 py-1.5 rounded-lg text-caption bg-surface-tertiary text-body hover:bg-[var(--hover-bg)] transition-colors"
                    >
                      {cat?.name || UNCATEGORIZED_LABEL} {formatKoreanUnit(tmpl.amount)}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Loan Interest Shortcut */}
          {mode === 'create' && activeLoans.length > 0 && (
            <div>
              <label className="block text-caption text-sub mb-1.5 flex items-center gap-1">
                <Landmark className="w-3.5 h-3.5" />
                대출이자 불러오기
              </label>
              <div className="flex gap-2 overflow-x-auto scrollbar-none -my-1 py-1">
                {activeLoans.map(loan => (
                  <button
                    key={loan.id}
                    type="button"
                    onClick={() => applyLoanInterest(loan.id!)}
                    className="flex-shrink-0 px-3 py-1.5 rounded-lg text-caption bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                  >
                    {loan.name} ({formatKoreanUnit(getMonthlyInterest(loan))}원/월)
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Member - NOW AT TOP */}
          {members.length > 0 && (
            <div>
              <label className="block text-body3 text-body mb-2">구성원</label>
              <div className="flex gap-2" role="group" aria-label="구성원 선택">
                {members.length <= 4 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setMemberId('')}
                      className={clsx(
                        'px-3 py-2 rounded-lg text-body3 transition-colors',
                        memberId === ''
                          ? 'bg-[var(--surface-tertiary)] text-heading ring-1 ring-[var(--border-default)]'
                          : 'bg-surface-tertiary text-sub hover:bg-[var(--hover-bg)]'
                      )}
                    >
                      미지정
                    </button>
                    {members.map(m => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setMemberId(m.id!)}
                        className={clsx(
                          'flex-1 py-2 px-4 rounded-lg text-body3 transition-colors',
                          memberId === m.id
                            ? 'text-white ring-1'
                            : 'bg-surface-tertiary text-sub hover:bg-[var(--hover-bg)]'
                        )}
                        style={memberId === m.id ? { backgroundColor: m.color, boxShadow: `0 0 0 1px ${m.color}` } : undefined}
                      >
                        {m.name}
                      </button>
                    ))}
                  </>
                ) : (
                  <Select
                    value={String(memberId)}
                    onChange={(v) => setMemberId(v ? Number(v) : '')}
                    options={members.map(m => ({ value: String(m.id), label: m.name }))}
                    placeholder="미지정"
                  />
                )}
              </div>
            </div>
          )}

          {/* Type Toggle */}
          <div>
            <label className="block text-body3 text-body mb-2">유형</label>
            <div className="flex gap-2" role="radiogroup" aria-label="거래 유형">
              <button
                type="button"
                onClick={() => setType('expense')}
                className={`flex-1 py-2 px-4 rounded-lg text-body3 transition-colors ${
                  type === 'expense'
                    ? 'bg-status-danger text-status-danger'
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
                    ? 'bg-status-success text-status-success'
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
                onChange={handleAmountChange}
                placeholder="0"
                className="input-base !pr-8 tabular-nums"
                autoFocus
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-disabled">원</span>
            </div>
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

          {/* Payment Method (거래수단) */}
          <div>
            <label className="block text-body3 text-body mb-1.5">거래수단 (선택)</label>
            <div className="grid grid-cols-3 gap-2">
              {PAYMENT_METHOD_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPaymentMethod(paymentMethod === opt.value ? '' : opt.value)}
                  className={clsx(
                    'py-2 px-2 rounded-lg text-caption transition-colors text-center',
                    paymentMethod === opt.value
                      ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 ring-1 ring-primary-300 dark:ring-primary-700'
                      : 'bg-surface-tertiary text-sub hover:bg-[var(--hover-bg)]'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Managed payment method items or free-text fallback */}
            {paymentMethod && paymentMethod !== 'cash' && (
              <div className="mt-2">
                {itemsForType.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {itemsForType.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectPaymentMethodItem(item.id!, item.name)}
                        className={clsx(
                          'px-3 py-1.5 rounded-lg text-caption transition-colors',
                          paymentMethodItemId === item.id
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 ring-1 ring-blue-300 dark:ring-blue-700'
                            : 'bg-surface-secondary text-sub hover:bg-[var(--hover-bg)]'
                        )}
                      >
                        {item.name}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => { setPaymentMethodItemId(''); setPaymentMethodDetail('') }}
                      className={clsx(
                        'px-3 py-1.5 rounded-lg text-caption transition-colors',
                        paymentMethodItemId === ''
                          ? 'bg-[var(--surface-tertiary)] text-body ring-1 ring-[var(--border-default)]'
                          : 'bg-surface-secondary text-sub hover:bg-[var(--hover-bg)]'
                      )}
                    >
                      직접 입력
                    </button>
                  </div>
                )}
                {paymentMethodItemId === '' && (
                  <input
                    type="text"
                    value={paymentMethodDetail}
                    onChange={(e) => setPaymentMethodDetail(e.target.value)}
                    placeholder="카드/계좌명 입력 (예: 신한카드)"
                    className="input-base text-caption"
                  />
                )}
              </div>
            )}
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

          {/* Recurring Toggle - create only */}
          {mode === 'create' && (
            <>
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
                      options={RECUR_OPTIONS}
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
            </>
          )}
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>취소</Button>
        <Button
          variant="primary"
          onClick={handleSubmit}
          disabled={isSubmitting || !amount || Number(amount.replace(/,/g, '')) <= 0}
        >
          {isSubmitting ? '저장 중...' : (mode === 'edit' ? '수정' : '기록')}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
