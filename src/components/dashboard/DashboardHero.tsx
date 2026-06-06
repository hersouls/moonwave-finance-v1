import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import {
  Wallet,
  Landmark,
  CreditCard,
  CalendarClock,
  Cloud,
  CloudOff,
  RefreshCw,
  Plus,
  type LucideIcon,
} from 'lucide-react'
import { RingProgress } from '@/components/ui/RingProgress'
import { useAuthStore } from '@/stores/authStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useUIStore } from '@/stores/uiStore'
import { useTransactionStore } from '@/stores/transactionStore'
import { useSubscriptionData } from '@/hooks/useSubscriptionData'
import { useSyncListener } from '@/hooks/useSyncListener'
import { getBudgetsByMonth } from '@/services/database'
import { getCurrentMonthString, formatMonthDayWeekKo } from '@/lib/dateUtils'
import {
  formatKoreanCompact,
  formatKoreanCompactChange,
} from '@/utils/format'
import type { AssetStats } from '@/lib/types'

/* ───────────────────────────────────────────
   대시보드 히어로 밴드 (Health dash-hero 1:1 포트)
   흐르는 그라데이션 + 인사 + 이번달 예산 미션 + 핵심지표 글래스 칩
   ─────────────────────────────────────────── */

interface HeroChip {
  icon: LucideIcon
  label: string
  value: string
  sub: string
  to: string
  /** 금액 칩 여부 — hideAmounts 설정 시 블러 마스킹 */
  masked?: boolean
  subMasked?: boolean
}

interface DashboardHeroProps {
  stats: AssetStats
  /** 첫 방문(자산 0건) 환영 모드 — 미션/칩 없이 인사만 */
  welcome?: boolean
}

/** 이번달 예산 합계 — 스토어가 없는 도메인이라 Dexie에서 직접 읽고 sync echo로 갱신 */
function useMonthlyBudgetTotal(month: string): number {
  const [total, setTotal] = useState(0)

  useEffect(() => {
    let cancelled = false
    const load = () =>
      getBudgetsByMonth(month)
        .then((budgets) => {
          if (!cancelled) setTotal(budgets.reduce((sum, b) => sum + b.amount, 0))
        })
        .catch(() => {
          /* Dexie 미초기화 등 — 예산 없음으로 둔다 */
        })
    load()
    return () => {
      cancelled = true
    }
  }, [month])

  useSyncListener(() => {
    getBudgetsByMonth(month)
      .then((budgets) => setTotal(budgets.reduce((sum, b) => sum + b.amount, 0)))
      .catch(() => {})
  }, ['budgets'])

  return total
}

