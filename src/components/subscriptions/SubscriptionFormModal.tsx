import { useState, useEffect, useCallback } from 'react'
import { Dialog, DialogHeader, DialogBody, DialogFooter } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { useSubscriptionStore } from '@/stores/subscriptionStore'
import { useTransactionStore } from '@/stores/transactionStore'
import { useUIStore } from '@/stores/uiStore'
import { SUBSCRIPTION_CATEGORIES, SUBSCRIPTION_PRESETS } from '@/utils/constants'
import { getTodayString } from '@/lib/dateUtils'
import { clsx } from 'clsx'
import type { SubscriptionCurrency, SubscriptionCycle, SubscriptionCategoryType } from '@/lib/types'

const CYCLE_OPTIONS: { value: SubscriptionCycle; label: string }[] = [
  { value: 'weekly', label: '매주' },
  { value: 'biweekly', label: '격주' },
  { value: 'monthly', label: '매월' },
  { value: 'quarterly', label: '분기' },
  { value: 'semi-annual', label: '반기' },
  { value: 'yearly', label: '연간' },
  { value: 'custom', label: '직접' },
]

const PRESET_COLORS = [
  '#EF4444', '#F97316', '#F59E0B', '#10B981', '#06B6D4',
  '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#71717A',
]

export function SubscriptionFormModal() {
  const isCreateOpen = useUIStore((s) => s.isSubscriptionCreateModalOpen)
  const isEditOpen = useUIStore((s) => s.isSubscriptionEditModalOpen)
  const editingId = useUIStore((s) => s.editingSubscriptionId)
  const closeCreate = useUIStore((s) => s.closeSubscriptionCreateModal)
  const closeEdit = useUIStore((s) => s.closeSubscriptionEditModal)

  const subscriptions = useSubscriptionStore((s) => s.subscriptions)
  const addSubscription = useSubscriptionStore((s) => s.addSubscription)
  const updateSubscription = useSubscriptionStore((s) => s.updateSubscription)

  const paymentMethodItems = useTransactionStore((s) => s.paymentMethodItems)
  const transactionCategories = useTransactionStore((s) => s.categories)
  const loadPaymentMethodItems = useTransactionStore((s) => s.loadPaymentMethodItems)
  const loadCategories = useTransactionStore((s) => s.loadCategories)

  const isOpen = isCreateOpen || isEditOpen

  useEffect(() => {
    if (isOpen) {
      loadPaymentMethodItems()
      loadCategories()
    }
  }, [isOpen])

  const creditCards = paymentMethodItems.filter((p) => p.type === 'credit_card')
  const expenseCategories = transactionCategories.filter((c) => c.type === 'expense')
  const isEdit = isEditOpen && editingId != null
  const editingSub = isEdit ? subscriptions.find(s => s.id === editingId) : null

  const [name, setName] = useState('')
  const [currency, setCurrency] = useState<SubscriptionCurrency>('KRW')
  const [amount, setAmount] = useState('')
  const [cycle, setCycle] = useState<SubscriptionCycle>('monthly')
  const [billingDay, setBillingDay] = useState(1)
  const [billingMonth, setBillingMonth] = useState(1)
  const [category, setCategory] = useState<SubscriptionCategoryType>('other')
  const [startDate, setStartDate] = useState(getTodayString())
  const [color, setColor] = useState('#3B82F6')
  const [url, setUrl] = useState('')
  const [memo, setMemo] = useState('')
  const [customCycleDays, setCustomCycleDays] = useState(30)
  const [paymentMethodItemId, setPaymentMethodItemId] = useState<number | undefined>(undefined)
  const [linkedTransactionCategoryId, setLinkedTransactionCategoryId] = useState<number | undefined>(undefined)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const needsBillingDay = !['weekly', 'biweekly', 'custom'].includes(cycle)

  useEffect(() => {
    if (isEdit && editingSub) {
      setName(editingSub.name)
      setCurrency(editingSub.currency)
      setAmount(editingSub.currency === 'KRW' ? String(editingSub.amount) : editingSub.amount.toFixed(2))
      setCycle(editingSub.cycle)
      setBillingDay(editingSub.billingDay)
      setBillingMonth(editingSub.billingMonth ?? 1)
      setCustomCycleDays(editingSub.customCycleDays ?? 30)
      setCategory(editingSub.category)
      setStartDate(editingSub.startDate)
      setColor(editingSub.color)
      setUrl(editingSub.url ?? '')
      setMemo(editingSub.memo ?? '')
      setPaymentMethodItemId(editingSub.paymentMethodItemId)
      setLinkedTransactionCategoryId(editingSub.linkedTransactionCategoryId)
    } else if (isCreateOpen) {
      resetForm()
    }
  }, [isEdit, editingSub, isCreateOpen])

  const resetForm = () => {
    setName('')
    setCurrency('KRW')
    setAmount('')
    setCycle('monthly')
    setBillingDay(1)
    setBillingMonth(1)
    setCustomCycleDays(30)
    setCategory('other')
    setStartDate(getTodayString())
    setColor('#3B82F6')
    setUrl('')
    setMemo('')
    setPaymentMethodItemId(undefined)
    setLinkedTransactionCategoryId(undefined)
  }

  const handleClose = useCallback(() => {
    if (isEdit) closeEdit()
    else closeCreate()
  }, [isEdit, closeEdit, closeCreate])

  const handlePresetClick = (preset: { name: string; amount: number; cycle: string; category: string; color: string; icon: string }) => {
    setName(preset.name)
    setAmount(currency === 'KRW' ? String(preset.amount) : preset.amount.toFixed(2))
    setCycle(preset.cycle as SubscriptionCycle)
    setCategory(preset.category as SubscriptionCategoryType)
    setColor(preset.color)
  }

  const handleAmountChange = (value: string) => {
    if (currency === 'KRW') {
      const digits = value.replace(/[^\d]/g, '')
      setAmount(digits ? Number(digits).toLocaleString('ko-KR') : '')
    } else {
      const cleaned = value.replace(/[^\d.]/g, '')
      setAmount(cleaned)
    }
  }

  const parseAmount = (): number => {
    if (currency === 'KRW') {
      return Number(amount.replace(/,/g, '')) || 0
    }
    return Number(amount) || 0
  }

  const handleSubmit = async () => {
    const parsedAmount = parseAmount()
    if (!name.trim() || parsedAmount <= 0) return
    if (needsBillingDay && (billingDay < 1 || billingDay > 28)) return

    setIsSubmitting(true)
    try {
      const data = {
        name: name.trim(),
        currency,
        amount: parsedAmount,
        cycle,
        billingDay: needsBillingDay ? billingDay : 1,
        billingMonth: cycle === 'yearly' ? billingMonth : undefined,
        customCycleDays: cycle === 'custom' ? Math.max(1, Math.min(365, customCycleDays)) : undefined,
        category,
        startDate,
        color,
        url: url.trim() || undefined,
        memo: memo.trim() || undefined,
        paymentMethodItemId: paymentMethodItemId || undefined,
        linkedTransactionCategoryId: linkedTransactionCategoryId || undefined,
      }

      if (isEdit && editingId) {
        await updateSubscription(editingId, data)
      } else {
        await addSubscription(data)
      }
      handleClose()
    } finally {
      setIsSubmitting(false)
    }
  }

  const currentPresets = currency === 'KRW' ? SUBSCRIPTION_PRESETS.KRW : SUBSCRIPTION_PRESETS.USD

  return (
    <Dialog open={isOpen} onClose={handleClose} size="lg">
      <DialogHeader
        title={isEdit ? '구독 수정' : '구독 추가'}
        onClose={handleClose}
      />
      <DialogBody>
        <div className="space-y-5">
          {/* Presets */}
          {!isEdit && (
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                빠른 선택
              </label>
              <div className="flex gap-1 mb-2">
                <button
                  onClick={() => setCurrency('KRW')}
                  className={clsx(
                    'px-3 py-1 text-xs rounded-full transition-colors',
                    currency === 'KRW'
                      ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                  )}
                >
                  원화 (KRW)
                </button>
                <button
                  onClick={() => setCurrency('USD')}
                  className={clsx(
                    'px-3 py-1 text-xs rounded-full transition-colors',
                    currency === 'USD'
                      ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                  )}
                >
                  달러 (USD)
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {currentPresets.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => handlePresetClick(preset)}
                    className={clsx(
                      'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors border',
                      name === preset.name
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                        : 'border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                    )}
                  >
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: preset.color }}
                    />
                    <span className="truncate text-zinc-700 dark:text-zinc-300">{preset.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              서비스명 *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 넷플릭스"
              className="w-full px-3 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Currency + Amount */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                통화
              </label>
              <div className="flex gap-1">
                {(['KRW', 'USD'] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => { setCurrency(c); setAmount('') }}
                    className={clsx(
                      'flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors',
                      currency === c
                        ? 'bg-primary-500 text-white'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                    )}
                  >
                    {c === 'KRW' ? '원화' : '달러'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                금액 *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">
                  {currency === 'KRW' ? '₩' : '$'}
                </span>
                <input
                  type="text"
                  inputMode={currency === 'KRW' ? 'numeric' : 'decimal'}
                  value={amount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  placeholder={currency === 'KRW' ? '0' : '0.00'}
                  className="w-full pl-8 pr-3 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 tabular-nums"
                />
              </div>
            </div>
          </div>

          {/* Cycle */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              결제주기
            </label>
            <div className="flex flex-wrap gap-1.5">
              {CYCLE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setCycle(opt.value)}
                  className={clsx(
                    'px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    cycle === opt.value
                      ? 'bg-primary-500 text-white'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom cycle days */}
          {cycle === 'custom' && (
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                반복 일수
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={customCycleDays}
                  onChange={(e) => setCustomCycleDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
                  className="w-24 px-3 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 tabular-nums"
                />
                <span className="text-sm text-zinc-500 dark:text-zinc-400">일마다</span>
              </div>
            </div>
          )}

          {/* Billing Day (only for cycles that use it) */}
          {needsBillingDay && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                  결제일
                </label>
                <select
                  value={billingDay}
                  onChange={(e) => setBillingDay(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>{d}일</option>
                  ))}
                </select>
              </div>

              {/* Billing Month (yearly only) */}
              {cycle === 'yearly' && (
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                    결제월
                  </label>
                  <select
                    value={billingMonth}
                    onChange={(e) => setBillingMonth(Number(e.target.value))}
                    className="w-full px-3 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <option key={m} value={m}>{m}월</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              카테고리
            </label>
            <div className="grid grid-cols-5 gap-2">
              {SUBSCRIPTION_CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => setCategory(cat.value)}
                  className={clsx(
                    'flex flex-col items-center gap-1 py-2 rounded-lg text-xs transition-colors border',
                    category === cat.value
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                      : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                  )}
                >
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: cat.color }}
                  />
                  <span className="truncate w-full text-center px-0.5">{cat.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              시작일
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Color */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              색상
            </label>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={clsx(
                    'w-8 h-8 rounded-full transition-all',
                    color === c ? 'ring-2 ring-offset-2 ring-primary-500 dark:ring-offset-zinc-900' : ''
                  )}
                  style={{ backgroundColor: c }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>

          {/* Payment Method (Credit Card) */}
          {creditCards.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                결제 카드 (선택)
              </label>
              <select
                value={paymentMethodItemId ?? ''}
                onChange={(e) => setPaymentMethodItemId(e.target.value ? Number(e.target.value) : undefined)}
                className="w-full px-3 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">선택 안 함</option>
                {creditCards.map((pm) => (
                  <option key={pm.id} value={pm.id}>{pm.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Linked Transaction Category */}
          {expenseCategories.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                가계부 카테고리 (선택)
              </label>
              <select
                value={linkedTransactionCategoryId ?? ''}
                onChange={(e) => setLinkedTransactionCategoryId(e.target.value ? Number(e.target.value) : undefined)}
                className="w-full px-3 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">선택 안 함</option>
                {expenseCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                가계부 지출에 자동 반영 시 사용할 카테고리
              </p>
            </div>
          )}

          {/* URL & Memo */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              URL (선택)
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://"
              className="w-full px-3 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              메모 (선택)
            </label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={2}
              className="w-full px-3 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            />
          </div>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={handleClose}>취소</Button>
        <Button
          variant="primary"
          onClick={handleSubmit}
          disabled={isSubmitting || !name.trim() || parseAmount() <= 0}
        >
          {isEdit ? '수정' : '추가'}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
