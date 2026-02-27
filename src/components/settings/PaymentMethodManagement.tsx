import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { Dialog, DialogHeader, DialogBody, DialogFooter } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { useTransactionStore } from '@/stores/transactionStore'
import type { PaymentMethod, PaymentMethodItem } from '@/lib/types'

const PAYMENT_METHOD_GROUPS: { type: PaymentMethod; label: string }[] = [
  { type: 'credit_card', label: '신용카드' },
  { type: 'debit_card', label: '체크카드' },
  { type: 'bank_transfer', label: '계좌이체' },
  { type: 'other', label: '기타' },
]

export function PaymentMethodManagement() {
  const paymentMethodItems = useTransactionStore((s) => s.paymentMethodItems)
  const addPaymentMethodItem = useTransactionStore((s) => s.addPaymentMethodItem)
  const updatePaymentMethodItem = useTransactionStore((s) => s.updatePaymentMethodItem)
  const deletePaymentMethodItem = useTransactionStore((s) => s.deletePaymentMethodItem)
  const loadPaymentMethodItems = useTransactionStore((s) => s.loadPaymentMethodItems)

  const [editingItem, setEditingItem] = useState<PaymentMethodItem | null>(null)
  const [editingType, setEditingType] = useState<PaymentMethod>('credit_card')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [deletingItem, setDeletingItem] = useState<PaymentMethodItem | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [memo, setMemo] = useState('')

  useEffect(() => {
    loadPaymentMethodItems()
  }, [loadPaymentMethodItems])

  const openCreate = (type: PaymentMethod) => {
    setEditingItem(null)
    setEditingType(type)
    setName('')
    setMemo('')
    setIsDialogOpen(true)
  }

  const openEdit = (item: PaymentMethodItem) => {
    setEditingItem(item)
    setEditingType(item.type)
    setName(item.name)
    setMemo(item.memo || '')
    setIsDialogOpen(true)
  }

  const openDelete = (item: PaymentMethodItem) => {
    setDeletingItem(item)
    setIsDeleteConfirmOpen(true)
  }

  const handleSave = async () => {
    if (!name.trim()) return
    if (editingItem?.id) {
      await updatePaymentMethodItem(editingItem.id, { name: name.trim(), memo: memo.trim() || undefined })
    } else {
      await addPaymentMethodItem({ type: editingType, name: name.trim(), memo: memo.trim() || undefined })
    }
    setIsDialogOpen(false)
  }

  const handleDelete = async () => {
    if (deletingItem?.id) {
      await deletePaymentMethodItem(deletingItem.id)
    }
    setIsDeleteConfirmOpen(false)
    setDeletingItem(null)
  }

  const getGroupLabel = (type: PaymentMethod) => {
    return PAYMENT_METHOD_GROUPS.find(g => g.type === type)?.label || type
  }

  const getPlaceholder = (type: PaymentMethod) => {
    switch (type) {
      case 'credit_card': return '예: 신한카드, 삼성카드'
      case 'debit_card': return '예: 카카오뱅크 체크카드'
      case 'bank_transfer': return '예: 국민은행, 신한은행'
      case 'other': return '예: 페이, 포인트'
      default: return '이름 입력'
    }
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3">거래수단 관리</h3>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
        자주 사용하는 카드나 계좌를 등록하면 거래 기록 시 빠르게 선택할 수 있습니다.
      </p>

      <div className="space-y-5">
        {PAYMENT_METHOD_GROUPS.map(group => {
          const items = paymentMethodItems.filter(i => i.type === group.type)
          return (
            <div key={group.type}>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  {group.label}
                </h4>
                <button
                  onClick={() => openCreate(group.type)}
                  className="flex items-center gap-1 text-xs font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  추가
                </button>
              </div>
              {items.length > 0 ? (
                <div className="space-y-1.5">
                  {items.map(item => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 group"
                    >
                      <span className="flex-1 text-sm text-zinc-900 dark:text-zinc-100">
                        {item.name}
                        {item.memo && (
                          <span className="ml-2 text-xs text-zinc-400">({item.memo})</span>
                        )}
                      </span>
                      <button
                        onClick={() => openEdit(item)}
                        className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 opacity-0 group-hover:opacity-100 transition-all"
                        aria-label="수정"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => openDelete(item)}
                        className="p-1.5 rounded-md text-zinc-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-all"
                        aria-label="삭제"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-400 dark:text-zinc-500 px-3 py-2">
                  등록된 {group.label}이(가) 없습니다.
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/* Edit/Create Dialog */}
      <Dialog open={isDialogOpen} onClose={() => setIsDialogOpen(false)} size="sm">
        <DialogHeader
          title={editingItem ? `${getGroupLabel(editingType)} 수정` : `${getGroupLabel(editingType)} 추가`}
          onClose={() => setIsDialogOpen(false)}
        />
        <DialogBody>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">이름</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={getPlaceholder(editingType)}
                className="w-full px-3 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">메모 (선택)</label>
              <input
                type="text"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="메모 입력"
                className="w-full px-3 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent placeholder:text-zinc-400"
              />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setIsDialogOpen(false)}>취소</Button>
          <Button variant="primary" onClick={handleSave} disabled={!name.trim()}>
            {editingItem ? '수정' : '추가'}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteConfirmOpen} onClose={() => setIsDeleteConfirmOpen(false)} size="sm">
        <DialogHeader title="거래수단 삭제" onClose={() => setIsDeleteConfirmOpen(false)} />
        <DialogBody>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            <span className="font-medium text-zinc-900 dark:text-zinc-100">{deletingItem?.name}</span>을(를) 삭제하시겠습니까?
          </p>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
            관련 거래에서 이 거래수단 정보가 제거됩니다.
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
