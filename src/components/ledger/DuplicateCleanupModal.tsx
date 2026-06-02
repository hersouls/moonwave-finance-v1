import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import {
  Copy, Check, Loader2, ChevronDown, Trash2, Square, CheckSquare, ShieldCheck, Calendar as CalendarIcon,
} from 'lucide-react'
import { clsx } from 'clsx'
import { Dialog, DialogBody, DialogFooter } from '@/components/ui/Dialog'
import { useTransactionStore } from '@/stores/transactionStore'
import { useMemberStore } from '@/stores/memberStore'
import { useToastStore } from '@/stores/toastStore'
import { useConfetti } from '@/hooks/useConfetti'
import { durations, easeOutExpo, springSnappy } from '@/lib/motionConfig'
import { formatDate } from '@/lib/dateUtils'
import {
  analyzeDuplicates,
  deleteDuplicates,
  type DuplicateAnalysis,
  type DuplicateGroup,
  type DuplicateConfidence,
} from '@/services/duplicateCleanup'
import { PremiumModalHeader, ModalFooterButton, ResultStat } from '@/components/ledger/ai/modalChrome'

interface Props {
  open: boolean
  onClose: () => void
  onApplied?: () => void
}

type Step = 'loading' | 'empty' | 'review' | 'applying' | 'result'

const CONF_META: Record<DuplicateConfidence, { label: string; color: string }> = {
  exact: { label: '완전 중복', color: 'var(--value-negative)' },
  high: { label: '중복 유력', color: 'var(--status-warning)' },
  medium: { label: '중복 가능', color: 'var(--text-sub)' },
}

function ConfBadge({ confidence, span }: { confidence: DuplicateConfidence; span: number }) {
  const m = CONF_META[confidence]
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 h-[18px] rounded-full text-micro leading-none font-bold ring-1"
      style={{
        color: m.color,
        backgroundColor: `color-mix(in srgb, ${m.color} 12%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${m.color} 30%, transparent)`,
      }}
    >
      {m.label}
      {confidence !== 'exact' && <span className="opacity-70 tabular-nums">{span}일</span>}
    </span>
  )
}

