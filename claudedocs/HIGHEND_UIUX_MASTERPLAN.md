# Moonwave Finance — 하이엔드급 UI/UX 전면 리디자인 마스터플랜

> **Version**: v1.0 → v2.0 "Obsidian"
> **작성일**: 2026-04-18
> **범위**: 전체 앱 (디자인 시스템 · 전역 효과 · 반응형 · 컴포넌트 · 모션 · 접근성)
> **철학**: *Evidence > Assumptions · Consistency > Novelty · Calm Luxury > Loud Premium*

---

## 0. Executive Summary

현재 Moonwave Finance는 **토큰 기반 디자인 시스템의 기반(Foundation CSS, Edge Lighting, 4색 팔레트, OLED 모드)이 이미 구축**되어 있으나, 실제 컴포넌트 적용에서 **보수적·단편적**이며 개별 요소의 시각적 완성도·정보 위계·마이크로 인터랙션이 하이엔드급에 미치지 못한다. 본 마스터플랜은 **코드 재작성이 아닌 "시스템 체계화 + 전역 효과 확대 + 반응형 강화 + 모션 정교화"** 4축으로 v2.0 "Obsidian" 릴리스를 설계한다.

### 핵심 방향성 5개 축

| # | 축 | 한 줄 정의 |
|---|---|---|
| 1 | **Obsidian Depth** | OLED-first 다층 서피스 + 은은한 글로우로 "깊이감 있는 검은 유리" 미학 |
| 2 | **Fluid Typography** | clamp() 기반 유체 타이포그래피 + 7단계 브레이크포인트 전 구간 최적화 |
| 3 | **Motion Choreography** | Framer Motion 기반 4-layer 안무(entry/stagger/micro/exit)로 UI에 시간감 부여 |
| 4 | **Financial Data Craft** | 숫자 표현 전문성 — tabular-nums + 카운트업 + 민감정보 마스킹 + 다크모드 차트 자동화 |
| 5 | **Accessibility-First Premium** | 대비 AA+ 보장, 포커스 가시성 강화, reduced-motion/high-contrast 완전 지원 |

### 비가역 결정사항 (Non-Negotiables)

- **기존 토큰 보존**: 토큰 이름/스케일을 재설계하지 않는다. 추가만 허용(breaking change 금지).
- **하드코딩 색상 0개 유지**: zinc/white/black 하드코딩 → semantic 토큰 `var(--surface-*)` 로 일관.
- **Tailwind ↔ Foundation CSS 하이브리드 유지**: 레이아웃은 Tailwind, 시각은 Foundation 클래스.
- **로컬 우선 데이터 흐름 유지**: Dexie SOT, Firestore 동기화 로직은 UI 리디자인 대상 아님.
- **점진 적용**: 빅뱅 리플레이스 금지. Phase별 병합 가능한 단위로 분할.

---

## 1. 현황 진단 Snapshot

### 1.1 디자인 시스템 (강점 / 약점)

**강점**
- `foundation.css`가 27개 import를 명확한 우선순위로 조립 (tokens → utilities → fin-aliases)
- Edge Lighting 시스템이 oklch 색공간·6단계 opacity·status variant·pulse/gradient-border까지 갖춘 **완성도 높은 토큰 레이어** (`src/styles/tokens/edge-lighting.css:16-163`, `src/styles/utilities/edge-lighting.css:1-465`)
- Semantic Color 3단계 (Light / Dark / OLED `html.dark[data-oled="true"]`) 토큰 존재 (`semantic-colors.css:91-109`)
- 4색 팔레트 (ocean/rose/purple/forest) + 시간 기반 테마 + 테마 오버레이(category/weather) 구조 정의됨

**약점 (리디자인 주요 타깃)**
- **전역 효과 채용률 ~10%**: `hero-gradient`·`noise-overlay`·`hero-shimmer` 가 `NetWorthCard` 1개 컴포넌트에만 사용 (`NetWorthCard.tsx:56`)
- **Edge Lighting 활용 편중**: 카드/인풋/토스트/셀렉트 등 일부만 적용, 사이드바/리스트/FAB 등 미적용
- **시간 기반 테마 미구현**: `data-time-period` 속성 읽는 CSS는 있으나 JS 주입 로직 부재
- **OLED 모드 토글 UI 없음**: 토큰은 있으나 설정에 스위치 미존재
- **타이포 스케일 유체화 미적용**: `--typo-*-size`가 고정 px, 모바일↔데스크톱 전환시 계단식 변화
- **Elevation 시스템이 3단계뿐**: shadow-1/2/3만으로 hero·sidebar·modal·toast 다층 구조 커버 부족

