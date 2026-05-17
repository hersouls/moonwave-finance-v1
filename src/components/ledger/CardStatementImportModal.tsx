import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { classifyAndPersistAliases, hasApiKey } from '@/services/aiCategorizeMerchants'
import {
  Sparkles, FileText, ClipboardPaste, Wallet, Users, Check, X,
  ArrowRight, ArrowLeft, AlertTriangle, CreditCard, Banknote,
  Landmark, Receipt, MoreHorizontal, Loader2, ShieldCheck,
  ChevronDown, ChevronUp, Eye, EyeOff, Tag, Calendar as CalendarIcon,
} from 'lucide-react'
import { clsx } from 'clsx'
import { Dialog, DialogBody, DialogFooter } from '@/components/ui/Dialog'
import { MiniCalendar } from '@/components/ui/MiniCalendar'
import { useTransactionStore } from '@/stores/transactionStore'
import { useMemberStore } from '@/stores/memberStore'
import { useToastStore } from '@/stores/toastStore'
import { getCategoryIcon } from '@/utils/categoryIcons'
import { PAYMENT_METHOD_OPTIONS } from '@/utils/paymentMethod'
import { SUBSCRIPTION_CATEGORIES } from '@/utils/constants'
import { formatDate, getTodayString } from '@/lib/dateUtils'
import { parseISO, format, addMonths, endOfMonth, setDate as setDayOfMonth } from 'date-fns'
import { durations, easeOutExpo, springSnappy } from '@/lib/motionConfig'
import {
  analyzeStatement,
  importStatement,
  detectCardCompany,
  type AnalyzedRow,
  type DuplicateLevel,
} from '@/services/cardStatementImport'
import type { PaymentMethod, SubscriptionCategoryType } from '@/lib/types'

interface Props {
  open: boolean
  onClose: () => void
  /** Optional initial text (e.g., from clipboard) */
  initialText?: string
}

type Step = 'input' | 'review' | 'importing' | 'result'

const PAYMENT_METHOD_ICONS: Record<PaymentMethod, typeof Banknote> = {
  cash: Banknote,
  credit_card: CreditCard,
  debit_card: CreditCard,
  bank_transfer: Landmark,
  loan: Receipt,
  other: MoreHorizontal,
}

const SAMPLE_TEXT_SHINHAN = `(주)신세계사이먼 파주점
293,100원
2026.04.05
본인643

CLAUDE.AI SUBSCRIPTION
169,785원
2026.03.23
본인429
수수료 301원`

const SAMPLE_TEXT_SAMSUNG = `일시불
소계 총 2건 100,000원
컬리페이_컬리
60,000원

26. 4. 5본 인 0438
LINK할인혜택 -2,000원

설성푸드 주식회사
40,000원

26. 4. 12본 인 0438`

