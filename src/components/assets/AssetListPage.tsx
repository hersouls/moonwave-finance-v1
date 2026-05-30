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
import { AssetInspectorBody } from './AssetInspectorBody'
import { FAB } from '@/components/ui/FAB'
import { Tabs } from '@/components/ui/Tabs'
import { ErrorEmptyState } from '@/components/ui/EmptyState'
import { InspectorPanel } from '@/components/ui/InspectorPanel'
import { SwipeableRow } from '@/components/ui/SwipeableRow'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Pencil, Trash2 } from 'lucide-react'
import { clsx } from 'clsx'
import { useBreakpoint } from '@/hooks/useBreakpoint'
import { useSyncListener } from '@/hooks/useSyncListener'
import { groupValuesByItem, valueAsOf } from '@/services/assetAnalytics'
import { getTodayString } from '@/lib/dateUtils'

export function AssetListPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeMember, setActiveMember] = useState<number | null>(null)
  const [activeCategory, setActiveCategory] = useState<number | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)

  const { isDesktop } = useBreakpoint()
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
  const openAssetEditModal = useUIStore((s) => s.openAssetEditModal)
  const deleteItem = useAssetStore((s) => s.deleteItem)

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

  const selectedItem = selectedId != null ? items.find((i) => i.id === selectedId) : undefined

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
          onChange={(id) => { setActiveMember(id === 'all' ? null : Number(id)); setSelectedId(null) }}
        />

        {/* Category Filter */}
        <AssetCategoryTabs
          activeCategory={activeCategory}
          onChange={(c) => { setActiveCategory(c); setSelectedId(null) }}
          type="asset"
        />

        {/* Item List + desktop inspector (master-detail) */}
        {filteredItems.length === 0 ? (
          <AssetEmptyState />
        ) : (
          <div className={clsx('master-detail', isDesktop && selectedId != null && 'has-inspector')}>
            <motion.div
              className={clsx('grid grid-cols-1 gap-3', isDesktop && selectedId == null && 'xl:grid-cols-2')}
              variants={containerV}
              initial="hidden"
              animate="visible"
              key={`${activeMember}-${activeCategory}`}
            >
              {filteredItems.map(item => {
                const id = item.id!
                const card = (
                  <AssetItemCard
                    itemId={id}
                    name={item.name}
                    categoryId={item.categoryId}
                    type="asset"
                    onSelect={isDesktop ? setSelectedId : undefined}
                    selected={isDesktop && selectedId === id}
                  />
                )
                return (
                  <motion.div key={id} variants={itemV}>
                    {isDesktop ? card : (
                      <SwipeableRow
                        actions={[
                          { icon: Pencil, label: '수정', variant: 'primary', onClick: () => openAssetEditModal(id) },
                          { icon: Trash2, label: '삭제', variant: 'danger', onClick: () => setDeleteId(id) },
                        ]}
                      >
                        {card}
                      </SwipeableRow>
                    )}
                  </motion.div>
                )
              })}
            </motion.div>

            {isDesktop && (
              <InspectorPanel
                open={selectedId != null}
                onClose={() => setSelectedId(null)}
                title={selectedItem?.name}
              >
                {selectedId != null && (
                  <AssetInspectorBody
                    itemId={selectedId}
                    type="asset"
                    onEdit={() => openAssetEditModal(selectedId)}
                    onDelete={() => setDeleteId(selectedId)}
                  />
                )}
              </InspectorPanel>
            )}
          </div>
        )}
      </div>

      <FAB onClick={openAssetCreateModal} label="새 자산 추가" />
      <AssetCreateModal />
      <ConfirmDialog
        open={deleteId != null}
        onClose={() => setDeleteId(null)}
        onConfirm={async () => {
          const id = deleteId
          setDeleteId(null)
          if (id != null) {
            await deleteItem(id)
            if (selectedId === id) setSelectedId(null)
          }
        }}
        title="자산을 삭제할까요?"
        description="이 자산과 관련된 가치 기록이 함께 삭제됩니다. 되돌릴 수 없습니다."
        variant="danger"
        confirmText="삭제"
      />
    </div>
  )
}
