# Moonwave Finance 가계부 v1.0

React 19 프로토타입 — 개인/가족 재무관리(가계부/자산/예산/구독/부채) 플랫폼

## Commands

```bash
npm run dev          # Vite dev server (port 3000)
npm run build        # tsc -b && vite build
npm run test         # Vitest run
npm run test:watch   # Vitest watch mode
npm run lint         # eslint
npm run preview      # Vite preview
```

## Architecture

```text
src/
├── components/               # React 컴포넌트 (feature-based)
│   ├── layout/               # Header, Sidebar, BottomNav, PageContainer
│   ├── ui/                   # ErrorBoundary, GlobalToast, Skeleton, Dialog, Badge, EmptyState
│   ├── dashboard/            # 메인 대시보드
│   ├── ledger/               # 거래내역 (수입/지출 CRUD)
│   ├── calendar/             # 달력 뷰
│   ├── budget/               # 예산관리
│   ├── assets/               # 자산관리
│   ├── liabilities/          # 부채관리
│   ├── subscriptions/        # 구독관리
│   ├── goals/                # 목표 저축
│   ├── reports/              # 통계/리포트
│   ├── search/               # 검색
│   ├── settings/             # 설정
│   ├── profile/              # 프로필/계정
│   └── onboarding/           # 온보딩
├── stores/                   # Zustand 상태관리 (15개)
│   ├── authStore.ts          # Firebase Auth
│   ├── settingsStore.ts      # 앱 설정 (테마, 팔레트, 다크모드)
│   ├── transactionStore.ts   # 거래내역 CRUD
│   ├── budgetStore.ts        # 예산관리
│   ├── assetStore.ts         # 자산관리
│   ├── loanStore.ts          # 부채/대출
│   ├── subscriptionStore.ts  # 구독관리
│   ├── goalStore.ts          # 목표 저축
│   ├── memberStore.ts        # 가족 멤버
│   ├── dailyValueStore.ts    # 일별 합계
│   ├── toastStore.ts         # 토스트 알림
│   ├── uiStore.ts            # UI 상태 (사이드바 등)
│   ├── undoStore.ts          # 되돌리기
│   ├── pwaUpdateStore.ts     # PWA 업데이트
│   └── iosInstallStore.ts    # iOS 설치 프롬프트
├── services/                 # 비즈니스 로직
│   ├── database.ts           # Dexie (IndexedDB) 스키마 + 초기화
│   ├── firestoreSync.ts      # Firebase Firestore 실시간 동기화
│   ├── recurringEngine.ts    # 반복 거래 엔진
│   ├── subscriptionEngine.ts # 구독 결제 엔진
│   ├── assetAnalytics.ts     # 자산 분석
│   ├── backup.ts             # 데이터 백업/복원
│   ├── easyLedgerImport.ts   # 편한가계부 CSV 임포트
│   ├── notificationService.ts # 알림 서비스
│   └── seedTestData.ts       # 테스트 데이터 시드
├── hooks/                    # 커스텀 훅 (17개)
│   ├── useCalendar.ts        # 달력 로직
│   ├── useTransactionFilters.ts # 거래 필터링
│   ├── useAssetStats.ts      # 자산 통계
│   ├── useDailyValues.ts     # 일별 합계
│   ├── useCountUp.ts         # 숫자 카운트업 애니메이션
│   ├── useAutoSync.ts        # 자동 동기화
│   ├── useSyncListener.ts    # 동기화 이벤트 리스너
│   ├── useSearch.ts          # 검색
│   ├── useSwipe.ts           # 스와이프 제스처
│   ├── useScrollDirection.ts # 스크롤 방향 감지
│   ├── useConfetti.ts        # 완료 효과
│   └── ...
├── lib/                      # 유틸리티
│   ├── types.ts              # TypeScript 전체 타입 정의
│   ├── firebase.ts           # Firebase 앱 초기화
│   ├── dateUtils.ts          # 날짜 유틸리티
│   ├── chartConfig.ts        # Chart.js 전역 설정
│   ├── motionConfig.ts       # Framer Motion 설정
│   ├── calendarUtils.ts      # 달력 유틸리티
│   ├── assetCalendarUtils.ts # 자산 달력 유틸리티
│   └── crypto.ts             # 암호화 유틸리티
├── utils/                    # 범용 유틸리티
├── pages/                    # 페이지 컴포넌트 (lazy load)
├── styles/                   # Foundation CSS 디자인 시스템
│   ├── foundation.css        # 마스터 import (tokens → utilities 순서)
│   ├── tokens/               # 디자인 토큰 (23개 CSS 파일)
│   └── utilities/            # 유틸리티 클래스 (19개 CSS 파일)
└── test/                     # Vitest 테스트
```

