import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { ChevronDown, ChevronUp, List, CalendarDays } from 'lucide-react'
import { useSubscriptionStore } from '@/stores/subscriptionStore'
import { useUIStore } from '@/stores/uiStore'
import { SubscriptionSummary } from './SubscriptionSummary'
import { SubscriptionCard } from './SubscriptionCard'
import { SubscriptionEmptyState } from './SubscriptionEmptyState'
import { SubscriptionFormModal } from './SubscriptionFormModal'
import { SubscriptionCalendarView } from './SubscriptionCalendarView'
import { PageSegmentControl } from '@/components/layout/PageSegmentControl'
import { FAB } from '@/components/ui/FAB'
import { SUBSCRIPTION_CATEGORIES } from '@/utils/constants'
import { clsx } from 'clsx'
import type { SubscriptionCategoryType } from '@/lib/types'

const SUB_SEGMENTS = [
  { id: 'domestic', label: '국내', path: '/subscriptions/domestic' },
  { id: 'international', label: '국외', path: '/subscriptions/international' },
]

export function SubscriptionPage() {
  const location = useLocation()
  const currencyFilter = location.pathname === '/subscriptions/international' ? 'USD' : 'KRW'
  const subscriptions = useSubscriptionStore((s) => s.subscriptions)
  const isLoading = useSubscriptionStore((s) => s.isLoading)
  const loadSubscriptions = useSubscriptionStore((s) => s.loadSubscriptions)
  const openCreate = useUIStore((s) => s.openSubscriptionCreateModal)

  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list')
  const [categoryFilter, setCategoryFilter] = useState<SubscriptionCategoryType | null>(null)
  const [showInactive, setShowInactive] = useState(false)

  useEffect(() => {
    loadSubscriptions()
  }, [loadSubscriptions])

  // Filter subscriptions by route-based currency
  const filtered = subscriptions.filter((s) => {
    if (s.currency !== currencyFilter) return false
    if (categoryFilter && s.category !== categoryFilter) return false
    return true
  })

  const active = filtered.filter(s => s.status === 'active')
  const inactive = filtered.filter(s => s.status !== 'active')

  if (isLoading) {
    return (
      <div className="space-y-4 p-4 animate-pulse">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-24 bg-zinc-200 dark:bg-zinc-700 rounded-xl" />
          ))}
        </div>
        {[0, 1, 2].map(i => (
          <div key={i} className="h-16 bg-zinc-200 dark:bg-zinc-700 rounded-xl" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-24">
      {/* Segment Control */}
      <PageSegmentControl segments={SUB_SEGMENTS} />

      {/* View Toggle */}
      <div className="flex items-center justify-between">
        {/* Summary */}
        <div className="flex-1">
          {subscriptions.some(s => s.status === 'active' && s.currency === currencyFilter) && viewMode === 'list' && (
            <SubscriptionSummary currencyFilter={currencyFilter} />
          )}
        </div>
        <div className="flex gap-1 ml-3 flex-shrink-0">
          <button
            onClick={() => setViewMode('list')}
            className={clsx(
              'p-2 rounded-lg transition-colors',
              viewMode === 'list'
                ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                : 'text-zinc-400 dark:text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            )}
            aria-label="리스트 보기"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('calendar')}
            className={clsx(
              'p-2 rounded-lg transition-colors',
              viewMode === 'calendar'
                ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                : 'text-zinc-400 dark:text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            )}
            aria-label="캘린더 보기"
          >
            <CalendarDays className="w-4 h-4" />
          </button>
        </div>
      </div>

      {viewMode === 'calendar' ? (
        <SubscriptionCalendarView />
      ) : (
        <>
          {/* Category Filter */}
          <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
            <button
              onClick={() => setCategoryFilter(null)}
              className={clsx(
                'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0',
                !categoryFilter
                  ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
              )}
            >
              전체
            </button>
            {SUBSCRIPTION_CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                onClick={() => setCategoryFilter(categoryFilter === cat.value ? null : cat.value)}
                className={clsx(
                  'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0',
                  categoryFilter === cat.value
                    ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Active Subscriptions */}
          {subscriptions.length === 0 ? (
            <SubscriptionEmptyState />
          ) : active.length === 0 && inactive.length === 0 ? (
            <p className="text-center text-sm text-zinc-400 dark:text-zinc-500 py-8">
              해당 조건에 맞는 구독이 없습니다.
            </p>
          ) : (
            <>
              <div className="space-y-2">
                {active.map((sub) => (
                  <SubscriptionCard key={sub.id} subscription={sub} />
                ))}
              </div>

              {/* Inactive section */}
              {inactive.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowInactive(!showInactive)}
                    className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors py-2"
                  >
                    {showInactive ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    일시정지/해지 ({inactive.length})
                  </button>
                  {showInactive && (
                    <div className="space-y-2 mt-1">
                      {inactive.map((sub) => (
                        <SubscriptionCard key={sub.id} subscription={sub} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}

      <FAB onClick={openCreate} label="구독 추가" />
      <SubscriptionFormModal />
    </div>
  )
}
