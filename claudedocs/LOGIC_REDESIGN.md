# FIN v1.0 — 로직 재설계안

> 50개 Q&A 기반, 2026-04-05 작성

---

## 1. 도메인 관계도 (Architecture Overview)

```
┌─────────────┐      자동 생성       ┌─────────────┐
│   구독       │ ──────────────────▶ │   가계부     │
│ Subscription │   (결제일 거래)      │  Ledger      │
└─────────────┘                      └─────────────┘
                                            │
                                            │ 연결 없음
                                            │ (자산은 독립)
                                            ▼
┌─────────────┐                      ┌─────────────┐
│   대출       │ ── 상환 시 자동 ──▶ │   자산       │
│   Loan       │   부채 잔액 감소     │  Asset       │
└─────────────┘                      └─────────────┘
```

### 핵심 규칙
- **구독 → 가계부**: 구독이 결제일에 가계부 지출 거래를 자동 생성
- **자산은 독립**: 가계부 지출/수입이 자산에 자동 반영되지 않음
- **대출 → 자산**: 대출 원금 상환 시 부채(자산의 liability) 잔액만 자동 감소
- **결제수단 ↔ 자산**: 표시용 연결만 (어떤 계좌/카드인지 라벨)

---

## 2. 자산 도메인 (Asset Domain)

### 2.1 데이터 모델

```
AssetCategory (2단계 계층)
├── id, syncId
├── name
├── type: 'asset' | 'liability'
├── parentId: number | null        ★ 신규 — 서브카테고리 지원
├── color, icon
├── sortOrder
└── timestamps

AssetItem
├── id, syncId
├── memberId                       (가족 구성원별 분리)
├── categoryId
├── name
├── type: 'asset' | 'liability'
├── assetSubType?: 'general' | 'real_estate' | 'severance' | 'stock' | 'crypto'  ★ 신규
├── memo
├── sortOrder
└── timestamps
    ※ isActive 필드 제거 — 모든 자산 순자산에 포함

DailyValue
├── id, syncId
├── assetItemId
├── date: string (YYYY-MM-DD)
├── value: number
└── timestamps
```

### 2.2 잔액 관리 규칙

| 규칙 | 설명 |
|------|------|
| **전일값 이월** | 오늘 입력이 없으면 가장 최근 입력값을 오늘 값으로 간주 |
| **수동 조정** | 사용자가 UI에서 직접 잔액 수정 (계좌이체, 잔액 변동 등) |
| **대출 상환 자동** | Loan 원금 상환 시 연결된 부채 AssetItem의 잔액 자동 감소 |
| **시세 API 연동** | 향후 고려 (주식, 암호화폐) — 현재는 수동 |

### 2.3 특수 자산 처리

```
일반 자산 (general)
  → 수동 입력 + 전일값 이월

부동산 (real_estate)
  → 수동 입력 + 전일값 이월 (동일)
  → RealEstateInputArea 전용 UI

퇴직금 (severance)
  → 근속연수 기반 자동 계산
  → 입력: 입사일, 현재 월급 → 법정 퇴직금 자동 산출
  → SeverancePayInputArea 전용 UI

주식/암호화폐 (stock, crypto)
  → 현재: 수동 입력
  → 향후: 시세 API 연동 확장 포인트
```

### 2.4 순자산 계산

```typescript
// 모든 자산 포함 (비활성 개념 없음)
totalAssets = Σ (type === 'asset'인 모든 item의 최신 dailyValue)
totalLiabilities = Σ (type === 'liability'인 모든 item의 최신 dailyValue)
netWorth = totalAssets - totalLiabilities

// 변동 계산
dailyChange = 오늘 netWorth - 어제 netWorth
monthlyChange = 오늘 netWorth - 이번달 1일 netWorth

// 빈 날짜: 가장 최근 입력값 이월 (A)
```

### 2.5 정렬

```
1차: 카테고리별 그룹
2차: 그룹 내 금액 내림차순
```

### 2.6 순자산 추이 그래프

- **일별**: 최근 30일 (기본 뷰)
- **주별**: 최근 12주
- **월별**: 최근 12개월
- 총자산 / 총부채 / 순자산 3개 라인

---

## 3. 가계부 도메인 (Ledger Domain)

### 3.1 데이터 모델

