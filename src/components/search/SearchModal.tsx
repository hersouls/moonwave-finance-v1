import { useState, useEffect, useRef, useMemo } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Search, X, Command, CornerDownLeft, ArrowUp, ArrowDown, Clock, Sparkles, Receipt, TrendingUp, RefreshCw, Tag } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import { useSearch, useRecentSearches, groupResults } from '@/hooks/useSearch'
import type { SearchResult, SearchResultType } from '@/hooks/useSearch'
import { SearchResultItem } from './SearchResultItem'
import { useUIStore } from '@/stores/uiStore'

const GROUP_ORDER: SearchResultType[] = ['transaction', 'asset', 'subscription', 'category']

const GROUP_META: Record<SearchResultType, { label: string; icon: React.ReactNode }> = {
  transaction: { label: '거래 · 메모', icon: <Receipt className="w-3.5 h-3.5" /> },
  asset: { label: '자산 · 부채', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  subscription: { label: '구독', icon: <RefreshCw className="w-3.5 h-3.5" /> },
  category: { label: '카테고리', icon: <Tag className="w-3.5 h-3.5" /> },
}

const SUGGESTIONS = ['커피', '월급', '지출', '구독', '카드'] as const

function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={clsx(
        'inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded',
        'bg-surface-tertiary/70 border border-base text-[10px] font-semibold text-sub tabular-nums',
        className,
      )}
    >
      {children}
    </kbd>
  )
}