export function DuplicateCleanupModal({ open, onClose, onApplied }: Props) {
  const categories = useTransactionStore((s) => s.categories)
  const members = useMemberStore((s) => s.members)
  const reloadTransactions = useTransactionStore((s) => s.loadTransactions)
  const addToast = useToastStore((s) => s.addToast)
  const { subtleSuccess } = useConfetti()
  const shouldReduceMotion = useReducedMotion()

  const [step, setStep] = useState<Step>('loading')
  const [analysis, setAnalysis] = useState<DuplicateAnalysis | null>(null)
  const [keepIds, setKeepIds] = useState<Record<string, number>>({})
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())
  const [result, setResult] = useState<{ deleted: number; groups: number } | null>(null)

  useEffect(() => {
    if (!open) return
    setStep('loading')
    setAnalysis(null)
    setKeepIds({})
    setSelectedIds(new Set())
    setExpandedKeys(new Set())
    setResult(null)
    void (async () => {
      const a = await analyzeDuplicates()
      const keep: Record<string, number> = {}
      const sel = new Set<number>()
      const exp = new Set<string>()
      for (const g of a.groups) {
        keep[g.key] = g.recommendedKeepId
        exp.add(g.key)
        // Default-select ONLY true same-day duplicates; distinct-day same-price
        // rows (possible real repeat spending) are shown but never pre-checked.
        for (const id of g.autoDeleteIds) sel.add(id)
      }
      setAnalysis(a)
      setKeepIds(keep)
      setSelectedIds(sel)
      setExpandedKeys(exp)
      setStep(a.groups.length === 0 ? 'empty' : 'review')
    })()
  }, [open])

  const groups = analysis?.groups ?? []

  const stats = useMemo(() => {
    let amount = 0
    const affectedGroups = new Set<string>()
    for (const g of groups) {
      for (const t of g.transactions) {
        if (t.id != null && selectedIds.has(t.id)) {
          amount += Math.abs(t.amount)
          affectedGroups.add(g.key)
        }
      }
    }
    return { count: selectedIds.size, amount, affectedGroups: affectedGroups.size }
  }, [groups, selectedIds])

  const toggleDelete = (id: number, groupKey: string) => {
    if (keepIds[groupKey] === id) return // never delete the keeper
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const setKeeper = (group: DuplicateGroup, id: number) => {
    // Only move the protected row; preserve the user's existing delete choices.
    setKeepIds((prev) => ({ ...prev, [group.key]: id }))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.delete(id) // the keeper is never deleted
      return next
    })
  }

  const selectRecommended = () => {
    const sel = new Set<number>()
    for (const g of groups) for (const id of g.autoDeleteIds) sel.add(id)
    setSelectedIds(sel)
  }

  const deselectAll = () => setSelectedIds(new Set())

  const handleApply = useCallback(async () => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    setStep('applying')
    try {
      const deleted = await deleteDuplicates(ids)
      const affected = new Set<string>()
      for (const g of groups) for (const t of g.transactions) if (t.id != null && selectedIds.has(t.id)) affected.add(g.key)
      setResult({ deleted, groups: affected.size })
      await reloadTransactions()
      onApplied?.()
      setStep('result')
      if (!shouldReduceMotion && deleted > 0) subtleSuccess()
    } catch (err) {
      const msg = err instanceof Error ? err.message : '삭제에 실패했습니다'
      addToast(msg.slice(0, 120), 'error')
      setStep('review')
    }
  }, [selectedIds, groups, reloadTransactions, onApplied, shouldReduceMotion, subtleSuccess, addToast])

  return (
    <Dialog open={open} onClose={onClose} size="2xl" noPadding>
      <PremiumModalHeader
        icon={<Copy className="w-4 h-4 text-[color:var(--color-primary-600)] dark:text-[color:var(--color-primary-300)]" />}
        title="중복 거래 정리"
        subtitle="같은 메모·금액으로 중복 등록된 지출을 찾아 삭제"
        onClose={onClose}
        canClose={step !== 'applying'}
      />

      <DialogBody className="!mt-0 px-5 sm:px-7 pb-4 max-h-[70vh] overflow-y-auto">
        <AnimatePresence mode="wait">
          {step === 'loading' && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="py-14 flex flex-col items-center justify-center text-center">
              <Loader2 className="w-10 h-10 text-[color:var(--color-primary-500)] animate-spin mb-3" />
              <p className="text-body3 font-bold text-heading">중복 거래 분석 중…</p>
              <p className="text-caption text-sub mt-0.5">전체 거래내역을 스캔하고 있어요</p>
            </motion.div>
          )}

          {step === 'empty' && (
            <motion.div key="empty" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="py-12 flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mb-3"
                style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--value-positive) 70%, white), var(--value-positive))' }}>
                <Check className="w-8 h-8 text-white" strokeWidth={3} />
              </div>
              <h3 className="text-title2 font-bold text-heading mb-1">중복 거래가 없어요</h3>
              <p className="text-body3 text-sub">1개월 이내 같은 메모·금액의 중복 지출이 발견되지 않았습니다.</p>
            </motion.div>
          )}

          {step === 'review' && analysis && (
            <motion.div key="review" initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }} exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: -8 }}
              transition={{ duration: durations.fast, ease: easeOutExpo }} className="space-y-4">

              <SummaryCard
                groupCount={groups.length}
                affectedGroups={stats.affectedGroups}
                selectedCount={stats.count}
                selectedAmount={stats.amount}
                onSelectRecommended={selectRecommended}
                onDeselectAll={deselectAll}
              />

              <div className="rounded-2xl p-3 bg-status-warning-soft ring-1 ring-[color:var(--status-warning-border)]">
                <div className="flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-status-warning flex-shrink-0 mt-0.5" />
                  <p className="text-caption text-status-warning leading-relaxed">
                    기본 선택은 <b>같은 날짜</b>에 중복 등록된 건(완전 중복)만 자동 체크합니다. <b>다른 날짜</b>의 같은 금액 건은
                    매일 커피·교통처럼 실제 반복 지출일 수 있어 선택하지 않았으니 날짜를 직접 확인 후 체크하세요.
                    각 그룹에서 <b>1건은 유지</b>되며, 삭제는 모든 기기에 반영되고 되돌릴 수 없습니다.
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                {groups.map((g) => (
                  <GroupBlock
                    key={g.key}
                    group={g}
                    keepId={keepIds[g.key]}
                    selectedIds={selectedIds}
                    expanded={expandedKeys.has(g.key)}
                    categories={categories}
                    members={members}
                    onToggleExpand={() =>
                      setExpandedKeys((prev) => {
                        const next = new Set(prev)
                        if (next.has(g.key)) next.delete(g.key)
                        else next.add(g.key)
                        return next
                      })
                    }
                    onToggleDelete={(id) => toggleDelete(id, g.key)}
                    onSetKeeper={(id) => setKeeper(g, id)}
                  />
                ))}
              </div>
            </motion.div>
          )}

          {step === 'applying' && (
            <motion.div key="applying" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="py-14 flex flex-col items-center justify-center text-center">
              <div className="relative w-16 h-16 mb-4">
                <motion.div className="absolute inset-0 rounded-full"
                  style={{ background: 'radial-gradient(circle, color-mix(in srgb, var(--value-negative) 30%, transparent), transparent 70%)', filter: 'blur(8px)' }}
                  animate={shouldReduceMotion ? undefined : { scale: [1, 1.2, 1] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }} />
                <Loader2 className="relative w-16 h-16 text-[color:var(--value-negative)] animate-spin" />
              </div>
              <p className="text-body3 font-bold text-heading mb-1">중복 거래 삭제 중…</p>
              <p className="text-caption text-sub">잠시만 기다려 주세요</p>
            </motion.div>
          )}

          {step === 'result' && result && (
            <motion.div key="result" initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }} transition={{ duration: durations.base, ease: easeOutExpo }}
              className="py-8 flex flex-col items-center text-center">
              <motion.div initial={shouldReduceMotion ? undefined : { scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }}
                transition={{ ...springSnappy, delay: 0.1 }} className="w-20 h-20 rounded-full flex items-center justify-center mb-4"
                style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--value-positive) 70%, white), var(--value-positive))', boxShadow: '0 8px 24px color-mix(in srgb, var(--value-positive) 40%, transparent)' }}>
                <Check className="w-10 h-10 text-white" strokeWidth={3} />
              </motion.div>
              <h3 className="text-title2 font-bold text-heading mb-1">중복 정리 완료</h3>
              <p className="text-body3 text-sub mb-4">{result.groups}개 그룹에서 {result.deleted}건의 중복 거래를 삭제했어요</p>
              <div className="grid grid-cols-2 gap-3 w-full max-w-xs">
                <ResultStat label="삭제된 거래" value={result.deleted} color="var(--value-negative)" />
                <ResultStat label="정리된 그룹" value={result.groups} color="var(--color-primary-500)" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogBody>

      <DialogFooter className="!mt-0 px-5 sm:px-7 py-4 border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-secondary)]/40 backdrop-blur-sm">
        {step === 'review' && (
          <>
            <ModalFooterButton variant="ghost" onClick={onClose}>취소</ModalFooterButton>
            <ModalFooterButton variant="danger" onClick={handleApply} disabled={stats.count === 0}>
              <Trash2 className="w-4 h-4" />
              <span>{stats.count}건 삭제</span>
            </ModalFooterButton>
          </>
        )}
        {(step === 'empty' || step === 'result') && (
          <ModalFooterButton variant="primary" onClick={onClose} fullWidth>완료</ModalFooterButton>
        )}
        {step === 'applying' && <ModalFooterButton variant="ghost" disabled>삭제 중…</ModalFooterButton>}
        {step === 'loading' && <ModalFooterButton variant="ghost" disabled>분석 중…</ModalFooterButton>}
      </DialogFooter>
    </Dialog>
  )
}

