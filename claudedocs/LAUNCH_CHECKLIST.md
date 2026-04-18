# Moonwave Finance v2.0 "Obsidian" — 런치 체크리스트

> 실전 배포 전 QA · 성능 · 접근성 · 롤백 검증 리스트
> **Status**: Pre-launch · 체크박스는 배포 전 확인 필요

---

## 🔨 빌드 · 테스트 (자동 검증 통과)

- [x] TypeScript 타입체크 (`npx tsc -b --noEmit`) — 0 errors
- [x] Vite 프로덕션 빌드 (`npm run build`) — 성공
- [x] Vitest 단위 테스트 (`npm run test`) — 22/22 통과
- [x] CSS 번들 증가 <+10% (v1.0 215 kB → v2.0 215 kB 유지)
- [x] JS index 번들 증가 <+10% (v1.0 390 kB → v2.0 394 kB, +1%)

---

## 🎨 시각 QA (수동 체크 필요)

### 핵심 페이지 × 테마 매트릭스

다음 조합에서 레이아웃 깨짐 · 텍스트 대비 저하 · 인터랙션 오동작 없는지 확인:

| 페이지 | Light | Dark | Dark+OLED |
|---|---|---|---|
| 로그인/로딩 (Aurora) | ☐ | ☐ | ☐ |
| 대시보드 (3-row hero) | ☐ | ☐ | ☐ |
| 거래 목록 (Ledger) | ☐ | ☐ | ☐ |
| 자산 목록 | ☐ | ☐ | ☐ |
| 자산 상세 | ☐ | ☐ | ☐ |
| 부채 목록/상세 | ☐ | ☐ | ☐ |
| 구독 목록 | ☐ | ☐ | ☐ |
| 분석 (Reports) | ☐ | ☐ | ☐ |
| 프로필 | ☐ | ☐ | ☐ |
| 설정 모달 | ☐ | ☐ | ☐ |

### 팔레트 4종 × 대시보드

- [ ] `default` — Blue primary
- [ ] `ocean` — Light ocean / Dark oklch(0.35 0.12 250)
- [ ] `rose` — Magenta hue 350
- [ ] `purple` — Violet hue 300
- [ ] `forest` — Emerald hue 160

각 팔레트에서 Edge Lighting glow · Hero gradient · 차트 색상이 일관성 있게 변경되는지 확인.

### 밀도(Density) 3종 × 핵심 페이지

- [ ] Compact — 여백 0.82x, 컴팩트 UI
- [ ] Comfortable (기본) — 표준
- [ ] Spacious — 여백 1.18x, 넓게

Dashboard · Ledger · Settings 에서 카드 간격/폰트 크기/터치 타겟이 자연스럽게 스케일되는지 확인.

---

## ♿ 접근성 (Accessibility)

### 수동 검증

- [ ] **Skip to content** — 브라우저에서 주소창 Tab 1회 시 "본문으로 건너뛰기" 링크 표시
- [ ] **키보드 네비게이션** — 마우스 없이 Tab만으로 모든 기능 접근 가능
- [ ] **포커스 링 가시성** — 모든 interactive 요소에 ring-2 + accent 색
- [ ] **Landmark** — 스크린 리더 로터에서 main/nav/complementary 확인
- [ ] **차트 SR** — VoiceOver/NVDA 에서 차트 데이터 table로 읽힘
- [ ] **모달 ESC** — Dialog ESC 키로 닫힘
- [ ] **모바일 Dialog 핸들** — 탭 or 아래 스와이프로 닫힘
- [ ] **prefers-reduced-motion** — OS 설정 ON 시 Aurora/shimmer/pulse 등 정지

### 자동 감사 (추후 설치 권장)

```bash
npm i -D @axe-core/playwright
# tests/a11y.spec.ts에 playwright + axe 통합
```

목표 기준:
- [ ] axe violations: 0 `critical`
- [ ] 대비도 AA: 모든 text/bg 쌍 4.5:1 이상
- [ ] 금액 텍스트 AAA: 7:1 지향

---