## Key Conventions

- **Language**: 모든 UI 텍스트 한국어.
- **Data**: Dexie (IndexedDB) 로컬 우선 + Firebase Firestore 클라우드 동기화.
- **Auth**: Firebase Authentication (Google 로그인).
- **Realtime Sync**: `firestoreSync.ts`로 Dexie ↔ Firestore 양방향 동기화.
- **State**: Zustand stores (15개). settingsStore는 localStorage persist.
- **Styling**: Foundation CSS(디자인 토큰 + 컴포넌트 클래스) + Tailwind CSS v4(레이아웃 + 반응형) 하이브리드.
- **Routing**: React Router v7. 모든 페이지 `React.lazy()` + `<Suspense>` 코드 스플리팅.
- **Components**: Feature-based directories under `src/components/`.
- **Icons**: Lucide React (`import { IconName } from 'lucide-react'`).
- **Charts**: Chart.js + react-chartjs-2.
- **Animation**: Framer Motion.

## CSS Design System (Foundation CSS)

PPA Foundation 아키텍처 기반 + TDL 팔레트 시스템.

```text
src/styles/
├── foundation.css            # 마스터 import hub
├── tokens/                   # 디자인 토큰 (23 files)
│   ├── spacing.css           # 8px grid + KT alias
│   ├── breakpoints.css       # 7단계 (xs 360px ~ 3xl 1920px)
│   ├── radius.css            # 반경 + nested radius
│   ├── elevation.css         # 그림자 + z-index alias
│   ├── typography.css        # KT 전체 타이포 스케일 (display1~label4)
│   ├── icon.css              # 아이콘 크기 + 터치타겟
│   ├── components.css        # 공통 컴포넌트 토큰
│   ├── button.css            # 버튼 토큰
│   ├── input.css             # 입력 토큰
│   ├── navigation.css        # 네비게이션 토큰
│   ├── card.css              # 카드 토큰
│   ├── dialog.css            # 다이얼로그 토큰
│   ├── bottomsheet.css       # 바텀시트 토큰
│   ├── toast.css             # 토스트 토큰
│   ├── tab.css               # 탭 토큰
│   ├── checkbox-radio.css    # 체크박스/라디오 토큰
│   ├── chip-badge.css        # 칩/배지 토큰
│   ├── misc.css              # 기타 (divider, tooltip, filter)
│   ├── semantic-colors.css   # 시맨틱 컬러 (surface/text/border + OLED + 차트)
│   ├── table.css             # 테이블 토큰
│   ├── category-colors.css   # 카테고리 컬러 팔레트 (TDL)
│   ├── edge-lighting.css     # Edge Lighting 토큰 (TDL)
│   └── theme-overlays.css    # 테마 오버레이 (TDL)
└── utilities/                # 유틸리티 클래스 (19 files)
    ├── typography.css        # 타이포그래피 클래스
    ├── elevation.css         # 그림자 유틸리티
    ├── divider.css           # 구분선
    ├── icon.css              # 아이콘 유틸리티
    ├── button.css            # 버튼 (FAB, slider 포함)
    ├── input.css             # 입력 (desktop 패턴 포함)
    ├── navigation.css        # 네비게이션
    ├── card.css              # 카드
    ├── dialog.css            # 다이얼로그
    ├── bottomsheet.css       # 바텀시트
    ├── toast.css             # 토스트
    ├── tab.css               # 탭 (segment 포함)
    ├── checkbox-radio.css    # 체크박스/라디오
    ├── chip-badge.css        # 칩/배지/태그
    ├── misc.css              # 기타 (spinner, filter panel)
    ├── semantic-colors.css   # 시맨틱 컬러 유틸리티
    ├── table.css             # 데이터 테이블
    ├── layout.css            # 반응형 콘텐츠 컨테이너
    └── edge-lighting.css     # Edge Lighting 유틸리티 (TDL)
```