```
TransactionCategory (2단계 계층)
├── id, syncId
├── name
├── type: 'income' | 'expense'
├── parentId: number | null        ★ 신규 — 서브카테고리 (식비 > 외식)
├── color, icon
├── isDefault
├── sortOrder
└── timestamps

Transaction
├── id, syncId
├── memberId: number | null        (null = 1인가구 미사용)
├── type: 'income' | 'expense'     (transfer 없음)
├── amount: number
├── categoryId: number | null
├── subcategoryId: number | null   ★ 신규
├── date: string
├── memo
├── tags: string[]                 ★ 신규 — 자동 해시태그
│
├── paymentMethod: PaymentMethod   (대분류)
├── paymentMethodItemId: number    (구체 카드/계좌)
│
├── isRecurring: boolean
├── recurPattern?: RepeatPattern
├── recurSourceId?: number         (자식→부모 참조)
├── subscriptionId?: number        (구독→거래 참조)
│
├── exchangeRate?: number          ★ 신규 — 외화 거래 시 적용 환율
├── originalAmount?: number        ★ 신규 — 원래 외화 금액
├── originalCurrency?: string      ★ 신규 — 원래 통화
│
└── timestamps

PaymentMethod (대분류 enum)
  'cash' | 'credit_card' | 'debit_card' | 'bank_transfer' | 'loan' | 'other'

PaymentMethodItem (구체 아이템)
├── id, syncId
├── type: PaymentMethod
├── name                           (신한 체크카드, 국민 신용카드...)
├── memo
├── linkedAssetItemId?: number     (표시용 연결)
├── sortOrder
└── timestamps
    ※ isActive 유지 — 카드 해지 등 비활성 처리
```

### 3.2 자동 해시태그 시스템

```
생성 규칙:
1. 카테고리 기반: #식비, #교통
2. 결제수단 기반: #신한카드, #현금
3. 메모 키워드 추출: "스타벅스 아메리카노" → #스타벅스, #카페
4. 시간 기반: #주말, #평일
5. 금액 기반: #소액(~1만), #중액(~10만), #고액(10만~)

향후 AI 서비스 연동 시:
  → Supabase 벡터DB 기반 자동 분류 고도화
  → 유사 거래 패턴 인식 → 태그 추천
```

### 3.3 반복 거래 (Recurring)

```
목적: 가계부 내 자동 반복 (월세, 교통비 등)
위치: 가계부 화면에서 관리

원본 수정 시 → 모든 자식 거래 일괄 변경 (Q20=B)
자식 거래 → 사용자 개별 수정/삭제 가능 (Q19)

흐름:
1. 사용자가 반복 거래 등록 (isRecurring=true, recurPattern 설정)
2. 앱 로드 시 processRecurringTransactions() 실행
3. 마지막 자식 날짜 이후 ~ 오늘까지 자식 거래 생성
4. 원본 수정 시: 모든 자식(recurSourceId = 원본.id) 일괄 업데이트
```

### 3.4 결제수단별 집계

```
월별 카드별 사용금액:
  → PaymentMethodItem 기준 그룹핑
  → 각 카드/계좌별 월 총 지출/수입 합산
  → UI: 결제수단별 파이차트 or 바차트
```

### 3.5 조회 범위

- **기본**: 월별 로딩
- **확장**: 연별 조회
- **내보내기**: CSV/Excel (월별, 연별, 기간 지정)

### 3.6 제거 대상

```
❌ Budget (예산) — 테이블 + 스토어 + 컴포넌트 전체 제거
❌ FinancialGoal — 제거 여부 미확인 (유지 가정)
```

---

## 4. 구독 도메인 (Subscription Domain)

### 4.1 데이터 모델

```
Subscription
├── id, syncId
├── name, description
├── currency: 'KRW' | 'USD'
├── amount: number
├── cycle: SubscriptionCycle
├── billingDay, billingMonth, customCycleDays
│
├── categoryId: number             ★ 변경 — TransactionCategory 통합 사용
│   (기존 category: SubscriptionCategoryType 제거)
│
├── status: 'active' | 'paused' | 'cancelled'
├── startDate: string
├── endDate?: string
├── freeTrialEndDate?: string      ★ 신규 — 무료 체험 종료일
├── pauseHistory: PauseHistoryEntry[]
│
├── icon, color, url, memo
├── paymentMethodItemId?: number
├── sortOrder
└── timestamps

※ linkedTransactionCategoryId 제거 — categoryId로 통합
※ SubscriptionCategoryType enum 제거 — TransactionCategory 테이블 사용
```