## 📱 모바일 / 반응형

### 디바이스 테스트

- [ ] **Fold closed (280×653)** — BottomNav 5-item 아이콘만, Header 한글 타이틀 줄임
- [ ] **Galaxy S (360×800)** — 전 페이지 스크롤/탭 정상
- [ ] **iPhone 14 (390×844)** — 노치 safe-top 확인, 하단 home indicator safe-bottom
- [ ] **iPad Mini (768×1024)** — 사이드바 off 상태에서 2열 그리드
- [ ] **iPad Pro (1024×1366)** — 사이드바 on 상태에서 3열 그리드
- [ ] **Desktop 1440×900** — 전체 레이아웃 + Spotlight hover

### 제스처

- [ ] **Pull-to-refresh** — Dashboard 상단 당기기 → rubber-band + 회전 아이콘 → 데이터 새로고침
- [ ] **Swipe-to-delete** — TransactionCard 좌측 스와이프 → 수정/삭제 버튼 노출
- [ ] **BottomSheet tap handle** — 시트 상단 핸들 탭 → 닫힘
- [ ] **BottomSheet swipe down** — 핸들 아래로 드래그 → 닫힘 (60px 이상 or velocity 기반)

---

## 🌐 브라우저 호환성

- [ ] **Chrome 최신** (macOS/Windows/Android)
- [ ] **Safari 17+** (iOS/iPadOS/macOS)
- [ ] **Firefox 최신**
- [ ] **Edge 최신**
- [ ] **Samsung Internet** (Galaxy 기본)

### 기능별 호환성

- [ ] Aurora gradient (`@property --aurora-angle`) — Safari 16.4+, Chrome 85+
- [ ] Container Query (`@container`) — Safari 16+, Chrome 105+
- [ ] `color-mix(in oklch, ...)` — Safari 16.2+, Chrome 111+
- [ ] `backdrop-filter` — 전 브라우저 (iOS Safari는 `-webkit-` 포함)
- [ ] `@property` for Edge Lighting gradient border — Safari 16.4+

미지원 브라우저 fallback:
- Aurora → 정적 gradient
- Container Query → `@supports not` fallback media query
- color-mix → oklch 직접 사용

---

## ⚡ 성능 (Lighthouse 측정)

### 측정 절차

```bash
npm run build
npm run preview &  # serve dist/ on :4173
# 새 터미널에서
lighthouse http://localhost:4173 --view --preset=desktop
lighthouse http://localhost:4173 --view --form-factor=mobile
```

### 목표 기준

| 카테고리 | Desktop 목표 | Mobile 목표 |
|---|---|---|
| Performance | ≥ 95 | ≥ 90 |
| Accessibility | 100 | 100 |
| Best Practices | ≥ 95 | ≥ 95 |
| SEO | ≥ 90 | ≥ 90 |

### Core Web Vitals 목표

- [ ] LCP ≤ 1.8s (mobile)
- [ ] CLS ≤ 0.05
- [ ] INP ≤ 200ms
- [ ] FCP ≤ 1.0s (desktop)

### 번들 크기

- [ ] index.js ≤ 400 kB (gzip ≤ 115 kB) — 현재 394 kB ✅
- [ ] 총 JS 초기 로드 ≤ 500 kB gzip — 현재 ~470 kB ✅
- [ ] CSS ≤ 220 kB (gzip ≤ 40 kB) — 현재 215 kB ✅

---

## 🔐 보안 · 개인정보

- [ ] Firebase API keys — 공개 키만 사용 확인 (`.env` 파일 체크)
- [ ] Firestore security rules — 사용자 본인 데이터만 read/write 가능
- [ ] **hideAmounts** 토글 상태에서 스크린샷 시 금액 블러 처리됨
- [ ] Service Worker 캐시 — 민감 데이터 캐싱 제외 확인
- [ ] CSP 헤더 — inline style은 `style-src 'unsafe-inline'` 필요 (디자인 토큰 CSS vars)

---

## 🧪 기능 회귀 테스트 (주요 플로우)

### 1. 거래 추가