// ════════════════════════════════════════════════════════
// Subcomponents
// ════════════════════════════════════════════════════════

function SummaryCard({
  groupCount, affectedGroups, selectedCount, selectedAmount, onSelectRecommended, onDeselectAll,
}: {
  groupCount: number
  affectedGroups: number
  selectedCount: number
  selectedAmount: number
  onSelectRecommended: () => void
  onDeselectAll: () => void
}) {
  return (
    <div className="elevation-1 rounded-3xl p-4 bg-surface-primary ring-1 ring-base">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, color-mix(in srgb, var(--value-negative) 18%, transparent), color-mix(in srgb, var(--value-negative) 6%, transparent))',
              boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--value-negative) 22%, transparent)',
            }}>
            <Copy className="w-5 h-5" style={{ color: 'var(--value-negative)' }} />
          </div>
          <div>
            <p className="text-label4 text-sub font-bold tracking-wider uppercase">삭제 선택</p>
            <p className="text-title2 font-extrabold text-heading tabular-nums">
              <span className="text-value-negative">{selectedCount}</span>
              <span className="text-sub text-caption font-bold ml-0.5">건</span>
              <span className="text-disabled font-semibold mx-1.5 text-body3">·</span>
              <span className="text-sub text-body3">{affectedGroups}/{groupCount} 그룹</span>
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-label4 text-sub font-bold tracking-wider uppercase">삭제 합계</p>
          <p className="text-body3-semi font-bold tabular-nums text-value-negative">
            −{selectedAmount.toLocaleString('ko-KR')}원
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-dashed border-[color:var(--border-default)] flex-wrap">
        <button type="button" onClick={onSelectRecommended}
          className="inline-flex items-center gap-1 px-2.5 h-7 rounded-full bg-surface-tertiary text-sub ring-1 ring-base text-caption font-semibold hover:bg-[var(--hover-bg)]">
          <CheckSquare className="w-3.5 h-3.5" /> 추천 중복 전체 선택
        </button>
        <button type="button" onClick={onDeselectAll}
          className="inline-flex items-center gap-1 px-2.5 h-7 rounded-full bg-surface-tertiary text-sub ring-1 ring-base text-caption font-semibold hover:bg-[var(--hover-bg)]">
          <Square className="w-3.5 h-3.5" /> 전체 해제
        </button>
      </div>
    </div>
  )
}