export function CardStatementImportModal({ open, onClose, initialText }: Props) {
  const transactions = useTransactionStore((s) => s.transactions)
  const categories = useTransactionStore((s) => s.categories)
  const paymentMethodItems = useTransactionStore((s) => s.paymentMethodItems)
  const members = useMemberStore((s) => s.members)
  const addToast = useToastStore((s) => s.addToast)
  const reloadTransactions = useTransactionStore((s) => s.loadTransactions)
  const shouldReduceMotion = useReducedMotion()

  const [step, setStep] = useState<Step>('input')
  const [text, setText] = useState('')
  const [rows, setRows] = useState<AnalyzedRow[]>([])
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('credit_card')
  const [paymentMethodItemId, setPaymentMethodItemId] = useState<number | ''>('')
  const [memberMap, setMemberMap] = useState<Record<string, number>>({})
  const [skipIndexes, setSkipIndexes] = useState<Set<number>>(new Set())
  const [showSample, setShowSample] = useState(false)
  const [showAllRows, setShowAllRows] = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; totalParsed: number } | null>(null)
  const [importError, setImportError] = useState<string>('')
  const [aiClassifying, setAiClassifying] = useState(false)
  // Cash-flow alignment: replace every row's statement date with one
  // user-chosen date (typically the card's payment due date). Default on
  // because users importing statements are almost always tracking real
  // cash outflow, not accrual-basis purchase dates.
  const [useOverrideDate, setUseOverrideDate] = useState(true)
  const [overrideDate, setOverrideDate] = useState<string>(getTodayString())
  // Optional bulk subscription-type label applied to every imported row.
  const [subscriptionCategory, setSubscriptionCategory] = useState<SubscriptionCategoryType | ''>('')

  // Reset state on open
  useEffect(() => {
    if (!open) return
    setStep('input')
    setText(initialText ?? '')
    setRows([])
    setPaymentMethod('credit_card')
    setPaymentMethodItemId('')
    setMemberMap({})
    setSkipIndexes(new Set())
    setShowSample(false)
    setShowAllRows(false)
    setImportResult(null)
    setImportError('')
    setUseOverrideDate(true)
    setOverrideDate(getTodayString())
    setSubscriptionCategory('')
  }, [open, initialText])

  // ── Analyze when entering review ─────────────────
  const handleAnalyze = useCallback(async () => {
    if (!text.trim()) {
      addToast('명세서 내용을 붙여넣어 주세요', 'info')
      return
    }
    const analyzed = await analyzeStatement(text, categories, transactions)
    if (analyzed.length === 0) {
      addToast('인식 가능한 거래가 없습니다. 형식을 확인해주세요', 'error')
      return
    }
    setRows(analyzed)
    // Auto-skip exact duplicates by default
    const skipExact = new Set<number>()
    for (const r of analyzed) {
      if (r.duplicate.level === 'exact') skipExact.add(r.index)
    }
    setSkipIndexes(skipExact)
    setStep('review')
  }, [text, categories, transactions, addToast])

  // ── Aggregate stats for review header ────────────
  const stats = useMemo(() => {
    const total = rows.length
    const skipped = skipIndexes.size
    const selected = total - skipped
    const dupExact = rows.filter(r => r.duplicate.level === 'exact').length
    const dupLikely = rows.filter(r => r.duplicate.level === 'likely').length
    const dupPossible = rows.filter(r => r.duplicate.level === 'possible').length
    const dupTotal = dupExact + dupLikely + dupPossible
    const totalAmount = rows
      .filter(r => !skipIndexes.has(r.index))
      .reduce((sum, r) => sum + r.amount, 0)
    const cardSuffixes = Array.from(new Set(rows.map(r => r.cardSuffix)))
    const dates = rows.map(r => r.date).sort()
    return {
      total, skipped, selected, dupExact, dupLikely, dupPossible, dupTotal, totalAmount,
      cardSuffixes, dateRange: dates.length > 0 ? { from: dates[0], to: dates[dates.length - 1] } : null,
    }
  }, [rows, skipIndexes])

  const allCardSuffixesMapped = useMemo(() =>
    stats.cardSuffixes.every(s => memberMap[s] !== undefined),
  [stats.cardSuffixes, memberMap])

  // ── Payment method items filtered ────────────────
  const itemsForMethod = useMemo(() => {
    if (paymentMethod === 'cash' || !paymentMethod) return []
    return paymentMethodItems.filter(i => i.type === paymentMethod && i.isActive)
  }, [paymentMethod, paymentMethodItems])

  // ── AI fallback: classify low/none-confidence rows via Claude ──
  // Collects unique merchant strings from rows that the local heuristic
  // couldn't resolve, sends them in one batched API call, persists results
  // into merchantAliases, then re-runs analyzeStatement so the suggestions
  // refresh with the new alias hits.
  const aiTargets = useMemo(
    () => rows.filter(r => r.suggestion.confidence === 'none' || r.suggestion.confidence === 'low'),
    [rows],
  )
  const uniqueAiMerchants = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const r of aiTargets) {
      if (!seen.has(r.merchant)) { seen.add(r.merchant); out.push(r.merchant) }
    }
    return out
  }, [aiTargets])

  const handleAiClassify = useCallback(async () => {
    if (uniqueAiMerchants.length === 0) return
    if (!hasApiKey()) {
      addToast('설정 → 시스템 → AI 카테고리 분류 에서 API 키를 설정해주세요', 'error')
      return
    }
    setAiClassifying(true)
    try {
      const results = await classifyAndPersistAliases({
        merchants: uniqueAiMerchants,
        categories,
      })
      // Re-analyze with refreshed aliases so the new mappings apply to all
      // rows (including any duplicates of the just-classified merchant).
      const refreshed = await analyzeStatement(text, categories, transactions)
      setRows(refreshed)
      const resolved = results.filter(r => r.categoryId != null).length
      addToast(
        `AI 분류 완료: ${resolved}/${results.length}건 자동 분류 (모두 다음 import부터 자동 적용)`,
        'success',
      )
    } catch (err) {
      console.error('[AI classify] failed', err)
      const msg = err instanceof Error ? err.message : 'AI 분류 실패'
      addToast(msg.slice(0, 120), 'error')
    } finally {
      setAiClassifying(false)
    }
  }, [uniqueAiMerchants, categories, text, transactions, addToast])

  // ── Import handler ────────────────────────────────
  const handleImport = useCallback(async () => {
    setStep('importing')
    setImportError('')
    try {
      const result = await importStatement(rows, {
        paymentMethod,
        paymentMethodItemId: paymentMethodItemId === '' ? undefined : paymentMethodItemId as number,
        paymentMethodDetail: paymentMethodItemId === ''
          ? undefined
          : paymentMethodItems.find(i => i.id === paymentMethodItemId)?.name,
        memberMap: Object.keys(memberMap).length > 0 ? memberMap : undefined,
        skipIndexes,
        overrideDate: useOverrideDate && overrideDate ? overrideDate : undefined,
        subscriptionCategoryOverride: subscriptionCategory || undefined,
      })
      setImportResult({ imported: result.imported, skipped: result.skipped, totalParsed: result.totalParsed })
      await reloadTransactions()
      setStep('result')
    } catch (err) {
      setImportError(err instanceof Error ? err.message : '가져오기 실패')
      setStep('review')
      addToast('가져오기에 실패했습니다', 'error')
    }
  }, [rows, paymentMethod, paymentMethodItemId, paymentMethodItems, memberMap, skipIndexes, useOverrideDate, overrideDate, subscriptionCategory, reloadTransactions, addToast])

  const handleClose = () => {
    if (step === 'importing') return
    if (step === 'result' && importResult && importResult.imported > 0) {
      addToast(`${importResult.imported}건 가져오기 완료`, 'success')
    }
    onClose()
  }

  const toggleRow = (index: number) => {
    setSkipIndexes(prev => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const skipAllDuplicates = () => {
    const next = new Set(skipIndexes)
    for (const r of rows) {
      if (r.duplicate.level !== 'none') next.add(r.index)
    }
    setSkipIndexes(next)
  }

  const includeAll = () => setSkipIndexes(new Set())

  return (
    <Dialog open={open} onClose={handleClose} size="2xl" noPadding>
      {/* ─── Aurora header ──────────────────────────── */}
      <PremiumHeader step={step} onClose={handleClose} canClose={step !== 'importing'} />

      <DialogBody className="!mt-0 px-5 sm:px-7 pb-4 max-h-[70vh] overflow-y-auto">
        <AnimatePresence mode="wait">
          {step === 'input' && (
            <motion.div
              key="input"
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: -8 }}
              transition={{ duration: durations.fast, ease: easeOutExpo }}
            >
              <InputStep
                text={text}
                onChange={setText}
                showSample={showSample}
                onToggleSample={() => setShowSample(s => !s)}
              />
            </motion.div>
          )}

          {step === 'review' && (
            <motion.div
              key="review"
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: -8 }}
              transition={{ duration: durations.fast, ease: easeOutExpo }}
              className="space-y-5"
            >
              <ReviewSummary
                stats={stats}
                overrideDate={useOverrideDate ? overrideDate : null}
              />

              {/* Payment method bulk picker */}
              <PaymentMethodPicker
                value={paymentMethod}
                onChange={setPaymentMethod}
                items={itemsForMethod}
                selectedItemId={paymentMethodItemId}
                onItemChange={setPaymentMethodItemId}
              />

              {/* Bulk payment-due-date override — aligns all rows to one date
                  for cash-flow accuracy (replaces individual statement dates). */}
              <BillingDatePicker
                enabled={useOverrideDate}
                date={overrideDate}
                onToggle={setUseOverrideDate}
                onChange={setOverrideDate}
              />

              {/* Card suffix → member mapping */}
              {stats.cardSuffixes.length > 0 && (
                <MemberMappingPicker
                  cardSuffixes={stats.cardSuffixes}
                  members={members}
                  memberMap={memberMap}
                  onChange={setMemberMap}
                />
              )}

              {/* Bulk subscription-type label (optional) */}
              <SubscriptionCategoryPicker
                value={subscriptionCategory}
                onChange={setSubscriptionCategory}
              />

              {/* Duplicate filter actions */}
              {stats.dupTotal > 0 && (
                <div className="rounded-2xl p-3 bg-amber-50 dark:bg-amber-900/15 ring-1 ring-amber-200 dark:ring-amber-800">
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-caption font-bold text-amber-700 dark:text-amber-300 mb-0.5">
                        중복 가능성 {stats.dupTotal}건 감지
                      </p>
                      <p className="text-[11px] text-amber-600 dark:text-amber-400 leading-relaxed">
                        완전 중복 {stats.dupExact} · 유사 {stats.dupLikely} · 가능성 {stats.dupPossible}
                      </p>
                      <div className="flex gap-2 mt-2 flex-wrap">
                        <button
                          type="button"
                          onClick={skipAllDuplicates}
                          className="text-[11px] font-semibold px-2.5 h-7 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 hover:brightness-95"
                        >
                          중복 전체 제외
                        </button>
                        <button
                          type="button"
                          onClick={includeAll}
                          className="text-[11px] font-semibold px-2.5 h-7 rounded-full bg-surface-primary text-sub ring-1 ring-base hover:bg-[var(--hover-bg)]"
                        >
                          전체 포함
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* AI fallback for unmatched merchants */}
              {uniqueAiMerchants.length > 0 && (
                <div className="rounded-2xl p-3 bg-violet-50 dark:bg-violet-900/15 ring-1 ring-violet-200 dark:ring-violet-800">
                  <div className="flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-violet-600 dark:text-violet-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-caption font-bold text-violet-700 dark:text-violet-300 mb-0.5">
                        AI 자동 분류 가능 — 미분류·낮은 신뢰도 가맹점 {uniqueAiMerchants.length}곳
                      </p>
                      <p className="text-[11px] text-violet-600 dark:text-violet-400 leading-relaxed">
                        Claude API로 한 번에 분류하고 학습된 매핑을 영구 저장 (다음 import부터 즉시 적용).
                        {!hasApiKey() && ' API 키는 설정 → 시스템에서 등록.'}
                      </p>
                      <div className="flex gap-2 mt-2 flex-wrap">
                        <button
                          type="button"
                          onClick={handleAiClassify}
                          disabled={aiClassifying}
                          className="text-[11px] font-semibold px-2.5 h-7 rounded-full bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {aiClassifying ? '분류 중…' : 'AI 분류 받기'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Row preview */}
              <RowList
                rows={rows}
                categories={categories}
                members={members}
                memberMap={memberMap}
                skipIndexes={skipIndexes}
                onToggle={toggleRow}
                showAll={showAllRows}
                onToggleShowAll={() => setShowAllRows(s => !s)}
                overrideDate={useOverrideDate ? overrideDate : null}
              />
            </motion.div>
          )}

          {step === 'importing' && (
            <motion.div
              key="importing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="py-12 flex flex-col items-center justify-center text-center"
            >
              <div className="relative w-16 h-16 mb-4">
                <motion.div
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: 'radial-gradient(circle, color-mix(in srgb, var(--color-primary-500) 30%, transparent), transparent 70%)',
                    filter: 'blur(8px)',
                  }}
                  animate={shouldReduceMotion ? undefined : { scale: [1, 1.2, 1] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                />
                <Loader2 className="relative w-16 h-16 text-[color:var(--color-primary-500)] animate-spin" />
              </div>
              <p className="text-body3 font-bold text-heading mb-1">거래 가져오는 중...</p>
              <p className="text-caption text-sub">잠시만 기다려 주세요</p>
            </motion.div>
          )}

          {step === 'result' && importResult && (
            <motion.div
              key="result"
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: durations.base, ease: easeOutExpo }}
              className="py-8 flex flex-col items-center text-center"
            >
              <motion.div
                initial={shouldReduceMotion ? undefined : { scale: 0, rotate: -90 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ ...springSnappy, delay: 0.1 }}
                className="w-20 h-20 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center mb-4"
                style={{ boxShadow: '0 8px 24px rgba(16,185,129,0.40)' }}
              >
                <Check className="w-10 h-10 text-white" strokeWidth={3} />
              </motion.div>
              <h3 className="text-title2 font-bold text-heading mb-1">가져오기 완료</h3>
              <p className="text-body3 text-sub mb-4">
                {importResult.imported}건의 거래가 등록되었습니다
                {importResult.skipped > 0 && ` · ${importResult.skipped}건 건너뜀`}
              </p>
              <div className="grid grid-cols-3 gap-3 w-full max-w-sm">
                <ResultStat label="등록" value={importResult.imported} color="var(--value-positive)" />
                <ResultStat label="건너뜀" value={importResult.skipped} color="var(--text-sub)" />
                <ResultStat label="총 감지" value={importResult.totalParsed} color="var(--color-primary-500)" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogBody>

      {/* ─── Footer ─── */}
      <DialogFooter className="!mt-0 px-5 sm:px-7 py-4 border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-secondary)]/40 backdrop-blur-sm">
        {step === 'input' && (
          <>
            <FooterButton variant="ghost" onClick={handleClose}>취소</FooterButton>
            <FooterButton variant="primary" onClick={handleAnalyze} disabled={!text.trim()}>
              <span>분석</span>
              <ArrowRight className="w-4 h-4" />
            </FooterButton>
          </>
        )}
        {step === 'review' && (
          <>
            <FooterButton variant="ghost" onClick={() => setStep('input')}>
              <ArrowLeft className="w-4 h-4" />
              <span>이전</span>
            </FooterButton>
            <FooterButton
              variant="primary"
              onClick={handleImport}
              disabled={
                stats.selected === 0 ||
                (stats.cardSuffixes.length > 0 && !allCardSuffixesMapped) ||
                (useOverrideDate && !overrideDate)
              }
            >
              <Check className="w-4 h-4" strokeWidth={3} />
              <span>{stats.selected}건 가져오기</span>
            </FooterButton>
          </>
        )}
        {step === 'importing' && (
          <FooterButton variant="ghost" disabled>가져오는 중...</FooterButton>
        )}
        {step === 'result' && (
          <FooterButton variant="primary" onClick={handleClose} fullWidth>완료</FooterButton>
        )}
        {importError && step === 'review' && (
          <p className="text-caption text-status-danger w-full text-center mt-2">{importError}</p>
        )}
      </DialogFooter>
    </Dialog>
  )
}