### 4.2 구독 vs 고정 지출 구분

```
구독 (Subscription)
  → 전용 관리 화면
  → 결제 주기, 일시정지, 해지 관리
  → 예: 넷플릭스, ChatGPT, Spotify

고정 지출 (Fixed Expense)
  → 가계부의 반복 거래로 처리
  → 예: 관리비, 보험료, 통신비
  → isRecurring=true로 등록
```

### 4.3 구독 → 거래 생성 로직

```
등록 시점:
  → 시작일 ~ 현재까지 모든 결제일 거래 일괄 생성

무료 체험 기간:
  → startDate ~ freeTrialEndDate: 금액 0원 거래 생성 (또는 미생성)
  → freeTrialEndDate 이후: 정상 금액 거래 생성

일시정지 중 거래:
  → 사용자에게 확인 팝업 (Q40=C)
  → "이미 결제됨 (전액)" / "결제 안 됨 (미생성)" 선택

카테고리 매핑:
  → subscription.categoryId 사용
  → categoryId 누락 시 기본 "구독" 카테고리 자동 지정
```

### 4.4 연간 구독 월할 표시

```
연간 120,000원 구독:
  → 가계부에 매월 10,000원씩 12건 분할 표시
  → 거래에 구분자 표시: isAnnualProrated = true ★ 신규
  → 구독 상세에서 "연간 결제" 뱃지 표시
  → 실제 결제월에는 별도 마킹 (actualBillingMonth)
```

### 4.5 USD 구독 환율 처리

```
거래 생성 시:
  1. 환율 API 조회 (당일 USD→KRW)
  2. Transaction에 저장:
     - amount: 환산된 KRW 금액
     - originalAmount: USD 금액
     - originalCurrency: 'USD'
     - exchangeRate: 적용 환율
  3. 사용자가 사후 수정 가능 (amount 직접 편집)
```

### 4.6 구독 상태 전이

```
         등록
          │
          ▼
     ┌─────────┐
     │  active  │◀──── 재개 (resumedAt 기록)
     └────┬─────┘
          │
    ┌─────┼──────┐
    ▼     ▼      ▼
 paused  만료   cancelled
    │   알림      │
    │  (사용자    (endDate 설정)
    │   수동전환)
    └────▶ cancelled

만료 처리:
  → endDate 도래 시 자동 전환 아님
  → 사용자에게 알림 → 수동으로 cancelled 전환
```

### 4.7 구독 삭제 시 캐스케이드

```
구독 삭제 → 해당 subscriptionId의 모든 거래도 함께 삭제
```

---

## 5. 대출 도메인 (Loan Domain)

### 5.1 자산 연동

```
대출 등록 시:
  1. Loan 레코드 생성
  2. 연결된 AssetItem (type=liability) 확인/생성
  3. DailyValue에 대출 원금 잔액 기록

원금 상환 시:
  1. Loan.currentBalance 감소
  2. 연결된 AssetItem의 DailyValue 자동 감소 (같은 금액)
  → 이것이 유일한 자산 자동 반영 케이스

이자 납부 시:
  1. 가계부에 지출 거래 자동 생성
  2. 반복 거래로 등록 (매월 이자금액)
  3. 자산에는 영향 없음 (이자는 비용)
```

### 5.2 데이터 모델 (변경사항)

```
Loan
├── ... (기존 필드 유지)
├── linkedAssetItemId: number      (부채 자산과 연결 — 필수)
└── interestTransactionId?: number ★ 신규 — 이자 반복 거래 참조
```

---

## 6. 멤버 도메인 (Member)

### 6.1 운용 규칙

```
계정: 1개 (단일 로그인)
멤버: 가족 구성원별 분리 (1인 가구 = 멤버 1명)

memberId 규칙:
  - AssetItem.memberId: 필수 (어떤 구성원 소유인지)
  - Transaction.memberId: nullable (1인 가구 시 null 허용)
```

### 6.2 멤버 삭제 캐스케이드