export function DashboardHero({ stats, welcome = false }: DashboardHeroProps) {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const syncStatus = useAuthStore((s) => s.syncStatus)
  const hideAmounts = useSettingsStore((s) => !!s.settings.hideAmounts)
  const openTransactionCreateModal = useUIStore((s) => s.openTransactionCreateModal)
  const transactions = useTransactionStore((s) => s.transactions)
  const { detected } = useSubscriptionData()

  const month = getCurrentMonthString()
  const budgetTotal = useMonthlyBudgetTotal(month)

  const name = user?.displayName || '사용자'
  const today = formatMonthDayWeekKo()

  /* 이번달 수입/지출 (LedgerSummaryCard와 동일 집계) */
  const { monthIncome, monthExpense } = useMemo(() => {
    let income = 0
    let expense = 0
    for (const t of transactions) {
      if (!t.date.startsWith(month)) continue
      if (t.type === 'income') income += t.amount
      else if (t.type === 'expense') expense += t.amount
    }
    return { monthIncome: income, monthExpense: expense }
  }, [transactions, month])

  /* 미션 스트립 — 예산이 있으면 예산 사용률, 없으면 수입 대비 지출률 */
  const mission = useMemo(() => {
    const base = budgetTotal > 0 ? budgetTotal : monthIncome
    const pct = base > 0 ? Math.round((monthExpense / base) * 100) : 0
    if (budgetTotal > 0) {
      const remaining = budgetTotal - monthExpense
      return {
        title: '이번달 예산',
        ringLabel: '사용',
        pctText: `${pct}%`,
        base,
        sub:
          remaining >= 0
            ? `남은 예산 ${formatKoreanCompact(remaining)}원`
            : `예산 ${formatKoreanCompact(-remaining)}원 초과 — 지출을 점검해 보세요`,
      }
    }
    if (monthIncome > 0) {
      return {
        title: '이번달 가계부',
        ringLabel: '지출',
        pctText: `${pct}%`,
        base,
        sub: `수입 ${formatKoreanCompact(monthIncome)}원 · 지출 ${formatKoreanCompact(monthExpense)}원`,
      }
    }
    return {
      title: '이번달 가계부',
      ringLabel: '지출',
      pctText: '—',
      base: 0,
      sub:
        monthExpense > 0
          ? `지출 ${formatKoreanCompact(monthExpense)}원 — 예산을 설정해 보세요`
          : '이번달 첫 거래를 기록해 보세요',
    }
  }, [budgetTotal, monthIncome, monthExpense])

  /* 결제 예정 구독 — Health '예정 진료' 칩과 동일하게 카운트는 무제한, sub는 최근접 */
  const upcoming = useMemo(
    () =>
      detected
        .filter((s) => s.daysUntilNext >= 0)
        .sort((a, b) => a.daysUntilNext - b.daysUntilNext),
    [detected],
  )

  const chips: HeroChip[] = [
    {
      icon: Wallet,
      label: '순자산',
      value: `${formatKoreanCompact(stats.netWorth)}원`,
      sub: `오늘 ${formatKoreanCompactChange(stats.dailyChange)}원`,
      to: '/assets',
      masked: true,
      subMasked: true,
    },
    {
      icon: Landmark,
      label: '총자산',
      value: `${formatKoreanCompact(stats.totalAssets)}원`,
      sub: `이번달 ${formatKoreanCompactChange(stats.assetMonthlyChange)}원`,
      to: '/assets',
      masked: true,
      subMasked: true,
    },
    {
      icon: CreditCard,
      label: '총부채',
      value: `${formatKoreanCompact(stats.totalLiabilities)}원`,
      sub:
        stats.totalLiabilities > 0
          ? `이번달 ${formatKoreanCompactChange(stats.liabilityMonthlyChange)}원`
          : '부채 없음',
      to: '/liabilities',
      masked: true,
      subMasked: stats.totalLiabilities > 0,
    },
    {
      icon: CalendarClock,
      label: '결제 예정',
      value: `${upcoming.length}건`,
      sub: upcoming[0]
        ? `${upcoming[0].daysUntilNext === 0 ? '오늘' : `D-${upcoming[0].daysUntilNext}`} · ${upcoming[0].name}`
        : '예정 없음',
      to: '/subscriptions',
    },
  ]

  return (
    <div className="dash-hero p-6 sm:p-8">
      {/* 장식 — 부유 도형 */}
      <div className="dash-hero__shapes" aria-hidden="true">
        <span className="dash-hero__shape dash-hero__shape--a" />
        <span className="dash-hero__shape dash-hero__shape--b" />
        <span className="dash-hero__shape dash-hero__shape--c" />
      </div>

      <div className="dash-hero__content">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-white/75">{today}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
              안녕하세요, {name}님 <span className="inline-block">👋</span>
            </h1>
            <p className="mt-1.5 text-sm text-white/80">
              {welcome
                ? '자산·가계부·구독을 한 곳에서 관리해 보세요'
                : '오늘도 건강한 재무 습관을 만들어 보세요'}
            </p>
          </div>
          {user && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium text-white ring-1 ring-white/20 backdrop-blur-sm">
              {syncStatus === 'syncing' ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : syncStatus === 'error' ? (
                <CloudOff className="h-3.5 w-3.5" />
              ) : (
                <Cloud className="h-3.5 w-3.5" />
              )}
              {syncStatus === 'syncing'
                ? '동기화 중'
                : syncStatus === 'error'
                  ? '동기화 오류'
                  : '클라우드 동기화'}
            </span>
          )}
        </div>

        {/* 이번달 예산 미션 — 사용률 링 + 거래 추가 CTA */}
        {!welcome && (
          <div className="mt-6 flex items-center gap-4 rounded-2xl bg-white/10 p-4 ring-1 ring-white/20 backdrop-blur-sm sm:gap-5 sm:p-5">
            <RingProgress
              value={monthExpense}
              max={mission.base}
              size={72}
              strokeWidth={7}
              color="#ffffff"
              trackColor="rgba(255,255,255,0.22)"
            >
              <span className="text-base font-bold leading-none text-white tabular-nums">
                {mission.pctText}
              </span>
              <span className="mt-0.5 text-[9px] text-white/70">{mission.ringLabel}</span>
            </RingProgress>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold sm:text-base">{mission.title}</p>
              <p
                className={clsx(
                  'mt-1 truncate text-xs text-white/75 sm:text-sm tabular-nums',
                  hideAmounts && 'amount-masked',
                )}
              >
                {mission.sub}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                // CommandPalette의 goAndOpen 관례 — 모달은 LedgerPage에 마운트되어 있다
                navigate('/ledger/expense')
                openTransactionCreateModal()
              }}
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-3.5 py-2 text-xs font-bold text-[#6d28d9] shadow-lg shadow-black/10 transition-all hover:scale-[1.04] hover:shadow-xl active:scale-95 sm:gap-1.5 sm:px-4 sm:py-2.5 sm:text-sm"
            >
              <Plus className="h-4 w-4" />
              거래 추가
            </button>
          </div>
        )}

        {/* 핵심지표 글래스 칩 */}
        {!welcome && (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {chips.map((c) => {
              const Icon = c.icon
              return (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => navigate(c.to)}
                  className="cursor-pointer rounded-2xl bg-white/10 px-4 py-3 text-left ring-1 ring-white/15 backdrop-blur-sm transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                >
                  <div className="flex items-center gap-1.5 text-xs font-medium text-white/75">
                    <Icon className="h-3.5 w-3.5" />
                    {c.label}
                  </div>
                  <p
                    className={clsx(
                      'mt-1.5 text-xl font-bold leading-none tabular-nums',
                      hideAmounts && c.masked && 'amount-masked',
                    )}
                    data-reveal={hideAmounts && c.masked ? 'false' : undefined}
                  >
                    {c.value}
                  </p>
                  <p
                    className={clsx(
                      'mt-1.5 truncate text-[11px] text-white/60 tabular-nums',
                      hideAmounts && c.subMasked && 'amount-masked',
                    )}
                  >
                    {c.sub}
                  </p>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