### Color System

- **Primary**: OKLCH hue 250 (Blue 기본) — `--color-primary-50` ~ `--color-primary-900`.
- **4색 팔레트 전환**: `data-palette="ocean|rose|purple|forest"` (Light + Dark).
- **시간 기반 테마**: `data-time-period="morning|evening|night"` — 시간대별 hue 자동 변경.
- **테마 오버레이**: `data-theme-overlay="..."` — 카테고리/날씨 기반 색상 오버레이.
- **시맨틱 컬러**: `--surface-primary`, `--text-secondary`, `--border-default` 등 (Light/Dark/OLED 3단계).
- **OLED 모드**: `html.dark[data-oled="true"]` — 순수 블랙 배경.
- Tailwind 클래스: `text-primary-500`, `bg-primary-600` 등.

### Responsive Breakpoints

```text
xs:  360px   (Galaxy S small)
sm:  390px   (iPhone 14/15)
md:  600px   (tablet)
lg:  768px   (tablet landscape)
xl:  1024px  (desktop)
2xl: 1280px  (wide desktop)
3xl: 1920px  (ultra-wide)
```

Custom variants: `dark`, `fold` (≤340px), `mobile` (<600px), `tablet` (600~1023px), `zfold-open` (600~767px).

## Gotchas & Tips

- **Dexie + Firestore 동기화**: `firestoreSync.ts`가 양방향 동기화 처리. Dexie가 로컬 SOT, Firestore가 클라우드 백업.
- **Store 초기화 흐름**: `authStatus === 'authenticated'` → `App.tsx`에서 스토어 `initialize()` → Dexie 로드 → Firestore 구독.
- **금융 데이터 표시**: `.tabular-nums` 또는 `.financial-value` 클래스 필수. `font-variant-numeric: tabular-nums`.
- **수입/지출 색상**: `.value-positive` (green), `.value-negative` (red) — index.css Finance-Specific 섹션.
- **팔레트 전환**: `settingsStore.palette` → `html[data-palette]` 속성으로 적용. JS에서 `document.documentElement.dataset.palette = 'ocean'`.
- **iOS Safari**: input `font-size: max(16px, 1em)` — 자동 줌 방지 (index.css에 설정됨).
- **Safe Area**: 하단 고정 요소에 `pb-safe` 또는 `env(safe-area-inset-bottom)` 필수.
- **Wizard 전환**: `.wizard-step-forward` / `.wizard-step-backward` — TransactionWizard에서 사용.
- **Hero 카드**: `.hero-gradient` + `.noise-overlay` + `.hero-shimmer` 조합.
- **Glassmorphism**: `.glass` (blur 16px) / `.glass-heavy` (blur 24px).
- **Edge Lighting**: `.edge-lighting` — 알림/강조 효과용 glow 애니메이션.
- **Vendor Chunking**: react, firebase, charts, ui, data, motion 6개 청크 (vite.config.ts).
- **CSV Import**: `easyLedgerImport.ts`로 편한가계부 CSV 직접 임포트 가능.