### 1.2 반응형 대응 (현재)

- 7단계 브레이크포인트 정의 완료: xs 360 / sm 390 / md 600 / lg 768 / xl 1024 / 2xl 1280 / 3xl 1920
- 커스텀 variant: `fold`(≤340px), `mobile`, `tablet`, `zfold-open`(600~767)
- **실제 활용**: BottomNav `fold:h-14` 정도만 사용, 대부분 Tailwind 기본 `md/lg/xl` 의존 → 폴드·초와이드 엣지 대응 부족
- Safe area: `pb-safe`만 존재, 상단 notch (`pt-safe`)·좌우(`px-safe-x`) 미흡

### 1.3 컴포넌트/페이지 (샘플 감사)

| 컴포넌트 | 위치 | 개선 필요 포인트 |
|---|---|---|
| `DashboardPage` | `components/dashboard/DashboardPage.tsx` | 세션/스토어 로딩 직렬 병합 존재하나, 콘텐츠 스켈레톤→실데이터 전환 모션 단순. `AnimatePresence` 2개 사용 중 (`:72`, 이후) |
| `NetWorthCard` | `components/dashboard/NetWorthCard.tsx:47-98` | 유일한 hero 적용 컴포넌트. `boxShadow: 0 8px 32px var(--glow-primary)` 인라인 스타일 — 토큰화 필요 |
| `BottomNav` | `components/layout/BottomNav.tsx:33-60` | `el-bottomnav` 적용은 되었으나 indicator 모션이 단조로움 (단순 opacity). spring-based morph 필요 |
| `DashboardSkeleton` | 동 디렉터리 | shimmer 단조. wave/gradient skeleton 미적용 |

### 1.4 모션 현황

- Framer Motion 도입, `motionConfig.ts` 변수(`staggerContainer`, `staggerItem`) 2종류 + reduced variant
- spring (stiffness 300/400, damping 15/25) 일관성 있으나 **섹션 간 전환·route 전환·리스트 재정렬 모션 부재**
- `useReducedMotion` 확인은 ~6개 컴포넌트 (전체 100+ 대비 커버리지 낮음)

### 1.5 접근성

- BottomNav `aria-current`, `aria-label` 등 기본 속성 존재
- **약점**: focus-visible ring 일관성 부족, `--ring-focus` 변수가 `var(--surface-primary)` 로 설정되어 링 자체가 배경과 동일(시맨틱 버그 가능성, `semantic-colors.css:49`, `:87`, `:108`)
- High-contrast 모드: edge-lighting.css 말미에 일부 처리 (`:452-464`) → 전역 컴포넌트로 확장 필요

---

## 2. 디자인 원칙 (v2.0 Obsidian)

### 2.1 Brand Feeling

> "검은 유리 위에 빛이 스쳐 지나가는 순간" — 어두운 서피스 + 단일 색상 글로우 + 절제된 색 + 정확한 타이포.

- **Less color, more hierarchy**: 강조는 글로우·weight·size로, 색은 데이터 의미(±)에만.
- **Spatial audio 방식의 효과 배치**: 중요한 요소만 빛나고, 주변은 어두워진다. `el-strong` 은 페이지당 1~2개만.
- **숫자가 주인공**: 타이포 "tabular-nums" + 카운트업 + 민감정보 마스킹이 일관성 있게.

### 2.2 Five Pillars

1. **Surface Depth** — 4단계 서피스 레이어(-1 sunken / 0 base / +1 raised / +2 floating) + hairline border
2. **Luminous Interaction** — 모든 인터랙티브 요소는 hover/focus 시 `el-soft→medium` 트랜지션
3. **Tabular Precision** — 금액·날짜·비율은 tabular-nums + fixed-width 컬럼 정렬
4. **Motion with Intent** — 장식 애니메이션 금지. 모든 모션은 "어디로/무엇이" 변하는지 전달
5. **Adaptive Theme** — palette × time × weather × OLED × reduced-motion 모든 조합에서 품질 보장

### 2.3 Anti-Patterns (절대 금지)

- ❌ 무의미한 bounce/elastic 애니메이션
- ❌ 여러 색 네온 글로우 동시 사용
- ❌ 금융 숫자를 proportional-nums 로 표시 (금액 자릿수가 흔들림)
- ❌ hover 상태에서만 나타나는 핵심 액션 (모바일에서 불가)
- ❌ 다크모드에서 순수 흰색 `#fff` 사용 (눈부심)

---

## 3. 아키텍처 변경 설계

### 3.1 토큰 레이어 확장 (Additive Only)