```
멤버 삭제 시:
  → 해당 거래: memberId를 null ("미지정")로 변경
  → 해당 자산: memberId를 null ("미지정")로 변경
  → 거래/자산 데이터는 보존됨
```

---

## 7. 카테고리 통합 설계

### 7.1 기존 → 변경

```
기존:
  - TransactionCategory (가계부용)
  - SubscriptionCategoryType enum (구독용)
  - AssetCategory (자산용)

변경:
  - TransactionCategory (가계부 + 구독 통합) ← 서브카테고리 추가
  - AssetCategory (자산 전용) ← 서브카테고리 추가
  
구독은 TransactionCategory를 직접 참조
```

### 7.2 서브카테고리 구조

```
TransactionCategory
├── id: 1, name: "식비", parentId: null      (대분류)
├── id: 2, name: "외식", parentId: 1          (소분류)
├── id: 3, name: "배달", parentId: 1          (소분류)
├── id: 4, name: "장보기", parentId: 1        (소분류)
├── id: 5, name: "교통", parentId: null       (대분류)
├── id: 6, name: "대중교통", parentId: 5      (소분류)
└── ...

AssetCategory
├── id: 1, name: "금융자산", type: "asset", parentId: null
├── id: 2, name: "은행계좌", type: "asset", parentId: 1
├── id: 3, name: "주식", type: "asset", parentId: 1
├── id: 4, name: "실물자산", type: "asset", parentId: null
├── id: 5, name: "부동산", type: "asset", parentId: 4
└── ...
```

### 7.3 카테고리 삭제 캐스케이드

```
카테고리 삭제 → 해당 카테고리의 모든 거래도 함께 삭제
서브카테고리 삭제 → 해당 서브카테고리 거래도 함께 삭제
부모 카테고리 삭제 → 자식 서브카테고리 + 모든 거래 연쇄 삭제
```

---

## 8. 동기화 아키텍처 (변경 방향)

### 8.1 현재 → 목표

```
현재:
  Dexie (IndexedDB) ← 오프라인 우선
  Firestore ← 클라우드 동기화
  LWW (Last-Write-Wins)

목표:
  Dexie (IndexedDB) ← 오프라인 캐시 유지
  Firestore ← 실시간 멀티디바이스 연동 강화
  LWW 유지
  
향후:
  Supabase 벡터DB + AI 서비스 추가 레이어
```

### 8.2 멀티디바이스 실시간 강화 포인트

```
1. Firestore onSnapshot 리스너 최적화
   - 테이블별 세분화된 리스너 (현재 구현 유지)
   - 변경 감지 → 즉시 로컬 반영 (디바운스 최소화)

2. 충돌 해결: LWW 유지
   - updatedAt 타임스탬프 기반
   - 서버 타임스탬프 사용으로 디바이스 간 시계 차이 보정

3. 실시간 Presence (향후)
   - 어떤 디바이스가 현재 활성인지 표시
   - 동시 편집 알림
```

---

## 9. 제거 대상 목록

