# FIN 타이포그래피 정책 (v3 "하이엔드 압축")

단일 SOT: `styles/tokens/typography.css`의 `--typo-*` 토큰 → `.text-*` 별칭(`fin-aliases.css`).
`index.css`의 `--font-size-*`는 레거시 별칭일 뿐이며 신규 코드에서 참조 금지.

## 실효 스케일 (Health_v1.0 리듬)

```
10(micro) · 11(칩) · 12(메타) · 14(텍스트) · 16(카드) · 18(섹션) · 20(강조) · 24+(페이지/fluid)
```

- **짝수 위주 + 최소 2px 점프.** 인접 1px 단계(13/14/15, 17/18 혼재)가 '조잡함'의 근원이다.
- 같은 크기 안의 위계는 **굵기(500/600/700)** 로 표현한다.
- 새 크기 토큰 추가 금지 — 이 8단계 밖의 크기가 필요하면 디자인을 다시 의심할 것.

## 역할 → 클래스 매핑 (강제)

| 역할 | 클래스 | 크기/굵기 |
|---|---|---|
| Hero 금액 (순자산·총자산 카드) | `text-financial-fluid tabular-nums` | 24–44px fluid /700 |
| 페이지 타이틀 (데스크톱 헤더) | `text-h2-fluid` | 20–32px fluid /700 |
| 섹션 헤더 ("이번 달 지출" 등 그룹 제목) | `text-title2` | 18px/700 |
| 카드 타이틀 | `text-title3` | 16px/600 |
| 카드 내 주요 금액 | `text-title3 tabular-nums` (강조 시 `text-title1 tabular-nums`) | 16/20px |
| 리스트 행 주 텍스트 (거래명·자산명) | `text-body2` | 14px/500 (행간 1.5) |
| 리스트 행 금액 | `text-body2-bold tabular-nums` | 14px/700 |
| 본문/설명 문단 | `text-body3` (UI 밀집 텍스트, 행간 1.35) | 14px/500 |
| 폼 라벨 | `text-label2` | 14px/600 |
| 보조 메타 (날짜·카테고리·건수·단위) | `text-label3-medium` | 12px/500 |
| 강조 보조 (탭 카운트, 작은 strong) | `text-label3` | 12px/700 |
| 캡션 (입력 헬퍼, 푸터 노트, 차트 축) | `text-caption` | 12px/500 |
| 배지/칩/필 | `text-label4` | 11px/600 |
| 초고밀도 칩 (달력 셀 등 최후수단) | `text-micro` | 10px/500 |

## 금지 규칙

1. **raw Tailwind 크기 금지**: `text-xs` `text-sm` `text-base` `text-lg` `text-xl` `text-2xl`… → 위 표의 역할 클래스로 대체.
2. **임의 px 금지**: `text-[11px]` 류 → 가장 가까운 역할 클래스. 10px 미만은 어떤 경우에도 금지(가독성 바닥 = `text-micro` 10px).
3. **인라인 `fontSize` 금지** — 예외: Chart.js 캔버스 옵션(`font: { size }`)은 DOM이 아니므로 허용하되 11(축)/12(툴팁) 두 값만 사용.
4. **`!important` 크기 재정의 금지**: 초소형 화면 밀도는 `index.css`의 미디어쿼리 `--typo-*-size` 토큰 재정의로만 처리.

## 캡션 남용 방지 (가독성 승격 기준)

`text-label4`(11px)·`text-micro`(10px)는 **배지/칩 전용**, 12px 계열은 **메타데이터·소형 컨트롤 전용**이다.
다음 중 하나라도 해당하면 14px(`text-body2`/`text-body3`)로 승격:
- 그 텍스트가 행/카드의 **주 식별 텍스트**다 (이름, 제목, 금액)
- 사용자가 **읽어야 하는 문장**이다 (설명, 안내, 에러 메시지 → `text-body3`)

소형 인터랙션(필터 칩, 토글 탭, "전체보기" 링크)은 12px(`text-label3-medium`/`text-label3`)까지 허용 —
단 터치 타깃은 44px을 별도로 보장할 것.

## 금액 표기

- 모든 숫자 금액에 `tabular-nums` (또는 `.financial-value`) 필수.
- 수입/지출 색상은 `.value-positive`/`.value-negative` (크기와 무관).
- 같은 화면 계층의 금액은 같은 클래스를 쓴다 (행끼리, 카드끼리 통일).

## 반응형

- 화면별 축소는 컴포넌트에서 `sm:text-*` 분기하지 말고 fluid 클래스(`text-financial-fluid`, `text-h2-fluid`)
  또는 `index.css`의 토큰 재정의(≤359px, ≤280px)에 맡긴다.
- 데스크톱에서 더 큰 위계가 필요한 경우에만 `lg:` 분기 허용 (예: `text-title2 lg:text-heading3`).