**`src/styles/tokens/`에 추가**:

```
tokens/
├── surfaces.css        [NEW] 4-layer surface system + hairline/haze
├── motion.css          [NEW] easing curves, duration scale, spring presets
├── blur.css            [NEW] backdrop-blur scale (4/8/16/24/32/48)
├── data-viz.css        [NEW] 차트 전용 색상 시퀀스 + 카테고리 pairing
└── density.css         [NEW] compact/comfortable/spacious 3단계 밀도 토큰
```

**핵심 추가 토큰 (예시)**:

```css
/* surfaces.css */
:root {
  --surface-haze: color-mix(in oklch, var(--surface-primary) 85%, transparent);
  --surface-layer-0: var(--surface-primary);
  --surface-layer-1: var(--surface-secondary);
  --surface-layer-2: var(--surface-elevated);
  --surface-layer-3: color-mix(in oklch, var(--surface-primary) 60%, var(--color-primary-50));
  --hairline: 1px solid color-mix(in oklch, var(--border-default) 60%, transparent);
}

/* motion.css */
:root {
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-out-back: cubic-bezier(0.34, 1.56, 0.64, 1);
  --ease-in-out-circ: cubic-bezier(0.85, 0, 0.15, 1);
  --dur-instant: 80ms;
  --dur-fast: 160ms;
  --dur-base: 240ms;
  --dur-slow: 360ms;
  --dur-slower: 520ms;
  --spring-gentle: stiffness:120, damping:18;    /* via JS */
  --spring-snappy: stiffness:320, damping:24;
}
```

### 3.2 유체 타이포그래피 (Fluid Typography)

기존 `typography.css` 는 유지하되 `utilities/typography-fluid.css` 추가:

```css
:root {
  --typo-display-size: clamp(28px, 2.2vw + 16px, 56px);
  --typo-h1-size:      clamp(22px, 1.6vw + 14px, 40px);
  --typo-h2-size:      clamp(20px, 1.2vw + 14px, 32px);
  --typo-body-size:    clamp(14px, 0.3vw + 13px, 16px);
  --typo-caption-size: clamp(11px, 0.1vw + 11px, 13px);
}
```

- `text-display-fluid`, `text-h1-fluid` 등 유틸로 노출
- 금융 수치는 `clamp(24px, 3vw, 44px)` — 순자산 카드가 모바일·태블릿·데스크톱에서 유체적으로 스케일

### 3.3 8-pt Spatial Grid 강제

모든 margin/padding을 `--spacing-*` 토큰으로. ESLint rule 추가:

```json
// .eslintrc - tailwindcss plugin
{
  "rules": {
    "tailwindcss/no-arbitrary-value": "warn"
  }
}
```

### 3.4 CSS 레이어(Cascade Layers) 도입

```css
@layer reset, tokens, foundation, utilities, components, overrides;
```

- Tailwind 의 `@tailwind base/components/utilities` 와 Foundation CSS 간 우선순위 충돌 해결
- `fin-aliases` 는 `overrides` 레이어로 최상위

---

## 4. 전역 효과 체계 (Global Effects System)

### 4.1 5-Level Surface Stack

| Level | 용도 | 토큰 | 효과 |
|---|---|---|---|
| **-1 Sunken** | 페이지 배경, 인풋 내부 | `--surface-sunken` | flat, no shadow |
| **0 Base** | 페이지 캔버스 | `--surface-primary` | hairline border only |
| **+1 Raised** | 일반 카드, 섹션 | `--surface-secondary` | `shadow-1` + `el-subtle` (dark) |
| **+2 Floating** | 모달, 드롭다운, 토스트 | `--surface-elevated` + `backdrop-blur-24` | `shadow-3` + `el-soft` + `el-inset-top` |
| **+3 Hero** | 순자산, 목표 달성 등 | hero-gradient + noise + shimmer | `el-strong` + animated conic border |

### 4.2 Effect Catalog (확대 배포 대상)

