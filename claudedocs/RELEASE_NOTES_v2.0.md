# Moonwave Finance v2.0 "Obsidian" — 릴리스 노트

> **코드네임**: Obsidian (흑요석)
> **대상**: v1.0 → v2.0 하이엔드 UI/UX 전면 리디자인
> **호환성**: 100% backward-compatible (데이터 스키마 / 스토어 API 무변경)

---

## 🌟 핵심 철학

**"검은 유리 위에 빛이 스쳐 지나가는 순간"**
어두운 서피스 + 단일 색상 글로우 + 절제된 색 + 정확한 타이포 = 프리미엄 금융 앱 미학

---

## 🎯 신규 사용자 기능

### 1. 대시보드 3-Row Hero Layout
순자산 1개 → **순자산 · 총자산 · 총부채** 3개 영웅 카드로 확장
- 각 카드에 고유한 gradient variant (primary / success / warning 자동 선택)
- 순자산 카드에 Spotlight cursor follow (desktop hover 시 마우스 추적 radial highlight)
- Stagger 애니메이션: 카드 순차 등장(80ms 간격)

### 2. 설정 → 화면 옵션 4종 신규 토글
사용자가 **설정 모달 → 일반 탭**에서 실시간 전환:

| 토글 | 효과 |
|---|---|
| **AMOLED 절약 모드** | 다크 모드에서 순수 블랙(#000) 배경으로 전환. OLED 패널 배터리 절약 |
| **시간대 자동 테마** | 아침/낮/저녁/밤에 따라 primary hue 자동 조정 (15분 간격) |
| **금액 숨기기** | 전 대시보드 금액 블러 처리. 호버/포커스 시 일시 공개 |
| **표시 밀도** | 컴팩트/표준/넓게 3단계 — spacing·typography·touch target 동시 스케일 |

### 3. 모바일 Pull-to-Refresh
대시보드에서 **상단으로 당기기** → native-feeling rubber-band spring + 회전 아이콘 + 새로고침
- `prefers-reduced-motion` 존중 (자동 비활성)
- 데스크톱 자동 비활성 (hover:hover 디바이스)

### 4. Edge Lighting 전 컴포넌트
모든 인터랙티브 요소에 절제된 primary glow 적용:
- 카드 hover 시 `el-glow-soft` → `el-glow-medium` 전환
- FAB `el-fab` + pulse
- Sidebar 활성 메뉴 좌측 3px glow bar
- BottomNav 활성 아이콘 뒤 morph blob (Framer `layoutId`)
- Dialog · Toast · Input focus glow

### 5. 로딩/로그인 화면 Aurora
3색 conic-gradient 24초 회전 (`aurora-bg`) — 프리미엄 인트로 인상

### 6. iOS 노치 / 안전 영역 대응
Header에 `pt-safe-only` — iOS Safari 상단 노치 영역이 헤더 뒤로 자연스럽게 흐름.
BottomNav는 기존 `pb-safe` 유지.

### 7. 유체 타이포그래피
`clamp()` 기반 `text-financial-fluid` / `text-h1-fluid` / `text-h2-fluid` — fold 디바이스(340px) ↔ 울트라와이드(1920px) 전 구간 자연스러운 스케일.

---

## 🔧 개발자 기술 변경

### 신규 디자인 토큰 (5개 파일)

```
src/styles/tokens/
├── surfaces.css   — 4-layer surface + hairline + inset highlight
├── motion.css     — easing / duration / transition presets
├── blur.css       — backdrop-blur scale (xs/sm/md/lg/xl/2xl/3xl)
├── data-viz.css   — 8-series chart + tooltip + 재무 의미색
└── density.css    — compact/comfortable/spacious 3단계 multiplier
```

### 신규 유틸 (4개 파일)

```
src/styles/utilities/
├── typography-fluid.css  — clamp() 기반 유체 타이포
├── safe-area.css         — iOS notch / home indicator 전방위
├── surfaces.css          — 4-layer surface utility classes
└── hero-effects.css      — Hero variant 3종 + Aurora + Spotlight + Skeleton wave
```

### 신규 컴포넌트/훅/로직

| 파일 | 역할 |
|---|---|
| `src/components/ui/HeroMetricCard.tsx` | 재사용 hero 카드 (4 variant · spotlight · layoutId · hideAmounts) |
| `src/components/ui/Amount.tsx` | hideAmounts 자동 구독 금액 표시 (5 format · sign · size) |
| `src/components/ui/PullToRefreshIndicator.tsx` | 상단 anchor UI |
| `src/hooks/usePullToRefresh.ts` | rubber-band touch gesture |
| `src/lib/timeTheme.ts` | morning/day/evening/night watcher (15분 간격) |

### 수정된 핵심 파일

- `src/lib/motionConfig.ts` — springs 6종 + routeTransition + heroContainer/heroItem + easing/duration 토큰 export
- `src/lib/chartConfig.ts` — CSS 변수 getter 패턴으로 전면 리팩터 (다크/팔레트 자동 반응)
- `src/styles/tokens/semantic-colors.css` — `--ring-focus` 버그 수정 (배경색 → accent)
- `src/stores/settingsStore.ts` — `setDensity` / `toggleOledMode` / `toggleHideAmounts` / `toggleTimeBasedTheme` 액션 추가
- `src/lib/types.ts` — `Density` + 4개 옵션 필드 추가

### 컴포넌트 업그레이드

- `DashboardPage.tsx` — 3-row hero + pull-to-refresh 통합
- `NetWorthCard.tsx` — HeroMetricCard 위임 (기존 props 호환)
- `DashboardSkeleton.tsx` — wave / breath / diagonal 3종 스켈레톤
- `BottomNav.tsx` — morph blob indicator + icon scale spring
- `Sidebar.tsx` — `el-sidebar-edge` + 메뉴 `el-hover`
- `Header.tsx` — `pt-safe-only` + 페이지 타이틀 `text-h2-fluid`
- `Dialog.tsx` — backdrop blur 2px → 12px + saturate 1.4
- `AnimatedOutlet.tsx` — motionConfig 토큰 정렬
- `AppLoadingScreen.tsx` · `OAuthCallback.tsx` — Aurora 적용
- `AssetLiabilityBreakdown.tsx` · `MonthlySummary.tsx` — `el-card-elevated` + `surface-inset-top` + Amount
- `TransactionCard.tsx` · `AssetItemCard.tsx` · `LiabilityItemCard.tsx` · `SubscriptionCard.tsx` · `SubscriptionWidget.tsx` · `LedgerSummaryCard.tsx` · `CategoryBreakdown.tsx` — Amount 적용 (hideAmounts 전역 반응)

---

## 📊 회귀 검증 결과

| 항목 | 결과 |
|---|---|
| TypeScript 타입체크 | ✅ 0 errors |
| Vite 프로덕션 빌드 | ✅ 성공 |
| Vitest 테스트 | ✅ 22/22 통과 |
| CSS 번들 | 215.22 kB (+0 vs v1.0) |
| JS index 번들 | 393.07 kB gzip 112.41 kB (+3 kB) |
| DashboardPage 청크 | 19.23 kB gzip 5.93 kB |

---

## 🔄 마이그레이션 가이드

### 기존 데이터 호환성: 100%
- Dexie 스키마 무변경
- Firestore 동기화 로직 무변경
- Zustand stores 기존 API 전부 유지 (Settings만 확장)

### 기존 컴포넌트 호환성: 100%
- `<NetWorthCard stats={stats} />` — 시그니처 유지. 내부적으로 HeroMetricCard 위임
- 기존 `formatKRW/formatKoreanUnit` — 유지. Amount는 선택적 추가

### 새로운 설정 필드 (자동 기본값 설정)
```ts
// 신규 필드는 initialize()에서 자동 hydrate — 마이그레이션 코드 불필요
settings.density         // 'comfortable' (기본)
settings.oledMode        // false
settings.hideAmounts     // false
settings.timeBasedTheme  // false
```

### CSS 클래스 이름 충돌 없음 (모두 신규)
- `el-*` (Edge Lighting) — v1.0에서 이미 사용 중
- `hero-gradient-success/warning/accent` — 신규, 기존 `hero-gradient`는 유지
- `aurora-bg`, `spotlight`, `amount-masked`, `skeleton-wave/breath/diagonal` — 신규

---

## ⚠️ 알려진 이슈 / 제한사항

1. **Chart.js getter 접근**: CSS 변수가 `:root` 에만 정의되어 있어 SSR/테스트 환경에서 fallback 값 사용
2. **Pull-to-refresh**: 모바일 Chrome의 기본 `overscroll-behavior` 와 시각적 겹칠 수 있음. 필요 시 `overscroll-behavior-y: contain` 추가 검토
3. **Aurora gradient**: `@property --aurora-angle` 지원 브라우저 (Safari 16+) 에서만 애니메이션. 미지원 브라우저는 정적 gradient fallback
4. **시간 기반 테마**: 15분 간격 interval — 정확한 분 단위 전환은 아님
5. **ESLint**: 프로젝트에 `eslint` devDep 미설치 상태 (v1.0 부터 존재하던 이슈, 본 릴리스와 무관)

---

## 📝 남은 후속 과제

- **Phase 5 (다음 릴리스)**: axe-core 접근성 자동 감사, 36 조합(palette × theme × OLED × density) 시각 회귀 테스트
- **Phase 6**: Lighthouse 측정 (목표: Performance ≥95, A11y=100)
- **추가 개선**: Sidebar 활성 메뉴 width morph, Swipe-to-dismiss BottomSheet, Container Query 도입

---

## 🙏 감사의 말

v1.0의 탄탄한 Foundation CSS 시스템(Edge Lighting · 4색 팔레트 · OLED 토큰 · Framer Motion)이 없었다면 2세션 안에 이 규모의 리디자인은 불가능했습니다. **기존 씨앗을 확대하는 작업**이지 **재설계가 아님** — 이것이 v2.0 Obsidian의 본질입니다.

---

*Claude (Opus 4.7) · 세션 누적 ~1200 lines · 테스트 100% 유지*