function GroupBlock({
  group, keepId, selectedIds, expanded, categories, members, onToggleExpand, onToggleDelete, onSetKeeper,
}: {
  group: DuplicateGroup
  keepId: number | undefined
  selectedIds: Set<number>
  expanded: boolean
  categories: ReturnType<typeof useTransactionStore.getState>['categories']
  members: ReturnType<typeof useMemberStore.getState>['members']
  onToggleExpand: () => void
  onToggleDelete: (id: number) => void
  onSetKeeper: (id: number) => void
}) {
  const selectedInGroup = group.transactions.filter((t) => t.id != null && selectedIds.has(t.id)).length

  return (
    <div className="rounded-2xl ring-1 ring-base bg-surface-primary">
      {/* Group header */}
      <button type="button" onClick={onToggleExpand} aria-expanded={expanded}
        className="w-full flex items-center gap-2.5 pl-3 pr-2.5 py-2.5 text-left">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, color-mix(in srgb, var(--value-negative) 16%, transparent), color-mix(in srgb, var(--value-negative) 5%, transparent))',
            boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--value-negative) 20%, transparent)',
          }}>
          <Copy className="w-4 h-4" style={{ color: 'var(--value-negative)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-caption font-bold text-heading truncate">{group.sampleMemo}</span>
            <ConfBadge confidence={group.confidence} span={group.spanDays} />
            <span className="text-label4 leading-none text-disabled tabular-nums font-semibold px-1.5 py-0.5 rounded-full bg-surface-tertiary flex-shrink-0">×{group.count}</span>
          </div>
          <p className="text-label4 text-sub tabular-nums mt-0.5">
            −{group.amount.toLocaleString('ko-KR')}원 · {selectedInGroup}건 삭제 예정
          </p>
        </div>
        <ChevronDown className={clsx('w-4 h-4 text-sub flex-shrink-0 transition-transform', expanded && 'rotate-180')} />
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: durations.base, ease: easeOutExpo }}
            className="overflow-hidden"
          >
            <div className="px-2 pb-2 space-y-1">
              {group.transactions.map((t) => {
                const isKeeper = keepId === t.id
                const isSelected = t.id != null && selectedIds.has(t.id)
                const cat = t.categoryId != null ? categories.find((c) => c.id === t.categoryId) : null
                const member = t.memberId != null ? members.find((m) => m.id === t.memberId) : null
                return (
                  <div
                    key={t.id}
                    className={clsx(
                      'flex items-center gap-2.5 rounded-xl px-2.5 py-2 ring-1 transition-colors',
                      isKeeper
                        ? 'bg-[color:var(--value-positive)]/8 ring-[color:var(--value-positive)]/30'
                        : isSelected
                          ? 'bg-status-danger-soft ring-[color:var(--status-danger)]/25'
                          : 'bg-surface-secondary ring-base',
                    )}
                  >
                    {isKeeper ? (
                      <span className="inline-flex items-center gap-1 px-2 h-6 rounded-full text-label4 font-bold text-white flex-shrink-0"
                        style={{ backgroundColor: 'var(--value-positive)' }}>
                        <Check className="w-3 h-3" strokeWidth={3} /> 유지
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onToggleDelete(t.id!)}
                        aria-pressed={isSelected}
                        aria-label={isSelected ? '삭제 취소' : '삭제 선택'}
                        className={clsx(
                          'w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 ring-1 transition-all',
                          isSelected ? 'bg-[color:var(--value-negative)] ring-transparent' : 'bg-surface-primary ring-base',
                        )}
                      >
                        {isSelected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                      </button>
                    )}

                    <div className="flex-1 min-w-0">
                      <span className="inline-flex items-center gap-1 text-caption font-semibold text-heading tabular-nums">
                        <CalendarIcon className="w-3 h-3 text-disabled" />
                        {formatDate(t.date)}
                      </span>
                      <div className="flex items-center gap-1.5 mt-0.5 text-label4 text-sub min-w-0">
                        {cat && (
                          <span className="inline-flex items-center gap-1 min-w-0">
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                            <span className="truncate">{cat.name}</span>
                          </span>
                        )}
                        {t.paymentMethodDetail && <span className="truncate">· {t.paymentMethodDetail}</span>}
                        {member && <span className="truncate" style={{ color: member.color }}>· {member.name}</span>}
                      </div>
                    </div>

                    {!isKeeper && (
                      <button
                        type="button"
                        onClick={() => onSetKeeper(t.id!)}
                        className="text-label4 font-semibold text-sub hover:text-heading hover:underline flex-shrink-0 px-1.5 py-1"
                      >
                        이 항목 유지
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