1. **Hero Gradient 확장** — 순자산·총자산·총부채·목표 progress 카드로 확대. 팔레트 전환 시 색상 자동 변경
2. **Noise Overlay** — `.noise-overlay` 를 모든 hero 카드에 기본 포함 (토큰 `--noise-opacity: 0.04`)
3. **Shimmer Motion** — `.hero-shimmer` 를 30초 주기 유지, 낮은 opacity 로 다크모드에서만 미세 활성
4. **Glass Panel** — `.glass` (blur 16) / `.glass-heavy` (blur 24) — 사이드바, BottomNav, 필터 패널에 표준 적용
5. **Aurora Gradient** (신규) — 로그인/온보딩 화면용 3색 conic gradient 애니메이션 (20s)
6. **Spotlight Cursor** (신규, desktop only) — 대형 hero 카드에 마우스 위치 기반 radial gradient follow
7. **Edge Lighting 전면 확대** — 버튼·셀렉트·리스트 항목·탭·토글 전체로
8. **Animated Gradient Border** — FAB·최상위 CTA·프리미엄 뱃지에만 (`el-gradient-border`)
9. **Inset Top Highlight** — 모든 raised 카드에 1px 흰색 inner-top highlight
10. **Skeleton Wave** — 현재 단조 shimmer → linear gradient wave + subtle pulse

### 4.3 사용 한계 가드레일

| 효과 | 페이지당 최대 사용 | 동시 실행 |
|---|---|---|
| Hero Gradient | 3개 | OK |
| el-vivid / el-pulse | 1개 | 금지 |
| Spotlight | 1개 | N/A |
| Aurora | 1개 (로그인 전용) | N/A |
| Animated border | 2개 | OK |

> **이유**: 효과 남용 시 "카지노 UI" 가 되어 신뢰도 저하. 하이엔드급은 *절제* 가 생명.

---

## 5. 반응형 강화 설계

### 5.1 Breakpoint 전 구간 커버리지 매트릭스

| BP | 폭 | 대상 기기 | 레이아웃 규칙 |
|---|---|---|---|
| **fold** | ≤340 | Galaxy Fold (closed) | 1열, icon-only nav, 축약 숫자(`₩1.2M`) |
| **xs** | 360-389 | Galaxy S (small) | 1열, BottomNav 5-item, truncate labels |
| **sm** | 390-599 | iPhone 14/15, 일반 Android | 1열, 카드 full-width, swipeable tabs |
| **md** | 600-767 | 소형 태블릿, zfold-open | 2열 grid, 사이드시트 옵션 |
| **lg** | 768-1023 | 태블릿 landscape | 2-3열, sidebar 선택적 |
| **xl** | 1024-1279 | 데스크톱 | sidebar 고정 + 3열 content |
| **2xl** | 1280-1919 | 와이드 데스크톱 | sidebar 고정 + 4열 + inspector panel |
| **3xl** | ≥1920 | 울트라 와이드 | max-width 1440 cap + side decoration |

### 5.2 Safe Area 전방위

```css
/* utilities/safe-area.css (NEW) */
.safe-top { padding-top: max(env(safe-area-inset-top), var(--spacing-4)); }
.safe-bottom { padding-bottom: max(env(safe-area-inset-bottom), var(--spacing-4)); }
.safe-x { padding-inline: max(env(safe-area-inset-left), var(--spacing-4)); }
.inset-safe { inset: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); }
```

### 5.3 Container Query 도입

카드 내부에서 자체 폭에 따라 레이아웃 분기:

```css
.card-container { container-type: inline-size; container-name: card; }
@container card (min-width: 480px) { .card-layout { grid-template-columns: 1fr 1fr; } }
```

용례: `MemberSummaryCards`, `BudgetOverviewCard`, `SubscriptionWidget` — 사이드바 on/off 에 따라 내부 레이아웃 자동 조정.

### 5.4 밀도(Density) 시스템

```html
<html data-density="comfortable"> <!-- default -->
<html data-density="compact">     <!-- 설정에서 토글 -->
<html data-density="spacious">    <!-- 접근성 모드 -->
```

- spacing·font-size·touch target 3배율 동시 스케일
- 설정 페이지에 "표시 밀도" 라디오 그룹 추가

### 5.5 모바일 전용 패턴

- **Pull-to-Refresh**: DashboardPage, LedgerPage 에 native-feeling pull 제스처 (rubber-band spring)
- **Swipe Actions**: 거래 리스트 항목 좌/우 스와이프 → 삭제/편집 (Framer Motion `drag`)
- **BottomSheet 중심 편집**: 데스크톱 Dialog 대신 모바일은 BottomSheet (기존 토큰 재활용)
- **Haptic-like Visual Feedback**: tap 시 0.98 scale + 60ms flash (iOS native 느낌)

---

## 6. 컴포넌트별 리디자인 상세

### 6.1 DashboardPage (최우선)

**현재**: 세로 stack, 카드 단색 배경, hero는 NetWorth 1개.

