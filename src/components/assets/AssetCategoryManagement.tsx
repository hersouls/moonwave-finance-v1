import { useState } from 'react'
import { Plus, Pencil, Trash2, ArrowLeft, AlertTriangle, GripVertical, Tag, Palette, Shapes } from 'lucide-react'
import { clsx } from 'clsx'
import { Dialog, DialogHeader, DialogBody, DialogFooter } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { FormSectionLabel, SegmentedControl } from '@/components/ui/CreateFormPrimitives'
import { useUIStore } from '@/stores/uiStore'
import { useAssetStore } from '@/stores/assetStore'
import { useToastStore } from '@/stores/toastStore'
import { getCategoryIcon } from '@/utils/categoryIcons'
import type { AssetCategory, AssetLiabilityType } from '@/lib/types'

const PRESET_COLORS = [
  '#EF4444', '#F97316', '#F59E0B', '#EAB308',
  '#84CC16', '#22C55E', '#10B981', '#14B8A6',
  '#06B6D4', '#0EA5E9', '#3B82F6', '#6366F1',
  '#8B5CF6', '#A855F7', '#D946EF', '#EC4899',
  '#F43F5E', '#D97706', '#71717A', '#475569',
]

const ICON_OPTIONS = [
  'PiggyBank', 'Landmark', 'Building2', 'TrendingUp', 'LineChart', 'Bitcoin',
  'Coins', 'Gem', 'Home', 'Wallet', 'Banknote', 'DollarSign',
  'Briefcase', 'Car', 'Package', 'Shield', 'CreditCard', 'Building',
  'Users', 'MinusCircle', 'Receipt', 'Plane',
]

type Mode = 'list' | 'form' | 'delete'

