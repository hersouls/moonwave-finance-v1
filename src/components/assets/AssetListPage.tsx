import { useEffect, useState, useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { staggerContainer, staggerItem, reducedStaggerContainer, reducedStaggerItem, motionVariants } from '@/lib/motionConfig'
import { useAssetStore } from '@/stores/assetStore'
import { useDailyValueStore } from '@/stores/dailyValueStore'
import { useMemberStore } from '@/stores/memberStore'
import { useUIStore } from '@/stores/uiStore'
import { AssetItemCard } from './AssetItemCard'
import { AssetSummaryHeader } from './AssetSummaryHeader'
import { AssetCategoryTabs } from './AssetCategoryTabs'
import { AssetCreateModal } from './AssetCreateModal'
import { AssetEmptyState } from './AssetEmptyState'
import { AssetListSkeleton } from './AssetListSkeleton'
import { FAB } from '@/components/ui/FAB'
import { Tabs } from '@/components/ui/Tabs'
import { ErrorEmptyState } from '@/components/ui/EmptyState'
import { useSyncListener } from '@/hooks/useSyncListener'
import { groupValuesByItem, valueAsOf } from '@/services/assetAnalytics'
import { getTodayString } from '@/lib/dateUtils'

export function AssetListPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeMember, setActiveMember] = useState<number | null>(null)
  const [activeCategory, setActiveCategory] = useState<number | null>(null)

  const today = getTodayString()
  const shouldReduceMotion = useReducedMotion()
  const containerV = motionVariants(shouldReduceMotion, staggerContainer, reducedStaggerContainer)
  const itemV = motionVariants(shouldReduceMotion, staggerItem, reducedStaggerItem)

  const loadAll = useAssetStore((s) => s.loadAll)
  const loadValues = useDailyValueStore((s) => s.loadValues)
  const loadAllValues = useDailyValueStore((s) => s.loadAllValues)
  const loadMembers = useMemberStore((s) => s.loadMembers)
  const items = useAssetStore((s) => s.items)
  const allValues = useDailyValueStore((s) => s.allValues)
  const members = useMemberStore((s) => s.members)
  const openAssetCreateModal = useUIStore((s) => s.openAssetCreateModal)

  const loadData = async () => {
    setError(null)
    setIsLoading(true)
    try {
      await Promise.all([loadAll(), loadValues(), loadAllValues(), loadMembers()])
    } catch {
      setError('데이터를 불러오는데 실패했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])
  useSyncListener(loadData, ['assetCategories', 'assetItems', 'dailyValues', 'members'])

  const memberTabs = useMemo(() => [
    { id: 'all', label: '전체' },
    ...members.map(m => ({ id: String(m.id), label: m.name })),
  ], [members])

  const filteredItems = useMemo(() => {
    let result = items.filter(i => i.type === 'asset' && i.isActive)
    if (activeMember !== null) {
      result = result.filter(i => i.memberId === activeMember)
    }
    if (activeCategory !== null) {
      result = result.filter(i => i.categoryId === activeCategory)
    }
    // 현재 가치 내림차순 정렬 — 큰 자산이 위로.
    const byItem = groupValuesByItem(allValues)
    return [...result].sort(
      (a, b) => valueAsOf(byItem.get(b.id!), today) - valueAsOf(byItem.get(a.id!), today)
    )
  }, [items, activeMember, activeCategory, allValues, today])

  if (isLoading) return <AssetListSkeleton />

  if (error) {
    return (
      <div className="p-4 lg:p-6">
        <ErrorEmptyState description={error} onRetry={loadData} />
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6">
      <div className="space-y-4">
        {/* Premium Summary Header */}
        {filteredItems.length > 0 && (
          <AssetSummaryHeader items={filteredItems} type="asset" />
        )}

        {/* Member Filter */}
        <Tabs
          tabs={memberTabs}
          activeTab={activeMember === null ? 'all' : String(activeMember)}
          onChange={(id) => setActiveMember(id === 'all' ? null : Number(id))}
        />

        {/* Category Filter */}
        <AssetCategoryTabs
          activeCategory={activeCategory}
          onChange={setActiveCategory}
          type="asset"
        />

        {/* Item List */}
        {filteredItems.length === 0 ? (
          <AssetEmptyState />
        ) : (
          <motion.div
            className="space-y-3"
            variants={containerV}
            initial="hidden"
            animate="visible"
            key={`${activeMember}-${activeCategory}`}
          >
            {filteredItems.map(item => (
              <motion.div key={item.id} variants={itemV}>
                <AssetItemCard
                  itemId={item.id!}
                  name={item.name}
                  categoryId={item.categoryId}
                  type="asset"
                />
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      <FAB onClick={openAssetCreateModal} label="새 자산 추가" />
      <AssetCreateModal />
    </div>
  )
}