**v2.0 설계**:
```
┌─────────────────────────────────┐
│  Hero Row                       │  ← 3-column (xl+) / stack (md-)
│  ┌───────┬─────────┬─────────┐  │
│  │ Net   │ Monthly │ Upcoming│  │
│  │Worth  │ Flow    │ Bills   │  │
│  │ (hero)│ (+1)    │ (+1)    │  │
│  └───────┴─────────┴─────────┘  │
├─────────────────────────────────┤
│  Chart Row (2-col)              │
│  ┌──────────────┬─────────────┐ │
│  │ NW Trend 3M  │ Allocation  │ │
│  │ (glass)      │ (glass)     │ │
│  └──────────────┴─────────────┘ │
├─────────────────────────────────┤
│  Summary Grid (4-col xl / 2-col md) │
│  [Budget] [Goals] [Subs] [Members]  │
├─────────────────────────────────┤
│  Recent Transactions (list)     │
└─────────────────────────────────┘
```

- **Hero Row**: `NetWorthCard` 를 3장으로 확장. 각 카드 hero-gradient 색상 서로 다른 hue offset (primary / accent-success / accent-warning)
- **Spotlight cursor**: 최상단 NetWorthCard (desktop only)
- **Stagger choreography**: `staggerContainer` 하위 각 Row 의 delayChildren 순차 (0 → 0.15 → 0.3 → 0.45)
- **Skeleton 개선**: 섹션별 wave skeleton, 실데이터 도착 시 cross-fade (200ms)
- **Quick Action FAB**: 우하단 `el-fab` + `el-pulse` (첫 방문 시만) "거래 추가"

### 6.2 NetWorthCard → HeroMetricCard 추상화

재사용 가능한 `<HeroMetricCard variant="primary|success|warning" gradient spotlight>` 로 리팩터:

```tsx
<HeroMetricCard
  label="순자산"
  value={netWorth}
  delta={{ daily: dailyChange, monthly: monthlyChange }}
  variant="primary"
  spotlight          // desktop only
  shimmer
  noise
/>
```

- `boxShadow` 인라인 → `el-strong` 클래스로
- AnimatedAmount 는 useCountUp 훅으로 정리
- tap 시 상세 Assets 페이지로 슬라이드 (route transition + shared layout id)

### 6.3 BottomNav

- 활성 인디케이터: 현재 하단 라인 → **icon 뒤 morph blob** (Framer `layoutId`)
- Long press → 빠른 액션 메뉴 (BottomSheet)
- Icon: 비활성 `stroke-width:1.5` → 활성 `stroke-width:2` + scale 1.05 spring
- Haptic ripple (시각적): tap 중심 radial-gradient 0→80%, 250ms

### 6.4 Header (desktop Sidebar)

- `el-sidebar-edge` 이미 존재 → 적용 확대
- 활성 메뉴: `el-sidebar-active::before` left 3px glow bar (존재) — hover 시 width 6px 확장 morph
- 사용자 아바타 영역: `el-gradient-border` 적용 (프리미엄 뱃지 느낌)

### 6.5 Card / ListItem

- 모든 카드 `el-card` 강제 → hover 시 `el-glow-soft`
- 리스트 항목: `el-hover` + `--surface-layer-1` 위 `--surface-layer-2` 로 hover lift
- 중요 카드 (예산 초과, 목표 달성): status glow (`el-success`/`el-warning`/`el-danger`)

### 6.6 Dialog / BottomSheet

- Overlay: `backdrop-blur-24` + `background: color-mix(in oklch, black 40%, transparent)`
- Entry: y:40 → 0, opacity, spring snappy (320/24)
- Exit: y:20, opacity 0, 180ms
- BottomSheet drag-to-dismiss: velocity > 500 시 close

### 6.7 Toast / Snackbar

- 우하단 (desktop) / 상단 (mobile) positioning
- Entry: y:-16→0 + opacity, 스태거 가능 (여러 개 동시)
- Progress bar (auto-dismiss): 1px bottom bar linear countdown
- Status variant: success/warning/danger glow 자동

### 6.8 Input / Form

- `el-input` focus glow 이미 존재 → 전 인풋 적용
- Floating label 스타일 재정립 (iOS Safari 16px 이상 유지)
- 금액 입력: 입력 직후 자동 `formatKoreanUnit` 프리뷰 (하단 caption)
- 에러: shake 100ms + danger glow + haptic-like 진동 (모바일)

### 6.9 Chart (Chart.js)

- `lib/chartConfig.ts` 확장:
  - darkmode media query 감지 → grid/label 색상 자동 전환
  - palette 데이터 속성 감지 → 데이터셋 색상 연동
  - tooltip: glassmorphism 배경 + `el-soft` + monospace 금액
