import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Save, Plus } from 'lucide-react'
import { useInvestmentStore } from '@/stores/investmentStore'
import { useDividendStore } from '@/stores/dividendStore'
import { useAccountInterestStore } from '@/stores/accountInterestStore'
import { useMemberStore } from '@/stores/memberStore'
// Form component for investment data entry
import type { InvestmentTrade, Dividend, AccountInterest, InvestmentAssetType, InvestmentMarket, InterestCurrency } from '@/lib/types'

type FormType = 'trade' | 'dividend' | 'interest'

interface Props {
  isOpen: boolean
  onClose: () => void
  formType: FormType
  editTrade?: InvestmentTrade | null
  editDividend?: Dividend | null
  editInterest?: AccountInterest | null
}

const ASSET_TYPES: InvestmentAssetType[] = ['국내주식', '해외주식', '국내ETF', '해외ETF', '채권', '펀드', '기타']

function InputField({ label, value, onChange, type = 'text', placeholder, suffix, required }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; suffix?: string; required?: boolean
}) {
  return (
    <div>
      <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-sub block mb-1">{label}{required && ' *'}</label>
      <div className="input-field">
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          className="input-value tabular-nums" />
        {suffix && <span className="text-[11px] text-disabled pr-3 shrink-0">{suffix}</span>}
      </div>
    </div>
  )
}

function SelectField({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]
}) {
  return (
    <div>
      <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-sub block mb-1">{label}</label>
      <div className="select-field">
        <select value={value} onChange={e => onChange(e.target.value)} className="input-value">
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    </div>
  )
}

