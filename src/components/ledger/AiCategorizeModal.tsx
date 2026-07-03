import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import {
  Sparkles, Check, Loader2, Wand2, ChevronDown, Tag,
  CheckCheck, Square, CheckSquare, AlertCircle,
} from 'lucide-react'
import { clsx } from 'clsx'
import { Dialog, DialogBody, DialogFooter } from '@/components/ui/Dialog'
import { useTransactionStore } from '@/stores/transactionStore'
import { useToastStore } from '@/stores/toastStore'
import { useConfetti } from '@/hooks/useConfetti'
import { getCategoryIcon } from '@/utils/categoryIcons'
import { durations, easeOutExpo, springSnappy } from '@/lib/motionConfig'
import { classifyAndPersistAliases, hasApiKey } from '@/services/aiCategorizeMerchants'
import {
  analyzeUncategorized,
  applyGroups,
  isConfident,
  type BulkAnalysis,
  type UncategorizedGroup,
} from '@/services/bulkAutoCategorize'
import { ConfidenceMeter } from '@/components/ledger/ai/aiPrimitives'
import { PremiumModalHeader, ModalFooterButton, ResultStat } from '@/components/ledger/ai/modalChrome'
import type { TransactionCategory } from '@/lib/types'

interface Props {
  open: boolean
  onClose: () => void
  /** Called after transactions are updated so the page can refresh. */
  onApplied?: () => void
}

type Step = 'loading' | 'empty' | 'review' | 'applying' | 'result'