// ════════════════════════════════════════════════════════
// Subcomponents
// ════════════════════════════════════════════════════════

function PremiumHeader({ step, onClose, canClose }: { step: Step; onClose: () => void; canClose: boolean }) {
  const stepInfo: Record<Step, { title: string; subtitle: string }> = {
    input: { title: '카드 명세서 가져오기', subtitle: '신한·삼성카드 명세서 텍스트를 붙여넣어 주세요' },
    review: { title: '검토 및 매핑', subtitle: '거래수단 · 멤버 매핑을 확인하세요' },
    importing: { title: '가져오는 중', subtitle: '잠시만 기다려 주세요' },
    result: { title: '완료', subtitle: '거래가 성공적으로 등록되었습니다' },
  }
  const info = stepInfo[step]
  const stepIndex = step === 'input' ? 0 : step === 'review' ? 1 : step === 'importing' ? 2 : 2

  return (
    <div className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(circle at 18% 0%, oklch(0.62 0.18 250 / 0.18), transparent 50%),
            radial-gradient(circle at 88% 12%, oklch(0.72 0.16 195 / 0.14), transparent 45%)
          `,
        }}
      />
      <div className="relative px-5 sm:px-7 pt-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{
                background: 'linear-gradient(135deg, color-mix(in srgb, var(--color-primary-500) 22%, transparent), color-mix(in srgb, var(--color-primary-500) 8%, transparent))',
                boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--color-primary-500) 30%, transparent), inset 0 1px 0 0 rgba(255,255,255,0.5)',
              }}
            >
              <CreditCard className="w-4 h-4 text-[color:var(--color-primary-600)] dark:text-[color:var(--color-primary-300)]" />
            </div>
            <div className="min-w-0">
              <h2 className="text-title2 font-bold text-heading tracking-tight truncate">
                {info.title}
              </h2>
              <p className="text-[11px] text-sub font-medium mt-0.5 truncate">
                {info.subtitle}
              </p>
            </div>
          </div>
          {canClose && (
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full flex items-center justify-center text-sub hover:text-heading hover:bg-[var(--hover-bg)] transition-colors flex-shrink-0"
              aria-label="닫기"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
        {/* Step indicator */}
        <div className="mt-3 flex items-center gap-2">
          {['붙여넣기', '검토', '완료'].map((label, i) => {
            const active = i === stepIndex
            const done = i < stepIndex
            return (
              <div key={label} className="flex items-center gap-2">
                <div
                  className={clsx(
                    'flex items-center gap-1.5 px-2.5 h-6 rounded-full text-[11px] font-bold transition-all',
                    active
                      ? 'bg-[color:var(--color-primary-500)] text-white shadow-[0_2px_8px_color-mix(in_oklch,var(--color-primary-500)_30%,transparent)]'
                      : done
                        ? 'bg-[color:var(--color-primary-100)] text-[color:var(--color-primary-700)] dark:bg-[color:var(--color-primary-900)]/40 dark:text-[color:var(--color-primary-300)]'
                        : 'bg-surface-tertiary text-disabled',
                  )}
                >
                  {done ? <Check className="w-3 h-3" strokeWidth={3} /> : <span className="tabular-nums">{i + 1}</span>}
                  {label}
                </div>
                {i < 2 && <div className="w-3 h-px bg-[color:var(--border-default)]" />}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function InputStep({
  text, onChange, showSample, onToggleSample,
}: {
  text: string
  onChange: (v: string) => void
  showSample: boolean
  onToggleSample: () => void
}) {
  const lineCount = text.split('\n').filter(l => l.trim()).length
  // 카드사별로 거래 1건당 차지하는 라인 수가 다르다: Shinhan 4줄, Samsung 3줄
  const detectedCompany = text.trim() ? detectCardCompany(text) : 'unknown'
  const linesPerRow = detectedCompany === 'samsung' ? 3 : 4
  const estimatedRows = Math.floor(lineCount / linesPerRow)
  const companyLabel = detectedCompany === 'samsung' ? '삼성카드' : detectedCompany === 'shinhan' ? '신한카드' : '카드사 미감지'

  return (
    <div className="space-y-4 pt-1">
      {/* Textarea */}
      <div className="relative">
        <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-sub mb-2">
          <ClipboardPaste className="w-3.5 h-3.5 text-[color:var(--color-primary-500)]" />
          명세서 텍스트
        </label>
        <div
          className={clsx(
            'relative rounded-2xl ring-1 transition-all',
            text.trim()
              ? 'ring-[color:var(--color-primary-300)] shadow-[0_0_0_4px_color-mix(in_oklch,var(--color-primary-500)_10%,transparent)]'
              : 'ring-base',
          )}
        >
          <textarea
            value={text}
            onChange={(e) => onChange(e.target.value)}
            placeholder="신한·삼성카드 앱/웹에서 거래내역을 복사해 붙여넣으세요...&#10;&#10;[신한] 가맹점 / 금액원 / 2026.04.05 / 본인XXX&#10;[삼성] 가맹점 / 금액원 / 26. 4. 5본 인 XXXX&#10;        + 할인 라인(LINK할인혜택 -N원)은 자동 인식"
            className="w-full min-h-[280px] p-4 bg-surface-primary rounded-2xl text-caption text-heading placeholder:text-disabled outline-none resize-y tabular-nums"
            spellCheck={false}
          />
          {text.trim() && (
            <div className="absolute bottom-3 right-3 flex items-center gap-1.5">
              <span
                className={clsx(
                  'inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold shadow-md',
                  detectedCompany === 'unknown'
                    ? 'bg-surface-tertiary text-sub ring-1 ring-base'
                    : 'bg-surface-primary text-heading ring-1 ring-[color:var(--color-primary-300)]',
                )}
              >
                <CreditCard className="w-3 h-3" />
                {companyLabel}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[color:var(--color-primary-500)] text-white text-[10px] font-bold shadow-md">
                <Sparkles className="w-3 h-3" />
                ~{estimatedRows}건 감지
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Sample toggle */}
      <button
        type="button"
        onClick={onToggleSample}
        className="flex items-center gap-1.5 text-[11px] font-semibold text-[color:var(--color-primary-600)] dark:text-[color:var(--color-primary-300)] hover:underline"
      >
        {showSample ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        예시 형식 보기
      </button>

      <AnimatePresence>
        {showSample && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: durations.base, ease: easeOutExpo }}
            className="overflow-hidden"
          >
            <div className="rounded-2xl bg-surface-tertiary ring-1 ring-base p-3.5 space-y-3">
              <div>
                <p className="text-[11px] text-sub mb-2 font-semibold">
                  <FileText className="inline w-3 h-3 mr-1" />
                  신한카드 — 4줄 블록 (가맹점 / 금액 / 날짜 / 카드주인) + 선택 항목
                </p>
                <pre className="text-[11px] text-body whitespace-pre-wrap tabular-nums font-mono leading-relaxed">
                  {SAMPLE_TEXT_SHINHAN}
                </pre>
              </div>
              <div className="pt-2 border-t border-dashed border-[color:var(--border-default)]">
                <p className="text-[11px] text-sub mb-2 font-semibold">
                  <FileText className="inline w-3 h-3 mr-1" />
                  삼성카드 — 가맹점 / 금액 / "YY. M. DD본 인 XXXX" 3줄 + 할인 라인(자유 라벨)
                </p>
                <pre className="text-[11px] text-body whitespace-pre-wrap tabular-nums font-mono leading-relaxed">
                  {SAMPLE_TEXT_SAMSUNG}
                </pre>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ReviewSummary({
  stats,
  overrideDate,
}: {
  stats: { total: number; selected: number; totalAmount: number; dateRange: { from: string; to: string } | null }
  overrideDate: string | null
}) {
  return (
    <div className="rounded-3xl p-4 bg-surface-primary ring-1 ring-base shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, color-mix(in srgb, var(--value-negative) 18%, transparent), color-mix(in srgb, var(--value-negative) 6%, transparent))',
              boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--value-negative) 22%, transparent)',
            }}
          >
            <Receipt className="w-5 h-5" style={{ color: 'var(--value-negative)' }} />
          </div>
          <div>
            <p className="text-[10px] text-sub font-bold tracking-wider uppercase">선택된 거래</p>
            <p className="text-title2 font-extrabold text-heading tabular-nums">
              <span style={{ color: 'var(--value-negative)' }}>{stats.selected}</span>
              <span className="text-disabled font-semibold mx-1">/</span>
              <span className="text-sub">{stats.total}</span>
              <span className="text-sub text-caption font-bold ml-0.5">건</span>
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-sub font-bold tracking-wider uppercase">합계</p>
          <p className="text-body3-semi font-bold tabular-nums text-value-negative">
            −{stats.totalAmount.toLocaleString('ko-KR')}원
          </p>
          {overrideDate ? (
            <p className="text-[10px] mt-0.5 tabular-nums font-semibold text-[color:var(--color-primary-600)] dark:text-[color:var(--color-primary-300)]">
              지급일 {formatDate(overrideDate)}
            </p>
          ) : stats.dateRange && (
            <p className="text-[10px] text-disabled mt-0.5 tabular-nums">
              {stats.dateRange.from} ~ {stats.dateRange.to}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

const KOREAN_DOW = ['일', '월', '화', '수', '목', '금', '토'] as const

/**
 * Returns common card payment-day shortcuts so the user can land on a sensible
 * date in one tap instead of navigating the calendar. Picks reflect typical
 * Korean credit-card billing cycles (25일 is the most common payment day).
 */
function buildBillingQuickPicks(todayStr: string): { id: string; label: string; date: string }[] {
  const today = parseISO(todayStr)
  const this25 = setDayOfMonth(today, 25)
  const next25 = setDayOfMonth(addMonths(today, 1), 25)
  const thisEnd = endOfMonth(today)
  const fmt = (d: Date) => format(d, 'yyyy-MM-dd')
  return [
    { id: 'today', label: '오늘', date: todayStr },
    { id: 'this-25', label: '이번달 25일', date: fmt(this25) },
    { id: 'next-25', label: '다음달 25일', date: fmt(next25) },
    { id: 'this-end', label: '이번달 말일', date: fmt(thisEnd) },
  ]
}

/**
 * Bulk replace each row's statement date with one user-chosen date — typically
 * the credit card's payment due date. This is essential when the user tracks
 * daily cash flow (cash-basis) rather than purchase activity (accrual-basis):
 * the cash actually leaves the account on the payment date, not on each
 * individual transaction date.
 *
 * UI structure:
 *   1) Header: title + on/off pill toggle
 *   2) Hero: large selected date with weekday + relative label (오늘/내일/N일 후)
 *   3) Quick picks: today / this-month-25 / next-month-25 / this-month-end
 *   4) Inline MiniCalendar — keyed by yyyy-MM so picks across months auto-flip
 *   5) Footer description text
 */
function BillingDatePicker({
  enabled, date, onToggle, onChange,
}: {
  enabled: boolean
  date: string
  onToggle: (v: boolean) => void
  onChange: (v: string) => void
}) {
  const shouldReduceMotion = useReducedMotion()
  const today = useMemo(() => getTodayString(), [])
  const quickPicks = useMemo(() => buildBillingQuickPicks(today), [today])
  const selected = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? parseISO(date) : null
  const dow = selected ? KOREAN_DOW[selected.getDay()] : ''

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-sub">
          <CalendarIcon className="w-3.5 h-3.5 text-[color:var(--color-primary-500)]" />
          지급일 일괄 설정
        </label>
        <motion.button
          type="button"
          onClick={() => onToggle(!enabled)}
          whileTap={shouldReduceMotion ? undefined : { scale: 0.95 }}
          transition={springSnappy}
          aria-pressed={enabled}
          className={clsx(
            'inline-flex items-center gap-1 px-3 h-7 rounded-full text-[11px] font-bold transition-all',
            enabled
              ? 'bg-[color:var(--color-primary-500)] text-white shadow-[0_2px_8px_color-mix(in_oklch,var(--color-primary-500)_30%,transparent)]'
              : 'bg-surface-tertiary text-sub ring-1 ring-base hover:bg-[var(--hover-bg)]',
          )}
        >
          {enabled && <Check className="w-3 h-3" strokeWidth={3} />}
          {enabled ? '사용' : '사용 안 함'}
        </motion.button>
      </div>

      <AnimatePresence initial={false} mode="wait">
        {enabled ? (
          <motion.div
            key="on"
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: durations.fast, ease: easeOutExpo }}
            className="space-y-2.5"
          >
            {/* Hero — selected date */}
            <div
              className="rounded-2xl p-4 ring-1 ring-[color:var(--color-primary-300)] dark:ring-[color:var(--color-primary-700)]"
              style={{
                background: 'linear-gradient(135deg, color-mix(in srgb, var(--color-primary-500) 10%, var(--surface-primary)), color-mix(in srgb, var(--color-primary-500) 3%, var(--surface-primary)))',
                boxShadow: '0 0 0 4px color-mix(in oklch, var(--color-primary-500) 7%, transparent)',
              }}
            >
              {selected ? (
                <div className="flex items-end justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--color-primary-600)] dark:text-[color:var(--color-primary-300)] mb-0.5">
                      카드 대금 지급일
                    </p>
                    <p className="text-title2 font-extrabold text-heading tabular-nums leading-tight">
                      {format(selected, 'yyyy년 M월 d일')}
                      <span className="ml-1.5 text-body3 font-bold text-sub">({dow})</span>
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2.5 h-7 rounded-full bg-surface-primary/80 backdrop-blur-sm ring-1 ring-base text-[11px] font-semibold text-sub tabular-nums">
                    <CalendarIcon className="w-3 h-3" />
                    {formatDate(date)}
                  </span>
                </div>
              ) : (
                <p className="text-body3 text-status-danger font-semibold">
                  날짜를 선택해주세요.
                </p>
              )}
            </div>

            {/* Quick picks */}
            <div className="flex flex-wrap gap-1.5">
              {quickPicks.map((p) => {
                const isActive = date === p.date
                return (
                  <motion.button
                    key={p.id}
                    type="button"
                    onClick={() => onChange(p.date)}
                    whileTap={shouldReduceMotion ? undefined : { scale: 0.95 }}
                    transition={springSnappy}
                    aria-pressed={isActive}
                    className={clsx(
                      'inline-flex items-center gap-1 px-3 h-7 rounded-full text-[11px] font-bold transition-all',
                      isActive
                        ? 'bg-[color:var(--color-primary-100)] text-[color:var(--color-primary-700)] dark:bg-[color:var(--color-primary-900)]/40 dark:text-[color:var(--color-primary-300)] ring-1 ring-[color:var(--color-primary-300)] dark:ring-[color:var(--color-primary-700)]'
                        : 'bg-surface-tertiary text-sub ring-1 ring-base hover:bg-[var(--hover-bg)]',
                    )}
                  >
                    {isActive && <Check className="w-3 h-3" strokeWidth={3} />}
                    {p.label}
                  </motion.button>
                )
              })}
            </div>

            {/* Inline calendar — keyed by month so picks across months auto-flip */}
            <MiniCalendar
              key={date.slice(0, 7) || 'cal'}
              value={date}
              onChange={onChange}
              className="!p-3 sm:!p-4"
            />

            <p className="text-[11px] text-sub leading-relaxed">
              명세서의 거래일을 무시하고 위 날짜로 모든 거래를 등록합니다. 카드 대금 지급일에 맞춰 일별 현금흐름을 정확히 확인할 수 있어요.
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="off"
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: durations.fast, ease: easeOutExpo }}
            className="rounded-2xl p-3.5 bg-surface-tertiary ring-1 ring-base"
          >
            <p className="text-[11px] text-sub leading-relaxed">
              명세서에 적힌 거래일을 그대로 사용합니다.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function PaymentMethodPicker({
  value, onChange, items, selectedItemId, onItemChange,
}: {
  value: PaymentMethod
  onChange: (v: PaymentMethod) => void
  items: ReturnType<typeof useTransactionStore.getState>['paymentMethodItems']
  selectedItemId: number | ''
  onItemChange: (id: number | '') => void
}) {
  const shouldReduceMotion = useReducedMotion()
  return (
    <div>
      <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-sub mb-2">
        <Wallet className="w-3.5 h-3.5 text-[color:var(--color-primary-500)]" />
        거래수단 (전체 일괄)
      </label>
      <div className="grid grid-cols-3 gap-2">
        {PAYMENT_METHOD_OPTIONS.map(opt => {
          const Icon = PAYMENT_METHOD_ICONS[opt.value as PaymentMethod] || Wallet
          const isActive = value === opt.value
          return (
            <motion.button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              whileTap={shouldReduceMotion ? undefined : { scale: 0.95 }}
              transition={springSnappy}
              aria-pressed={isActive}
              className={clsx(
                'inline-flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-2xl text-caption font-semibold transition-all',
                isActive
                  ? 'bg-[color:var(--color-primary-500)] text-white shadow-[0_4px_14px_color-mix(in_oklch,var(--color-primary-500)_30%,transparent)]'
                  : 'bg-surface-tertiary text-sub ring-1 ring-base hover:bg-[var(--hover-bg)]',
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {opt.label}
            </motion.button>
          )
        })}
      </div>
      <AnimatePresence>
        {value !== 'cash' && items.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: durations.base, ease: easeOutExpo }}
            className="overflow-hidden"
          >
            <div className="pt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => onItemChange('')}
                className={clsx(
                  'inline-flex items-center gap-1 px-3 h-7 rounded-full text-[11px] font-semibold transition-all',
                  selectedItemId === ''
                    ? 'bg-surface-primary text-heading ring-1 ring-[color:var(--border-strong)]'
                    : 'bg-surface-secondary text-sub ring-1 ring-base hover:bg-[var(--hover-bg)]',
                )}
              >
                미지정
              </button>
              {items.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onItemChange(item.id!)}
                  className={clsx(
                    'inline-flex items-center gap-1 px-3 h-7 rounded-full text-[11px] font-semibold transition-all',
                    selectedItemId === item.id
                      ? 'bg-[color:var(--color-primary-100)] text-[color:var(--color-primary-700)] dark:bg-[color:var(--color-primary-900)]/40 dark:text-[color:var(--color-primary-300)] ring-1 ring-[color:var(--color-primary-300)] dark:ring-[color:var(--color-primary-700)]'
                      : 'bg-surface-secondary text-sub ring-1 ring-base hover:bg-[var(--hover-bg)]',
                  )}
                >
                  {selectedItemId === item.id && <Check className="w-3 h-3" />}
                  {item.name}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function MemberMappingPicker({
  cardSuffixes, members, memberMap, onChange,
}: {
  cardSuffixes: string[]
  members: ReturnType<typeof useMemberStore.getState>['members']
  memberMap: Record<string, number>
  onChange: (m: Record<string, number>) => void
}) {
  const shouldReduceMotion = useReducedMotion()
  if (members.length === 0) return null
  return (
    <div>
      <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-sub mb-2">
        <Users className="w-3.5 h-3.5 text-[color:var(--color-primary-500)]" />
        카드 끝자리 → 멤버 매핑
      </label>
      <div className="space-y-2">
        {cardSuffixes.map(suffix => (
          <div
            key={suffix}
            className="flex items-center gap-3 p-2.5 rounded-2xl bg-surface-tertiary ring-1 ring-base"
          >
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-primary text-caption font-bold tabular-nums text-heading ring-1 ring-base">
              <CreditCard className="w-3.5 h-3.5 text-disabled" />
              본인{suffix}
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-disabled flex-shrink-0" />
            <div className="flex flex-wrap gap-1.5 flex-1">
              {members.map(m => {
                const isActive = memberMap[suffix] === m.id
                return (
                  <motion.button
                    key={m.id}
                    type="button"
                    onClick={() => onChange({ ...memberMap, [suffix]: m.id! })}
                    whileTap={shouldReduceMotion ? undefined : { scale: 0.95 }}
                    transition={springSnappy}
                    className={clsx(
                      'inline-flex items-center gap-1.5 pl-1 pr-2.5 h-7 rounded-full text-[11px] font-bold transition-all',
                      isActive ? 'text-white' : 'text-sub',
                    )}
                    style={
                      isActive
                        ? {
                            background: `linear-gradient(135deg, ${m.color}, color-mix(in srgb, ${m.color} 75%, black))`,
                            boxShadow: `0 2px 8px color-mix(in srgb, ${m.color} 38%, transparent)`,
                          }
                        : { background: 'var(--surface-primary)' }
                    }
                  >
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                      style={{
                        backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : m.color,
                      }}
                    >
                      {m.name?.slice(0, 1) || '?'}
                    </span>
                    {m.name}
                  </motion.button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Bulk subscription-type label picker. Lets the user tag every imported row
 * with a single SubscriptionCategoryType (e.g., productivity, cloud) in one
 * pick — useful for SaaS-heavy statements. Optional; empty means "no label".
 */
function SubscriptionCategoryPicker({
  value, onChange,
}: {
  value: SubscriptionCategoryType | ''
  onChange: (v: SubscriptionCategoryType | '') => void
}) {
  const shouldReduceMotion = useReducedMotion()
  return (
    <div>
      <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-sub mb-2">
        <Sparkles className="w-3.5 h-3.5 text-[color:var(--color-primary-500)]" />
        구독 분류 일괄 라벨
        <span className="font-normal text-disabled normal-case">선택</span>
      </label>
      <div className="flex flex-wrap gap-1.5">
        <motion.button
          type="button"
          onClick={() => onChange('')}
          whileTap={shouldReduceMotion ? undefined : { scale: 0.95 }}
          transition={springSnappy}
          aria-pressed={value === ''}
          className={clsx(
            'inline-flex items-center gap-1 px-3 h-7 rounded-full text-[11px] font-semibold transition-all',
            value === ''
              ? 'bg-surface-primary text-heading ring-1 ring-[color:var(--border-strong)]'
              : 'bg-surface-secondary text-sub ring-1 ring-base hover:bg-[var(--hover-bg)]',
          )}
        >
          미지정
        </motion.button>
        {SUBSCRIPTION_CATEGORIES.map((opt) => {
          const isActive = value === opt.value
          return (
            <motion.button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              whileTap={shouldReduceMotion ? undefined : { scale: 0.95 }}
              transition={springSnappy}
              aria-pressed={isActive}
              className={clsx(
                'inline-flex items-center gap-1.5 pl-1 pr-2.5 h-7 rounded-full text-[11px] font-bold transition-all',
                isActive ? 'text-white' : 'text-sub',
              )}
              style={
                isActive
                  ? {
                      background: `linear-gradient(135deg, ${opt.color}, color-mix(in srgb, ${opt.color} 75%, black))`,
                      boxShadow: `0 2px 8px color-mix(in srgb, ${opt.color} 38%, transparent)`,
                    }
                  : { background: 'var(--surface-secondary)', boxShadow: 'inset 0 0 0 1px var(--border-default)' }
              }
            >
              <span
                className="w-4 h-4 rounded-full flex items-center justify-center"
                style={{ backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : opt.color }}
              />
              {opt.label}
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}

function RowList({
  rows, categories, members, memberMap, skipIndexes, onToggle, showAll, onToggleShowAll, overrideDate,
}: {
  rows: AnalyzedRow[]
  categories: ReturnType<typeof useTransactionStore.getState>['categories']
  members: ReturnType<typeof useMemberStore.getState>['members']
  memberMap: Record<string, number>
  skipIndexes: Set<number>
  onToggle: (index: number) => void
  showAll: boolean
  onToggleShowAll: () => void
  overrideDate: string | null
}) {
  const COLLAPSED = 8
  const rendered = showAll ? rows : rows.slice(0, COLLAPSED)
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-sub">
          <Tag className="w-3.5 h-3.5 text-[color:var(--color-primary-500)]" />
          거래 미리보기
          <span className="font-normal text-disabled normal-case">{rows.length}건</span>
        </label>
      </div>
      <div className="space-y-1.5">
        {rendered.map(row => (
          <RowItem
            key={row.index}
            row={row}
            categories={categories}
            members={members}
            memberMap={memberMap}
            skip={skipIndexes.has(row.index)}
            onToggle={() => onToggle(row.index)}
            overrideDate={overrideDate}
          />
        ))}
      </div>
      {rows.length > COLLAPSED && (
        <button
          type="button"
          onClick={onToggleShowAll}
          className="mt-2.5 w-full inline-flex items-center justify-center gap-1 py-2 rounded-2xl bg-surface-tertiary ring-1 ring-base text-[11px] font-semibold text-sub hover:bg-[var(--hover-bg)] transition-colors"
        >
          {showAll ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {showAll ? '접기' : `+${rows.length - COLLAPSED}건 더보기`}
        </button>
      )}
    </div>
  )
}

function RowItem({
  row, categories, members, memberMap, skip, onToggle, overrideDate,
}: {
  row: AnalyzedRow
  categories: ReturnType<typeof useTransactionStore.getState>['categories']
  members: ReturnType<typeof useMemberStore.getState>['members']
  memberMap: Record<string, number>
  skip: boolean
  onToggle: () => void
  overrideDate: string | null
}) {
  const shouldReduceMotion = useReducedMotion()
  const cat = row.suggestion.categoryId ? categories.find(c => c.id === row.suggestion.categoryId) : null
  const Icon = getCategoryIcon(cat?.icon)
  const accentColor = cat?.color ?? 'var(--text-muted)'
  const memberId = memberMap[row.cardSuffix]
  const member = memberId ? members.find(m => m.id === memberId) : null
  const dup = row.duplicate.level
  const effectiveDate = overrideDate ?? row.date
  const isDateOverridden = overrideDate != null && overrideDate !== row.date

  return (
    <motion.button
      type="button"
      onClick={onToggle}
      whileTap={shouldReduceMotion ? undefined : { scale: 0.995 }}
      className={clsx(
        'group relative w-full text-left rounded-2xl pl-3 pr-2.5 py-2.5 transition-all ring-1',
        skip
          ? 'bg-surface-tertiary/60 ring-base opacity-60'
          : 'bg-surface-primary ring-base hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]',
      )}
    >
      <div className="flex items-center gap-2.5">
        {/* Selection checkbox */}
        <div
          className={clsx(
            'w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-all ring-1',
            skip
              ? 'bg-surface-tertiary ring-base'
              : 'bg-[color:var(--color-primary-500)] ring-transparent',
          )}
        >
          {!skip && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
        </div>

        {/* Category icon */}
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: `linear-gradient(135deg, color-mix(in srgb, ${accentColor} 18%, transparent), color-mix(in srgb, ${accentColor} 6%, transparent))`,
            boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${accentColor} 22%, transparent)`,
          }}
        >
          <Icon className="w-4 h-4" style={{ color: accentColor }} />
        </div>

        {/* Body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-caption font-bold text-heading truncate">
              {row.merchant}
            </span>
            {dup !== 'none' && <DuplicateBadge level={dup} />}
            {row.suggestion.confidence !== 'high' && cat && (
              <span className="text-[9px] font-semibold uppercase tracking-wider text-disabled">
                {row.suggestion.confidence === 'medium' ? '추정' : '낮음'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-sub tabular-nums">
            <span
              className={clsx(
                'inline-flex items-center gap-0.5',
                isDateOverridden && 'font-semibold text-[color:var(--color-primary-600)] dark:text-[color:var(--color-primary-300)]',
              )}
            >
              <CalendarIcon className="w-2.5 h-2.5" />
              {formatDate(effectiveDate)}
              {isDateOverridden && (
                <span className="ml-1 text-[9px] text-disabled line-through font-normal">
                  {formatDate(row.date)}
                </span>
              )}
            </span>
            {cat && (
              <span className="inline-flex items-center gap-0.5">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: cat.color }}
                />
                {cat.name}
              </span>
            )}
            {member && (
              <span
                className="inline-flex items-center gap-0.5"
                style={{ color: member.color }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: member.color }} />
                {member.name}
              </span>
            )}
            {row.discount && (
              <span className="text-disabled">−{row.discount.toLocaleString()}원 할인</span>
            )}
          </div>
        </div>

        {/* Amount */}
        <div className="text-right flex-shrink-0">
          <p className="text-caption font-bold text-value-negative tabular-nums">
            −{row.amount.toLocaleString('ko-KR')}
          </p>
          <p className="text-[9px] text-disabled">원</p>
        </div>
      </div>
    </motion.button>
  )
}

