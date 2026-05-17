import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, AlertTriangle, Receipt, Wallet, Repeat, CreditCard } from 'lucide-react'
import { Dialog, DialogHeader, DialogBody, DialogFooter } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { useTransactionStore } from '@/stores/transactionStore'
import { clsx } from 'clsx'
import type { TransactionType, TransactionCategory } from '@/lib/types'
import { getTransactionCategoryUsage, type TransactionCategoryUsage } from '@/services/database'
import { formatKRW } from '@/utils/format'

const PRESET_COLORS = [
  '#EF4444', '#F97316', '#F59E0B', '#EAB308',
  '#84CC16', '#22C55E', '#10B981', '#14B8A6',
  '#06B6D4', '#0EA5E9', '#3B82F6', '#6366F1',
  '#8B5CF6', '#A855F7', '#D946EF', '#EC4899',
  '#F43F5E', '#71717A',
]

export function CategoryManagement() {
  const categories = useTransactionStore((s) => s.categories)
  const addCategory = useTransactionStore((s) => s.addCategory)
  const updateCategory = useTransactionStore((s) => s.updateCategory)
  const deleteCategory = useTransactionStore((s) => s.deleteCategory)
  const loadCategories = useTransactionStore((s) => s.loadCategories)

  const [activeType, setActiveType] = useState<TransactionType>('expense')
  const [editingCategory, setEditingCategory] = useState<TransactionCategory | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [deletingCategory, setDeletingCategory] = useState<TransactionCategory | null>(null)
  const [usage, setUsage] = useState<TransactionCategoryUsage | null>(null)
  const [isUsageLoading, setIsUsageLoading] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Form state
  const [name, setName] = useState('')
  const [color, setColor] = useState(PRESET_COLORS[0])

  useEffect(() => {
    loadCategories()
  }, [loadCategories])

  const filtered = categories.filter(c => c.type === activeType)

  const openCreate = () => {
    setEditingCategory(null)
    setName('')
    setColor(PRESET_COLORS[0])
    setIsDialogOpen(true)
  }

  const openEdit = (cat: TransactionCategory) => {
    setEditingCategory(cat)
    setName(cat.name)
    setColor(cat.color)
    setIsDialogOpen(true)
  }

  const openDelete = async (cat: TransactionCategory) => {
    setDeletingCategory(cat)
    setUsage(null)
    setIsDeleteConfirmOpen(true)
    if (!cat.id) return
    setIsUsageLoading(true)
    try {
      const result = await getTransactionCategoryUsage(cat.id)
      setUsage(result)
    } catch (err) {
      console.error('Failed to load category usage:', err)
    } finally {
      setIsUsageLoading(false)
    }
  }

  const closeDelete = () => {
    if (isDeleting) return
    setIsDeleteConfirmOpen(false)
    setDeletingCategory(null)
    setUsage(null)
  }

  const handleSave = async () => {
    if (!name.trim()) return
    if (editingCategory?.id) {
      await updateCategory(editingCategory.id, { name: name.trim(), color })
    } else {
      await addCategory({ name: name.trim(), type: activeType, color })
    }
    setIsDialogOpen(false)
  }

  const handleDelete = async () => {
    if (!deletingCategory?.id) return
    setIsDeleting(true)
    try {
      await deleteCategory(deletingCategory.id)
      setIsDeleteConfirmOpen(false)
      setDeletingCategory(null)
      setUsage(null)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div>
      <h3 className="text-body3-semi text-heading mb-3">카테고리 관리</h3>

      {/* Type tabs */}
      <div className="flex gap-2 mb-4">
        {(['expense', 'income'] as const).map(t => (
          <button
            key={t}
            onClick={() => setActiveType(t)}
            className={clsx(
              'px-4 py-1.5 rounded-lg text-body3 transition-colors',
              activeType === t
                ? t === 'expense'
                  ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                : 'bg-surface-tertiary text-sub'
            )}
          >
            {t === 'expense' ? '지출' : '수입'}
          </button>
        ))}
      </div>

      {/* Category list */}
      <div className="space-y-1.5">
        {filtered.map(cat => (
          <div
            key={cat.id}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-surface-secondary group"
          >
            <div
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: cat.color }}
            />
            <span className="flex-1 text-sm text-heading">{cat.name}</span>
            <button
              onClick={() => openEdit(cat)}
              className="p-1.5 rounded-md text-disabled hover:text-body hover:bg-[var(--hover-bg)] opacity-0 group-hover:opacity-100 transition-all"
              aria-label="수정"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => openDelete(cat)}
              className="p-1.5 rounded-md text-disabled hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-all"
              aria-label="삭제"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Add button */}
      <button
        onClick={openCreate}
        className="mt-3 flex items-center gap-1.5 text-body3 text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
      >
        <Plus className="w-4 h-4" />
        카테고리 추가
      </button>

      {/* Edit/Create Dialog */}
      <Dialog open={isDialogOpen} onClose={() => setIsDialogOpen(false)} size="sm">
        <DialogHeader
          title={editingCategory ? '카테고리 수정' : '카테고리 추가'}
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
                placeholder="카테고리 이름"
                className="input-base"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-body3 text-body mb-1.5">색상</label>
              <div className="grid grid-cols-9 gap-2">
                {PRESET_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={clsx(
                      'w-7 h-7 rounded-full transition-all',
                      color === c ? 'ring-2 ring-offset-2 ring-primary-500 dark:ring-offset-[var(--surface-primary)]' : 'hover:scale-110'
                    )}
                    style={{ backgroundColor: c }}
                    aria-label={c}
                  />
                ))}
              </div>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setIsDialogOpen(false)}>취소</Button>
          <Button variant="primary" onClick={handleSave} disabled={!name.trim()}>
            {editingCategory ? '수정' : '추가'}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteConfirmOpen} onClose={closeDelete} size="sm">
        <DialogHeader title="카테고리 삭제" onClose={closeDelete} />
        <DialogBody>
          <div className="flex items-center gap-2 mb-3">
            <div
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: deletingCategory?.color }}
            />
            <p className="text-sm text-sub">
              <span className="font-medium text-heading">{deletingCategory?.name}</span>
              {' '}카테고리에 포함된 정보입니다.
            </p>
          </div>

          {isUsageLoading && (
            <div className="py-6 text-center text-caption text-sub">사용 정보를 불러오는 중…</div>
          )}

          {!isUsageLoading && usage && (
            <div className="space-y-2.5">
              {/* Summary cards */}
              <div className="grid grid-cols-2 gap-2">
                <UsageStat
                  icon={<Receipt className="w-3.5 h-3.5" />}
                  label="거래"
                  value={`${usage.transactionCount}건`}
                  sub={usage.transactionCount > 0 ? formatKRW(usage.transactionTotal) : undefined}
                />
                <UsageStat
                  icon={<Wallet className="w-3.5 h-3.5" />}
                  label="예산"
                  value={`${usage.budgetCount}건`}
                  sub={usage.budgetMonths.length > 0 ? `최근 ${usage.budgetMonths[0]}` : undefined}
                />
                <UsageStat
                  icon={<Repeat className="w-3.5 h-3.5" />}
                  label="반복 거래"
                  value={`${usage.recurringSourceCount}건`}
                />
                <UsageStat
                  icon={<CreditCard className="w-3.5 h-3.5" />}
                  label="연결 구독"
                  value={`${usage.linkedSubscriptions.length}건`}
                  sub={usage.linkedSubscriptions[0]?.name}
                />
              </div>

              {/* Income / Expense split when both exist */}
              {usage.transactionCount > 0 && usage.incomeCount > 0 && usage.expenseCount > 0 && (
                <div className="flex gap-2 text-caption">
                  <span className="value-positive">수입 {usage.incomeCount}건 · {formatKRW(usage.incomeTotal)}</span>
                  <span className="text-disabled">|</span>
                  <span className="value-negative">지출 {usage.expenseCount}건 · {formatKRW(usage.expenseTotal)}</span>
                </div>
              )}

              {/* Recent transactions preview */}
              {usage.recentTransactions.length > 0 && (
                <div className="rounded-lg bg-surface-secondary px-3 py-2">
                  <div className="text-caption text-sub mb-1.5">최근 거래</div>
                  <ul className="space-y-1">
                    {usage.recentTransactions.map(t => (
                      <li key={t.id} className="flex items-center gap-2 text-caption">
                        <span className="text-disabled tabular-nums shrink-0">{t.date.slice(5)}</span>
                        <span className="flex-1 truncate text-body">{t.memo || '(메모 없음)'}</span>
                        <span className={clsx('tabular-nums shrink-0', t.type === 'income' ? 'value-positive' : 'value-negative')}>
                          {t.type === 'income' ? '+' : '-'}{formatKRW(t.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Linked subscription warning */}
              {usage.linkedSubscriptions.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <div className="text-caption text-amber-700 dark:text-amber-300">
                    구독 <span className="font-medium">{usage.linkedSubscriptions.map(s => s.name).join(', ')}</span>의 연결 카테고리가 해제됩니다.
                  </div>
                </div>
              )}

              {/* Result summary */}
              <div className="rounded-lg bg-surface-secondary px-3 py-2 text-caption text-sub">
                {usage.transactionCount === 0 && usage.budgetCount === 0 && usage.linkedSubscriptions.length === 0 ? (
                  <span>이 카테고리에 연결된 데이터가 없어 안전하게 삭제할 수 있습니다.</span>
                ) : (
                  <ul className="space-y-0.5 list-disc list-inside">
                    {usage.transactionCount > 0 && <li>거래 {usage.transactionCount}건은 <span className="text-heading font-medium">미분류</span>로 변경됩니다.</li>}
                    {usage.budgetCount > 0 && <li>이 카테고리에 설정된 <span className="text-heading font-medium">예산 {usage.budgetCount}건</span>은 함께 삭제되지 않으니 예산관리에서 확인하세요.</li>}
                    {usage.linkedSubscriptions.length > 0 && <li>연결된 구독은 카테고리 연결이 해제됩니다.</li>}
                  </ul>
                )}
              </div>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={closeDelete} disabled={isDeleting}>취소</Button>
          <Button variant="danger" onClick={handleDelete} disabled={isDeleting || isUsageLoading}>
            {isDeleting ? '삭제 중…' : '삭제'}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  )
}

function UsageStat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-surface-secondary px-3 py-2">
      <div className="flex items-center gap-1.5 text-caption text-sub mb-0.5">
        {icon}
        {label}
      </div>
      <div className="text-sm font-medium text-heading tabular-nums">{value}</div>
      {sub && <div className="text-caption text-disabled truncate">{sub}</div>}
    </div>
  )
}