| 항목 | 파일 | 사유 |
|------|------|------|
| Budget 테이블 | database.ts | 예산 기능 불필요 |
| Budget 스토어 | budgetStore.ts | 예산 기능 불필요 |
| Budget 컴포넌트 | components/budget/* | 예산 기능 불필요 |
| SubscriptionCategoryType | types.ts | TransactionCategory로 통합 |
| linkedTransactionCategoryId | Subscription 타입 | categoryId로 통합 |
| AssetItem.isActive | types.ts | 모든 자산 순자산 포함 |
| PaymentMethodItem.isActive | 검토 필요 | 카드 해지 등은 유지 필요할 수 있음 |

---

## 10. 신규 추가 목록

| 항목 | 위치 | 설명 |
|------|------|------|
| parentId | AssetCategory, TransactionCategory | 서브카테고리 |
| subcategoryId | Transaction | 소분류 참조 |
| tags: string[] | Transaction | 자동 해시태그 |
| assetSubType | AssetItem | 특수 자산 구분 |
| freeTrialEndDate | Subscription | 무료 체험 종료일 |
| exchangeRate | Transaction | 외화 적용 환율 |
| originalAmount | Transaction | 외화 원래 금액 |
| originalCurrency | Transaction | 외화 통화 |
| isAnnualProrated | Transaction | 연간구독 월할 구분자 |
| interestTransactionId | Loan | 이자 반복거래 참조 |
| 환율 API 서비스 | services/ | USD→KRW 당일 환율 조회 |
| 자동 태그 엔진 | services/ | 메모/카테고리 기반 태그 생성 |
| CSV/Excel 내보내기 | services/ | 월별/연별 데이터 내보내기 |

---

## 11. 데이터 흐름 요약

```
┌──────────────────────────────────────────────────────┐
│                    사용자 입력                         │
├───────────┬──────────────┬───────────────────────────┤
│ 자산 관리  │   가계부      │      구독 관리             │
│           │              │                           │
│ 잔액 수정  │ 수입/지출     │ 구독 등록/수정/해지          │
│ (직접 UI) │ 기록         │                            │
│           │              │                           │
│     ▲     │              │   결제일 도래 시             │
│     │     │              │      │                     │
│  대출상환  │              │      ▼                     │
│  자동반영  │     ◀────────┤  거래 자동 생성              │
│     │     │              │  (월할 분할 포함)            │
│     │     │              │                           │
│  Loan     │  Transaction │  Subscription              │
│  Domain   │  + Category  │  → TransactionCategory 공유 │
└───────────┴──────────────┴───────────────────────────┘
                    │
                    ▼
         ┌─────────────────┐
         │  Dexie (로컬)    │
         │       +         │
         │  Firestore      │
         │  (실시간 동기화)  │
         └─────────────────┘
```

---

## 12. 핵심 사용 시나리오 (설계 검증)

### 시나리오 1: 매일 지출 기록
```
1. 가계부 열기
2. 지출 추가: 금액, 카테고리(+서브), 결제수단, 메모
3. 자동 태그 생성: #외식 #신한카드 #주말
4. 자산에는 영향 없음
5. Firestore 동기화 → 다른 디바이스 즉시 반영
```

### 시나리오 2: 월말 자산 점검
```
1. 자산 화면 열기
2. 각 계좌 잔액 확인 (전일값 이월됨)
3. 변동된 계좌만 잔액 수정
4. 순자산 추이 그래프 확인 (일/주/월)
5. 카테고리별 자산 분포 확인
```

### 시나리오 3: 구독 관리
```
1. 구독 전용 화면 열기
2. 월별 구독 총액 확인 (KRW + USD 환산)
3. 구독 추가/수정/일시정지/해지
4. 가계부에 자동 반영된 구독 거래 확인
5. 연간 구독은 월할 분할로 표시
```

### 시나리오 4: 대출 상환
```
1. 대출 화면에서 원금 상환 입력
2. 부채 자산 잔액 자동 감소
3. 이자 비용은 가계부에 반복 거래로 자동 기록
4. 사용자가 은행계좌 잔액은 직접 수정
```

---

## 13. 구현 우선순위

### Phase 1 — 구조 정리 (기반)
1. 카테고리 서브카테고리 추가 (parentId)
2. 구독 카테고리 → TransactionCategory 통합
3. Budget 기능 제거
4. AssetItem.isActive 제거
5. 타입 정의 업데이트

### Phase 2 — 핵심 로직
6. 대출 상환 → 부채 자동 감소 연동
7. 반복 거래 원본 수정 → 자식 일괄 변경
8. 구독 무료 체험 지원
9. 연간 구독 월할 분할 로직
10. 일시정지 중 거래 생성 확인 팝업

### Phase 3 — 부가 기능
11. 자동 해시태그 엔진
12. USD 환율 API 연동
13. CSV/Excel 내보내기
14. 순자산 추이 그래프 (일/주/월)
15. 결제수단별 월 사용금액 집계

### Phase 4 — 인프라
16. 멀티디바이스 실시간 동기화 강화
17. Supabase 벡터DB + AI 서비스 (향후)

---

## 14. 미확정 사항

| 항목 | 설명 | 기본 가정 |
|------|------|----------|
| Q32 구독 거래 생성 | 등록 시 일괄 vs 1건만 | 시작일~현재 일괄 생성 |
| FinancialGoal | 제거 여부 미확인 | 유지 |
| PaymentMethodItem.isActive | 제거 여부 | 유지 (카드 해지 등) |
| 퇴직금 자동계산 공식 | 법정 퇴직금 기준 | 근속연수 × 월평균임금 |