export function AiCategorizeModal({ open, onClose, onApplied }: Props) {
  const categories = useTransactionStore((s) => s.categories)
  const reloadTransactions = useTransactionStore((s) => s.loadTransactions)
  const addToast = useToastStore((s) => s.addToast)
  const { subtleSuccess } = useConfetti()
  const shouldReduceMotion = useReducedMotion()

  const expenseCategories = useMemo(
    () => categories.filter((c) => c.type === 'expense'),
    [categories],
  )

  const [step, setStep] = useState<Step>('loading')
  const [analysis, setAnalysis] = useState<BulkAnalysis | null>(null)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [aiClassifying, setAiClassifying] = useState(false)
  const [result, setResult] = useState<{ applied: number; merchants: number } | null>(null)

  // ── Scan on open ──────────────────────────────────
  const runScan = useCallback(async (preserveSelection = false) => {
    const a = await analyzeUncategorized()
    setAnalysis(a)
    setSelectedKeys((prev) => {
      const next = preserveSelection ? new Set(prev) : new Set<string>()
      for (const k of a.confidentKeys) next.add(k)
      return next
    })
    setStep(a.groups.length === 0 ? 'empty' : 'review')
  }, [])

  useEffect(() => {
    if (!open) return
    setStep('loading')
    setAnalysis(null)
    setSelectedKeys(new Set())
    setOverrides({})
    setExpandedKey(null)
    setAiClassifying(false)
    setResult(null)
    void runScan(false)
  }, [open, runScan])

  const groups = analysis?.groups ?? []

  // effectiveCategoryId for a group: override wins over the suggestion.
  const effectiveCat = useCallback(
    (g: UncategorizedGroup): TransactionCategory | null => {
      const id = overrides[g.merchantKey] ?? g.suggestion.categoryId
      if (id == null) return null
      return expenseCategories.find((c) => c.id === id) ?? null
    },
    [overrides, expenseCategories],
  )

  // ── Derived stats ─────────────────────────────────
  const stats = useMemo(() => {
    let selectedGroups = 0
    let selectedTxns = 0
    let selectedAmount = 0
    for (const g of groups) {
      if (!selectedKeys.has(g.merchantKey)) continue
      const id = overrides[g.merchantKey] ?? g.suggestion.categoryId
      if (id == null) continue
      selectedGroups++
      selectedTxns += g.count
      selectedAmount += g.amountTotal
    }
    const unresolved = groups.filter(
      (g) => !isConfident(g.suggestion) && overrides[g.merchantKey] == null,
    )
    return { selectedGroups, selectedTxns, selectedAmount, unresolvedCount: unresolved.length, unresolved }
  }, [groups, selectedKeys, overrides])

  // ── Toggles ───────────────────────────────────────
  const toggleKey = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const selectAllResolved = () => {
    setSelectedKeys(new Set(
      groups
        .filter((g) => (overrides[g.merchantKey] ?? g.suggestion.categoryId) != null)
        .map((g) => g.merchantKey),
    ))
  }

  const deselectAll = () => setSelectedKeys(new Set())

  const pickOverride = (key: string, catId: string) => {
    setOverrides((prev) => ({ ...prev, [key]: catId }))
    setSelectedKeys((prev) => new Set(prev).add(key))
    setExpandedKey(null)
  }

  // ── AI classify remaining ─────────────────────────
  const handleAiClassify = useCallback(async () => {
    const merchants = Array.from(new Set(stats.unresolved.map((g) => g.sampleMerchant)))
    if (merchants.length === 0) return
    if (!hasApiKey()) {
      addToast('설정 → 시스템 → AI 카테고리 분류에서 API 키를 등록해주세요', 'error')
      return
    }
    setAiClassifying(true)
    try {
      const results = await classifyAndPersistAliases({ merchants, categories })
      await runScan(true) // refresh suggestions with the new aliases, keep selection
      const resolved = results.filter((r) => r.categoryId != null).length
      addToast(`AI 분류 완료 — ${resolved}/${results.length}곳 자동 분류`, 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI 분류에 실패했습니다'
      addToast(msg.slice(0, 120), 'error')
    } finally {
      setAiClassifying(false)
    }
  }, [stats.unresolved, categories, addToast, runScan])

  // ── Apply ─────────────────────────────────────────
  const handleApply = useCallback(async () => {
    setStep('applying')
    try {
      const res = await applyGroups({ groups, selectedKeys, overrides })
      setResult(res)
      await reloadTransactions()
      onApplied?.()
      setStep('result')
      if (!shouldReduceMotion && res.applied > 0) subtleSuccess()
    } catch (err) {
      const msg = err instanceof Error ? err.message : '적용에 실패했습니다'
      addToast(msg.slice(0, 120), 'error')
      setStep('review')
    }
  }, [groups, selectedKeys, overrides, reloadTransactions, onApplied, shouldReduceMotion, subtleSuccess, addToast])

  return (
    <Dialog open={open} onClose={onClose} size="2xl" noPadding>
      <PremiumModalHeader
        icon={<Sparkles className="w-4 h-4 text-[color:var(--color-primary-600)] dark:text-[color:var(--color-primary-300)]" />}
        title="AI 카테고리 자동 분류"
        subtitle="미분류 거래를 가맹점별로 분류해 한 번에 적용"
        onClose={onClose}
        canClose={step !== 'applying'}
      />

      <DialogBody className="!mt-0 px-5 sm:px-7 pb-4 max-h-[70vh] overflow-y-auto">
        <AnimatePresence mode="wait">
          {step === 'loading' && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="py-14 flex flex-col items-center justify-center text-center">
              <Loader2 className="w-10 h-10 text-[color:var(--color-primary-500)] animate-spin mb-3" />
              <p className="text-body3 font-bold text-heading">미분류 거래 분석 중…</p>
              <p className="text-body3 text-sub mt-0.5">전체 거래내역을 스캔하고 있어요</p>
            </motion.div>
          )}

          {step === 'empty' && (
            <motion.div key="empty" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="py-12 flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mb-3"
                style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--value-positive) 70%, white), var(--value-positive))' }}>
                <Check className="w-8 h-8 text-white" strokeWidth={3} />
              </div>
              <h3 className="text-title2 font-bold text-heading mb-1">모두 분류되어 있어요</h3>
              <p className="text-body3 text-sub">분류할 미분류 지출 거래가 없습니다.</p>
            </motion.div>
          )}

          {step === 'review' && analysis && (
            <motion.div key="review" initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }} exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: -8 }}
              transition={{ duration: durations.fast, ease: easeOutExpo }} className="space-y-4">

              <SummaryCard
                merchants={groups.length}
                selectedGroups={stats.selectedGroups}
                selectedTxns={stats.selectedTxns}
                selectedAmount={stats.selectedAmount}
                memolessCount={analysis.memolessCount}
                onSelectAll={selectAllResolved}
                onDeselectAll={deselectAll}
              />

              {/* AI fallback for unresolved merchants */}
              {stats.unresolvedCount > 0 && (
                <div className="rounded-2xl p-3 bg-[color:var(--color-primary-50)] dark:bg-[color:var(--color-primary-900)]/15 ring-1 ring-[color:var(--color-primary-200)] dark:ring-[color:var(--color-primary-800)]">
                  <div className="flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-accent-primary flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-label3 text-accent-primary mb-0.5">
                        AI로 분류 가능 — 미해결 가맹점 {stats.unresolvedCount}곳
                      </p>
                      <p className="text-body3 text-accent-primary leading-relaxed">
                        Claude API로 한 번에 분류하고 학습된 매핑을 저장합니다.
                        {!hasApiKey() && ' API 키는 설정 → 시스템에서 등록.'}
                      </p>
                      <button
                        type="button"
                        onClick={handleAiClassify}
                        disabled={aiClassifying}
                        className="mt-2 inline-flex items-center gap-1.5 px-3 h-8 rounded-full bg-[color:var(--color-primary-600)] text-white text-label3 hover:brightness-110 disabled:opacity-50"
                      >
                        {aiClassifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                        {aiClassifying ? '분류 중…' : 'AI로 나머지 분류'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Group list */}
              <div className="space-y-1.5">
                {groups.map((g) => (
                  <GroupRow
                    key={g.merchantKey}
                    group={g}
                    category={effectiveCat(g)}
                    overridden={overrides[g.merchantKey] != null}
                    selected={selectedKeys.has(g.merchantKey)}
                    expanded={expandedKey === g.merchantKey}
                    expenseCategories={expenseCategories}
                    onToggle={() => toggleKey(g.merchantKey)}
                    onExpand={() => setExpandedKey((k) => (k === g.merchantKey ? null : g.merchantKey))}
                    onPick={(catId) => pickOverride(g.merchantKey, catId)}
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
                  style={{ background: 'radial-gradient(circle, color-mix(in srgb, var(--color-primary-500) 30%, transparent), transparent 70%)', filter: 'blur(8px)' }}
                  animate={shouldReduceMotion ? undefined : { scale: [1, 1.2, 1] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }} />
                <Loader2 className="relative w-16 h-16 text-[color:var(--color-primary-500)] animate-spin" />
              </div>
              <p className="text-body3 font-bold text-heading mb-1">카테고리 적용 중…</p>
              <p className="text-body3 text-sub">잠시만 기다려 주세요</p>
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
              <h3 className="text-title2 font-bold text-heading mb-1">자동 분류 완료</h3>
              <p className="text-body3 text-sub mb-4">
                {result.merchants}개 가맹점 · {result.applied}건의 거래를 분류했어요
              </p>
              <div className="grid grid-cols-2 gap-3 w-full max-w-xs">
                <ResultStat label="분류된 거래" value={result.applied} color="var(--value-positive)" />
                <ResultStat label="가맹점" value={result.merchants} color="var(--color-primary-500)" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogBody>

      <DialogFooter className="!mt-0 px-5 sm:px-7 py-4 border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-secondary)]/40 backdrop-blur-sm">
        {step === 'review' && (
          <>
            <ModalFooterButton variant="ghost" onClick={onClose}>취소</ModalFooterButton>
            <ModalFooterButton variant="primary" onClick={handleApply} disabled={stats.selectedGroups === 0}>
              <CheckCheck className="w-4 h-4" strokeWidth={2.5} />
              <span>{stats.selectedTxns}건 분류 적용</span>
            </ModalFooterButton>
          </>
        )}
        {(step === 'empty' || step === 'result') && (
          <ModalFooterButton variant="primary" onClick={onClose} fullWidth>완료</ModalFooterButton>
        )}
        {step === 'applying' && <ModalFooterButton variant="ghost" disabled>적용 중…</ModalFooterButton>}
        {step === 'loading' && <ModalFooterButton variant="ghost" disabled>분석 중…</ModalFooterButton>}
      </DialogFooter>
    </Dialog>
  )
}

// ════════════════════════════════════════════════════════
// Subcomponents
// ════════════════════════════════════════════════════════

function SummaryCard({
  merchants, selectedGroups, selectedTxns, selectedAmount, memolessCount, onSelectAll, onDeselectAll,
}: {
  merchants: number
  selectedGroups: number
  selectedTxns: number
  selectedAmount: number
  memolessCount: number
  onSelectAll: () => void
  onDeselectAll: () => void
}) {
  return (
    <div className="elevation-1 rounded-3xl p-4 bg-surface-primary ring-1 ring-base">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, color-mix(in srgb, var(--color-primary-500) 18%, transparent), color-mix(in srgb, var(--color-primary-500) 6%, transparent))',
              boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--color-primary-500) 22%, transparent)',
            }}>
            <Tag className="w-5 h-5 text-[color:var(--color-primary-600)] dark:text-[color:var(--color-primary-300)]" />
          </div>
          <div>
            <p className="text-label4 text-sub font-bold tracking-wider uppercase">선택된 분류</p>
            <p className="text-title2 font-extrabold text-heading tabular-nums">
              <span className="text-[color:var(--color-primary-600)] dark:text-[color:var(--color-primary-300)]">{selectedGroups}</span>
              <span className="text-disabled font-semibold mx-1">/</span>
              <span className="text-sub">{merchants}</span>
              <span className="text-sub text-caption font-bold ml-0.5">가맹점</span>
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-label4 text-sub font-bold tracking-wider uppercase">{selectedTxns}건 · 합계</p>
          <p className="text-body3-bold tabular-nums text-value-negative">
            −{selectedAmount.toLocaleString('ko-KR')}원
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-dashed border-[color:var(--border-default)] flex-wrap">
        <button type="button" onClick={onSelectAll}
          className="inline-flex items-center gap-1 px-2.5 h-7 rounded-full bg-surface-tertiary text-sub ring-1 ring-base text-label3-medium font-semibold hover:bg-[var(--hover-bg)]">
          <CheckSquare className="w-3.5 h-3.5" /> 분류 가능 전체 선택
        </button>
        <button type="button" onClick={onDeselectAll}
          className="inline-flex items-center gap-1 px-2.5 h-7 rounded-full bg-surface-tertiary text-sub ring-1 ring-base text-label3-medium font-semibold hover:bg-[var(--hover-bg)]">
          <Square className="w-3.5 h-3.5" /> 전체 해제
        </button>
        {memolessCount > 0 && (
          <span className="inline-flex items-center gap-1 text-label4 text-disabled ml-auto">
            <AlertCircle className="w-3 h-3" />
            메모 없는 {memolessCount}건은 분류 불가
          </span>
        )}
      </div>
    </div>
  )
}