- 데이터 시퀀스 토큰화: `--chart-series-1` ~ `--chart-series-8` (palette 연동)
- Empty state: `EmptyState` 컴포넌트 재사용 + 일러스트 (CSS-only gradient blob)

### 6.10 Skeleton

- 현재 shimmer 단조 → 3종류로 세분화
  - `skeleton-wave`: gradient linear wave (2s)
  - `skeleton-pulse`: opacity 0.4↔0.7 breathing (1.6s)
  - `skeleton-shimmer-diagonal`: hero 용

### 6.11 EmptyState

- 각 feature 별 전용 일러스트 (CSS gradient blob + lucide icon 조합)
- 3단 구조: 시각 요소 + 메시지 + primary action
- 다크모드 대비 최적화

---

## 7. 모션 안무 시스템 (Motion Choreography)

### 7.1 4-Layer Motion Model

| Layer | 책임 | 예시 | Duration |
|---|---|---|---|
| **L1 Entry** | 페이지/섹션 진입 | `staggerContainer` + fade+y | 400-600ms |
| **L2 Stagger** | 리스트/그리드 등장 | `staggerItem` delay 40ms | 200ms each |
| **L3 Micro** | hover/focus/tap | scale 0.98, glow transition | 160-240ms |
| **L4 Exit** | 언마운트, route 전환 | y:8, opacity 0 | 180ms |

### 7.2 Route Transition

```tsx
<AnimatePresence mode="wait">
  <motion.div
    key={location.pathname}
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -4 }}
    transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
  >
```

### 7.3 Shared Layout Transitions

- HeroMetricCard → 상세 페이지: `layoutId="hero-networth"` 로 morph
- BottomNav active indicator: `layoutId="nav-indicator"`
- ListItem → EditSheet: `layoutId={transaction.id}`

### 7.4 Spring Presets (JS)

```ts
// lib/motionConfig.ts 확장
export const springs = {
  gentle:  { type: 'spring', stiffness: 120, damping: 18, mass: 1 },
  snappy:  { type: 'spring', stiffness: 320, damping: 24, mass: 0.8 },
  bouncy:  { type: 'spring', stiffness: 400, damping: 12, mass: 0.6 },
  precise: { type: 'spring', stiffness: 500, damping: 30, mass: 1 },
}
```

### 7.5 Reduced Motion 준수 강제

- 모든 motion 컴포넌트는 `useReducedMotion()` 훅으로 분기
- Lint rule: Framer Motion `animate=` prop 사용 시 훅 사용 여부 체크 (custom eslint plugin)

---

## 8. 접근성 하드닝 (Accessibility)

### 8.1 Focus System 재설계

- `--ring-focus` 토큰을 현재 배경색 → **항상 대비되는 accent 색**으로 수정
  ```css
  :root { --ring-focus: var(--color-primary-600); }
  .dark { --ring-focus: var(--color-primary-400); }
  html.dark[data-oled="true"] { --ring-focus: var(--color-primary-300); }
  ```
- focus-visible 표준 클래스: `ring-2 ring-[color:var(--ring-focus)] ring-offset-2 ring-offset-[color:var(--surface-primary)]`

### 8.2 WCAG 준수

- 대비 감사 (axe-core 자동화): 모든 text/bg 쌍 AA (4.5:1) 이상, 숫자(금액)는 AAA (7:1) 지향
- Skip link: 페이지 최상단에 "본문으로 건너뛰기" (현재 없음 추정)
- Landmark: `<main>`, `<nav aria-label="...">`, `<aside>` 명시

### 8.3 Media Queries

- `prefers-reduced-motion: reduce` → 모든 animation/transition `duration: 0ms`
- `prefers-contrast: more` → 그림자/글로우 제거, 테두리 2px 강조
- `prefers-color-scheme: dark` → 시스템 기본 다크 자동 선택 (사용자 override 저장 시 무시)

### 8.4 Screen Reader

- 모든 차트에 `<table>` screen-reader-only summary 제공
- 상태 변경(sync, toast)은 `aria-live="polite"` region
- 로딩 상태는 `aria-busy="true"`

---

## 9. 다크모드 & OLED 완성도

### 9.1 다크모드 자동화

- Tailwind `dark:` variant 수동 작성 → **semantic 토큰 사용으로 자동화** (이미 방향성 맞음, 커버리지 확대)
- 모든 color 속성 `var(--text-*)`, `var(--surface-*)`, `var(--border-*)` 로 강제 (ESLint rule)

### 9.2 OLED 모드 UX

- 설정 페이지에 **"AMOLED 절약 모드"** 토글 추가
- 토글 시 `html.dark[data-oled="true"]` 속성 주입
- 효과: 순수 블랙 배경 (`#000`) + Edge Lighting 대비 향상으로 고급감 급상승

