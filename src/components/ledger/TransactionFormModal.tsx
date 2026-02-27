import { useState, useEffect, useMemo } from 'react'
import { Dialog, DialogHeader, DialogBody, DialogFooter } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { useTransactionStore } from '@/stores/transactionStore'
import { useMemberStore } from '@/stores/memberStore'
import { useBudgetStore } from '@/stores/budgetStore'
import { getTodayString } from '@/lib/dateUtils'
import { PAYMENT_METHOD_OPTIONS } from '@/utils/paymentMethod'
import { formatKoreanUnit } from '@/utils/format'
import { clsx } from 'clsx'
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
  const members = useMemberStore((s) => s.members)
  const budgets = useBudgetStore((s) => s.budgets)
  const transactions = useTransactionStore((s) => s.transactions)

  const [type, setType] = useState<TransactionType>('expense')
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [memberId, setMemberId] = useState<number | ''>('')
  const [date, setDate] = useState(getTodayString())
  const [memo, setMemo] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('')
  const [paymentMethodDetail, setPaymentMethodDetail] = useState('')
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurType, setRecurType] = useState<RepeatType>('monthly')
  const [recurEndDate, setRecurEndDate] = useState('')

  const currentCategories = categories.filter(c => c.type === type)

  // Recent templates: top 5 frequent transaction patterns from last 3 months
  const templates = useMemo(() => {
    if (mode !== 'create') return []
    const allTxns = transactions
    const freqMap = new Map<string, { count: number; type: TransactionType; categoryId: number | null; amount: number; memo?: string; paymentMethod?: PaymentMethod; memberId: number | null }>()
    for (const t of allTxns) {
      const key = `${t.type}|${t.categoryId}|${t.amount}|${t.memo || ''}`
      const existing = freqMap.get(key)
      if (existing) {
        existing.count++
      } else {
        freqMap.set(key, { count: 1, type: t.type, categoryId: t.categoryId, amount: t.amount, memo: t.memo, paymentMethod: t.paymentMethod, memberId: t.memberId })
      }
    }
    return Array.from(freqMap.values())
      .filter(t => t.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
  }, [transactions, mode])

  // Budget warning for selected category
  const budgetWarning = useMemo(() => {
    if (type !== 'expense' || !categoryId) return null
    const budget = budgets.find(b => b.categoryId === categoryId)
    if (!budget) return null
    const used = transactions
      .filter(t => t.type === 'expense' && t.categoryId === categoryId)
      .reduce((sum, t) => sum + t.amount, 0)
    const remaining = budget.amount - used
    const percent = budget.amount > 0 ? (used / budget.amount) * 100 : 0
    return { budgetAmount: budget.amount, used, remaining, percent }
  }, [type, categoryId, budgets, transactions])

  useEffect(() => {
    if (!open) return
    if (mode === 'edit' && initialData) {
      setType(initialData.type)
      setAmount(String(initialData.amount))
      setCategoryId(initialData.categoryId ?? '')
      setMemberId(initialData.memberId ?? '')
      setDate(initialData.date)
      setMemo(initialData.memo || '')
      setPaymentMethod(initialData.paymentMethod || '')
      setPaymentMethodDetail(initialData.paymentMethodDetail || '')
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
      setIsRecurring(false)
      setRecurType('monthly')
      setRecurEndDate('')
    }
  }, [open, mode, initialData, initialDate, members])

  useEffect(() => {
    setCategoryId('')
  }, [type])

  const applyTemplate = (tmpl: typeof templates[0]) => {
    setType(tmpl.type)
    setAmount(String(tmpl.amount))
    setCategoryId(tmpl.categoryId ?? '')
    setMemo(tmpl.memo || '')
    if (tmpl.paymentMethod) setPaymentMethod(tmpl.paymentMethod)
    if (tmpl.memberId) setMemberId(tmpl.memberId)
  }

  const handleSubmit = async () => {
    const numAmount = Number(amount.replace(/,/g, ''))
    if (!numAmount || numAmount <= 0) return

    if (mode === 'edit' && initialData?.id) {
      await updateTransaction(initialData.id, {
        type,
        amount: numAmount,
        categoryId: categoryId ? (categoryId as number) : null,
        memberId: memberId ? (memberId as number) : null,
        date,
        memo: memo.trim() || undefined,
        paymentMethod: paymentMethod || undefined,
        paymentMethodDetail: paymentMethodDetail.trim() || undefined,
      })
    } else {
      await addTransaction({
        memberId: memberId ? (memberId as number) : null,
        type,
        amount: numAmount,
        categoryId: categoryId ? (categoryId as number) : null,
        date,
        memo: memo.trim() || undefined,
        paymentMethod: paymentMethod || undefined,
        paymentMethodDetail: paymentMethodDetail.trim() || undefined,
        isRecurring,
        recurPattern: isRecurring ? { type: recurType, interval: 1, endDate: recurEndDate || undefined } : undefined,
      })
    }
    onClose()
  }

  const isCard = paymentMethod === 'credit_card' || paymentMethod === 'debit_card'

  return (
    <Dialog open={open} onClose={onClose} size="md">
      <DialogHeader title={mode === 'edit' ? '거래 수정' : '새 거래 기록'} onClose={onClose} />
      <DialogBody>
        <div className="space-y-4">
          {/* Templates */}
          {mode === 'create' && templates.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">자주 쓰는 거래</label>
              <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
                {templates.map((tmpl, i) => {
                  const cat = tmpl.categoryId ? categories.find(c => c.id === tmpl.categoryId) : null
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => applyTemplate(tmpl)}
                      className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                    >
                      {cat?.name || '미분류'} {formatKoreanUnit(tmpl.amount)}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

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

          {/* Budget Warning */}
          {budgetWarning && (
            <div className={clsx(
              'px-3 py-2 rounded-lg text-xs font-medium',
              budgetWarning.percent > 100
                ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                : budgetWarning.percent >= 80
                  ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
                  : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
            )}>
              {budgetWarning.percent > 100
                ? `예산 ${formatKoreanUnit(budgetWarning.budgetAmount)} 중 ${formatKoreanUnit(budgetWarning.used)} 사용 (${formatKoreanUnit(Math.abs(budgetWarning.remaining))} 초과!)`
                : `예산 ${formatKoreanUnit(budgetWarning.budgetAmount)} 중 ${formatKoreanUnit(budgetWarning.used)} 사용 (${formatKoreanUnit(budgetWarning.remaining)} 남음)`
              }
            </div>
          )}

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

          {/* Payment Method */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">결제수단 (선택)</label>
            <div className="grid grid-cols-3 gap-2">
              {PAYMENT_METHOD_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPaymentMethod(paymentMethod === opt.value ? '' : opt.value)}
                  className={clsx(
                    'py-2 px-2 rounded-lg text-xs font-medium transition-colors text-center',
                    paymentMethod === opt.value
                      ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 ring-1 ring-primary-300 dark:ring-primary-700'
                      : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {isCard && (
              <input
                type="text"
                value={paymentMethodDetail}
                onChange={(e) => setPaymentMethodDetail(e.target.value)}
                placeholder="카드명 (예: 신한카드)"
                className="w-full mt-2 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent placeholder:text-zinc-400"
              />
            )}
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

          {/* Recurring Toggle - create only */}
          {mode === 'create' && (
            <>
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
            </>
          )}
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>취소</Button>
        <Button
          variant="primary"
          onClick={handleSubmit}
          disabled={!amount || Number(amount.replace(/,/g, '')) <= 0}
        >
          {mode === 'edit' ? '수정' : '기록'}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