export function AssetCategoryManagement() {
  const isOpen = useUIStore((s) => s.isAssetCategoryManagerOpen)
  const close = useUIStore((s) => s.closeAssetCategoryManager)

  const categories = useAssetStore((s) => s.categories)
  const items = useAssetStore((s) => s.items)
  const addCategory = useAssetStore((s) => s.addCategory)
  const updateCategory = useAssetStore((s) => s.updateCategory)
  const deleteCategory = useAssetStore((s) => s.deleteCategory)

  const [mode, setMode] = useState<Mode>('list')
  const [activeType, setActiveType] = useState<AssetLiabilityType>('asset')
  const [editing, setEditing] = useState<AssetCategory | null>(null)
  const [deleting, setDeleting] = useState<AssetCategory | null>(null)
  const [busy, setBusy] = useState(false)

  // Form state
  const [name, setName] = useState('')
  const [color, setColor] = useState(PRESET_COLORS[0])
  const [icon, setIcon] = useState<string>('PiggyBank')

  const filtered = categories.filter((c) => c.type === activeType).sort((a, b) => a.sortOrder - b.sortOrder)
  const itemCount = (catId: string) => items.filter((i) => i.categoryId === catId && i.isActive).length

  const reset = () => { setMode('list'); setEditing(null); setDeleting(null) }
  const handleClose = () => { if (busy) return; reset(); close() }

  const openCreate = () => {
    setEditing(null)
    setName(''); setColor(PRESET_COLORS[0]); setIcon(activeType === 'asset' ? 'PiggyBank' : 'CreditCard')
    setMode('form')
  }
  const openEdit = (cat: AssetCategory) => {
    setEditing(cat)
    setName(cat.name); setColor(cat.color); setIcon(cat.icon || 'PiggyBank')
    setMode('form')
  }
  const openDelete = (cat: AssetCategory) => { setDeleting(cat); setMode('delete') }

  const handleSave = async () => {
    if (!name.trim()) return
    setBusy(true)
    try {
      if (editing?.id) {
        await updateCategory(editing.id, { name: name.trim(), color, icon })
        useToastStore.getState().addToast('카테고리가 수정되었습니다.', 'success')
      } else {
        await addCategory(name.trim(), activeType, color, icon)
        useToastStore.getState().addToast('카테고리가 추가되었습니다.', 'success')
      }
      reset()
    } catch {
      useToastStore.getState().addToast('저장에 실패했습니다.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    if (!deleting?.id) return
    setBusy(true)
    try {
      await deleteCategory(deleting.id)
      reset()
    } finally {
      setBusy(false)
    }
  }

  const headerTitle = mode === 'form'
    ? (editing ? '카테고리 수정' : '카테고리 추가')
    : mode === 'delete' ? '카테고리 삭제'
    : '자산 카테고리 관리'

  return (
    <Dialog open={isOpen} onClose={handleClose} size="md">
      <DialogHeader title={headerTitle} onClose={handleClose} />
      <DialogBody>
        {mode === 'list' && (
          <>
            {/* Type tabs */}
            <div className="mb-4">
              <SegmentedControl<AssetLiabilityType>
                layoutId="asset-cat-type"
                ariaLabel="자산/부채 유형"
                value={activeType}
                onChange={setActiveType}
                options={[
                  { value: 'asset', label: '자산' },
                  { value: 'liability', label: '부채' },
                ]}
              />
            </div>

            {/* Category list */}
            {filtered.length === 0 ? (
              <p className="py-8 text-center text-body3 text-sub">카테고리가 없습니다. 아래에서 추가하세요.</p>
            ) : (
              <ul className="space-y-1.5">
                {filtered.map((cat) => {
                  const Icon = getCategoryIcon(cat.icon)
                  const n = itemCount(cat.id)
                  return (
                    <li key={cat.id} className="group flex items-center gap-3 rounded-lg bg-surface-secondary px-3 py-2.5 ring-1 ring-base">
                      <GripVertical className="h-4 w-4 flex-shrink-0 text-disabled" aria-hidden="true" />
                      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `color-mix(in srgb, ${cat.color} 16%, transparent)` }}>
                        <Icon className="h-4 w-4" style={{ color: cat.color }} aria-hidden="true" />
                      </span>
                      <span className="flex-1 truncate text-body3 text-heading">{cat.name}</span>
                      {n > 0 && <span className="flex-shrink-0 text-caption text-disabled">{n}개</span>}
                      <button onClick={() => openEdit(cat)} className="touch-target-inset rounded-md p-1.5 text-disabled transition-all hover:bg-[var(--hover-bg)] hover:text-body" aria-label="수정">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => openDelete(cat)} className="touch-target-inset rounded-md p-1.5 text-disabled transition-all hover:bg-status-danger-soft hover:text-status-danger" aria-label="삭제">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}

            <button onClick={openCreate} className="mt-3 inline-flex items-center gap-1.5 text-body3 text-accent-primary transition-colors hover:opacity-80">
              <Plus className="h-4 w-4" />
              {activeType === 'asset' ? '자산' : '부채'} 카테고리 추가
            </button>
          </>
        )}

        {mode === 'form' && (
          <div className="space-y-4">
            <div>
              <FormSectionLabel icon={Tag} htmlFor="asset-cat-name">이름</FormSectionLabel>
              <input id="asset-cat-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 연금저축" className="input-base" autoFocus />
            </div>
            <div>
              <FormSectionLabel icon={Palette}>색상</FormSectionLabel>
              <div className="grid grid-cols-8 justify-items-center gap-2 sm:grid-cols-10">
                {PRESET_COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setColor(c)} aria-label={c}
                    className={clsx('touch-target-inset h-7 w-7 rounded-full transition-all', color === c ? 'ring-2 ring-primary-500 ring-offset-2 ring-offset-[var(--surface-primary)]' : 'hover:scale-110')}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
            <div>
              <FormSectionLabel icon={Shapes}>아이콘</FormSectionLabel>
              <div className="grid grid-cols-8 justify-items-center gap-2 sm:grid-cols-11">
                {ICON_OPTIONS.map((nm) => {
                  const Icon = getCategoryIcon(nm)
                  const sel = icon === nm
                  return (
                    <button key={nm} type="button" onClick={() => setIcon(nm)} aria-label={nm}
                      className={clsx('touch-target-inset flex h-8 w-8 items-center justify-center rounded-lg transition-all', sel ? 'text-white' : 'bg-surface-tertiary text-sub hover:text-heading')}
                      style={sel ? { backgroundColor: color } : undefined}>
                      <Icon className="h-4 w-4" />
                    </button>
                  )
                })}
              </div>
            </div>
            {/* Live preview */}
            <div className="flex items-center gap-2 rounded-lg bg-surface-secondary px-3 py-2.5 ring-1 ring-base">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)` }}>
                {(() => { const I = getCategoryIcon(icon); return <I className="h-4 w-4" style={{ color }} /> })()}
              </span>
              <span className="text-body3 text-heading">{name || '미리보기'}</span>
            </div>
          </div>
        )}

        {mode === 'delete' && deleting && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: `color-mix(in srgb, ${deleting.color} 16%, transparent)` }}>
                {(() => { const I = getCategoryIcon(deleting.icon); return <I className="h-4 w-4" style={{ color: deleting.color }} /> })()}
              </span>
              <span className="text-body2 font-semibold text-heading">{deleting.name}</span>
            </div>
            {itemCount(deleting.id) > 0 ? (
              <div className="flex items-start gap-2 rounded-lg border border-status-danger bg-status-danger-soft px-3 py-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-status-danger" />
                <p className="text-body3 text-status-danger">
                  이 카테고리에 속한 <b>{itemCount(deleting.id)}개 항목</b>과 모든 가치 기록이 <b>함께 삭제</b>됩니다. 되돌릴 수 없습니다.
                </p>
              </div>
            ) : (
              <p className="rounded-lg bg-surface-secondary px-3 py-2.5 text-body3 text-sub">연결된 항목이 없어 안전하게 삭제할 수 있습니다.</p>
            )}
          </div>
        )}
      </DialogBody>

      <DialogFooter>
        {mode === 'list' ? (
          <Button variant="secondary" onClick={handleClose}>닫기</Button>
        ) : mode === 'form' ? (
          <>
            <Button variant="secondary" onClick={reset} leftIcon={<ArrowLeft className="h-4 w-4" />}>뒤로</Button>
            <Button variant="primary" onClick={handleSave} disabled={busy || !name.trim()}>{busy ? '저장 중…' : editing ? '수정' : '추가'}</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={reset} disabled={busy}>취소</Button>
            <Button variant="danger" onClick={handleDelete} disabled={busy}>{busy ? '삭제 중…' : '삭제'}</Button>
          </>
        )}
      </DialogFooter>
    </Dialog>
  )
}
