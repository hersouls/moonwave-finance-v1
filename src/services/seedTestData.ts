import { db } from '@/services/database'
import { fullUpload } from '@/services/firestoreSync'
import type { DailyValue, Transaction, Budget } from '@/lib/types'

/**
 * 테스트용 가상 데이터를 로컬 DB에 넣고 Firebase에 업로드합니다.
 * 한국 가정의 현실적인 재정 데이터를 시뮬레이션합니다.
 */
export async function seedTestDataAndUpload(uid: string): Promise<void> {
  // ─── 1. 기존 데이터 전부 초기화 ─────────────────────
  await db.transaction('rw', [
    db.members, db.assetCategories, db.assetItems, db.dailyValues,
    db.transactionCategories, db.transactions, db.budgets, db.goals,
  ], async () => {
    await db.members.clear()
    await db.assetCategories.clear()
    await db.assetItems.clear()
    await db.dailyValues.clear()
    await db.transactionCategories.clear()
    await db.transactions.clear()
    await db.budgets.clear()
    await db.goals.clear()
  })

  const now = new Date().toISOString()
  const uuid = () => crypto.randomUUID()

  // ─── 2. 가족 구성원 ──────────────────────────────────
  const memberIds = await db.members.bulkAdd([
    { syncId: uuid(), name: '대성', color: '#3B82F6', isDefault: true, sortOrder: 0, createdAt: now, updatedAt: now },
    { syncId: uuid(), name: '다연', color: '#EC4899', isDefault: true, sortOrder: 1, createdAt: now, updatedAt: now },
  ], { allKeys: true }) as number[]
  const [대성, 다연] = memberIds

  // ─── 3. 자산/부채 카테고리 ───────────────────────────
  const assetCatIds = await db.assetCategories.bulkAdd([
    { syncId: uuid(), name: '퇴직금', type: 'asset', color: '#6366F1', icon: 'Landmark', sortOrder: 0, createdAt: now, updatedAt: now },
    { syncId: uuid(), name: '주식', type: 'asset', color: '#3B82F6', icon: 'TrendingUp', sortOrder: 1, createdAt: now, updatedAt: now },
    { syncId: uuid(), name: '암호화폐', type: 'asset', color: '#F59E0B', icon: 'Bitcoin', sortOrder: 2, createdAt: now, updatedAt: now },
    { syncId: uuid(), name: '거래소 현금', type: 'asset', color: '#10B981', icon: 'Banknote', sortOrder: 3, createdAt: now, updatedAt: now },
    { syncId: uuid(), name: '금', type: 'asset', color: '#EAB308', icon: 'Gem', sortOrder: 4, createdAt: now, updatedAt: now },
    { syncId: uuid(), name: '은행계좌', type: 'asset', color: '#06B6D4', icon: 'Building2', sortOrder: 5, createdAt: now, updatedAt: now },
    { syncId: uuid(), name: '기타자산', type: 'asset', color: '#8B5CF6', icon: 'Package', sortOrder: 6, createdAt: now, updatedAt: now },
    { syncId: uuid(), name: '주택대출', type: 'liability', color: '#EF4444', icon: 'Home', sortOrder: 0, createdAt: now, updatedAt: now },
    { syncId: uuid(), name: '신용대출', type: 'liability', color: '#F97316', icon: 'CreditCard', sortOrder: 1, createdAt: now, updatedAt: now },
    { syncId: uuid(), name: '마이너스 대출', type: 'liability', color: '#DC2626', icon: 'MinusCircle', sortOrder: 2, createdAt: now, updatedAt: now },
    { syncId: uuid(), name: '회사 대출', type: 'liability', color: '#E11D48', icon: 'Building', sortOrder: 3, createdAt: now, updatedAt: now },
    { syncId: uuid(), name: '개인 대출', type: 'liability', color: '#BE185D', icon: 'Users', sortOrder: 4, createdAt: now, updatedAt: now },
  ], { allKeys: true }) as number[]

  const [cat퇴직금, cat주식, cat암호화폐, cat거래소현금, cat금, cat은행, cat기타, cat주택대출, cat신용대출] = assetCatIds

  // ─── 4. 자산 항목 (AssetItem) ────────────────────────
  const assetItemIds = await db.assetItems.bulkAdd([
    // 대성 자산
    { syncId: uuid(), memberId: 대성, categoryId: cat퇴직금, name: '대성 퇴직연금 (DB형)', type: 'asset', memo: '삼성증권 퇴직연금', isActive: true, sortOrder: 0, createdAt: now, updatedAt: now },
    { syncId: uuid(), memberId: 대성, categoryId: cat주식, name: '삼성전자', type: 'asset', memo: '보통주 150주', isActive: true, sortOrder: 1, createdAt: now, updatedAt: now },
    { syncId: uuid(), memberId: 대성, categoryId: cat주식, name: 'TIGER S&P500 ETF', type: 'asset', memo: '미래에셋 계좌', isActive: true, sortOrder: 2, createdAt: now, updatedAt: now },
    { syncId: uuid(), memberId: 대성, categoryId: cat암호화폐, name: '비트코인 (BTC)', type: 'asset', memo: '업비트', isActive: true, sortOrder: 3, createdAt: now, updatedAt: now },
    { syncId: uuid(), memberId: 대성, categoryId: cat암호화폐, name: '이더리움 (ETH)', type: 'asset', memo: '업비트', isActive: true, sortOrder: 4, createdAt: now, updatedAt: now },
    { syncId: uuid(), memberId: 대성, categoryId: cat거래소현금, name: '업비트 예수금', type: 'asset', memo: '', isActive: true, sortOrder: 5, createdAt: now, updatedAt: now },
    { syncId: uuid(), memberId: 대성, categoryId: cat은행, name: '국민은행 월급통장', type: 'asset', memo: '주거래 통장', isActive: true, sortOrder: 6, createdAt: now, updatedAt: now },
    { syncId: uuid(), memberId: 대성, categoryId: cat은행, name: '토스 비상금', type: 'asset', memo: '비상금 계좌', isActive: true, sortOrder: 7, createdAt: now, updatedAt: now },
    { syncId: uuid(), memberId: 대성, categoryId: cat금, name: '금 현물 10g', type: 'asset', memo: 'KRX 금시장', isActive: true, sortOrder: 8, createdAt: now, updatedAt: now },
    // 대성 부채
    { syncId: uuid(), memberId: 대성, categoryId: cat주택대출, name: '아파트 담보대출', type: 'liability', memo: '국민은행 3.8%', isActive: true, sortOrder: 0, createdAt: now, updatedAt: now },
    { syncId: uuid(), memberId: 대성, categoryId: cat신용대출, name: '신용대출', type: 'liability', memo: '카카오뱅크 4.5%', isActive: true, sortOrder: 1, createdAt: now, updatedAt: now },

    // 다연 자산
    { syncId: uuid(), memberId: 다연, categoryId: cat퇴직금, name: '다연 퇴직연금 (DC형)', type: 'asset', memo: 'NH투자증권', isActive: true, sortOrder: 0, createdAt: now, updatedAt: now },
    { syncId: uuid(), memberId: 다연, categoryId: cat주식, name: 'KODEX 200 ETF', type: 'asset', memo: '키움증권', isActive: true, sortOrder: 1, createdAt: now, updatedAt: now },
    { syncId: uuid(), memberId: 다연, categoryId: cat주식, name: '카카오', type: 'asset', memo: '보통주 80주', isActive: true, sortOrder: 2, createdAt: now, updatedAt: now },
    { syncId: uuid(), memberId: 다연, categoryId: cat은행, name: '신한은행 적금', type: 'asset', memo: '6개월 만기 4.2%', isActive: true, sortOrder: 3, createdAt: now, updatedAt: now },
    { syncId: uuid(), memberId: 다연, categoryId: cat은행, name: '카카오뱅크 통장', type: 'asset', memo: '생활비 통장', isActive: true, sortOrder: 4, createdAt: now, updatedAt: now },
    { syncId: uuid(), memberId: 다연, categoryId: cat기타, name: '전세 보증금', type: 'asset', memo: '이전 주거지 (2026.08 만기)', isActive: true, sortOrder: 5, createdAt: now, updatedAt: now },
  ], { allKeys: true }) as number[]

  // id를 읽기 쉽게 매핑
  const [
    ai대성퇴직금, ai삼성전자, aiSP500, aiBTC, aiETH, ai업비트현금, ai국민통장, ai토스비상금, ai금현물,
    ai주택대출, ai신용대출,
    ai다연퇴직금, aiKODEX, ai카카오, ai신한적금, ai카카오뱅크, ai전세보증금,
  ] = assetItemIds

  // ─── 5. 일별 자산가치 (최근 90일) ────────────────────
  const dailyValues: DailyValue[] = []

  // 날짜 생성 헬퍼
  function dateStr(daysAgo: number): string {
    const d = new Date()
    d.setDate(d.getDate() - daysAgo)
    return d.toISOString().slice(0, 10)
  }
  function ts(daysAgo: number): string {
    const d = new Date()
    d.setDate(d.getDate() - daysAgo)
    return d.toISOString()
  }

  // 점진적 증가/변동 시뮬레이션
  function generateSeries(base: number, days: number, dailyDriftPct: number, volatilityPct: number): number[] {
    const values: number[] = []
    let current = base
    for (let i = days; i >= 0; i--) {
      current = current * (1 + dailyDriftPct / 100) + current * (Math.random() * 2 - 1) * volatilityPct / 100
      values.push(Math.round(current))
    }
    return values
  }

  const DAYS = 90

  // 자산가치 시계열 데이터 생성
  const series: { itemId: number; values: number[] }[] = [
    { itemId: ai대성퇴직금, values: generateSeries(42_000_000, DAYS, 0.01, 0.05) },
    { itemId: ai삼성전자, values: generateSeries(10_500_000, DAYS, 0.02, 1.5) },
    { itemId: aiSP500, values: generateSeries(8_200_000, DAYS, 0.03, 1.2) },
    { itemId: aiBTC, values: generateSeries(15_300_000, DAYS, 0.05, 3.0) },
    { itemId: aiETH, values: generateSeries(4_800_000, DAYS, 0.04, 3.5) },
    { itemId: ai업비트현금, values: generateSeries(2_500_000, DAYS, 0, 0) },
    { itemId: ai국민통장, values: generateSeries(5_800_000, DAYS, -0.02, 2.0) },
    { itemId: ai토스비상금, values: generateSeries(3_000_000, DAYS, 0.005, 0) },
    { itemId: ai금현물, values: generateSeries(1_200_000, DAYS, 0.02, 0.8) },
    { itemId: ai주택대출, values: generateSeries(280_000_000, DAYS, -0.005, 0) },
    { itemId: ai신용대출, values: generateSeries(15_000_000, DAYS, -0.01, 0) },
    { itemId: ai다연퇴직금, values: generateSeries(28_000_000, DAYS, 0.01, 0.05) },
    { itemId: aiKODEX, values: generateSeries(6_500_000, DAYS, 0.02, 1.0) },
    { itemId: ai카카오, values: generateSeries(3_200_000, DAYS, -0.01, 2.0) },
    { itemId: ai신한적금, values: generateSeries(12_000_000, DAYS, 0.01, 0) },
    { itemId: ai카카오뱅크, values: generateSeries(4_200_000, DAYS, -0.03, 1.5) },
    { itemId: ai전세보증금, values: generateSeries(150_000_000, DAYS, 0, 0) },
  ]

  for (const { itemId, values } of series) {
    for (let i = 0; i <= DAYS; i++) {
      dailyValues.push({
        syncId: uuid(),
        assetItemId: itemId,
        date: dateStr(DAYS - i),
        value: values[i],
        createdAt: ts(DAYS - i),
        updatedAt: ts(DAYS - i),
      })
    }
  }

  await db.dailyValues.bulkAdd(dailyValues)

  // ─── 6. 거래 카테고리 ────────────────────────────────
  const txnCatIds = await db.transactionCategories.bulkAdd([
    { syncId: uuid(), name: '월급', type: 'income', color: '#10B981', icon: 'Briefcase', isDefault: true, sortOrder: 0, createdAt: now, updatedAt: now },
    { syncId: uuid(), name: '부수입', type: 'income', color: '#06B6D4', icon: 'Coins', isDefault: true, sortOrder: 1, createdAt: now, updatedAt: now },
    { syncId: uuid(), name: '투자수익', type: 'income', color: '#8B5CF6', icon: 'TrendingUp', isDefault: true, sortOrder: 2, createdAt: now, updatedAt: now },
    { syncId: uuid(), name: '식비', type: 'expense', color: '#F59E0B', icon: 'UtensilsCrossed', isDefault: true, sortOrder: 0, createdAt: now, updatedAt: now },
    { syncId: uuid(), name: '교통비', type: 'expense', color: '#3B82F6', icon: 'Car', isDefault: true, sortOrder: 1, createdAt: now, updatedAt: now },
    { syncId: uuid(), name: '주거비', type: 'expense', color: '#8B5CF6', icon: 'Home', isDefault: true, sortOrder: 2, createdAt: now, updatedAt: now },
    { syncId: uuid(), name: '통신비', type: 'expense', color: '#EC4899', icon: 'Smartphone', isDefault: true, sortOrder: 3, createdAt: now, updatedAt: now },
    { syncId: uuid(), name: '의료비', type: 'expense', color: '#EF4444', icon: 'Heart', isDefault: true, sortOrder: 4, createdAt: now, updatedAt: now },
    { syncId: uuid(), name: '교육비', type: 'expense', color: '#6366F1', icon: 'GraduationCap', isDefault: true, sortOrder: 5, createdAt: now, updatedAt: now },
    { syncId: uuid(), name: '기타', type: 'expense', color: '#71717A', icon: 'MoreHorizontal', isDefault: true, sortOrder: 6, createdAt: now, updatedAt: now },
    { syncId: uuid(), name: '쇼핑', type: 'expense', color: '#F472B6', icon: 'ShoppingBag', isDefault: false, sortOrder: 7, createdAt: now, updatedAt: now },
    { syncId: uuid(), name: '여가/문화', type: 'expense', color: '#A78BFA', icon: 'Music', isDefault: false, sortOrder: 8, createdAt: now, updatedAt: now },
  ], { allKeys: true }) as number[]

  const [tc월급, tc부수입, tc투자수익, tc식비, tc교통비, tc주거비, tc통신비, tc의료비, tc교육비, tc기타, tc쇼핑, tc여가] = txnCatIds

  // ─── 7. 거래 내역 (최근 3개월) ───────────────────────
  const transactions: Transaction[] = []

  // 월급 (매월 25일, 반복)
  for (let m = 2; m >= 0; m--) {
    const d = new Date()
    d.setMonth(d.getMonth() - m)
    const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const day25 = `${monthStr}-25`

    // 대성 월급
    transactions.push({
      syncId: uuid(), memberId: 대성, type: 'income', amount: 4_500_000, categoryId: tc월급,
      date: day25, memo: '월급 입금', isRecurring: true,
      recurPattern: { type: 'monthly', interval: 1 }, createdAt: ts(m * 30 + 5), updatedAt: ts(m * 30 + 5),
    })
    // 다연 월급
    transactions.push({
      syncId: uuid(), memberId: 다연, type: 'income', amount: 3_800_000, categoryId: tc월급,
      date: day25, memo: '월급 입금', isRecurring: true,
      recurPattern: { type: 'monthly', interval: 1 }, createdAt: ts(m * 30 + 5), updatedAt: ts(m * 30 + 5),
    })

    // 고정 지출 (월 1회)
    transactions.push({
      syncId: uuid(), memberId: 대성, type: 'expense', amount: 1_200_000, categoryId: tc주거비,
      date: `${monthStr}-05`, memo: '아파트 대출 이자', isRecurring: true,
      recurPattern: { type: 'monthly', interval: 1 }, createdAt: ts(m * 30 + 25), updatedAt: ts(m * 30 + 25),
    })
    transactions.push({
      syncId: uuid(), memberId: null, type: 'expense', amount: 89_000, categoryId: tc통신비,
      date: `${monthStr}-10`, memo: 'KT 인터넷+TV', isRecurring: true,
      recurPattern: { type: 'monthly', interval: 1 }, createdAt: ts(m * 30 + 20), updatedAt: ts(m * 30 + 20),
    })
    transactions.push({
      syncId: uuid(), memberId: 대성, type: 'expense', amount: 59_000, categoryId: tc통신비,
      date: `${monthStr}-12`, memo: 'SKT 요금제', isRecurring: true,
      recurPattern: { type: 'monthly', interval: 1 }, createdAt: ts(m * 30 + 18), updatedAt: ts(m * 30 + 18),
    })
    transactions.push({
      syncId: uuid(), memberId: 다연, type: 'expense', amount: 55_000, categoryId: tc통신비,
      date: `${monthStr}-12`, memo: 'KT 요금제', isRecurring: true,
      recurPattern: { type: 'monthly', interval: 1 }, createdAt: ts(m * 30 + 18), updatedAt: ts(m * 30 + 18),
    })
  }

  // 변동 지출 (랜덤 날짜, 최근 90일)
  const variableExpenses: { cat: number; minAmt: number; maxAmt: number; memos: string[]; freq: number; member: number | null }[] = [
    { cat: tc식비, minAmt: 8_000, maxAmt: 45_000, memos: ['점심 식사', '배달음식', '마트 장보기', '외식 (고깃집)', '커피 & 디저트', '편의점', '회사 근처 식당'], freq: 45, member: null },
    { cat: tc교통비, minAmt: 1_400, maxAmt: 35_000, memos: ['지하철', '버스', '택시', '주유', '고속도로 톨비', '주차비'], freq: 25, member: null },
    { cat: tc쇼핑, minAmt: 15_000, maxAmt: 250_000, memos: ['쿠팡 주문', '네이버 쇼핑', '다이소', '유니클로', '화장품', '생활용품'], freq: 12, member: null },
    { cat: tc여가, minAmt: 10_000, maxAmt: 120_000, memos: ['영화 관람', '넷플릭스', '헬스장', 'CGV', '콘서트 티켓', '독서 (교보문고)'], freq: 8, member: null },
    { cat: tc교육비, minAmt: 50_000, maxAmt: 300_000, memos: ['온라인 강의', '영어 학원', '자격증 교재', '아이 학원비'], freq: 4, member: null },
    { cat: tc의료비, minAmt: 5_000, maxAmt: 150_000, memos: ['약국', '병원 진료', '치과', '건강검진'], freq: 3, member: null },
    { cat: tc기타, minAmt: 5_000, maxAmt: 80_000, memos: ['경조사비', '기부', '보험료', '구독 서비스'], freq: 5, member: null },
  ]

  for (const exp of variableExpenses) {
    for (let i = 0; i < exp.freq; i++) {
      const daysAgo = Math.floor(Math.random() * DAYS)
      const amount = Math.round((exp.minAmt + Math.random() * (exp.maxAmt - exp.minAmt)) / 100) * 100
      const memo = exp.memos[Math.floor(Math.random() * exp.memos.length)]
      const member = exp.member ?? (Math.random() > 0.5 ? 대성 : 다연)
      transactions.push({
        syncId: uuid(), memberId: member, type: 'expense', amount, categoryId: exp.cat,
        date: dateStr(daysAgo), memo, isRecurring: false, createdAt: ts(daysAgo), updatedAt: ts(daysAgo),
      })
    }
  }

  // 부수입/투자수익
  const bonusIncomes: { cat: number; amt: number; memo: string; daysAgo: number; member: number }[] = [
    { cat: tc부수입, amt: 500_000, memo: '프리랜서 외주 수입', daysAgo: 15, member: 대성 },
    { cat: tc투자수익, amt: 320_000, memo: '삼성전자 배당금', daysAgo: 45, member: 대성 },
    { cat: tc투자수익, amt: 180_000, memo: 'ETF 분배금', daysAgo: 30, member: 다연 },
    { cat: tc부수입, amt: 250_000, memo: '블로그 광고 수익', daysAgo: 60, member: 다연 },
    { cat: tc투자수익, amt: 85_000, memo: '적금 이자', daysAgo: 10, member: 다연 },
  ]

  for (const inc of bonusIncomes) {
    transactions.push({
      syncId: uuid(), memberId: inc.member, type: 'income', amount: inc.amt, categoryId: inc.cat,
      date: dateStr(inc.daysAgo), memo: inc.memo, isRecurring: false, createdAt: ts(inc.daysAgo), updatedAt: ts(inc.daysAgo),
    })
  }

  await db.transactions.bulkAdd(transactions)

  // ─── 8. 예산 (이번 달, 지난 달) ──────────────────────
  const thisMonth = new Date().toISOString().slice(0, 7)
  const lastD = new Date()
  lastD.setMonth(lastD.getMonth() - 1)
  const lastMonth = lastD.toISOString().slice(0, 7)

  const budgetData: { catId: number; amount: number }[] = [
    { catId: tc식비, amount: 800_000 },
    { catId: tc교통비, amount: 200_000 },
    { catId: tc주거비, amount: 1_300_000 },
    { catId: tc통신비, amount: 210_000 },
    { catId: tc의료비, amount: 150_000 },
    { catId: tc교육비, amount: 400_000 },
    { catId: tc쇼핑, amount: 300_000 },
    { catId: tc여가, amount: 200_000 },
    { catId: tc기타, amount: 150_000 },
  ]

  const budgets: Budget[] = []
  for (const b of budgetData) {
    budgets.push({ syncId: uuid(), categoryId: b.catId, month: thisMonth, amount: b.amount, createdAt: now, updatedAt: now })
    budgets.push({ syncId: uuid(), categoryId: b.catId, month: lastMonth, amount: b.amount, createdAt: now, updatedAt: now })
  }
  await db.budgets.bulkAdd(budgets)

  // ─── 9. 재정 목표 ───────────────────────────────────
  await db.goals.bulkAdd([
    {
      syncId: uuid(), name: '비상금 5천만원 모으기', type: 'savings',
      targetAmount: 50_000_000, currentAmount: 31_200_000,
      targetDate: '2026-12-31', color: '#10B981', icon: 'Shield',
      memo: '6개월치 생활비 확보', isCompleted: false, createdAt: now, updatedAt: now,
    },
    {
      syncId: uuid(), name: '주택대출 조기상환', type: 'debt',
      targetAmount: 280_000_000, currentAmount: 45_000_000,
      targetDate: '2035-06-30', color: '#EF4444', icon: 'Home',
      memo: '10년 내 완납 목표', isCompleted: false, createdAt: now, updatedAt: now,
    },
    {
      syncId: uuid(), name: '투자 포트폴리오 1억', type: 'investment',
      targetAmount: 100_000_000, currentAmount: 68_500_000,
      targetDate: '2027-12-31', color: '#3B82F6', icon: 'TrendingUp',
      memo: '주식+ETF+암호화폐 합산', isCompleted: false, createdAt: now, updatedAt: now,
    },
    {
      syncId: uuid(), name: '해외여행 자금', type: 'custom',
      targetAmount: 5_000_000, currentAmount: 5_000_000,
      targetDate: '2026-07-01', color: '#F59E0B', icon: 'Plane',
      memo: '일본 가족여행 (2026 여름)', isCompleted: true, createdAt: now, updatedAt: now,
    },
    {
      syncId: uuid(), name: '신용대출 전액 상환', type: 'debt',
      targetAmount: 15_000_000, currentAmount: 8_200_000,
      targetDate: '2026-09-30', color: '#F97316', icon: 'CreditCard',
      memo: '카카오뱅크 대출', isCompleted: false, createdAt: now, updatedAt: now,
    },
  ])

  // ─── 10. Firebase에 업로드 ──────────────────────────
  await fullUpload(uid)
}