export function SearchModal() {
  const isOpen = useUIStore((s) => s.isSearchModalOpen)
  const close = useUIStore((s) => s.closeSearchModal)
  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotion()

  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const { results, isSearching } = useSearch(query)
  const { recent, add: pushRecent, remove: removeRecent, clear: clearRecent } = useRecentSearches()

  const groups = useMemo(() => groupResults(results), [results])
  const orderedResults = useMemo(
    () => GROUP_ORDER.flatMap((t) => groups[t]),
    [groups],
  )

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setActiveIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  useEffect(() => {
    setActiveIndex(0)
  }, [results])

  // Auto-scroll active item into view
  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${activeIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const handleSelect = (r: SearchResult) => {
    pushRecent(query)
    close()
    navigate(r.path)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, Math.max(orderedResults.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && orderedResults[activeIndex]) {
      e.preventDefault()
      handleSelect(orderedResults[activeIndex])
    } else if (e.key === 'Escape') {
      close()
    }
  }

  const isEmpty = !query.trim()
  const noResults = !isEmpty && !isSearching && orderedResults.length === 0

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-[var(--z-overlay)] flex items-start justify-center pt-[8vh] sm:pt-[12vh] px-4"
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label="검색"
        >
          {/* Premium backdrop with subtle gradient */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-md"
            style={{
              backgroundImage:
                'radial-gradient(800px circle at 50% 0%, color-mix(in srgb, var(--color-primary-500) 12%, transparent), transparent 60%)',
            }}
          />

          {/* Modal */}
          <motion.div
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.98 }}
            animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 360, damping: 28 }}
            className={clsx(
              'relative w-full max-w-xl',
              'bg-surface-primary/90 glass-heavy',
              'rounded-2xl overflow-hidden',
              'ring-1 ring-base',
              'shadow-[0_24px_60px_-12px_rgba(0,0,0,0.25),0_0_0_1px_color-mix(in_srgb,var(--color-primary-400)_20%,transparent)]',
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Gradient top accent */}
            <div
              aria-hidden
              className="absolute inset-x-0 top-0 h-px"
              style={{
                background:
                  'linear-gradient(90deg, transparent, color-mix(in srgb, var(--color-primary-400) 60%, transparent), transparent)',
              }}
            />

            {/* Search Input */}
            <div className="relative flex items-center gap-3 px-5 border-b border-base">
              <Search className="w-5 h-5 text-[color:var(--color-primary-500)] flex-shrink-0" strokeWidth={2.2} />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="거래 메모, 자산, 구독, 카테고리 검색..."
                className="flex-1 py-5 text-base bg-transparent text-heading placeholder:text-disabled focus:outline-none"
                autoComplete="off"
                spellCheck={false}
                aria-autocomplete="list"
                aria-controls="search-results"
                aria-activedescendant={orderedResults[activeIndex] ? `search-opt-${activeIndex}` : undefined}
              />
              {isSearching && (
                <div className="flex-shrink-0">
                  <motion.div
                    className="w-3.5 h-3.5 rounded-full border-2 border-[color:var(--color-primary-400)]/30 border-t-[color:var(--color-primary-500)]"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                  />
                </div>
              )}
              {query && !isSearching && (
                <button
                  onClick={() => { setQuery(''); inputRef.current?.focus() }}
                  className="p-1 rounded-lg hover:bg-[var(--hover-bg)] text-disabled hover:text-heading transition-colors"
                  aria-label="검색어 지우기"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={close}
                className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-md border border-base text-[10px] text-sub hover:bg-[var(--hover-bg)] transition-colors"
                aria-label="닫기"
              >
                <span>ESC</span>
              </button>
            </div>

            {/* Body */}
            <div
              ref={listRef}
              id="search-results"
              role="listbox"
              aria-label="검색 결과"
              className="max-h-[min(60vh,520px)] overflow-y-auto overscroll-contain"
            >
              {/* Empty state: recents + suggestions */}
              {isEmpty && (
                <div className="px-5 py-5 space-y-5">
                  {recent.length > 0 && (
                    <section>
                      <div className="flex items-center justify-between mb-2.5">
                        <div className="flex items-center gap-1.5 text-caption text-sub">
                          <Clock className="w-3.5 h-3.5" />
                          <span className="font-semibold uppercase tracking-wide">최근 검색</span>
                        </div>
                        <button
                          onClick={clearRecent}
                          className="text-[11px] text-disabled hover:text-heading transition-colors"
                        >
                          지우기
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {recent.map((r) => (
                          <div
                            key={r}
                            className="group inline-flex items-center rounded-full border border-base bg-surface-tertiary/40 hover:bg-surface-tertiary transition-colors"
                          >
                            <button
                              onClick={() => setQuery(r)}
                              className="pl-3 pr-1.5 py-1 text-caption text-heading"
                            >
                              {r}
                            </button>
                            <button
                              onClick={() => removeRecent(r)}
                              className="pr-2 pl-0.5 py-1 text-disabled hover:text-heading transition-colors"
                              aria-label={`${r} 제거`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  <section>
                    <div className="flex items-center gap-1.5 mb-2.5 text-caption text-sub">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span className="font-semibold uppercase tracking-wide">추천 검색어</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {SUGGESTIONS.map((s) => (
                        <button
                          key={s}
                          onClick={() => setQuery(s)}
                          className="px-3 py-1 rounded-full border border-base text-caption text-heading hover:bg-[color:var(--color-primary-50)] hover:border-[color:var(--color-primary-300)] dark:hover:bg-[color:var(--color-primary-900)]/20 transition-colors"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="pt-2 border-t border-base">
                    <p className="text-[11px] text-disabled leading-relaxed">
                      거래 메모, 자산 이름, 구독 서비스, 카테고리를 한번에 검색하세요.
                      메모 내용은 <span className="text-heading font-semibold">하이라이트</span>로 강조됩니다.
                    </p>
                  </section>
                </div>
              )}

              {/* No results */}
              {noResults && (
                <div className="px-5 py-12 text-center">
                  <div className="w-12 h-12 mx-auto rounded-2xl bg-surface-tertiary/60 flex items-center justify-center mb-3">
                    <Search className="w-5 h-5 text-disabled" />
                  </div>
                  <p className="text-body3 text-heading font-semibold mb-1">
                    "<span className="text-[color:var(--color-primary-600)] dark:text-[color:var(--color-primary-300)]">{query}</span>"에 대한 결과가 없어요
                  </p>
                  <p className="text-caption text-sub">
                    다른 키워드로 시도해보거나, 철자를 확인해주세요.
                  </p>
                </div>
              )}

              {/* Grouped results */}
              {!isEmpty && orderedResults.length > 0 && (
                <div className="py-1.5">
                  {GROUP_ORDER.map((type) => {
                    const items = groups[type]
                    if (items.length === 0) return null
                    const startIndex = orderedResults.indexOf(items[0])
                    return (
                      <section key={type} className="py-1">
                        <div className="flex items-center justify-between px-5 py-1.5">
                          <div className="flex items-center gap-1.5 text-[10px] text-sub font-semibold uppercase tracking-[0.08em]">
                            <span className="text-[color:var(--color-primary-500)]">{GROUP_META[type].icon}</span>
                            {GROUP_META[type].label}
                          </div>
                          <span className="text-[10px] text-disabled tabular-nums">{items.length}</span>
                        </div>
                        {items.map((r, i) => {
                          const globalIdx = startIndex + i
                          return (
                            <div key={`${r.type}-${r.id}`} data-idx={globalIdx} id={`search-opt-${globalIdx}`}>
                              <SearchResultItem
                                result={r}
                                isActive={globalIdx === activeIndex}
                                onClick={() => handleSelect(r)}
                                onHover={() => setActiveIndex(globalIdx)}
                              />
                            </div>
                          )
                        })}
                      </section>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-2.5 border-t border-base flex items-center justify-between text-[11px] text-sub bg-surface-secondary/50">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1">
                  <Kbd><ArrowUp className="w-2.5 h-2.5" /></Kbd>
                  <Kbd><ArrowDown className="w-2.5 h-2.5" /></Kbd>
                  <span className="hidden sm:inline">이동</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <Kbd><CornerDownLeft className="w-2.5 h-2.5" /></Kbd>
                  <span className="hidden sm:inline">선택</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <Kbd>ESC</Kbd>
                  <span className="hidden sm:inline">닫기</span>
                </span>
              </div>
              <div className="hidden sm:inline-flex items-center gap-1 text-disabled">
                <Command className="w-3 h-3" />
                <span>K</span>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