export function InvestmentFormSheet({ isOpen, onClose, formType, editTrade, editDividend, editInterest }: Props) {
  const members = useMemberStore(s => s.members)
  const addTrade = useInvestmentStore(s => s.addTrade)
  const updateTrade = useInvestmentStore(s => s.updateTrade)
  const addDividend = useDividendStore(s => s.addDividend)
  const updateDividend = useDividendStore(s => s.updateDividend)
  const addInterest = useAccountInterestStore(s => s.addInterest)
  const updateInterest = useAccountInterestStore(s => s.updateInterest)

  // Trade form state
  const [memberId, setMemberId] = useState<number | null>(null)
  const [sellDate, setSellDate] = useState('')
  const [assetType, setAssetType] = useState<InvestmentAssetType>('국내주식')
  const [stockName, setStockName] = useState('')
  const [totalProfit, setTotalProfit] = useState('')
  const [profitRate, setProfitRate] = useState('')
  const [totalSellAmount, setTotalSellAmount] = useState('')
  const [totalBuyAmount, setTotalBuyAmount] = useState('')
  const [sellQuantity, setSellQuantity] = useState('')
  const [fee, setFee] = useState('0')
  const [tax, setTax] = useState('0')

  // Dividend form state
  const [paymentDate, setPaymentDate] = useState('')
  const [exDividendDate, setExDividendDate] = useState('')
  const [dividendAmount, setDividendAmount] = useState('')
  const [quantity, setQuantity] = useState('')

  // Interest form state
  const [depositDate, setDepositDate] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [interestType, setInterestType] = useState('원화 이자')
  const [currency, setCurrency] = useState<InterestCurrency>('KRW')
  const [interestAmount, setInterestAmount] = useState('')
  const [interestRate, setInterestRate] = useState('')

  const isEdit = formType === 'trade' ? !!editTrade : formType === 'dividend' ? !!editDividend : !!editInterest

  useEffect(() => {
    if (!isOpen) return
    if (formType === 'trade' && editTrade) {
      setMemberId(editTrade.memberId)
      setSellDate(editTrade.sellDate)
      setAssetType(editTrade.assetType)
      setStockName(editTrade.stockName)
      setTotalProfit(String(editTrade.totalProfit))
      setProfitRate(String(editTrade.profitRate))
      setTotalSellAmount(String(editTrade.totalSellAmount))
      setTotalBuyAmount(String(editTrade.totalBuyAmount))
      setSellQuantity(String(editTrade.sellQuantity))
      setFee(String(editTrade.fee))
      setTax(String(editTrade.tax))
    } else if (formType === 'dividend' && editDividend) {
      setMemberId(editDividend.memberId)
      setPaymentDate(editDividend.paymentDate)
      setExDividendDate(editDividend.exDividendDate)
      setAssetType(editDividend.assetType)
      setStockName(editDividend.stockName)
      setDividendAmount(String(editDividend.dividendAmount))
      setQuantity(String(editDividend.quantity))
      setTax(String(editDividend.tax))
    } else if (formType === 'interest' && editInterest) {
      setMemberId(editInterest.memberId)
      setDepositDate(editInterest.depositDate)
      setPeriodStart(editInterest.periodStart)
      setPeriodEnd(editInterest.periodEnd)
      setInterestType(editInterest.interestType)
      setCurrency(editInterest.currency)
      setInterestAmount(String(editInterest.interestAmount))
      setTax(String(editInterest.tax))
      setInterestRate(String(editInterest.interestRate))
    } else {
      // Reset for new entry
      setMemberId(members[0]?.id ?? null)
      setSellDate(''); setStockName(''); setTotalProfit(''); setProfitRate('')
      setTotalSellAmount(''); setTotalBuyAmount(''); setSellQuantity('')
      setFee('0'); setTax('0'); setPaymentDate(''); setExDividendDate('')
      setDividendAmount(''); setQuantity(''); setDepositDate('')
      setPeriodStart(''); setPeriodEnd(''); setInterestAmount(''); setInterestRate('')
      setAssetType('국내주식'); setInterestType('원화 이자'); setCurrency('KRW')
    }
  }, [isOpen, formType, editTrade, editDividend, editInterest, members])

  const market: InvestmentMarket = assetType.includes('해외') ? 'overseas' : 'domestic'

  const handleSave = async () => {
    if (formType === 'trade') {
      const data = {
        memberId, sellDate, assetType, market, stockName,
        totalProfit: Number(totalProfit) || 0,
        profitRate: Number(profitRate) || 0,
        totalSellAmount: Number(totalSellAmount) || 0,
        totalBuyAmount: Number(totalBuyAmount) || 0,
        sellQuantity: Number(sellQuantity) || 0,
        fee: Number(fee) || 0,
        tax: Number(tax) || 0,
        profitPerShare: Number(sellQuantity) > 0 ? Math.round((Number(totalProfit) || 0) / Number(sellQuantity)) : 0,
        sellPricePerShare: Number(sellQuantity) > 0 ? Math.round((Number(totalSellAmount) || 0) / Number(sellQuantity)) : 0,
        buyPricePerShare: Number(sellQuantity) > 0 ? Math.round((Number(totalBuyAmount) || 0) / Number(sellQuantity)) : 0,
        fxGainLoss: null, sellExchangeRate: null, buyExchangeRate: null,
        memo: undefined,
      }
      if (isEdit && editTrade?.id != null) await updateTrade(editTrade.id, data)
      else await addTrade(data)
    } else if (formType === 'dividend') {
      const data = {
        memberId, paymentDate, exDividendDate, assetType, market, stockName,
        dividendAmount: Number(dividendAmount) || 0,
        quantity: Number(quantity) || 0,
        tax: Number(tax) || 0,
        memo: undefined,
      }
      if (isEdit && editDividend?.id != null) await updateDividend(editDividend.id, data)
      else await addDividend(data)
    } else {
      const data = {
        memberId, depositDate, periodStart, periodEnd, interestType, currency,
        interestAmount: Number(interestAmount) || 0,
        tax: Number(tax) || 0,
        interestRate: Number(interestRate) || 0,
        memo: undefined,
      }
      if (isEdit && editInterest?.id != null) await updateInterest(editInterest.id, data)
      else await addInterest(data)
    }
    onClose()
  }

  if (!isOpen) return null

  const titles = { trade: '판매수익', dividend: '배당금', interest: '계좌이자' }

  return (
    <AnimatePresence>
      <motion.div key="form-ov" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[var(--z-overlay)] bg-black/40 dark:bg-black/60 backdrop-blur-[12px]" onClick={onClose} />
      <motion.div key="form-sh" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        className="sheet-container max-h-[92vh]">
        <div className="sheet-handle" />
        <div className="sheet-body">
          <div className="sheet-header mb-4">
            <h2 className="sheet-title flex items-center gap-2">
              {isEdit ? <Save className="w-5 h-5" style={{ color: 'var(--color-primary-500)' }} /> : <Plus className="w-5 h-5" style={{ color: 'var(--color-primary-500)' }} />}
              {titles[formType]} {isEdit ? '수정' : '등록'}
            </h2>
            <button onClick={onClose} className="sheet-close"><X className="w-5 h-5" /></button>
          </div>

          <div className="space-y-3">
            {/* Member */}
            <SelectField label="구성원" value={memberId != null ? String(memberId) : ''} onChange={v => setMemberId(v ? Number(v) : null)}
              options={[...members.filter(m => m.id != null).map(m => ({ value: String(m.id!), label: m.name }))]} />

            {formType === 'trade' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <InputField label="판매일" value={sellDate} onChange={setSellDate} type="date" required />
                  <SelectField label="종목유형" value={assetType} onChange={v => setAssetType(v as InvestmentAssetType)}
                    options={ASSET_TYPES.map(t => ({ value: t, label: t }))} />
                </div>
                <InputField label="종목명" value={stockName} onChange={setStockName} placeholder="삼성전자" required />
                <div className="grid grid-cols-2 gap-3">
                  <InputField label="판매수량" value={sellQuantity} onChange={setSellQuantity} type="number" suffix="주" required />
                  <InputField label="수익률" value={profitRate} onChange={setProfitRate} type="number" suffix="%" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <InputField label="총 판매금액" value={totalSellAmount} onChange={setTotalSellAmount} type="number" suffix="원" required />
                  <InputField label="총 구매금액" value={totalBuyAmount} onChange={setTotalBuyAmount} type="number" suffix="원" required />
                </div>
                <InputField label="총 판매수익" value={totalProfit} onChange={setTotalProfit} type="number" suffix="원" required />
                <div className="grid grid-cols-2 gap-3">
                  <InputField label="수수료" value={fee} onChange={setFee} type="number" suffix="원" />
                  <InputField label="제세금" value={tax} onChange={setTax} type="number" suffix="원" />
                </div>
              </>
            )}

            {formType === 'dividend' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <InputField label="지급일" value={paymentDate} onChange={setPaymentDate} type="date" required />
                  <InputField label="배당락일" value={exDividendDate} onChange={setExDividendDate} type="date" required />
                </div>
                <SelectField label="종목유형" value={assetType} onChange={v => setAssetType(v as InvestmentAssetType)}
                  options={ASSET_TYPES.map(t => ({ value: t, label: t }))} />
                <InputField label="종목명" value={stockName} onChange={setStockName} placeholder="삼성전자" required />
                <div className="grid grid-cols-2 gap-3">
                  <InputField label="배당금" value={dividendAmount} onChange={setDividendAmount} type="number" suffix="원" required />
                  <InputField label="기준 수량" value={quantity} onChange={setQuantity} type="number" suffix="주" required />
                </div>
                <InputField label="제세금" value={tax} onChange={setTax} type="number" suffix="원" />
              </>
            )}

            {formType === 'interest' && (
              <>
                <InputField label="입금일" value={depositDate} onChange={setDepositDate} type="date" required />
                <div className="grid grid-cols-2 gap-3">
                  <InputField label="기간 시작" value={periodStart} onChange={setPeriodStart} type="date" required />
                  <InputField label="기간 종료" value={periodEnd} onChange={setPeriodEnd} type="date" required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <SelectField label="유형" value={interestType} onChange={v => { setInterestType(v); setCurrency(v.includes('달러') ? 'USD' : 'KRW') }}
                    options={[{ value: '원화 이자', label: '원화 이자' }, { value: '달러 이자', label: '달러 이자' }]} />
                  <InputField label="이자율" value={interestRate} onChange={setInterestRate} type="number" suffix="%" required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <InputField label="이자" value={interestAmount} onChange={setInterestAmount} type="number" suffix="원" required />
                  <InputField label="제세금" value={tax} onChange={setTax} type="number" suffix="원" />
                </div>
              </>
            )}
          </div>

          {/* Save button */}
          <div className="sheet-footer mt-4">
            <button onClick={handleSave}
              className="sheet-cta inline-flex items-center justify-center gap-2 w-full h-12 rounded-2xl text-[14px] font-bold text-white transition-all"
              style={{ background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-700))' }}>
              {isEdit ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {isEdit ? '수정 완료' : '등록하기'}
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
