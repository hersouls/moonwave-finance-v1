import { useMemo, useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useVirtualizer } from '@tanstack/react-virtual'
import { TransactionCard } from './TransactionCard'
import { DateGroupHeader } from './DateGroupHeader'
import { useTransactionGroups, type TransactionGroup } from '@/hooks/useTransactionGroups'
import type { Transaction } from '@/lib/types'
import { durations, easeOutExpo } from '@/lib/motionConfig'

interface TransactionListGroupedProps {
  transactions: Transaction[]
  /** sticky header 사용 여부 (기본 true). false 시 평면 list */
  sticky?: boolean
  /** 가상화 임계값 (기본 200건 이상일 때 자동 활성) */
  virtualThreshold?: number
}

type FlatItem =
  | { kind: 'header'; id: string; group: TransactionGroup }
  | { kind: 'transaction'; id: string; transaction: Transaction }

const HEADER_HEIGHT = 40
const CARD_HEIGHT = 84
const CARD_GAP = 8

function flattenGroups(groups: TransactionGroup[]): FlatItem[] {
  const result: FlatItem[] = []
  for (const group of groups) {
    result.push({ kind: 'header', id: `h:${group.date}`, group })
    for (const t of group.transactions) {
      result.push({ kind: 'transaction', id: `t:${t.id}`, transaction: t })
    }
  }
  return result
}

/**
 * 거래 200건+ 일 때 자동 가상화 (@tanstack/react-virtual)
 * 가상화 모드에서는 sticky header 비활성 (virtual 측정 충돌 방지)
 */
export function TransactionListGrouped({
  transactions,
  sticky = true,
  virtualThreshold = 200,
}: TransactionListGroupedProps) {
  const groups = useTransactionGroups(transactions)
  const shouldReduceMotion = useReducedMotion()
  const shouldVirtualize = transactions.length >= virtualThreshold

  const flatItems = useMemo<FlatItem[]>(
    () => shouldVirtualize ? flattenGroups(groups) : [],
    [groups, shouldVirtualize],
  )

  const parentRef = useRef<HTMLDivElement | null>(null)
  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) =>
      flatItems[index]?.kind === 'header' ? HEADER_HEIGHT : CARD_HEIGHT + CARD_GAP,
    overscan: 6,
    getItemKey: (index) => flatItems[index]?.id ?? index,
    enabled: shouldVirtualize,
  })

  // 비가상화 (기본): 기존 렌더링 + sticky 지원
  if (!shouldVirtualize) {
    return (
      <div className="space-y-5">
        {groups.map((group, gi) => (
          <motion.section
            key={group.date}
            initial={shouldReduceMotion ? undefined : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: durations.base,
              ease: easeOutExpo,
              delay: Math.min(gi * 0.04, 0.2),
            }}
            aria-label={`${group.label} 거래`}
          >
            <DateGroupHeader group={group} sticky={sticky} />
            <div className="space-y-2 pt-2">
              {group.transactions.map(t => (
                <TransactionCard key={t.id} transaction={t} />
              ))}
            </div>
          </motion.section>
        ))}
      </div>
    )
  }

  // 가상화 모드 (sticky off — virtual offset 과 충돌)
  return (
    <div
      ref={parentRef}
      className="relative overflow-auto"
      style={{ maxHeight: '70vh' }}
      role="feed"
      aria-label="거래 목록"
      aria-busy={false}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative',
          width: '100%',
        }}
      >
        {virtualizer.getVirtualItems().map(virtualRow => {
          const item = flatItems[virtualRow.index]
          if (!item) return null
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {item.kind === 'header' ? (
                <DateGroupHeader group={item.group} sticky={false} className="py-3" />
              ) : (
                <div className="pb-2">
                  <TransactionCard transaction={item.transaction} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
