import { memo } from 'react'
import { clsx } from 'clsx'
import {
  TrendingUp, TrendingDown, Receipt, Tag, RefreshCw, Pause, XCircle, User,
} from 'lucide-react'
import { Amount } from '@/components/ui/Amount'
import { formatDate } from '@/lib/dateUtils'
import { useHighlightSegments } from '@/hooks/useSearch'
import type {
  SearchResult, TransactionMeta, AssetMeta, SubscriptionMeta, CategoryMeta,
} from '@/hooks/useSearch'

interface SearchResultItemProps {
  result: SearchResult
  onClick: () => void
  isActive?: boolean
  onHover?: () => void
}

function Highlight({ text, range }: { text?: string; range?: [number, number] }) {
  const segments = useHighlightSegments(text, range)
  if (segments.length === 0) return null
  return (
    <>
      {segments.map((seg, i) =>
        seg.match ? (
          <mark
            key={i}
            className="bg-transparent text-[color:var(--color-primary-600)] dark:text-[color:var(--color-primary-300)] font-semibold underline decoration-[color:var(--color-primary-400)]/50 decoration-1 underline-offset-2"
          >
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  )
}

function TypeBadge({ children, color, tone = 'soft' }: { children: React.ReactNode; color?: string; tone?: 'soft' | 'solid' }) {
  if (tone === 'solid' && color) {
    return (
      <span
        className="text-caption leading-none px-1.5 py-0.5 rounded-full font-semibold text-white tabular-nums flex-shrink-0"
        style={{ backgroundColor: color }}
      >
        {children}
      </span>
    )
  }
  return (
    <span
      className="text-caption leading-none px-1.5 py-0.5 rounded-full font-medium flex-shrink-0"
      style={{
        backgroundColor: color ? `color-mix(in srgb, ${color} 14%, transparent)` : 'var(--surface-tertiary)',
        color: color ?? 'var(--text-sub)',
      }}
    >
      {children}
    </span>
  )
}

function TransactionIcon({ meta }: { meta: TransactionMeta }) {
  const isIncome = meta.txnType === 'income'
  const color = meta.categoryColor ?? (isIncome ? 'var(--value-positive)' : 'var(--value-negative)')
  return (
    <div
      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ring-1 ring-white/40"
      style={{ backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)` }}
    >
      <span className="text-body2-bold" style={{ color }}>
        {isIncome ? '+' : '−'}
      </span>
    </div>
  )
}

function GenericIcon({ color, icon }: { color?: string; icon: React.ReactNode }) {
  const c = color ?? 'var(--color-primary-500)'
  return (
    <div
      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ring-1 ring-white/40"
      style={{ backgroundColor: `color-mix(in srgb, ${c} 14%, transparent)`, color: c }}
    >
      {icon}
    </div>
  )
}

function TransactionRow({ result }: { result: SearchResult }) {
  const meta = result.meta as TransactionMeta
  const isIncome = meta.txnType === 'income'
  const isMemoMatch = result.matchedField === 'memo'

  return (
    <>
      <TransactionIcon meta={meta} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-body3 text-heading font-semibold truncate">
            {isMemoMatch ? (
              <Highlight text={result.matchedText} range={result.matchRange} />
            ) : (
              meta.categoryName || '미분류'
            )}
          </span>
          {meta.memberName && (
            <TypeBadge tone="solid" color={meta.memberColor}>
              {meta.memberName}
            </TypeBadge>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-caption text-sub truncate mt-0.5">
          {isMemoMatch && meta.categoryName ? (
            <>
              <span className="truncate">{meta.categoryName}</span>
              <span className="text-disabled">·</span>
              <span className="tabular-nums flex-shrink-0">{formatDate(meta.date)}</span>
            </>
          ) : (
            <>
              {meta.categoryName && !isMemoMatch && meta.categoryName !== result.title && (
                <>
                  <span className="truncate">
                    <Highlight text={meta.categoryName} range={result.matchRange} />
                  </span>
                  <span className="text-disabled">·</span>
                </>
              )}
              <span className="tabular-nums flex-shrink-0">{formatDate(meta.date)}</span>
              {meta.paymentLabel && (
                <>
                  <span className="text-disabled">·</span>
                  <span className="truncate">{meta.paymentLabel}</span>
                </>
              )}
            </>
          )}
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <Amount
          as="p"
          value={isIncome ? meta.amount : -meta.amount}
          format="change"
          size="body"
          className={clsx(
            'font-bold tabular-nums',
            isIncome ? 'text-value-positive' : 'text-value-negative',
          )}
        />
        <span className="text-caption leading-none text-disabled">
          {isIncome ? '수입' : '지출'}
        </span>
      </div>
    </>
  )
}

function AssetRow({ result }: { result: SearchResult }) {
  const meta = result.meta as AssetMeta
  const isAsset = meta.kind === 'asset'
  return (
    <>
      <GenericIcon
        color={meta.categoryColor}
        icon={isAsset ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-body3 text-heading font-semibold truncate">
            <Highlight text={result.matchedText === result.title ? result.matchedText : result.title} range={result.matchedText === result.title ? result.matchRange : undefined} />
          </span>
          <TypeBadge color={isAsset ? 'var(--value-positive)' : 'var(--value-negative)'}>
            {isAsset ? '자산' : '부채'}
          </TypeBadge>
        </div>
        {meta.categoryName && (
          <p className="text-caption text-sub truncate mt-0.5">
            {meta.categoryName}
          </p>
        )}
      </div>
    </>
  )
}

function SubscriptionRow({ result }: { result: SearchResult }) {
  const meta = result.meta as SubscriptionMeta
  const statusIcon =
    meta.status === 'active' ? <RefreshCw className="w-4 h-4" /> :
    meta.status === 'paused' ? <Pause className="w-4 h-4" /> :
    <XCircle className="w-4 h-4" />
  const statusLabel =
    meta.status === 'active' ? '활성' :
    meta.status === 'paused' ? '일시정지' : '해지'

  return (
    <>
      <GenericIcon color={meta.color} icon={statusIcon} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-body3 text-heading font-semibold truncate">
            <Highlight text={result.title} range={result.matchedField === 'title' ? result.matchRange : undefined} />
          </span>
          <TypeBadge>{statusLabel}</TypeBadge>
        </div>
        {result.matchedField !== 'title' && result.matchedText && (
          <p className="text-caption text-sub truncate mt-0.5">
            <Highlight text={result.matchedText} range={result.matchRange} />
          </p>
        )}
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-body3-semi tabular-nums text-heading">
          {meta.currency === 'USD' ? `$${meta.amount.toFixed(2)}` : `${Math.round(meta.amount).toLocaleString('ko-KR')}원`}
        </p>
        <span className="text-caption leading-none text-disabled">구독</span>
      </div>
    </>
  )
}

function CategoryRow({ result }: { result: SearchResult }) {
  const meta = result.meta as CategoryMeta
  return (
    <>
      <GenericIcon color={meta.color} icon={<Tag className="w-4 h-4" />} />
      <div className="flex-1 min-w-0">
        <span className="text-body3 text-heading font-semibold truncate block">
          <Highlight text={result.title} range={result.matchRange} />
        </span>
        {result.subtitle && (
          <p className="text-caption text-sub truncate mt-0.5">{result.subtitle}</p>
        )}
      </div>
    </>
  )
}

function SearchResultItemInner({ result, onClick, isActive, onHover }: SearchResultItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onHover}
      role="option"
      aria-selected={isActive}
      className={clsx(
        'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all duration-150',
        'border-l-2',
        isActive
          ? 'bg-[color:var(--color-primary-50)] dark:bg-[color:var(--color-primary-900)]/20 border-[color:var(--color-primary-500)]'
          : 'border-transparent hover:bg-[var(--hover-bg)]',
      )}
    >
      {result.type === 'transaction' && <TransactionRow result={result} />}
      {result.type === 'asset' && <AssetRow result={result} />}
      {result.type === 'subscription' && <SubscriptionRow result={result} />}
      {result.type === 'category' && <CategoryRow result={result} />}
      {!['transaction', 'asset', 'subscription', 'category'].includes(result.type) && (
        <>
          <GenericIcon icon={<Receipt className="w-4 h-4" />} />
          <div className="flex-1 min-w-0">
            <p className="text-body3 text-heading truncate">{result.title}</p>
            {result.subtitle && (
              <p className="text-caption text-sub truncate mt-0.5 flex items-center gap-1">
                <User className="w-3 h-3" /> {result.subtitle}
              </p>
            )}
          </div>
        </>
      )}
    </button>
  )
}

export const SearchResultItem = memo(SearchResultItemInner)