function GroupRow({
  group, category, overridden, selected, expanded, expenseCategories, onToggle, onExpand, onPick,
}: {
  group: UncategorizedGroup
  category: TransactionCategory | null
  overridden: boolean
  selected: boolean
  expanded: boolean
  expenseCategories: TransactionCategory[]
  onToggle: () => void
  onExpand: () => void
  onPick: (catId: string) => void
}) {
  const shouldReduceMotion = useReducedMotion()
  const Icon = getCategoryIcon(category?.icon)
  const accent = category?.color ?? 'var(--text-muted)'
  const reason = overridden ? '직접 선택' : group.suggestion.reason

  return (
    <div className={clsx(
      'rounded-2xl ring-1 transition-all',
      selected ? 'bg-surface-primary ring-[color:var(--color-primary-300)] dark:ring-[color:var(--color-primary-700)]' : 'bg-surface-tertiary/50 ring-base',
    )}>
      <div className="flex items-center gap-2.5 pl-2.5 pr-2 py-2.5">
        {/* checkbox */}
        <button type="button" onClick={onToggle} aria-pressed={selected} aria-label={selected ? '선택 해제' : '선택'}
          className={clsx(
            'w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-all ring-1',
            selected ? 'bg-[color:var(--color-primary-500)] ring-transparent' : 'bg-surface-primary ring-base',
          )}>
          {selected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
        </button>

        {/* icon */}
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: `linear-gradient(135deg, color-mix(in srgb, ${accent} 18%, transparent), color-mix(in srgb, ${accent} 6%, transparent))`,
            boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${accent} 22%, transparent)`,
          }}>
          <Icon className="w-4 h-4" style={{ color: accent }} />
        </div>

        {/* body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-label3 text-heading truncate">{group.sampleMerchant}</span>
            <span className="text-label4 leading-none text-disabled tabular-nums font-semibold px-1.5 py-0.5 rounded-full bg-surface-tertiary flex-shrink-0">×{group.count}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {category ? (
              <>
                <span className="text-label3-medium text-sub truncate">{category.name}</span>
                {!overridden && <ConfidenceMeter confidence={group.suggestion.confidence} showLabel={false} />}
                {reason && <span className="text-body3 text-disabled truncate hidden sm:inline">· {reason}</span>}
              </>
            ) : (
              <span className="text-label3-medium text-status-warning font-semibold">미해결 — 카테고리 선택 필요</span>
            )}
          </div>
        </div>

        {/* amount */}
        <div className="text-right flex-shrink-0 pr-1">
          <p className="text-label3 text-value-negative tabular-nums">−{group.amountTotal.toLocaleString('ko-KR')}</p>
        </div>

        {/* change category */}
        <button type="button" onClick={onExpand} aria-expanded={expanded}
          className="inline-flex items-center gap-0.5 px-2 h-8 rounded-full text-label3-medium font-semibold text-sub hover:text-heading hover:bg-[var(--hover-bg)] transition-colors flex-shrink-0">
          {category ? '변경' : '선택'}
          <ChevronDown className={clsx('w-3.5 h-3.5 transition-transform', expanded && 'rotate-180')} />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: durations.base, ease: easeOutExpo }}
            className="overflow-hidden"
          >
            <div className="px-2.5 pb-2.5 pt-0.5 grid grid-cols-3 xs:grid-cols-4 sm:grid-cols-5 gap-1.5">
              {expenseCategories.map((cat) => {
                const CatIcon = getCategoryIcon(cat.icon)
                const isCur = category?.id === cat.id
                return (
                  <motion.button
                    key={cat.id}
                    type="button"
                    onClick={() => onPick(cat.id)}
                    whileTap={shouldReduceMotion ? undefined : { scale: 0.94 }}
                    className={clsx(
                      'flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-xl ring-1 transition-all',
                      isCur ? 'ring-transparent' : 'bg-surface-primary ring-base hover:ring-[color:var(--color-primary-300)]',
                    )}
                    style={isCur ? { backgroundColor: cat.color, boxShadow: `0 4px 14px -4px color-mix(in srgb, ${cat.color} 45%, transparent)` } : undefined}
                  >
                    <CatIcon className="w-4 h-4" style={{ color: isCur ? '#fff' : cat.color }} />
                    <span className={clsx('text-label3-medium leading-none truncate max-w-full font-semibold', isCur ? 'text-white' : 'text-sub')}>{cat.name}</span>
                  </motion.button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