### 9.3 Time-Based Theme 구현

```ts
// lib/timeTheme.ts (NEW)
function getTimePeriod(): 'morning' | 'day' | 'evening' | 'night' {
  const h = new Date().getHours()
  if (h >= 5 && h < 10) return 'morning'
  if (h >= 10 && h < 17) return 'day'
  if (h >= 17 && h < 21) return 'evening'
  return 'night'
}
// App.tsx 마운트 시 + 매 시간 interval 로 data-time-period 주입
```

### 9.4 Palette 4색 × 테마 3종 매트릭스 QA

12개 조합 × Light/Dark/OLED 3종 = **36개 시각 상태** 모두 스크린샷 회귀 테스트 대상.

---

## 10. Financial Data UX 특화

### 10.1 숫자 표현 표준

| 상황 | 표현 | 클래스 |
|---|---|---|
| 카드 hero 금액 | `1,234,567원` + 한국 단위 서브 | `.tabular-nums` + `.financial-value` |
| 작은 공간 (모바일) | `123.4만원` | `formatKoreanUnit()` |
| 차트 툴팁 | `1,234,567` monospace | `font-variant-numeric: tabular-nums` |
| 비율 | `+12.3%` | color: `var(--value-positive/negative)` |

### 10.2 민감정보 마스킹

- 설정 "금액 숨기기" 토글 → 모든 금액 `●●●●` 마스킹
- Long-press 시 일시 공개 (3초), `el-pulse` 효과로 피드백
- 앱 백그라운드 진입 시 자동 마스킹 (Visibility API)

### 10.3 Delta 시각화

- 긍정: `TrendingUp` + `text-[color:var(--status-success-text)]`
- 부정: `TrendingDown` + `text-[color:var(--status-danger-text)]`
- 변화 순간 0.3s ease-out scale(1.1) + glow flash

### 10.4 Live Sync Indicator

- 우상단 또는 헤더에 "✓ 2초 전 동기화" · "⏳ 동기화 중" · "⚠ 오프라인"
- 상태 변경 모션: 180ms opacity cross-fade

---

## 11. Phase 로드맵 (6주)

### Phase 0 · Setup (0.5주)
- 토큰 레이어 신규 파일 생성 (surfaces/motion/blur/data-viz/density)
- `@layer` cascade 도입
- ESLint rule: 하드코딩 색상/스페이싱 감지
- Storybook 도입 (선택, 컴포넌트 감사용)

### Phase 1 · Foundation 확장 (1주)
- 유체 타이포그래피 유틸 추가
- Safe area 유틸 확대
- Focus ring 토큰 수정
- Density 토글 (settingsStore)

### Phase 2 · 전역 효과 확대 (1주)
- Edge Lighting 미적용 컴포넌트 일괄 적용 (FAB, List, Sidebar item)
- Hero gradient variant 3종 추가
- Aurora/Spotlight 효과 신규 (로그인, 대시보드)
- Skeleton wave 개선

### Phase 3 · 모션 시스템 (1주)
- `motionConfig.ts` spring presets 확장
- AnimatePresence route transition 전역화
- Shared layoutId 도입 (hero morph, nav indicator)
- Swipe/drag gestures (리스트, BottomSheet)

### Phase 4 · 컴포넌트 리디자인 (1.5주)
- DashboardPage 3-row 레이아웃
- HeroMetricCard 추상화
- BottomNav morph indicator
- Chart.js 다크모드/팔레트 자동화
- Input/Dialog/Toast 모션 업그레이드

### Phase 5 · QA & 접근성 (1주)
- axe-core 자동 감사
- 36개 조합(palette × theme) 시각 회귀
- prefers-reduced-motion / prefers-contrast 회귀
- Playwright E2E: 주요 유저 플로우 5개

### Phase 6 · 마감 · 배포 (0.5주)
- 성능 예산 확인 (Lighthouse ≥ 95)
- 번들 크기 회귀 (기존 대비 +10% 이내)
- 릴리스 노트, 롤백 플랜

---

## 12. 파일 변경 영향도 (예측)

### 신규 생성 (11개)
```
src/styles/tokens/surfaces.css
src/styles/tokens/motion.css
src/styles/tokens/blur.css
src/styles/tokens/data-viz.css
src/styles/tokens/density.css
src/styles/utilities/typography-fluid.css
src/styles/utilities/safe-area.css
src/styles/utilities/surfaces.css
src/components/ui/HeroMetricCard.tsx
src/components/ui/SpotlightCard.tsx
src/lib/timeTheme.ts
```

