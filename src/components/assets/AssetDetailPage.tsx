import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAssetStore } from '@/stores/assetStore'
import { useDailyValueStore } from '@/stores/dailyValueStore'
import { useMemberStore } from '@/stores/memberStore'
import { IconButton, Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { formatKRW, formatChange } from '@/utils/format'
import { getMonthDates, formatMonthLabel, getPreviousMonth, getNextMonth } from '@/lib/dateUtils'
import { clsx } from 'clsx'
import { UI_DELAYS } from '@/utils/constants'

export function AssetDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const itemId = Number(id)

  const [isLoading, setIsLoading] = useState(true)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [editingCell, setEditingCell] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const loadAll = useAssetStore((s) => s.loadAll)
  const loadMembers = useMemberStore((s) => s.loadMembers)
  const items = useAssetStore((s) => s.items)
  const categories = useAssetStore((s) => s.categories)
  const members = useMemberStore((s) => s.members)
  const deleteItem = useAssetStore((s) => s.deleteItem)

  const values = useDailyValueStore((s) => s.values)
  const selectedMonth = useDailyValueStore((s) => s.selectedMonth)
  const setSelectedMonth = useDailyValueStore((s) => s.setSelectedMonth)
  const loadValues = useDailyValueStore((s) => s.loadValues)
  const setValue = useDailyValueStore((s) => s.setValue)

  const item = items.find(i => i.id === itemId)
  const category = item ? categories.find(c => c.id === item.categoryId) : null
  const member = item ? members.find(m => m.id === item.memberId) : null
  const dates = getMonthDates(selectedMonth)

  useEffect(() => {
    const init = async () => {
      await Promise.all([loadAll(), loadValues(), loadMembers()])
      setIsLoading(false)
    }
    init()
  }, [])

  const handleCellClick = useCallback((date: string) => {
    const key = `${itemId}-${date}`
    const val = values.find(v => v.assetItemId === itemId && v.date === date)
    setEditingCell(key)
    setEditValue(val ? String(val.value) : '')
    setTimeout(() => inputRef.current?.focus(), UI_DELAYS.NAV)
  }, [itemId, values])

  const handleCellSave = useCallback(async (date: string) => {
    const numVal = Number(editValue.replace(/,/g, ''))
    if (!isNaN(numVal)) {
      await setValue(itemId, date, numVal)
    }
    setEditingCell(null)
    setEditValue('')
  }, [editValue, itemId, setValue])

  const handleKeyDown = useCallback((e: React.KeyboardEvent, date: string, dateIndex: number) => {
    if (e.key === 'Enter') {
      handleCellSave(date)
      // Move to next day
      if (dateIndex < dates.length - 1) {
        setTimeout(() => handleCellClick(dates[dateIndex + 1]), UI_DELAYS.NAV)
      }
    } else if (e.key === 'Escape') {
      setEditingCell(null)
      setEditValue('')
    } else if (e.key === 'Tab') {
      e.preventDefault()
      handleCellSave(date)
      if (e.shiftKey && dateIndex > 0) {
        setTimeout(() => handleCellClick(dates[dateIndex - 1]), UI_DELAYS.NAV)
      } else if (!e.shiftKey && dateIndex < dates.length - 1) {
        setTimeout(() => handleCellClick(dates[dateIndex + 1]), UI_DELAYS.NAV)
      }
    }
  }, [handleCellSave, handleCellClick, dates])

  const handleDelete = async () => {
    const targetPath = item?.type === 'liability' ? '/liabilities' : '/assets'
    await deleteItem(itemId)
    navigate(targetPath)
  }

  if (isLoading) {
    return (
      <div className="p-4 lg:p-6 animate-pulse space-y-4">
        <div className="h-8 w-48 bg-zinc-200 dark:bg-zinc-700 rounded" />
        <div className="h-64 bg-zinc-200 dark:bg-zinc-700 rounded-xl" />
      </div>
    )
  }

  if (!item) {
    return (
      <div className="p-4 lg:p-6">
        <p className="text-zinc-500 dark:text-zinc-400">항목을 찾을 수 없습니다.</p>
        <Button variant="secondary" onClick={() => navigate(-1)} className="mt-4">
          돌아가기
        </Button>
      </div>
    )
  }

  // Get latest value and previous
  const itemValues = values
    .filter(v => v.assetItemId === itemId)
    .sort((a, b) => b.date.localeCompare(a.date))
  const latestValue = itemValues[0]?.value || 0
  const prevValue = itemValues[1]?.value || latestValue

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <IconButton onClick={() => navigate(-1)} plain>
            <ArrowLeft className="w-5 h-5" />
          </IconButton>
          <div>
            <div className="flex items-center gap-2">
              {category && (
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: category.color }} />
              )}
              <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{item.name}</h1>
            </div>
            <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
              {category && <span>{category.name}</span>}
              {member && (
                <>
                  <span className="text-zinc-300 dark:text-zinc-600">·</span>
                  <span>{member.name}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <IconButton onClick={() => setShowDeleteConfirm(true)} color="danger" plain>
          <Trash2 className="w-5 h-5" />
        </IconButton>
      </div>

      {/* Current Value Summary */}
      <Card className="!p-5">
        <span className="text-sm text-zinc-500 dark:text-zinc-400">현재 가치</span>
        <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums mt-1">
          {formatKRW(latestValue)}
        </p>
        {latestValue !== prevValue && (
          <p className={clsx(
            'text-sm tabular-nums mt-1',
            latestValue > prevValue ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
          )}>
            {formatChange(latestValue - prevValue)}
          </p>
        )}
        {item.memo && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2">{item.memo}</p>
        )}
      </Card>

      {/* Monthly Value Grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <IconButton onClick={() => setSelectedMonth(getPreviousMonth(selectedMonth))} plain size="sm">
            <ChevronLeft className="w-5 h-5" />
          </IconButton>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {formatMonthLabel(selectedMonth)}
          </h3>
          <IconButton onClick={() => setSelectedMonth(getNextMonth(selectedMonth))} plain size="sm">
            <ChevronRight className="w-5 h-5" />
          </IconButton>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="grid grid-cols-1 divide-y divide-zinc-100 dark:divide-zinc-800">
            {dates.map((date, idx) => {
              const val = values.find(v => v.assetItemId === itemId && v.date === date)
              const prevDayVal = idx > 0
                ? values.find(v => v.assetItemId === itemId && v.date === dates[idx - 1])
                : null
              const change = val && prevDayVal ? val.value - prevDayVal.value : 0
              const day = new Date(date).getDate()
              const isEditing = editingCell === `${itemId}-${date}`

              return (
                <div
                  key={date}
                  className="flex items-center px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer"
                  onClick={() => !isEditing && handleCellClick(date)}
                >
                  <span className="w-10 text-sm text-zinc-500 dark:text-zinc-400 tabular-nums">
                    {day}일
                  </span>
                  <div className="flex-1">
                    {isEditing ? (
                      <input
                        ref={inputRef}
                        type="text"
                        inputMode="numeric"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => handleCellSave(date)}
                        onKeyDown={(e) => handleKeyDown(e, date, idx)}
                        className="w-full px-2 py-1 rounded border border-primary-400 dark:border-primary-600 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 tabular-nums focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    ) : (
                      <span className={clsx(
                        'text-sm tabular-nums',
                        val ? 'text-zinc-900 dark:text-zinc-100 font-medium' : 'text-zinc-300 dark:text-zinc-600'
                      )}>
                        {val ? formatKRW(val.value) : '-'}
                      </span>
                    )}
                  </div>
                  {change !== 0 && !isEditing && (
                    <span className={clsx(
                      'text-xs tabular-nums ml-2',
                      change > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                    )}>
                      {formatChange(change)}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title={`${item.name} 삭제`}
        description="이 항목과 관련된 모든 일별 가치 데이터가 삭제됩니다. 이 작업은 되돌릴 수 없습니다."
        confirmText="삭제"
        variant="danger"
      />
    </div>
  )
}
