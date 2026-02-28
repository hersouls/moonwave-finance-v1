import type { PaymentMethod } from '@/lib/types'

export const PAYMENT_METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: '현금' },
  { value: 'credit_card', label: '신용카드' },
  { value: 'debit_card', label: '체크카드' },
  { value: 'bank_transfer', label: '계좌이체' },
  { value: 'loan', label: '대출' },
  { value: 'other', label: '기타' },
]

export function getPaymentMethodLabel(method?: PaymentMethod | string): string {
  if (!method) return ''
  const found = PAYMENT_METHOD_OPTIONS.find(o => o.value === method)
  return found?.label || method
}