### 수정 (주요, ~20개)
- `src/styles/foundation.css` (import 추가)
- `src/styles/tokens/semantic-colors.css` (ring-focus 수정)
- `src/lib/motionConfig.ts` (springs 추가)
- `src/lib/chartConfig.ts` (다크모드 자동화)
- `src/stores/settingsStore.ts` (density, oled, hideAmounts 추가)
- `src/components/dashboard/DashboardPage.tsx` (3-row 레이아웃)
- `src/components/dashboard/NetWorthCard.tsx` → HeroMetricCard 로 대체
- `src/components/layout/BottomNav.tsx` (morph indicator)
- `src/components/layout/Sidebar.tsx`, `Header.tsx`
- `src/components/ui/Card.tsx`, `Dialog.tsx`, `GlobalToast.tsx`, `Skeleton.tsx`
- `src/App.tsx` (time-period injection, route AnimatePresence)
- ESLint 설정

### 비수정 (원칙)
- `src/services/*` (데이터 레이어 건드리지 않음)
- `src/stores/*` (settingsStore 제외)
- `src/hooks/*` 대부분

---

## 13. 성공 지표 (KPIs)

| 카테고리 | 지표 | 목표 |
|---|---|---|
| **성능** | Lighthouse Performance | ≥ 95 |
| **성능** | LCP (모바일) | ≤ 1.8s |
| **성능** | CLS | ≤ 0.05 |
| **성능** | JS 번들 증가 | ≤ +10% |
| **접근성** | Lighthouse A11y | 100 |
| **접근성** | axe violations | 0 critical |
| **다크모드** | 시각 회귀 커버리지 | 36조합 |
| **일관성** | 하드코딩 색상 개수 | 0 |
| **일관성** | Edge Lighting 적용 컴포넌트 | ≥ 90% |
| **모션** | reduced-motion 준수 컴포넌트 | 100% |
| **반응형** | fold~3xl 레이아웃 깨짐 | 0 |

---

## 14. 리스크 & 완화책

| 리스크 | 영향 | 완화책 |
|---|---|---|
| 모션 증가 → 저사양 기기 버벅임 | 중 | `@media (prefers-reduced-motion)` + 디바이스 성능 감지 시 L3만 유지 |
| 효과 남용 → "카지노 UI" | 고 | Effect 가드레일 (§4.3) · 페이지당 hero 3개 상한 |
| 다크모드 대비 저하 | 고 | axe 자동 감사 + 디자이너 수동 리뷰 |
| Chart.js 커스텀으로 업데이트 파손 | 저 | 버전 핀 + chartConfig 단일 모듈화 |
| Phase 간 시각 불일치 | 중 | feature flag (`data-ui-version="v2"`) 로 점진 롤아웃 |
| iOS Safari backdrop-blur 성능 | 중 | `backdrop-filter` 에 `will-change` 병용, `@supports` fallback |

---

## 15. 오픈 퀘스천 (의사결정 필요)

1. **Storybook 도입 여부** — 컴포넌트 감사 효율 vs. 번들·빌드 오버헤드
2. **컬러 팔레트 5번째 추가** (monochrome/plum 등) — 4색 충분 여부
3. **Pull-to-refresh 라이브러리** — 자체 구현 vs. `react-pull-to-refresh`
4. **Chart.js 교체 여부** — Recharts, visx 전환 검토 가치 (본 플랜은 유지 가정)
5. **Feature flag 메커니즘** — data-attr vs. env vs. 새 store
6. **릴리스 전략** — v1.0.x 병렬 유지 vs. 즉시 승격

---

## 16. 결론

Moonwave Finance v2.0 **"Obsidian"** 은 **재설계가 아닌 체계화**다. 이미 심어둔 좋은 씨앗(Edge Lighting, 4색 팔레트, OLED 토큰, Framer Motion)을 **균등하게 확대**하고, 부족한 축(유체 타이포, 시간 테마, 모션 안무, 접근성)을 **표준 수준까지 끌어올리는** 작업에 가깝다.

하이엔드급의 본질은 **"많이"가 아닌 "정확하게"**다. 빛나는 요소는 적고, 여백은 넓고, 숫자는 정확하고, 상호작용은 예측 가능해야 한다. 6주 로드맵을 통해 각 Phase는 독립 배포 가능하며, 언제든 롤백 가능하다.

**Next Action**: §15 오픈 퀘스천에 대한 의사결정 → Phase 0 착수.

---
*문서 버전: 1.0 · 작성: Claude (Opus 4.7, --ultrathink)*
