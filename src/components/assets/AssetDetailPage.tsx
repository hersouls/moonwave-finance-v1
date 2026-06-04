import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Pencil, Trash2, ChevronLeft, ChevronRight, RefreshCw, Plus, TrendingUp, TrendingDown } from 'lucide-react'
import { useAssetStore } from '@/stores/assetStore'
import { useDailyValueStore } from '@/stores/dailyValueStore'
import { useMemberStore } from '@/stores/memberStore'
import { IconButton, Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { formatKRW, formatChange } from '@/utils/format'
import { Amount } from '@/components/ui/Amount'
import { Sparkline } from '@/components/ui/Sparkline'
import { getMonthDates, formatMonthLabel, getPreviousMonth, getNextMonth, getCurrentMonthString, getTodayString } from '@/lib/dateUtils'
import { latestAndPrev, valueAsOf } from '@/services/assetAnalytics'
import { getPositiveColor, getNegativeColor } from '@/lib/chartConfig'
import { clsx } from 'clsx'
import { format } from 'date-fns'
import { UI_DELAYS } from '@/utils/constants'
import { useSyncListener } from '@/hooks/useSyncListener'
import { useUIStore } from '@/stores/uiStore'
import { useToastStore } from '@/stores/toastStore'
import { AssetEditModal } from '@/components/assets/AssetEditModal'
import { calculateSeverancePay, generateSeverancePayValues, calculateSeveranceTax, getServiceYears } from '@/services/assetAnalytics'

export function AssetDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const itemId = Number(id)

  const [isLoading, setIsLoading] = useState(true)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [editingCell, setEditingCell] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Severance pay recalculation state
  const [sevJoinDate, setSevJoinDate] = useState('')
  const [sevWageStr, setSevWageStr] = useState('')
  const [sevEstimated, setSevEstimated] = useState(0)
  const [sevRecalculating, setSevRecalculating] = useState(false)

  const loadAll = useAssetStore((s) => s.loadAll)
  const loadMembers = useMemberStore((s) => s.loadMembers)
  const items = useAssetStore((s) => s.items)
  const categories = useAssetStore((s) => s.categories)
  const members = useMemberStore((s) => s.members)
  const deleteItem = useAssetStore((s) => s.deleteItem)
  const openAssetEditModal = useUIStore((s) => s.openAssetEditModal)

  const values = useDailyValueStore((s) => s.values)
  const allValues = useDailyValueStore((s) => s.allValues)
  const selectedMonth = useDailyValueStore((s) => s.selectedMonth)
  const setSelectedMonth = useDailyValueStore((s) => s.setSelectedMonth)
  const loadValues = useDailyValueStore((s) => s.loadValues)
  const loadAllValues = useDailyValueStore((s) => s.loadAllValues)

  const item = items.find(i => i.id === itemId)
  const category = item ? categories.find(c => c.id === item.categoryId) : null
  const member = item ? members.find(m => m.id === item.memberId) : null
  const dates = getMonthDates(selectedMonth)
  const isSeverancePay = !!category && category.name.includes('퇴직금')

  const loadData = async () => {
    await Promise.all([loadAll(), loadValues(), loadAllValues(), loadMembers()])
    setIsLoading(false)
  }

  useEffect(() => { loadData() }, [])
  useSyncListener(loadData, ['assetCategories', 'assetItems', 'dailyValues', 'members'])

  // Live preview of severance pay amount
  useEffect(() => {
    if (!isSeverancePay) return
    const wage = Number(sevWageStr.replace(/[^0-9]/g, ''))
    if (sevJoinDate && wage > 0) {
      setSevEstimated(calculateSeverancePay(sevJoinDate, wage, format(new Date(), 'yyyy-MM-dd')))
    } else {
      setSevEstimated(0)
    }
  }, [sevJoinDate, sevWageStr, isSeverancePay])

  const handleSeveranceRecalc = async () => {
    const wage = Number(sevWageStr.replace(/[^0-9]/g, ''))
    if (!sevJoinDate || wage <= 0) return
    setSevRecalculating(true)
    try {
      const today = format(new Date(), 'yyyy-MM-dd')
      const newValues = generateSeverancePayValues(itemId, sevJoinDate, wage, today)
      if (newValues.length > 0) {
        await useDailyValueStore.getState().bulkSetValues(
          newValues.map(v => ({ ...v, assetItemId: itemId }))
        )
        await loadValues()
      }
      useToastStore.getState().addToast('퇴직금이 재계산되었습니다.', 'success')
    } catch {
      useToastStore.getState().addToast('재계산에 실패했습니다.', 'error')
    } finally {
      setSevRecalculating(false)
    }
  }

  const handleCellClick = useCallback((date: string) => {
    const key = `${itemId}-${date}`
    const all = useDailyValueStore.getState().allValues.filter(v => v.assetItemId === itemId)
    const rec = all.find(v => v.date === date)
    // 이월(forward-fill) 값으로 프리필 — 빈 칸이 아니라 현재 유효값에서 편집 시작
    const series = [...all].sort((a, b) => b.date.localeCompare(a.date))
    const eff = rec ? rec.value : valueAsOf(series, date)
    setEditingCell(key)
    setEditValue(eff > 0 ? String(eff) : '')
    setTimeout(() => inputRef.current?.focus(), UI_DELAYS.NAV)
  }, [itemId])

  const handleCellSave = useCallback(async (date: string) => {
    const numVal = Number(editValue.replace(/,/g, ''))
    if (!isNaN(numVal)) {
      const dv = useDailyValueStore.getState()
      // 최신 수동 기록일
      const latestManual = dv.allValues
        .filter(v => v.assetItemId === itemId && v.source === 'manual')
        .reduce((max, v) => (v.date > max ? v.date : max), '')
      if (!latestManual || date >= latestManual) {
        // 최신/당일 이후 편집 → v2 재투영(규칙 적용 + 미래 갱신)
        await dv.applyValueSeries(itemId, numVal, date, item?.projection)
      } else {
        // 과거 이력 보정 → 비파괴적 수동 앵커(신규 데이터/미래 투영 보존)
        await dv.bulkSetValues([{ assetItemId: itemId, date, value: numVal, source: 'manual' }])
      }
    }
    setEditingCell(null)
    setEditValue('')
  }, [editValue, itemId, item?.projection])

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
        <div className="h-8 w-48 bg-surface-secondary rounded" />
        <div className="h-64 bg-surface-secondary rounded-xl" />
      </div>
    )
  }

  if (!item) {
    return (
      <div className="p-4 lg:p-6">
        <p className="text-sub">항목을 찾을 수 없습니다.</p>
        <Button variant="secondary" onClick={() => navigate(-1)} className="mt-4">
          돌아가기
        </Button>
      </div>
    )
  }

  // 전체 이력에서 현재 가치/직전 값 산출 (이번 달 기록이 없어도 정확)
  const itemSeriesDesc = allValues
    .filter(v => v.assetItemId === itemId)
    .sort((a, b) => b.date.localeCompare(a.date))
  const { latest: latestValue, prev: prevValue } = latestAndPrev(itemSeriesDesc)
  const isLiability = item.type === 'liability'
  const diff = latestValue - prevValue
  // 부채는 감소가 긍정(green), 자산은 증가가 긍정.
  const diffIsGood = isLiability ? diff < 0 : diff > 0

  // 최근 90일 추이 (Forward-Fill)
  const today = getTodayString()
  const trendData: number[] = (() => {
    if (itemSeriesDesc.length === 0) return []
    const out: number[] = []
    for (let i = 89; i >= 0; i--) {
      // UTC 기준 — getTodayString()과 동일하게 맞춰 하루 어긋남 방지
      const d = new Date(today + 'T00:00:00Z')
      d.setUTCDate(d.getUTCDate() - i)
      out.push(valueAsOf(itemSeriesDesc, d.toISOString().split('T')[0]))
    }
    return out
  })()
  const hasTrend = trendData.some((v, i) => i > 0 && v !== trendData[0])

  const goToToday = () => {
    const curMonth = getCurrentMonthString()
    if (selectedMonth !== curMonth) setSelectedMonth(curMonth)
    setTimeout(() => handleCellClick(today), UI_DELAYS.NAV)
  }

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
              <h1 className="text-title1 text-heading">{item.name}</h1>
            </div>
            <div className="flex items-center gap-2 text-label3-medium text-sub">
              {category && <span>{category.name}</span>}
              {member && (
                <>
                  <span className="text-disabled">·</span>
                  <span>{member.name}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <IconButton onClick={() => openAssetEditModal(itemId)} plain>
            <Pencil className="w-5 h-5" />
          </IconButton>
          <IconButton onClick={() => setShowDeleteConfirm(true)} color="danger" plain>
            <Trash2 className="w-5 h-5" />
          </IconButton>
        </div>
      </div>

      {/* Current Value Summary */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 24, mass: 0.8 }}
      >
        <Card className="card-pad-lg el-card-elevated surface-inset-top">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="text-label2 text-sub">{isLiability ? '현재 잔액' : '현재 가치'}</span>
              <Amount
                as="p"
                value={latestValue}
                format="krw"
                size="title"
                className={clsx('mt-1 block', isLiability ? 'text-status-danger' : 'text-heading')}
              />
              {diff !== 0 && (
                <p className={clsx(
                  'inline-flex items-center gap-1 text-label3-medium tabular-nums mt-1',
                  diffIsGood ? 'text-status-success' : 'text-status-danger'
                )}>
                  {diff > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  {formatChange(diff)}
                </p>
              )}
            </div>
            {hasTrend && (
              <div className="flex-shrink-0 pt-1" aria-hidden="true">
                <Sparkline
                  data={trendData}
                  width={108}
                  height={44}
                  color={diffIsGood ? getPositiveColor() : getNegativeColor()}
                  strokeWidth={2}
                />
                <p className="text-caption text-disabled text-right mt-0.5">최근 90일</p>
              </div>
            )}
          </div>
          {item.memo && (
            <p className="text-body3 text-sub mt-3 pt-3 border-t border-base">{item.memo}</p>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={goToToday}
            className="mt-4 w-full"
          >
            <Plus className="w-4 h-4" />
            오늘 값 입력
          </Button>
        </Card>
      </motion.div>

      {/* Severance Pay Recalculation */}
      {isSeverancePay && (() => {
        const sevWage = Number(sevWageStr.replace(/[^0-9]/g, ''))
        const sevServiceYears = sevJoinDate && sevWage > 0 ? getServiceYears(sevJoinDate, format(new Date(), 'yyyy-MM-dd')) : 0
        const sevTax = sevEstimated > 0 ? calculateSeveranceTax(sevEstimated, sevServiceYears) : null
        return (
          <Card className="card-pad-lg space-y-4">
            <h3 className="text-title3 text-heading flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-sub" />
              퇴직금 재계산
            </h3>
            <p className="text-body3 text-sub leading-relaxed">
              입사일과 월 평균임금을 입력하면 입사일부터 오늘까지 일별 퇴직금을 다시 계산합니다.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-label2 text-sub mb-1.5">입사일</label>
                <input
                  type="date"
                  value={sevJoinDate}
                  onChange={(e) => setSevJoinDate(e.target.value)}
                  className="input-base"
                />
              </div>
              <div>
                <label className="block text-label2 text-sub mb-1.5">월 평균임금 (30일분)</label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={sevWageStr}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, '')
                      setSevWageStr(raw ? Number(raw).toLocaleString('ko-KR') : '')
                    }}
                    placeholder="0"
                    className="input-base text-right pr-8 tabular-nums"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-label3-medium text-disabled">원</span>
                </div>
                <p className="text-caption text-sub mt-1">최근 3개월 급여총액 / 해당 기간 총일수 x 30</p>
              </div>
              {sevEstimated > 0 && (
                <div className="pt-3 border-t border-base space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-body2 text-body">퇴직금 예상액</span>
                    <span className="text-title3 text-status-success tabular-nums">
                      {sevEstimated.toLocaleString('ko-KR')} <span className="text-label3-medium">원</span>
                    </span>
                  </div>
                  {sevTax && sevTax.totalTax > 0 && (
                    <>
                      <div className="flex justify-between items-center text-label3-medium leading-none">
                        <span className="text-sub">퇴직소득세</span>
                        <span className="text-sub tabular-nums">
                          -{sevTax.incomeTax.toLocaleString('ko-KR')}원
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-label3-medium leading-none">
                        <span className="text-sub">퇴직주민세</span>
                        <span className="text-sub tabular-nums">
                          -{sevTax.residentTax.toLocaleString('ko-KR')}원
                        </span>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-base">
                        <span className="text-body2 text-body">세후 예상 수령액</span>
                        <span className="text-title3 text-accent-primary tabular-nums">
                          {sevTax.netSeverance.toLocaleString('ko-KR')} <span className="text-label3-medium">원</span>
                        </span>
                      </div>
                    </>
                  )}
                </div>
              )}
              <Button
                variant="primary"
                size="sm"
                onClick={handleSeveranceRecalc}
                disabled={sevRecalculating || !sevJoinDate || !sevWageStr}
                className="w-full"
              >
                {sevRecalculating ? '재계산 중...' : '퇴직금 재계산'}
              </Button>
            </div>
          </Card>
        )
      })()}

      {/* Monthly Value Grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <IconButton onClick={() => setSelectedMonth(getPreviousMonth(selectedMonth))} plain size="sm">
            <ChevronLeft className="w-5 h-5" />
          </IconButton>
          <h3 className="text-title3 text-heading">
            {formatMonthLabel(selectedMonth)}
          </h3>
          <IconButton onClick={() => setSelectedMonth(getNextMonth(selectedMonth))} plain size="sm">
            <ChevronRight className="w-5 h-5" />
          </IconButton>
        </div>

        <div className="card-base card-pad-none overflow-hidden">
          <div className="grid grid-cols-1 divide-y divide-[var(--border-default)]">
            {dates.map((date, idx) => {
              const val = values.find(v => v.assetItemId === itemId && v.date === date)
              // 표시값 = Forward-Fill 유효값(평탄/희소 저장이어도 전 구간 값이 보이도록).
              const effective = valueAsOf(itemSeriesDesc, date)
              const prevDate = new Date(date + 'T00:00:00Z')
              prevDate.setUTCDate(prevDate.getUTCDate() - 1)
              const prevEffective = valueAsOf(itemSeriesDesc, prevDate.toISOString().split('T')[0])
              const change = effective - prevEffective
              const day = new Date(date).getDate()
              const isEditing = editingCell === `${itemId}-${date}`
              const isToday = date === today

              return (
                <div
                  key={date}
                  className={clsx(
                    'flex items-center px-4 py-3 cursor-pointer transition-colors',
                    isToday ? 'bg-[color:var(--color-primary-50)] dark:bg-[color:var(--color-primary-900)]/20' : 'hover:bg-[var(--hover-bg)]'
                  )}
                  onClick={() => !isEditing && handleCellClick(date)}
                >
                  <span className={clsx(
                    'w-12 text-label3-medium tabular-nums flex items-center gap-1',
                    isToday ? 'text-primary-600 dark:text-primary-400 font-semibold' : 'text-sub'
                  )}>
                    {day}일
                    {isToday && <span className="w-1.5 h-1.5 rounded-full bg-primary-500" />}
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
                        className="w-full px-2 py-1 rounded border border-primary-400 dark:border-primary-600 bg-surface-primary text-body2 text-heading tabular-nums focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    ) : (
                      <span className={clsx(
                        'text-body2 tabular-nums',
                        effective > 0 ? (val ? 'text-heading font-medium' : 'text-sub') : 'text-disabled'
                      )}>
                        {effective > 0 ? formatKRW(effective) : '-'}
                        {effective > 0 && !val && <span className="ml-1 text-label4 text-disabled">이월</span>}
                      </span>
                    )}
                  </div>
                  {change !== 0 && !isEditing && (
                    <span className={clsx(
                      'text-caption tabular-nums ml-2',
                      change > 0 ? 'text-status-success' : 'text-status-danger'
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
      <AssetEditModal />
    </div>
  )
}
