# Moonwave Ledger v2.0 "Prism" — 상세 개발문서

> **프로젝트**: 가계부 섹션 하이엔드 UI/UX 전면 업그레이드
> **대상**: `src/components/ledger/*`, `src/hooks/useTransactionFilters`, `src/stores/transactionStore`
> **기반 디자인 시스템**: Moonwave Foundation CSS v2 "Obsidian" (이미 구축 완료)
> **작성일**: 2026-04-18
> **문서 버전**: 1.0 (착수 전)
> **예상 개발 기간**: 3주 (옵션 B 기준) / 5주 (옵션 C 전체)

---

## 📋 목차

1. [Executive Summary](#1-executive-summary)
2. [현황 진단 (As-Is)](#2-현황-진단-as-is)
3. [목표 설계 (To-Be)](#3-목표-설계-to-be)
4. [Information Architecture 재설계](#4-information-architecture-재설계)
5. [Phase별 상세 개발 스펙](#5-phase별-상세-개발-스펙)
6. [컴포넌트 Inventory](#6-컴포넌트-inventory)
7. [데이터 모델 & 계산 로직](#7-데이터-모델--계산-로직)
8. [모션 안무 & 애니메이션](#8-모션-안무--애니메이션)
9. [반응형 레이아웃 그리드](#9-반응형-레이아웃-그리드)
10. [접근성 상세 계획](#10-접근성-상세-계획)
11. [성능 예산 & 최적화](#11-성능-예산--최적화)
12. [테스트 전략](#12-테스트-전략)
13. [마이그레이션 & 롤아웃](#13-마이그레이션--롤아웃)
14. [KPI 측정 계획](#14-kpi-측정-계획)
15. [리스크 레지스터](#15-리스크-레지스터)
16. [파일 변경 영향도](#16-파일-변경-영향도)
17. [개발 타임라인](#17-개발-타임라인)
18. [부록: 디자인 세부 사양](#18-부록-디자인-세부-사양)

---

## 1. Executive Summary

### 1.1 핵심 방향
**"재무 인사이트 + 빠른 기록"** — 가계부는 단순 기록 도구가 아니라 *이번 달 내 돈의 흐름을 0.5초 안에 파악할 수 있는 재무 대시보드*로 진화.

### 1.2 Five Pillars (재설계 원칙)
1. **One Focal Point**: 매 화면 최상단에 단일 hero 금액
2. **Temporal Grouping**: 거래 목록은 날짜별 sticky 그룹
3. **Ambient Insights**: 계산 없이도 보이는 자동 trend 배지
4. **Fluid Surfaces**: 반응형 1-col / 2-col / 3-col 자연스러운 전환
5. **Performance by Default**: 1500건 이상도 60fps

### 1.3 Non-Negotiables
- Foundation CSS v2 Obsidian 토큰만 사용 (커스텀 색 0)
- 데이터 스키마/Zustand store API 무변경
- 기존 Wizard/ActionSheet 로직 100% 보존
- 팔레트 4색 × 다크 × OLED 모든 조합 동작

### 1.4 Out of Scope (이번 릴리스 제외)
- 카테고리 CRUD 재설계 (설정에서 처리)
- 예산 설정 플로우 (별도 플로우)
- Firebase 동기화 로직 변경
- 차트 라이브러리 도입 (SVG 자체 구현 선호)

---

## 2. 현황 진단 (As-Is)

### 2.1 컴포넌트 Tree (현재)

```
<LedgerPage>
├── <PageSegmentControl> (지출/수입/캘린더)
├── <div swipe-zone>
│   ├── Month Navigator (< 2026년 4월 >)
│   ├── <MonthlySummary> (수입/지출/잔액 3-card)
│   └── <BudgetOverviewCard> (progress bar + 3 통계)
├── <TransactionFilters>
│   ├── Row 1: 검색바 + 필터 버튼
│   ├── Row 2: 타입 세그먼트 (전체/지출/수입 pill)
│   ├── Row 3: Active filter pills (conditional)
│   └── Row 4: 확장 패널 (정렬/기간/카테고리/구성원/결제/금액)
├── <CategoryBreakdown type="expense">  (2-col grid)
├── <CategoryBreakdown type="income">
├── <TransactionList>
│   └── <TransactionCard> × N  (평면 리스트, 그룹핑 없음)
├── <FAB>
├── <TransactionWizard>  (create modal)
└── <TransactionFormModal>  (edit modal)
```

### 2.2 스크롤 깊이 측정 (375px 모바일, 5건 거래)

| 섹션 | 높이 (px) | 누적 |
|---|---|---|
| PageSegmentControl | 64 | 64 |
| Month Navigator | 56 | 120 |
| MonthlySummary (3-card) | 140 | 260 |
| BudgetOverviewCard | 180 | 440 |
| TransactionFilters (접힘) | 140 | 580 |
| CategoryBreakdown (2 sections) | 280 | 860 |
| TransactionCard × 5 | 380 | 1,240 |

→ **첫 거래가 화면에 보이려면 약 580-860px 스크롤 필요** (뷰포트 667px 기준)

### 2.3 정보 밀도 분석

| 영역 | 표시되는 정보 개수 | 실제 자주 쓰는 것 | 오버엔지니어링 비율 |
|---|---|---|---|
| MonthlySummary | 3 금액 + 3 아이콘 | 2 (지출/잔액) | 33% |
| BudgetOverviewCard | 3 금액 + progress | 1 (진행률) | 50% |
| TransactionFilters 확장 패널 | 6 섹션 × 2-5 옵션 | 2-3개 옵션만 | 60% |
| CategoryBreakdown | 2 섹션 × 5 카테고리 | 상위 3 | 40% |

### 2.4 성능 측정 (baseline)
- 거래 100건 기준 초기 렌더: **~180ms** (acceptable)
- 거래 500건 기준 초기 렌더: **~450ms** (저하)
- 검색 입력 typing: **~80ms/keystroke** (500건 기준)
- Lighthouse Performance: **95** (현재 그린)

---

## 3. 목표 설계 (To-Be)

### 3.1 핵심 지표 변화 목표

| 지표 | Baseline | Target | 측정 방법 |
|---|---|---|---|
| 가계부 진입 → 월 총액 인지 | ~3s (3-card 중 찾아야) | **<0.5s** (단일 hero) | 사용자 테스트 |
| 첫 거래 목록 노출까지 스크롤 | ~800px | **0px** | DevTools |
| Transaction List 렌더 (1000건) | unmeasured | **<100ms** | Performance Monitor |
| 필터 열고 카테고리 적용까지 탭 | 4탭 | **2탭** | Task time |
| 인사이트 배지 노출률 | 0% | **80%** (전월 대비 +10%↑인 월) | Analytics |
| Lighthouse Performance | 95 | **95 유지** | Lighthouse CI |
| 가계부 체류 시간 (평균) | Baseline | **+30%** | GA Analytics |

### 3.2 컴포넌트 Tree (목표)

```
<LedgerPage>
├── <PageSegmentControl> (유지)
├── <LedgerHero>                          ← ⭐ 신규
│   ├── Month Navigator (통합)
│   ├── Focal Amount (대형 display)
│   ├── Trend Indicator (+12.3% ↑)
│   ├── Mini Sparkline (최근 30일)
│   └── Secondary Metrics (수입 / 저축률)
├── <LedgerInsightsRow>                    ← ⭐ 신규 (가로 스크롤)
│   ├── <BudgetRingCard>                   ← ⭐ SVG donut
│   ├── <TopCategoryCard>                  ← ⭐ trend badge
│   ├── <SubscriptionCard>                 ← ⭐ link to subscriptions
│   └── <UpcomingBillsCard>                ← ⭐ 결제 예정
├── <QuickRecordStrip>                     ← ⭐ 신규 (top 5 빠른 기록)
├── <LedgerFilterBar>                      ← 기존 TransactionFilters 축약
│   ├── 검색바
│   ├── Active filter chips (inline)
│   └── [필터] → Bottom sheet 열기
├── <TransactionListGrouped>               ← ⭐ 신규 (날짜 sticky 그룹)
│   ├── <DateGroupHeader date="오늘" count={3} total={...} />
│   ├── <TransactionCard> × N
│   ├── <DateGroupHeader date="어제" ... />
│   └── ...
├── <FAB>                                   (유지)
├── <LedgerFiltersSheet>                   ← ⭐ 기존 Row 4 → Bottom sheet
├── <BudgetDetailSheet>                    ← ⭐ BudgetOverviewCard → 전체 화면 sheet
├── <TransactionWizard> / <TransactionFormModal> (유지)
└── <MonthlyReportCard>                    ← ⭐ P3: 월말 자동 요약
```

### 3.3 정보 밀도 리밸런싱

| 영역 | Before | After |
|---|---|---|
| Hero (지출 총액) | 3-card 중 하나 | **단일 display 40-64px** |
| 수입 | 3-card 중 하나 | Hero 하단 서브 텍스트 |
| 잔액 | 3-card 중 하나 | 저축률 %로 변환 (Hero 서브) |
| 예산 | Progress bar 큰 카드 | **Ring SVG mini card** (Insights) |
| 카테고리 breakdown | 2개 섹션 표 | **Insights row + 별도 sheet** |
| 필터 | 140px 고정 bar | **sticky 슬림 bar (48px) + sheet** |

---

## 4. Information Architecture 재설계

### 4.1 3-Layer Layout 원칙

```
┌─ Layer 1: TEMPORAL + FOCAL ──────────────┐
│  Month Navigator + Hero Amount + Trend   │  ← "언제, 얼마" 0.5초에 파악
│  220px                                   │
├─ Layer 2: QUICK INSIGHTS ─────────────────┤
│  4 mini cards (가로 스크롤)               │  ← 재무 상태 5초에 파악
│  120px                                   │
├─ Layer 3: LIST ──────────────────────────┤
│  Quick Record Strip                      │  ← 기록 1탭
│  44px                                   │
│  Filter Bar (sticky)                     │  ← 검색/필터
│  48px                                   │
│  Transaction List (grouped)              │  ← 세부 탐색
│  rest                                    │
└──────────────────────────────────────────┘

선택적 overlay:
  - LedgerFiltersSheet (필터 열기)
  - BudgetDetailSheet (예산 탭)
  - TransactionActionSheet (거래 탭)
  - TransactionWizard (+추가)
```

### 4.2 URL 구조 (변경 없음)

- `/ledger/expense` — 지출 중심 뷰
- `/ledger/income` — 수입 중심 뷰
- `/ledger/calendar` — 캘린더 뷰 (별도)

### 4.3 상태 흐름

```
User lands → Segment determines type filter (expense default)
           → Hero reads from useTransactionFilters.summary
           → Insights Row reads from store + useMemo trends
           → List reads filtered array + useMemo grouping by date
```

모든 계산은 기존 store + hook 기반 **derived state**로 처리 (store schema 변경 0).

---

## 5. Phase별 상세 개발 스펙

## Phase 1: Hero + 날짜 그룹 (P0, Week 1)

### 5.1.1 `<LedgerHero />` 컴포넌트

**파일**: `src/components/ledger/LedgerHero.tsx` (신규)

**Props**:
```ts
interface LedgerHeroProps {
  type: 'expense' | 'income'
  selectedMonth: string // 'YYYY-MM'
  onMonthChange: (month: string) => void
  summary: {
    totalIncome: number
    totalExpense: number
    netSavings: number
  }
  previousSummary?: { totalExpense: number; totalIncome: number }
  dailyValues?: number[] // 최근 30일 일별 지출 (sparkline 용)
}
```

**레이아웃 (모바일 375px)**:
```
┌──────────────────────────────────────────┐
│   ←   2026년 4월   →        [오늘 chip]  │  ← month navigator (top)
│                                          │
│   4월 지출 금액                          │  ← 서브 라벨
│                                          │
│   1,234,567원                            │  ← clamp(36, 9vw, 56)
│                    ↑ 12.3% 전월 대비     │  ← trend badge
│                                          │
│   ╭─────────────────────────────────╮   │
│   │       ╱╲                        │   │  ← mini sparkline (30일)
│   │  ────╱  ╲──────╱╲───────         │   │    SVG polyline
│   │                ╱  ╲              │   │    gradient fill
│   ╰─────────────────────────────────╯   │
│                                          │
│   수입 2,500,000원 · 저축률 50.6% ↑2%    │  ← 서브 메트릭 row
│                                          │
└──────────────────────────────────────────┘
```

**데스크톱 (≥1024px)**: 좌측 Hero + 우측 mini charts 가능 (Phase 6)

**스타일 토큰**:
- 배경: `var(--surface-primary)` + `shadow-[0_2px_8px_rgba(0,0,0,0.04)]`
- Border: `inset 0 0 0 1px var(--border-default)` (foundation 패턴 준수)
- Rounded: `rounded-2xl`
- Padding: `fold:p-4 p-5 sm:p-6`
- Focal amount: `text-value-negative` (지출) or `text-value-positive` (수입)
- Trend badge: 
  - 증가(지출) → `bg-status-danger-soft text-status-danger`
  - 감소(지출) → `bg-status-success-soft text-status-success`
  - 수입은 반대

**Framer Motion**:
- 숫자 변경 시 `AnimatedAmount` (useCountUp 활용)
- 달 변경 시 direction-aware slide (AnimatePresence x)
- Sparkline entry: `path` `strokeDashoffset` animate

**의존성**:
- 기존 `useCountUp` 훅
- 기존 `useTransactionFilters` 출력 `summary`
- 신규 `useDailyExpenses(month, transactions)` 훅 (Phase 1에서 함께)

---

### 5.1.2 `<TransactionListGrouped />` 컴포넌트

**파일**: `src/components/ledger/TransactionListGrouped.tsx` (신규)

**Props**:
```ts
interface TransactionListGroupedProps {
  transactions: Transaction[]
  members: Member[]
  categories: TransactionCategory[]
  /** 오늘 기준 (yyyy-MM-dd) */
  today: string
  /** 가상 스크롤 임계값 (기본 200) */
  virtualThreshold?: number
}
```

**날짜 그룹 알고리즘**:
```ts
function groupTransactionsByDate(
  transactions: Transaction[],
  today: string,
): DateGroup[] {
  // 1. 날짜 기준 내림차순 정렬
  const sorted = [...transactions].sort((a, b) => b.date.localeCompare(a.date))
  
  // 2. 날짜 라벨 변환
  const labelFor = (date: string): string => {
    if (date === today) return '오늘'
    if (date === yesterday(today)) return '어제'
    const diff = daysBetween(date, today)
    if (diff <= 7) return `${diff}일 전 · ${formatKorWeekday(date)}요일`
    return formatKorDate(date) // "4월 11일 (금)"
  }
  
  // 3. 그룹핑
  const groups = new Map<string, Transaction[]>()
  for (const t of sorted) {
    const label = labelFor(t.date)
    if (!groups.has(label)) groups.set(label, [])
    groups.get(label)!.push(t)
  }
  
  // 4. 그룹별 summary 계산 (income/expense 합계)
  return Array.from(groups.entries()).map(([label, txs]) => ({
    label,
    date: txs[0].date,
    transactions: txs,
    totalExpense: txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
    totalIncome: txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0),
    count: txs.length,
  }))
}
```

**Sticky Header 디자인**:
```
────── 오늘 · 4월 18일 · 지출 3건 ─────     ← sticky top:0, bg-surface-secondary/80 backdrop-blur
  [TransactionCard]
  [TransactionCard]
  [TransactionCard]

────── 어제 · 4월 17일 · 지출 5건 / 수입 1건 ──
  [TransactionCard]
  ...
```

**HTML/CSS 구조**:
```tsx
<div className="space-y-6">
  {groups.map(group => (
    <section key={group.label} aria-label={`${group.label} 거래`}>
      <header
        className="sticky top-0 z-[5] flex items-center justify-between gap-3 py-2 px-4 -mx-4 bg-[color:var(--surface-secondary)]/85 backdrop-blur-sm border-b border-[color:var(--border-subtle)]"
      >
        <h3 className="text-caption font-bold text-heading tabular-nums">
          {group.label}
        </h3>
        <div className="text-[11px] text-sub tabular-nums">
          {group.count}건 · {formatSummary(group)}
        </div>
      </header>
      <div className="space-y-2 pt-2">
        {group.transactions.map(t => <TransactionCard key={t.id} transaction={t} />)}
      </div>
    </section>
  ))}
</div>
```

**Framer Motion 그룹 entry**:
- 초기 렌더 시 각 group fade+y 0.03s stagger
- 새 거래 추가 시 해당 group만 re-animate (AnimatePresence)

**Virtual Scrolling** (Phase 3 확장):
- `@tanstack/react-virtual` 8.0
- Sticky header 호환 모드
- 200건 이상 자동 활성

---

## Phase 2: Quick Insights Row + Budget Ring (P1, Week 2)

### 5.2.1 `<LedgerInsightsRow />`

**파일**: `src/components/ledger/LedgerInsightsRow.tsx` (신규)

**구조**: 가로 스크롤 mini card 4개

```tsx
<div className="flex gap-3 overflow-x-auto scrollbar-none -mx-4 px-4 -my-1 py-1 snap-x snap-mandatory">
  <BudgetRingCard ... className="snap-start min-w-[180px]" />
  <TopCategoryCard ... className="snap-start min-w-[180px]" />
  <SubscriptionCard ... className="snap-start min-w-[180px]" />
  <UpcomingBillsCard ... className="snap-start min-w-[180px]" />
</div>
```

**공통 카드 스타일**:
- `rounded-2xl bg-surface-primary`
- `inset 0 0 0 1px border-default` (foundation)
- padding `p-4`
- hover `y:-2 shadow-[0_8px_24px_rgba(0,0,0,0.06)]`
- tap → 해당 detail sheet 열기

---

### 5.2.2 `<BudgetRingCard />`

**파일**: `src/components/ledger/insights/BudgetRingCard.tsx`

**SVG Ring 사양**:
- viewBox: `0 0 100 100`
- radius: 40
- stroke-width: 8
- 270° arc (bottom-right 90° gap for "남은 일수" 표시)
- Gradient stroke: `stop-color` primary-400 → primary-600
- Active progress path: `stroke-dasharray: 188.5 (=2πr×270/360)` `stroke-dashoffset` animate

**색상 임계값**:
```ts
function budgetColor(percent: number): string {
  if (percent < 60) return 'var(--viz-positive)'
  if (percent < 80) return 'oklch(0.75 0.18 70)' // amber
  if (percent < 100) return 'oklch(0.68 0.20 45)' // orange
  return 'var(--value-negative)' // red
}
```

**레이아웃**:
```
┌───────────────────┐
│ [🏦] 예산        │  ← top label + icon
│                   │
│      ╱──╲         │  ← SVG ring 주변
│    75%            │  ← 중앙 큰 숫자
│   312,000원       │  ← 남은 금액
│      ╲──╱         │
│                   │
│ 11일 남음         │  ← 하단
└───────────────────┘
```

**Framer Motion**:
- Ring arc `pathLength` animate 0 → progress (1.2s spring)
- 중앙 숫자 AnimatedAmount count-up

---

### 5.2.3 `<TopCategoryCard />`

**파일**: `src/components/ledger/insights/TopCategoryCard.tsx`

**레이아웃**:
```
┌───────────────────┐
│ [🍙] Top 카테고리 │
│                   │
│ 식비              │  ← 카테고리명
│ 320,000원         │  ← 금액
│                   │
│ ↑ +25% 전월 대비  │  ← trend badge
└───────────────────┘
```

**데이터 계산**:
```ts
function useTopCategory(transactions: Transaction[], month: string) {
  return useMemo(() => {
    const expensesThis = transactions.filter(t => 
      t.type === 'expense' && t.date.startsWith(month)
    )
    const byCategory = Map<number | null, number>()
    expensesThis.forEach(t => {
      byCategory.set(t.categoryId, (byCategory.get(t.categoryId) || 0) + t.amount)
    })
    const sorted = [...byCategory.entries()].sort((a, b) => b[1] - a[1])
    return sorted[0] // [categoryId, amount]
  }, [transactions, month])
}
```

**Trend 배지 로직**:
```ts
function useCategoryTrend(categoryId: number, month: string, transactions: Transaction[]) {
  return useMemo(() => {
    const prevMonth = getPreviousMonth(month)
    const thisTotal = sumBy(transactions, month, categoryId)
    const prevTotal = sumBy(transactions, prevMonth, categoryId)
    if (prevTotal === 0) return null
    const pct = ((thisTotal - prevTotal) / prevTotal) * 100
    return { pct, direction: pct > 0 ? 'up' : 'down' }
  }, [categoryId, month, transactions])
}
```

---

### 5.2.4 `<QuickRecordStrip />`

**파일**: `src/components/ledger/QuickRecordStrip.tsx` (신규)

**목적**: 최근 자주 쓴 거래 5개를 1-tap으로 기록

**데이터 추출**:
```ts
function useQuickRecordCandidates(transactions: Transaction[]) {
  return useMemo(() => {
    // 최근 30일 거래 중 (카테고리, 금액, 메모) 기준 빈도 top 5
    const thirtyDaysAgo = subtractDays(today(), 30)
    const recent = transactions.filter(t => t.date >= thirtyDaysAgo)
    const freq = new Map<string, { count: number; template: Transaction }>()
    recent.forEach(t => {
      const key = `${t.categoryId}:${t.amount}:${t.memo || ''}`
      const entry = freq.get(key)
      if (entry) entry.count++
      else freq.set(key, { count: 1, template: t })
    })
    return [...freq.values()]
      .filter(v => v.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map(v => v.template)
  }, [transactions])
}
```

**UI**:
```
빠른 기록  [🔥 최근 자주 사용]
[🍙 점심 8,000] [☕ 커피 4,500] [🚇 교통 1,450] [💳 카드대금 300,000] [📺 넷플릭스]
```

**tap 동작**:
- Toast "+8,000원 기록되었어요" + Undo
- Background에서 `addTransaction` 호출 (오늘 날짜로)
- 실패 시 toast error + rollback

---

## Phase 3: 필터 간소화 + Budget Detail Sheet (Week 2 하반)

### 5.3.1 `<LedgerFilterBar />` (기존 TransactionFilters 대체)

**파일**: `src/components/ledger/LedgerFilterBar.tsx` (신규)

**UI** (sticky, 48px 높이):
```
┌──────────────────────────────────────────┐
│ 🔍 검색 ... │ [식비 ×] [대성 ×]  │ [필터] │
│             │ ← inline active chips │  ← open sheet
└──────────────────────────────────────────┘
```

- 필터 버튼 탭 → `<LedgerFiltersSheet />` 슬라이드업
- Active chips inline 표시 (dismissible)
- 타입 세그먼트(전체/지출/수입)는 위의 Hero와 병합되거나 LedgerHero 내부로 이동 검토

---

### 5.3.2 `<LedgerFiltersSheet />` (신규)

**파일**: `src/components/ledger/LedgerFiltersSheet.tsx`

BottomSheet로 확장 패널을 분리. `TransactionActionSheet` 와 동일 패턴.

**구조**:
- 드래그 handle + 제목 "필터" + 초기화 버튼
- 기존 Row 4 내용 (정렬/기간/카테고리/구성원/결제/금액) 유지
- 하단 고정 "적용" 버튼 (변경 누적 count 표시)

---

### 5.3.3 `<BudgetDetailSheet />` (신규)

**파일**: `src/components/ledger/BudgetDetailSheet.tsx`

**목적**: Insights의 BudgetRingCard 탭 시 열림. 전체 예산 설정/편집.

**구조**:
- 대형 Ring (viewBox 0 0 200 200)
- 이번 달 총 예산 / 사용 / 남음 (대형 display)
- 카테고리별 예산 list (각 mini ring + progress)
- 편집 버튼 → BudgetSettingModal (기존)

---

## Phase 4: Category Donut + Trend 상세 (Week 3)

### 5.4.1 `<CategoryDonutCard />`

**파일**: `src/components/ledger/insights/CategoryDonutCard.tsx`

**SVG Donut**:
- 6 segment 상위 5 카테고리 + "기타"
- Gap 2% 각도
- 각 segment tap → 카테고리 필터 자동 적용

**계산**:
```ts
function buildDonutSegments(breakdown: CategoryBreakdown[]) {
  const top5 = breakdown.slice(0, 5)
  const others = breakdown.slice(5).reduce((sum, b) => sum + b.total, 0)
  const total = breakdown.reduce((sum, b) => sum + b.total, 0)
  
  const segments = [...top5]
  if (others > 0) {
    segments.push({
      categoryId: null,
      name: '기타',
      color: 'var(--text-muted)',
      total: others,
    })
  }
  
  let cumulativeAngle = 0
  return segments.map(s => {
    const angle = (s.total / total) * 360
    const segment = {
      ...s,
      startAngle: cumulativeAngle,
      endAngle: cumulativeAngle + angle,
      pathData: describeArc(50, 50, 40, cumulativeAngle, cumulativeAngle + angle - 2),
    }
    cumulativeAngle += angle
    return segment
  })
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, r, endAngle)
  const end = polarToCartesian(cx, cy, r, startAngle)
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`
}
```

---

## Phase 5: Virtual Scrolling + 성능 (Week 3 하반)

### 5.5.1 `@tanstack/react-virtual` 통합

**설치**: `npm i @tanstack/react-virtual` (~10kB)

**TransactionListGrouped**에서 조건부 가상화:
```ts
const shouldVirtualize = flatItems.length > (virtualThreshold ?? 200)

const virtualizer = useVirtualizer({
  count: flatItems.length,
  getScrollElement: () => parentRef.current,
  estimateSize: (index) => flatItems[index].type === 'header' ? 40 : 76,
  overscan: 5,
  getItemKey: (index) => flatItems[index].id,
})
```

**Flat items 구조**:
```ts
type FlatItem =
  | { type: 'header'; id: string; label: string; count: number; ... }
  | { type: 'transaction'; id: number; transaction: Transaction }
```

**Sticky header**는 가상화 시 약간 다른 처리 필요 — **두 번째 transactions들이 header 영역을 겹쳐 지나가는 효과**가 깨질 수 있음. `position: sticky` 포기하고 header가 scroll 따라가도록 하거나, 외부 추가 UI로 "현재 보고있는 날짜"를 top bar에 작게 표시.

---

## Phase 6: 반응형 3-Column (Week 3)

### 5.6.1 브레이크포인트별 레이아웃

**Mobile (<600px)** — 1-column
```
[Hero] → [Insights Row scroll] → [Filter Bar] → [List]
```

**Tablet (600-1023px)** — 1-column but wider padding
```
[Hero full] (max-w-md center) 
[Insights Row full]
[Filter Bar]
[List centered max-w-xl]
```

**Desktop (≥1024px)** — 3-column
```
┌─ Left: Mini nav ─┬─ Center: Main ───────┬─ Right: Side panel ─┐
│ (이미 Sidebar)    │ Hero                  │ Budget Ring        │
│                  │ Insights Row          │ Category Donut     │
│                  │ Filter Bar            │ Upcoming Bills     │
│                  │ Transaction List      │ Monthly Report     │
└──────────────────┴───────────────────────┴────────────────────┘
```

구현:
- `LedgerPage` outer wrapper: `lg:grid lg:grid-cols-[1fr_320px] lg:gap-6`
- Right panel은 `lg:block hidden` (모바일 숨김)
- Insights Row는 desktop에서 "mini cards 세로 배치" 변경 (side panel 내)

---

## Phase 7: 세부 마감 (Week 3 말)

### 5.7.1 애니메이션 안무 최종

| 이벤트 | 애니메이션 | 지속 |
|---|---|---|
| 페이지 진입 | Hero fade+y, Insights stagger 40ms | 400ms |
| 월 변경 | Hero slide-x (direction-aware) | 280ms |
| 거래 추가 | 해당 그룹에 slide-in (spring 320/24) | 320ms |
| 거래 삭제 | cross-fade + collapse height | 240ms |
| 카테고리 필터 tap | Insights donut segment highlight + bar chart tween | 400ms |
| Budget Ring 초기 | arc `pathLength` 0→progress | 1200ms |
| 숫자 변경 | useCountUp (spring 60/20) | 600ms |

### 5.7.2 접근성

- 모든 SVG 차트: `role="img"` + `aria-label` + `<title>`
- 날짜 그룹 헤더: `role="heading" aria-level="3"`
- 필터 시트: focus trap (HeadlessUI 기본)
- Live region: `aria-live="polite"` 월 변경 공지 ("4월로 이동")
- High-contrast mode: SVG stroke-width 상향 (1.5 → 2)

### 5.7.3 Empty State 재설계

**LedgerEmptyState v2**:
```
🌱
이번 달 첫 거래를 기록해볼까요?
점심값, 교통비, 커피 한 잔 — 자주 쓰는 걸로 시작해요.

[+ 지출 추가]   [☕ 커피 기록 예시]
```

- `+ 지출 추가` → Wizard 열기
- `커피 예시` → Quick Record (coffee 4,500원) 자동 기록 (데모)

---

## 6. 컴포넌트 Inventory

### 6.1 신규 컴포넌트 (15개)

| 파일 | 책임 | Phase | LOC 예상 |
|---|---|---|---|
| `ledger/LedgerHero.tsx` | Focal 카드 + month nav | P1 | 180 |
| `ledger/TransactionListGrouped.tsx` | 날짜 그룹 list | P1 | 160 |
| `ledger/LedgerInsightsRow.tsx` | 4 mini cards 가로 | P2 | 60 |
| `ledger/insights/BudgetRingCard.tsx` | SVG donut | P2 | 140 |
| `ledger/insights/TopCategoryCard.tsx` | Top 카테고리 + trend | P2 | 90 |
| `ledger/insights/SubscriptionCard.tsx` | 구독 요약 | P2 | 80 |
| `ledger/insights/UpcomingBillsCard.tsx` | 결제 예정 | P2 | 80 |
| `ledger/QuickRecordStrip.tsx` | 빠른 기록 chip | P2 | 100 |
| `ledger/LedgerFilterBar.tsx` | Sticky 슬림 필터 | P3 | 100 |
| `ledger/LedgerFiltersSheet.tsx` | 필터 bottom sheet | P3 | 220 |
| `ledger/BudgetDetailSheet.tsx` | 예산 상세 sheet | P3 | 180 |
| `ledger/insights/CategoryDonutCard.tsx` | 카테고리 donut | P4 | 140 |
| `ledger/insights/MonthlyTrendChart.tsx` | 월간 추세 sparkline | P4 | 90 |
| `ledger/DateGroupHeader.tsx` | Sticky 날짜 헤더 | P1 | 50 |
| `ledger/MonthlyReportCard.tsx` | 월말 자동 리포트 | P5 | 200 |

### 6.2 수정 컴포넌트 (6개)

| 파일 | 변경 | 영향도 |
|---|---|---|
| `LedgerPage.tsx` | 구조 재배치 (Hero/Insights/List 분리) | 높음 (하위 배치만) |
| `MonthlySummary.tsx` | **삭제** (LedgerHero로 통합) | 낮음 |
| `BudgetOverviewCard.tsx` | **간소화** (Insights Row에서 미니 ring만) + detail sheet 분리 | 중 |
| `CategoryBreakdown.tsx` | **축약** — 기존 섹션 → Insights Row TopCategoryCard + CategoryDonutCard로 분산 | 중 |
| `TransactionFilters.tsx` | **삭제/축약** → LedgerFilterBar + LedgerFiltersSheet로 분리 | 중 |
| `TransactionCard.tsx` | **그룹 context 대응**: 날짜 prefix 제거 (그룹 헤더로 이동) | 낮음 |

### 6.3 신규 훅 (5개)

| 파일 | 책임 |
|---|---|
| `hooks/useDailyExpenses.ts` | 월별 일별 지출 배열 (sparkline 용) |
| `hooks/useCategoryTrend.ts` | 카테고리별 전월 대비 % |
| `hooks/useQuickRecordCandidates.ts` | top 5 빠른 기록 후보 |
| `hooks/useTransactionGroups.ts` | 날짜 그룹핑 + summary |
| `hooks/useBudgetStatus.ts` | 예산 상태 (percent, 남은일수, 경고) |

---

## 7. 데이터 모델 & 계산 로직

### 7.1 데이터 스키마 (변경 없음)

기존 `Transaction`, `Budget`, `Subscription`, `AssetItem` 스키마 그대로 사용.

### 7.2 핵심 계산 함수

#### 7.2.1 전월 대비 증감률
```ts
function calculateMomChange(
  thisMonth: number,
  prevMonth: number,
): { diff: number; pct: number | null; direction: 'up' | 'down' | 'flat' } {
  const diff = thisMonth - prevMonth
  if (prevMonth === 0) return { diff, pct: null, direction: 'flat' }
  const pct = (diff / prevMonth) * 100
  return {
    diff,
    pct,
    direction: Math.abs(pct) < 1 ? 'flat' : pct > 0 ? 'up' : 'down',
  }
}
```

#### 7.2.2 저축률
```ts
function calculateSavingsRate(income: number, expense: number): number {
  if (income === 0) return 0
  return Math.max(0, ((income - expense) / income) * 100)
}
```

#### 7.2.3 예산 상태
```ts
interface BudgetStatus {
  totalBudget: number
  totalUsed: number
  remaining: number
  percentUsed: number
  daysRemaining: number
  status: 'safe' | 'warning' | 'critical' | 'exceeded'
  projectedOverage: number | null // 현재 속도로 지속 시 예상 초과액
}

function calculateBudgetStatus(
  budgets: Budget[],
  transactions: Transaction[],
  today: string,
  month: string,
): BudgetStatus {
  const totalBudget = budgets.reduce((s, b) => s + b.amount, 0)
  const thisMonthExpenses = transactions
    .filter(t => t.type === 'expense' && t.date.startsWith(month))
  const totalUsed = thisMonthExpenses.reduce((s, t) => s + t.amount, 0)
  const remaining = totalBudget - totalUsed
  const percentUsed = totalBudget > 0 ? (totalUsed / totalBudget) * 100 : 0
  
  // 남은 일수
  const lastDay = new Date(month + '-01')
  lastDay.setMonth(lastDay.getMonth() + 1)
  lastDay.setDate(0)
  const todayDay = new Date(today).getDate()
  const daysRemaining = lastDay.getDate() - todayDay
  
  // 투영: 현재 속도로 지속 시 예상 초과액
  const daysPassed = todayDay
  const dailyRate = daysPassed > 0 ? totalUsed / daysPassed : 0
  const projectedTotal = dailyRate * lastDay.getDate()
  const projectedOverage = projectedTotal > totalBudget ? projectedTotal - totalBudget : null
  
  return {
    totalBudget,
    totalUsed,
    remaining,
    percentUsed,
    daysRemaining,
    status: percentUsed >= 100 ? 'exceeded'
          : percentUsed >= 80 ? 'critical'
          : percentUsed >= 60 ? 'warning'
          : 'safe',
    projectedOverage,
  }
}
```

#### 7.2.4 Sparkline 데이터
```ts
function useDailyExpenses(month: string, transactions: Transaction[]): number[] {
  return useMemo(() => {
    const days = getMonthDates(month) // ['2026-04-01', ..., '2026-04-30']
    return days.map(date => {
      return transactions
        .filter(t => t.type === 'expense' && t.date === date)
        .reduce((s, t) => s + t.amount, 0)
    })
  }, [month, transactions])
}
```

#### 7.2.5 Sparkline SVG path
```ts
function generateSparklinePath(values: number[], width: number, height: number): string {
  if (values.length === 0) return ''
  const max = Math.max(...values, 1)
  const xStep = width / Math.max(values.length - 1, 1)
  const points = values.map((v, i) => ({
    x: i * xStep,
    y: height - (v / max) * height,
  }))
  // Smooth curve (cardinal spline) — optional
  return 'M ' + points.map(p => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ')
}
```

---

## 8. 모션 안무 & 애니메이션

### 8.1 모션 토큰 (이미 정의됨 — motion.css)

| 토큰 | 값 | 용도 |
|---|---|---|
| `--ease-out-expo` | cubic-bezier(0.16, 1, 0.3, 1) | 주요 enter |
| `--dur-fast` | 160ms | 작은 state 변경 |
| `--dur-base` | 240ms | 일반 transition |
| `--dur-slow` | 360ms | 섹션 enter |
| `springSnappy` | stiffness 320, damping 24 | 탭 feedback |

### 8.2 페이지 진입 안무 (LedgerPage)

```
t=0ms   → PageSegmentControl 이미 presenta (이전 페이지에서)
t=60ms  → LedgerHero fadein+y (durations.base, easeOutExpo)
t=120ms → LedgerInsightsRow stagger (40ms 간격 4개 card)
t=300ms → QuickRecordStrip fadein
t=380ms → LedgerFilterBar fadein
t=460ms → TransactionListGrouped 첫 그룹 헤더 + 첫 3 cards
t=540ms → 나머지 그룹들 IntersectionObserver 기반 lazy fade-in
```

### 8.3 SVG Donut 초기 애니메이션
```tsx
<motion.path
  d={arcPath}
  fill="none"
  stroke={color}
  strokeWidth={8}
  strokeLinecap="round"
  pathLength="1"
  initial={{ pathLength: 0 }}
  animate={{ pathLength: progress }}
  transition={{ duration: 1.2, ease: easeOutExpo }}
/>
```

### 8.4 월 변경 direction-aware

```tsx
<AnimatePresence mode="wait" custom={direction}>
  <motion.div
    key={selectedMonth}
    custom={direction}
    variants={{
      enter: (dir) => ({ x: dir === 'forward' ? 40 : -40, opacity: 0 }),
      center: { x: 0, opacity: 1 },
      exit: (dir) => ({ x: dir === 'forward' ? -40 : 40, opacity: 0 }),
    }}
    initial="enter"
    animate="center"
    exit="exit"
    transition={{ duration: durations.base, ease: easeOutExpo }}
  >
    <LedgerHero ... />
  </motion.div>
</AnimatePresence>
```

### 8.5 Reduced Motion 대응

모든 motion 컴포넌트는 `useReducedMotion()` 훅 사용:
```ts
const shouldReduceMotion = useReducedMotion()
const variants = shouldReduceMotion ? simpleFade : heroSpring
```

---

## 9. 반응형 레이아웃 그리드

### 9.1 브레이크포인트 매트릭스

| BP | 폭 | Hero | Insights | List | Side Panel |
|---|---|---|---|---|---|
| fold | ≤340 | full, `p-3`, amount `clamp(32, 10vw, 44)` | 가로 스크롤, 카드 `min-w-[160px]` | 그룹 sticky | — |
| xs | 360-389 | full, `p-4`, amount `clamp(36, 10vw, 52)` | 가로 스크롤, `min-w-[180px]` | 그룹 | — |
| sm | 390-599 | full, `p-5`, amount `clamp(40, 10vw, 56)` | 가로 스크롤 | 그룹 | — |
| md | 600-767 | full, `p-6`, amount `clamp(48, 9vw, 60)` | 가로 스크롤 (4 full-visible) | 그룹 | — |
| lg | 768-1023 | `max-w-2xl center` | 가로 스크롤 | centered `max-w-xl` | — |
| xl | 1024+ | grid-cols-[1fr_320px], Hero 좌측 | 좌측 column | 좌측 column | 우측 320px |
| 2xl | 1280+ | grid-cols-[1fr_360px] | | | 우측 360px |

### 9.2 CSS Container Query 활용

`LedgerInsightsRow` 는 container query로 inline-size 에 반응:
```css
.insights-row {
  container-type: inline-size;
  container-name: insights;
}

@container insights (min-width: 700px) {
  .insights-row .card { min-width: 200px; }
}

@container insights (min-width: 1000px) {
  .insights-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
  }
}
```

이미 구축된 `container-queries.css` 유틸 활용.

---

## 10. 접근성 상세 계획

### 10.1 ARIA 계획

| 요소 | role | aria-* |
|---|---|---|
| LedgerHero | `region` | `aria-labelledby="hero-label"` |
| Focal amount | `text` | `aria-live="polite"` (월 변경 시 공지) |
| Month Navigator prev/next | `button` | `aria-label="이전 달"` / `"다음 달"` |
| Insights Row | `region` | `aria-label="재무 인사이트"` |
| BudgetRingCard SVG | `img` | `aria-label="예산 75% 소진, 남은 11일"` |
| Category Donut segment | `button` | `aria-label="식비 카테고리, 320,000원"` |
| Date group header | `heading aria-level="3"` | |
| TransactionListGrouped | `feed` | `aria-busy={isLoading}` |
| Filter Sheet | `dialog` | `aria-modal="true" aria-labelledby="filter-title"` |
| Budget Detail Sheet | `dialog` | `aria-modal="true"` |

### 10.2 키보드 단축키

| 키 | 동작 |
|---|---|
| `←` / `→` | 이전/다음 달 |
| `/` | 검색 포커스 |
| `f` | 필터 시트 열기 |
| `n` or `+` | 새 거래 Wizard 열기 |
| `Esc` | 시트 닫기 |
| `↑` / `↓` (목록 포커스 시) | 거래 간 이동 |
| `Enter` (거래 포커스 시) | ActionSheet 열기 |

### 10.3 WCAG 준수

- 텍스트 대비: AA 4.5:1 이상 (Foundation 이미 준수)
- Focus ring: `var(--ring-focus)` 명시적 사용
- Touch target: min 44×44px (chip, button 모두)
- Reduced motion: 모든 애니메이션 `useReducedMotion()` 분기
- Screen reader: 모든 SVG 차트에 `aria-label` + `<title>`

---

## 11. 성능 예산 & 최적화

### 11.1 성능 예산

| 지표 | 목표 | 측정 |
|---|---|---|
| LedgerPage 초기 렌더 (100건) | <150ms | React DevTools Profiler |
| LedgerPage 초기 렌더 (1000건) | <300ms (virtual 활성) | 동일 |
| 검색 typing lag | <16ms/keystroke | Performance Monitor |
| Hero 월 변경 transition | <300ms | DevTools Animation panel |
| Insights Row scroll FPS | 60fps | Performance Monitor |
| 번들 크기 증가 | <+25KB gzip | Vite build output |
| Lighthouse Performance | ≥95 | Lighthouse CI |
| CLS (layout shift) | <0.05 | Web Vitals |

### 11.2 최적화 기법

**React**:
- `React.memo` 모든 TransactionCard, DateGroupHeader, InsightCard
- `useMemo` 모든 파생 계산 (trend, groups, sparkline path)
- `useCallback` handler (props로 전달 시)
- `useDeferredValue` 검색어 (typing lag 감소)

**Render 최적화**:
- TransactionListGrouped 조건부 가상화 (200건+)
- Sparkline SVG path 계산 cache
- Insights card 4개 각각 독립 React.memo

**Bundle**:
- `@tanstack/react-virtual` ~10kB gzip
- 자체 SVG chart (Recharts 도입 불필요)
- Insights cards lazy load 고려 (Phase 6)

---

## 12. 테스트 전략

### 12.1 단위 테스트 (Vitest)

| 파일 | 테스트 |
|---|---|
| `hooks/useTransactionGroups.test.ts` | 오늘/어제/3일전 label 변환, 빈 배열, 단일 거래 |
| `hooks/useDailyExpenses.test.ts` | 월초/월말 경계, 누락된 날 |
| `hooks/useCategoryTrend.test.ts` | prev=0 (null 반환), pct 계산, 방향 판정 |
| `hooks/useBudgetStatus.test.ts` | 상태 임계값, projectedOverage 계산 |
| `hooks/useQuickRecordCandidates.test.ts` | 빈도 top 5, 중복 제거 |
| `utils/sparkline.test.ts` | path 생성, 빈 배열, 단일 값, 큰 값 |

### 12.2 컴포넌트 테스트

- `@testing-library/react` 로 render + 상호작용 테스트
- `<LedgerHero>`: trend badge direction, 월 변경 시 공지
- `<TransactionListGrouped>`: 그룹 생성, sticky header, virtual 활성 조건
- `<BudgetRingCard>`: 상태별 색상, accessibility label

### 12.3 E2E 테스트 (Playwright)

**기본 플로우**:
1. 가계부 진입 → Hero 렌더 확인
2. 월 이전/다음 → Hero 금액 변경 확인
3. Quick Record 첫 chip 탭 → 거래 추가 + Hero 업데이트
4. 검색 "커피" → 필터링된 목록 확인
5. 필터 열기 → 카테고리 선택 → 적용 → active chip 확인
6. TransactionCard 탭 → ActionSheet → 삭제 → 목록 업데이트

### 12.4 시각 회귀 (Percy 또는 Chromatic)

- 가계부 페이지 × 팔레트 4종 × 테마 3종 = 12 조합 스크린샷
- 필터 열린 상태 / 닫힌 상태
- 거래 0건 / 3건 / 200건 / 1000건
- Reduced motion ON/OFF

---

## 13. 마이그레이션 & 롤아웃

### 13.1 Feature Flag 전략

`settingsStore`에 추가:
```ts
interface Settings {
  // ... 기존
  ledgerV2?: boolean // default false
}
```

- 기존 UI와 v2 UI 병행 유지
- 설정에서 "새 가계부 써보기" 토글
- LedgerPage 에서 flag 기반 컴포넌트 분기 렌더

**점진 롤아웃**:
1. Week 1: 내부 테스트 (flag true 수동)
2. Week 2: 신규 사용자 20% 자동 enable
3. Week 3: 50%
4. Week 4: 100% + flag 제거

### 13.2 Backward Compat

- Zustand store schema 변경 없음 → 기존 사용자 데이터 호환
- 기존 Wizard/ActionSheet URL routing 무변경
- 기존 거래 목록의 swipe/edit 동작 유지
- 마이그레이션 스크립트 불필요

### 13.3 롤백 계획

- 각 Phase는 독립 git commit
- Vercel 대시보드에서 이전 배포로 1-click rollback 가능
- feature flag 로 즉시 v1 복귀 (코드 수정 없이)
- Firebase 데이터 영향 없음

---

## 14. KPI 측정 계획

### 14.1 측정 항목

| 지표 | 측정 방법 | 측정 도구 |
|---|---|---|
| 가계부 진입 횟수 | Event `ledger_view` | Firebase Analytics / GA4 |
| 거래 추가 flow completion | Event `transaction_created` | Analytics |
| 첫 거래까지 탭 수 | Custom event `first_tx_taps` | 세션 내 카운트 |
| Quick Record 사용률 | Event `quick_record_used` | Analytics |
| Insights card tap | Event `insight_tap` | Analytics |
| Hero 월 변경 | Event `month_changed` | Analytics |
| 필터 사용률 | Event `filter_applied` | Analytics |
| 체류 시간 | `session_duration` | Analytics |
| Lighthouse | CI 자동 실행 | lighthouse-ci |

### 14.2 A/B 성공 기준 (feature flag ledgerV2)

- **거래 추가 완료율**: v1 대비 +15%
- **체류 시간**: v1 대비 +20%
- **재방문률**: v1 대비 +10%
- **성능 회귀**: 0 (LCP 1.8s 이하 유지)

---

## 15. 리스크 레지스터

| ID | 리스크 | 확률 | 영향 | 완화책 |
|---|---|---|---|---|
| R1 | 사용자 학습 비용 | 높음 | 중 | feature flag 점진 롤아웃 + onboarding micro-tour |
| R2 | SVG 차트 브라우저 호환성 | 낮음 | 중 | `@property` 미사용, viewBox 기반 표준 SVG |
| R3 | Virtual scrolling + sticky header 충돌 | 중 | 중 | react-virtual 공식 예제 기반, sticky 대체 "top 라벨" |
| R4 | Insights 계산 성능 (1000건+) | 중 | 중 | useMemo + useDeferredValue + Web Worker 준비 |
| R5 | iOS Safari backdrop-filter 성능 | 중 | 낮 | `will-change` 적용, `@supports` fallback |
| R6 | Foundation CSS 토큰 변경 시 breaking | 낮 | 높 | 토큰 버저닝, 직접 색상 사용 금지 |
| R7 | 팔레트 전환 시 custom 색상 불일치 | 낮 | 중 | 모든 색 토큰 참조, 순수 hex 금지 |
| R8 | 구글 드라이브 동기화 중 큰 상태 변경 | 낮 | 중 | 기존 sync listener 유지, 새 state는 derived only |
| R9 | MonthlyReport 자동 노출 과도 (알림 피로) | 중 | 낮 | 월 1회 노출 제한 + dismiss 기능 |
| R10 | Insights 배지 false positive (trend 오해) | 중 | 중 | 최소 기준: 전월 5만원+ 지출 있을 때만 표시 |

---

## 16. 파일 변경 영향도

### 16.1 신규 파일 (20개)

```
src/components/ledger/
├── LedgerHero.tsx                          [신규]
├── LedgerInsightsRow.tsx                   [신규]
├── LedgerFilterBar.tsx                     [신규]
├── LedgerFiltersSheet.tsx                  [신규]
├── BudgetDetailSheet.tsx                   [신규]
├── TransactionListGrouped.tsx              [신규]
├── DateGroupHeader.tsx                     [신규]
├── QuickRecordStrip.tsx                    [신규]
├── MonthlyReportCard.tsx                   [신규 · P5]
└── insights/
    ├── BudgetRingCard.tsx                  [신규]
    ├── TopCategoryCard.tsx                 [신규]
    ├── SubscriptionCard.tsx                [신규]
    ├── UpcomingBillsCard.tsx               [신규]
    ├── CategoryDonutCard.tsx               [신규 · P4]
    └── MonthlyTrendChart.tsx               [신규 · P4]

src/hooks/
├── useDailyExpenses.ts                     [신규]
├── useCategoryTrend.ts                     [신규]
├── useQuickRecordCandidates.ts             [신규]
├── useTransactionGroups.ts                 [신규]
└── useBudgetStatus.ts                      [신규]

src/utils/
├── sparkline.ts                            [신규] (SVG path 생성)
└── svgArc.ts                               [신규] (donut arc)

tests/
├── hooks/useTransactionGroups.test.ts      [신규]
├── hooks/useDailyExpenses.test.ts          [신규]
├── hooks/useCategoryTrend.test.ts          [신규]
├── hooks/useBudgetStatus.test.ts           [신규]
└── utils/sparkline.test.ts                 [신규]
```

### 16.2 수정 파일 (7개)

```
src/components/ledger/
├── LedgerPage.tsx                          [대폭 재구성]
├── TransactionCard.tsx                     [소수정: 날짜 prefix 제거]
├── MonthlySummary.tsx                      [삭제 예정]
├── CategoryBreakdown.tsx                   [축소 또는 Insights로 이동]
├── TransactionFilters.tsx                  [LedgerFilterBar/Sheet로 분리]
├── LedgerEmptyState.tsx                    [카피 + 예시 데이터 기능 추가]
└── index.ts                                [exports 정리]

src/stores/
└── settingsStore.ts                        [ledgerV2 feature flag 추가]

src/lib/
└── types.ts                                [Settings.ledgerV2 옵션 추가]
```

### 16.3 무변경 파일

- `TransactionWizard.tsx` — 100% 유지 (이미 하이엔드)
- `TransactionActionSheet.tsx` — 유지
- `TransactionFormModal.tsx` — 유지
- `AmountCalculator.tsx` — 유지
- `MiniCalendar.tsx` — 유지
- `stores/transactionStore.ts` — 유지
- `stores/budgetStore.ts` — 유지
- `services/` 전체 — 유지

---

## 17. 개발 타임라인

### 17.1 3주 플랜 (옵션 B 권장)

```
Week 1 — Hero + 날짜 그룹 (P0, P1 시작)
───────────────────────────────────
Day 1: LedgerHero 기본 구조 (props, 레이아웃, trend badge)
Day 2: LedgerHero 완성 (sparkline SVG, month navigator 통합)
Day 3: useTransactionGroups 훅 + DateGroupHeader 컴포넌트
Day 4: TransactionListGrouped 구현 + LedgerPage 통합
Day 5: 테스트 + 시각 검수 + 미세 조정

Week 2 — Insights Row + Budget Ring + Quick Record
───────────────────────────────────────────────
Day 1: LedgerInsightsRow 구조 + scroll snap + container query
Day 2: BudgetRingCard SVG donut + useBudgetStatus 훅
Day 3: TopCategoryCard + useCategoryTrend + SubscriptionCard + UpcomingBillsCard
Day 4: QuickRecordStrip + useQuickRecordCandidates + toast undo
Day 5: Insights 탭 동작 + BudgetDetailSheet 분리

Week 3 — 필터 간소화 + Category Donut + 반응형 + 마감
────────────────────────────────────────────────
Day 1: LedgerFilterBar (sticky 슬림) + LedgerFiltersSheet 분리
Day 2: CategoryDonutCard + MonthlyTrendChart
Day 3: 태블릿/데스크톱 3-col 레이아웃 분기 + CSS
Day 4: 접근성 audit + reduced-motion 전수 확인 + Virtual scroll (옵션)
Day 5: E2E 테스트 + feature flag + 배포 + 관찰
```

### 17.2 Day-by-day 상세 (Week 1 예시)

**Day 1 (8h)**:
- 08:00-10:00 `LedgerHero.tsx` 기본 props/구조 (60 LOC)
- 10:00-12:00 Month navigator 통합 (AnimatePresence direction)
- 13:00-15:00 Trend badge 컴포넌트 (useCategoryTrend 임시 활용)
- 15:00-17:00 Focal amount + useCountUp 연동

**Day 2 (8h)**:
- 08:00-10:00 `utils/sparkline.ts` (SVG path 생성)
- 10:00-12:00 Mini sparkline SVG 렌더 + gradient fill
- 13:00-15:00 LedgerHero 반응형 (fold/xs/sm 분기)
- 15:00-17:00 Vitest 단위 테스트 (sparkline.test.ts)

*(Day 3-5 유사하게 계획)*

---

## 18. 부록: 디자인 세부 사양

### 18.1 타이포그래피 스케일 (Foundation 활용)

| 용도 | 토큰 | 예시 |
|---|---|---|
| Hero Amount (focal) | `text-financial-fluid` + `clamp(36, 9vw, 64)` | "1,234,567원" |
| Insights 큰 숫자 | `text-body2-bold` + tabular-nums | "75%" |
| 트렌드 % | `text-caption` + font-bold | "+12.3%" |
| 날짜 그룹 라벨 | `text-caption-bold` | "오늘 · 4월 18일" |
| 카테고리명 | `text-body3` | "식비" |
| 서브 라벨 | `text-caption` text-sub | "11일 남음" |

### 18.2 색상 매핑 (Foundation 토큰)

| 요소 | 색상 |
|---|---|
| Hero 지출 focal | `var(--value-negative)` |
| Hero 수입 focal | `var(--value-positive)` |
| Trend 증가 (지출) | `text-status-danger` |
| Trend 감소 (지출) | `text-status-success` |
| Budget safe | `var(--value-positive)` |
| Budget warning (60-80%) | `oklch(0.75 0.18 70)` (amber) |
| Budget critical (80-100%) | `oklch(0.68 0.20 45)` (orange) |
| Budget exceeded (100%+) | `var(--value-negative)` |

### 18.3 Spacing Scale (8-pt grid)

| 영역 | fold | xs/sm | md+ |
|---|---|---|---|
| LedgerPage outer padding | 12px | 16px | 24px |
| Hero inner padding | 16px | 20px | 24px |
| 섹션 간 간격 | 16px | 20px | 24px |
| Insights card gap | 10px | 12px | 16px |
| 거래 카드 간 | 6px | 8px | 8px |
| 날짜 그룹 간 | 20px | 24px | 32px |

### 18.4 Radius 스케일

- 카드 (기본): `rounded-2xl` (16px)
- Hero: `rounded-3xl` (24px)
- Chips (pill): `rounded-full`
- Input: `rounded-xl` (12px)
- Bottom sheet: `rounded-t-3xl` (24px)

### 18.5 Shadow 스케일

- 정적 카드: `shadow-[0_1px_3px_rgba(0,0,0,0.04)]`
- Hover 카드: `shadow-[0_8px_24px_rgba(0,0,0,0.06)]`
- Hero: `shadow-[0_2px_8px_rgba(0,0,0,0.04)]`
- Active pill: `shadow-[0_4px_14px_color-mix(in_oklch,var(--color-primary-500)_28%,transparent)]`
- Bottom sheet: `shadow-[0_-4px_24px_rgba(0,0,0,0.08)]`

### 18.6 애니메이션 타이밍 카탈로그

| 동작 | Duration | Easing | Distance |
|---|---|---|---|
| Hero fade-in | 400ms | easeOutExpo | y 8 → 0 |
| Insights stagger | 40ms / child | easeOutExpo | y 8 → 0 |
| Month slide | 280ms | easeOutExpo | x ±40 |
| Budget ring arc | 1200ms | easeOutExpo | 0 → progress |
| Count-up | 600ms | spring 60/20 | numeric |
| Card hover lift | 160ms | easeOut | y -2 |
| Sheet open | 320ms | spring 320/32 | y 100% → 0 |

---

## 19. 참고 자료

### 19.1 내부 문서
- `claudedocs/HIGHEND_UIUX_MASTERPLAN.md` — v2 Obsidian 디자인 시스템 마스터플랜
- `claudedocs/RELEASE_NOTES_v2.0.md` — v2 릴리스 기능 요약
- `claudedocs/LAUNCH_CHECKLIST.md` — 배포 전 체크리스트

### 19.2 외부 참고
- **KT 이용대금명세서 앱** — 대형 display + dashed divider + pill chips 패턴
- **Toss** — 미니멀 하이어라키, 카드 간 넓은 여백
- **뱅크샐러드** — 소비 리포트, trend badge
- **Monarch Money** — budget ring, category sparkline
- **YNAB** — 카테고리별 예산 상태 즉시성

### 19.3 기술 문서
- [Framer Motion — AnimatePresence custom direction](https://www.framer.com/motion/animate-presence/)
- [@tanstack/react-virtual — sticky header patterns](https://tanstack.com/virtual/v3/docs/introduction)
- [SVG donut chart tutorial](https://observablehq.com/@d3/donut-chart)
- [CSS Container Queries MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_container_queries)

---

## 20. 개발 착수 체크리스트

착수 전 확인:

- [ ] 본 문서 리뷰 완료
- [ ] 옵션 A/B/C 중 선택 확정 (권장: B)
- [ ] feature flag `ledgerV2` 추가 준비
- [ ] 기존 가계부 스크린샷 확보 (회귀 비교용)
- [ ] seed 데이터 1500건 생성 스크립트 준비
- [ ] git branch `feature/ledger-v2-prism` 생성
- [ ] Phase별 milestone issue 생성 (GitHub)
- [ ] Daily checkpoint 일정 협의

---

**문서 끝.**

다음 액션: 사용자가 본 문서 검토 후 **옵션 B 승인** → `feature/ledger-v2-prism` 브랜치에서 Phase 1 착수.

_문서 작성: Claude Opus 4.7 (1M context) — Moonwave Finance 프로젝트 하이엔드 팀_
