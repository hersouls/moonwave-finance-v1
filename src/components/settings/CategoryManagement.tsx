import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { Dialog, DialogHeader, DialogBody, DialogFooter } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { useTransactionStore } from '@/stores/transactionStore'
import { clsx } from 'clsx'
import type { TransactionType, TransactionCategory } from '@/lib/types'

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

  const openDelete = (cat: TransactionCategory) => {
    setDeletingCategory(cat)
    setIsDeleteConfirmOpen(true)
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
    if (deletingCategory?.id) {
      await deleteCategory(deletingCategory.id)
    }
    setIsDeleteConfirmOpen(false)
    setDeletingCategory(null)
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3">카테고리 관리</h3>

      {/* Type tabs */}
      <div className="flex gap-2 mb-4">
        {(['expense', 'income'] as const).map(t => (
          <button
            key={t}
            onClick={() => setActiveType(t)}
            className={clsx(
              'px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
              activeType === t
                ? t === 'expense'
                  ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
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
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 group"
          >
            <div
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: cat.color }}
            />
            <span className="flex-1 text-sm text-zinc-900 dark:text-zinc-100">{cat.name}</span>
            <button
              onClick={() => openEdit(cat)}
              className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 opacity-0 group-hover:opacity-100 transition-all"
              aria-label="수정"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => openDelete(cat)}
              className="p-1.5 rounded-md text-zinc-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-all"
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
        className="mt-3 flex items-center gap-1.5 text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
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
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">이름</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="카테고리 이름"
                className="w-full px-3 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">색상</label>
              <div className="grid grid-cols-9 gap-2">
                {PRESET_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={clsx(
                      'w-7 h-7 rounded-full transition-all',
                      color === c ? 'ring-2 ring-offset-2 ring-primary-500 dark:ring-offset-zinc-900' : 'hover:scale-110'
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
      <Dialog open={isDeleteConfirmOpen} onClose={() => setIsDeleteConfirmOpen(false)} size="sm">
        <DialogHeader title="카테고리 삭제" onClose={() => setIsDeleteConfirmOpen(false)} />
        <DialogBody>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            <span className="font-medium text-zinc-900 dark:text-zinc-100">{deletingCategory?.name}</span>을(를) 삭제하시겠습니까?
          </p>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
            이 카테고리의 거래는 '미분류'로 변경됩니다.
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