function DuplicateBadge({ level }: { level: DuplicateLevel }) {
  if (level === 'none') return null
  const map: Record<Exclude<DuplicateLevel, 'none'>, { label: string; cls: string; icon: typeof AlertTriangle }> = {
    exact: { label: '중복', cls: 'bg-status-danger-soft text-status-danger ring-status-danger/20', icon: AlertTriangle },
    likely: { label: '유사', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 ring-amber-300/40', icon: AlertTriangle },
    possible: { label: '가능', cls: 'bg-surface-tertiary text-sub ring-base', icon: AlertTriangle },
  }
  const item = map[level]
  const Icon = item.icon
  return (
    <span className={clsx('inline-flex items-center gap-0.5 px-1.5 h-[14px] rounded-full text-[9px] font-bold ring-1', item.cls)}>
      <Icon className="w-2 h-2" />
      {item.label}
    </span>
  )
}

function ResultStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      className="rounded-2xl p-3 bg-surface-primary ring-1 ring-base text-center"
    >
      <p className="text-[10px] text-sub font-semibold uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-title2 font-extrabold tabular-nums" style={{ color }}>
        {value}
      </p>
    </div>
  )
}

function FooterButton({
  variant, onClick, disabled, fullWidth, children,
}: {
  variant: 'primary' | 'ghost'
  onClick?: () => void
  disabled?: boolean
  fullWidth?: boolean
  children: React.ReactNode
}) {
  const shouldReduceMotion = useReducedMotion()
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileHover={shouldReduceMotion || disabled ? undefined : { y: -1 }}
      whileTap={shouldReduceMotion || disabled ? undefined : { scale: 0.97 }}
      transition={springSnappy}
      className={clsx(
        'h-12 px-5 rounded-2xl text-body3 font-bold inline-flex items-center justify-center gap-1.5 transition-all',
        'disabled:opacity-50 disabled:pointer-events-none',
        fullWidth && 'w-full',
        variant === 'primary'
          ? 'text-white'
          : 'text-sub bg-surface-tertiary ring-1 ring-base hover:bg-[var(--hover-bg)]',
      )}
      style={
        variant === 'primary' && !disabled
          ? {
              background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-700))',
              boxShadow: '0 6px 20px color-mix(in oklch, var(--color-primary-500) 38%, transparent), inset 0 1px 0 0 rgba(255,255,255,0.3)',
            }
          : undefined
      }
    >
      {children}
    </motion.button>
  )
}

