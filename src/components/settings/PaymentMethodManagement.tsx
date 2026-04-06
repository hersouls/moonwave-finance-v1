import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, Link2 } from 'lucide-react'
import { Dialog, DialogHeader, DialogBody, DialogFooter } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { useTransactionStore } from '@/stores/transactionStore'
import { useAssetStore } from '@/stores/assetStore'
import { Select } from '@/components/ui/Select'
import type { PaymentMethod, PaymentMethodItem } from '@/lib/types'

const PAYMENT_METHOD_GROUPS: { type: PaymentMethod; label: string }[] = [
  { type: 'credit_card', label: '신용카드' },
  { type: 'debit_card', label: '체크카드' },
  { type: 'bank_transfer', label: '계좌이체' },
  { type: 'loan', label: '대출' },
  { type: 'other', label: '기타' },
]

export function PaymentMethodManagement() {
  const paymentMethodItems = useTransactionStore((s) => s.paymentMethodItems)
  const addPaymentMethodItem = useTransactionStore((s) => s.addPaymentMethodItem)
  const updatePaymentMethodItem = useTransactionStore((s) => s.updatePaymentMethodItem)
  const deletePaymentMethodItem = useTransactionStore((s) => s.deletePaymentMethodItem)
  const loadPaymentMethodItems = useTransactionStore((s) => s.loadPaymentMethodItems)

  // Asset store for linking
  const assetItems = useAssetStore((s) => s.items)
  const loadAssets = useAssetStore((s) => s.loadAll)

  const [editingItem, setEditingItem] = useState<PaymentMethodItem | null>(null)
  const [editingType, setEditingType] = useState<PaymentMethod>('credit_card')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [deletingItem, setDeletingItem] = useState<PaymentMethodItem | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [memo, setMemo] = useState('')
  const [linkedAssetItemId, setLinkedAssetItemId] = useState<number | undefined>(undefined)

  useEffect(() => {
    loadPaymentMethodItems()
    loadAssets()
  }, [loadPaymentMethodItems, loadAssets])

  const assetTypeItems = assetItems.filter((i) => i.type === 'asset' && i.isActive)
  const liabilityTypeItems = assetItems.filter((i) => i.type === 'liability' && i.isActive)

  const openCreate = (type: PaymentMethod) => {
    setEditingItem(null)
    setEditingType(type)
    setName('')
    setMemo('')
    setLinkedAssetItemId(undefined)
    setIsDialogOpen(true)
  }

  const openEdit = (item: PaymentMethodItem) => {
    setEditingItem(item)
    setEditingType(item.type)
    setName(item.name)
    setMemo(item.memo || '')
    setLinkedAssetItemId(item.linkedAssetItemId)
    setIsDialogOpen(true)
  }

  const openDelete = (item: PaymentMethodItem) => {
    setDeletingItem(item)
    setIsDeleteConfirmOpen(true)
  }

  const handleSave = async () => {
    if (!name.trim()) return
    const updates = {
      name: name.trim(),
      memo: memo.trim() || undefined,
      linkedAssetItemId: linkedAssetItemId || undefined,
    }
    if (editingItem?.id) {
      await updatePaymentMethodItem(editingItem.id, updates)
    } else {
      await addPaymentMethodItem({ type: editingType, ...updates })
    }
    setIsDialogOpen(false)
  }

  const showAssetLink = editingType === 'bank_transfer' || editingType === 'loan'
  const linkableItems = editingType === 'bank_transfer' ? assetTypeItems : liabilityTypeItems
  const linkLabel = editingType === 'bank_transfer' ? '연결 자산 항목' : '연결 부채 항목'

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
      case 'loan': return '예: 주택담보대출, 신용대출'
      case 'other': return '예: 페이, 포인트'
      default: return '이름 입력'
    }
  }

  return (
    <div>
      <h3 className="text-body3-semi text-heading mb-3">거래수단 관리</h3>
      <p className="text-caption text-sub mb-4">
        자주 사용하는 카드나 계좌를 등록하면 거래 기록 시 빠르게 선택할 수 있습니다.
      </p>

      <div className="space-y-5">
        {PAYMENT_METHOD_GROUPS.map(group => {
          const items = paymentMethodItems.filter(i => i.type === group.type)
          return (
            <div key={group.type}>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-caption text-sub uppercase tracking-wider">
                  {group.label}
                </h4>
                <button
                  onClick={() => openCreate(group.type)}
                  className="flex items-center gap-1 text-caption text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
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
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-surface-secondary group"
                    >
                      <span className="flex-1 text-sm text-heading">
                        {item.name}
                        {item.memo && (
                          <span className="ml-2 text-caption text-disabled">({item.memo})</span>
                        )}
                        {item.linkedAssetItemId && (
                          <span className="ml-2 text-caption text-primary-500 dark:text-primary-400 inline-flex items-center gap-0.5">
                            <Link2 className="w-3 h-3" />
                            {assetItems.find((a) => a.id === item.linkedAssetItemId)?.name || '연결됨'}
                          </span>
                        )}
                      </span>
                      <button
                        onClick={() => openEdit(item)}
                        className="p-1.5 rounded-md text-disabled hover:text-body hover:bg-[var(--hover-bg)] opacity-0 group-hover:opacity-100 transition-all"
                        aria-label="수정"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => openDelete(item)}
                        className="p-1.5 rounded-md text-disabled hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-all"
                        aria-label="삭제"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-caption text-disabled px-3 py-2">
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
              <label className="block text-body3 text-body mb-1.5">이름</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={getPlaceholder(editingType)}
                className="input-base"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-body3 text-body mb-1.5">메모 (선택)</label>
              <input
                type="text"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="메모 입력"
                className="input-base"
              />
            </div>
            {showAssetLink && linkableItems.length > 0 && (
              <div>
                <label className="block text-body3 text-body mb-1.5">{linkLabel} (선택)</label>
                <Select
                  value={String(linkedAssetItemId ?? '')}
                  onChange={(v) => setLinkedAssetItemId(v ? Number(v) : undefined)}
                  options={linkableItems.map(item => ({ value: String(item.id), label: item.name }))}
                  placeholder="연결 안 함"
                />
              </div>
            )}
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
          <p className="text-sm text-sub">
            <span className="font-medium text-heading">{deletingItem?.name}</span>을(를) 삭제하시겠습니까?
          </p>
          <p className="mt-2 text-caption text-sub">
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