- [ ] 지출 추가 → 대시보드 "이번 달 가계부" 실시간 반영
- [ ] 수입 추가 → 월간 합계 업데이트
- [ ] 예산 초과 시 warning glow 표시 (`el-warning`)
- [ ] Ctrl+Z → 최근 거래 undo

### 2. 자산 관리

- [ ] 자산 추가 → 대시보드 총자산 증가, 순자산 카드 Stats 업데이트
- [ ] 자산 편집 → 상세 페이지 Current Value 카드 animate
- [ ] 자산 삭제 → 확인 Dialog → 목록에서 제거

### 3. 구독

- [ ] 구독 추가 (KRW) → 월별 합계 반영
- [ ] 구독 추가 (USD) → 환율 적용 → KRW 합산
- [ ] 결제 예정 알림 (설정 → 알림) → 지정 일수 전 알림

### 4. 동기화

- [ ] Google 로그인 → Firestore 데이터 복원
- [ ] 두 디바이스 동시 접속 → 변경사항 실시간 반영
- [ ] 오프라인 → 로컬 Dexie 동작 → 온라인 복귀 시 자동 동기화

### 5. 설정

- [ ] 테마 Light/Dark/System 전환
- [ ] AMOLED 토글 → 순수 블랙 배경
- [ ] 시간대 자동 테마 → hue 변경
- [ ] 금액 숨기기 → 전 앱 블러
- [ ] 밀도 컴팩트/표준/넓게 → spacing 변경

---

## 🔄 롤백 플랜

### v2.0 → v1.0 즉시 롤백이 필요한 경우

1. **Git**: `git revert` 로 v2.0 커밋 시리즈 되돌림
2. **데이터 스키마 무변경** → Dexie/Firestore 마이그레이션 불필요
3. **Settings 필드**:
   - v2.0 신규 필드 (`density`, `oledMode`, `hideAmounts`, `timeBasedTheme`) 는 optional
   - v1.0 코드는 이 필드들을 단순히 무시함 → **자동 롤백 호환**
4. **사용자 영향**: 없음 (데이터 손실 없음)

### 부분 롤백 (특정 기능만)

| 기능 | 비활성화 방법 |
|---|---|
| Aurora | `aurora-bg` 클래스 제거 |
| Spotlight | `HeroMetricCard spotlight={false}` |
| Pull-to-refresh | DashboardPage의 `usePullToRefresh` 호출 주석 |
| Time-based theme | Settings 기본값 `false` 유지 + 토글 숨김 |

---

## 📣 출시 커뮤니케이션

### 릴리스 노트 (사용자용)

- [x] `claudedocs/RELEASE_NOTES_v2.0.md` 작성 완료
- [ ] 한국어 공지 (앱 내 Update banner or 이메일)
- [ ] 주요 스크린샷 (대시보드 3-row, AMOLED 모드, Aurora)

### 개발자 문서

- [x] `claudedocs/HIGHEND_UIUX_MASTERPLAN.md`
- [x] `claudedocs/RELEASE_NOTES_v2.0.md`
- [x] `claudedocs/LAUNCH_CHECKLIST.md` (본 문서)

---

## ✍️ 배포 후 모니터링 (첫 48시간)

- [ ] Sentry 등 에러 로깅 — 24h 치 로그 확인
- [ ] Firestore read/write 급증 여부 확인
- [ ] 사용자 피드백 채널 (이메일/카톡) 모니터링
- [ ] iOS Safari 메모리 경고 여부 (Aurora + blur 많은 페이지)
- [ ] Android Chrome FPS (프레임 드랍 확인, 애니메이션 많은 설정 조합)

---

## ✅ 배포 승인 사인

- [ ] 개발자 검토 완료
- [ ] 디자이너 검토 완료
- [ ] QA 검토 완료
- [ ] Owner 최종 승인

**배포 예정일**: _______________
**담당자**: _______________

---

*본 체크리스트는 프로젝트 기간 동안 살아있는 문서로 유지 — 새 기능/이슈 발견 시 갱신*
