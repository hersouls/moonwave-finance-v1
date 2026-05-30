import { useEffect, useState, useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { staggerContainer, staggerItem, reducedStaggerContainer, reducedStaggerItem, motionVariants } from '@/lib/motionConfig'
import { useAssetStore } from '@/stores/assetStore'
import { useDailyValueStore } from '@/stores/dailyValueStore'
import { useMemberStore } from '@/stores/memberStore'
import { useUIStore } from '@/stores/uiStore'
import { LiabilityItemCard } from './LiabilityItemCard'
import { LiabilityCreateModal } from './LiabilityCreateModal'
import { LiabilityEmptyState } from './LiabilityEmptyState'
import { AssetCategoryTabs } from '@/components/assets/AssetCategoryTabs'
import { AssetSummaryHeader } from '@/components/assets/AssetSummaryHeader'
import { AssetInspectorBody } from '@/components/assets/AssetInspectorBody'
import { AssetTableView } from '@/components/assets/AssetTableView'
import { FAB } from '@/components/ui/FAB'
import { Tabs } from '@/components/ui/Tabs'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { SwipeableRow } from '@/components/ui/SwipeableRow'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { InspectorPanel } from '@/components/ui/InspectorPanel'
import { Pencil, Trash2, LayoutGrid, Table2 } from 'lucide-react'
import { clsx } from 'clsx'
import { useBreakpoint } from '@/hooks/useBreakpoint'
import { useSyncListener } from '@/hooks/useSyncListener'
import { groupValuesByItem, valueAsOf } from '@/services/assetAnalytics'
import { getTodayString } from '@/lib/dateUtils'

export function LiabilityListPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [activeMember, setActiveMember] = useState<number | null>(null)
  const [activeCategory, setActiveCategory] = useState<number | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards')

  const { isDesktop } = useBreakpoint()
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
  const openLiabilityCreateModal = useUIStore((s) => s.openLiabilityCreateModal)
  const openAssetEditModal = useUIStore((s) => s.openAssetEditModal)
  const deleteItem = useAssetStore((s) => s.deleteItem)
  const today = getTodayString()

  const loadData = async () => {
    await Promise.all([loadAll(), loadValues(), loadAllValues(), loadMembers()])
    setIsLoading(false)
  }

  useEffect(() => { loadData() }, [])
  useSyncListener(loadData, ['assetCategories', 'assetItems', 'dailyValues', 'members', 'loans'])

  const memberTabs = useMemo(() => [
    { id: 'all', label: '전체' },
    ...members.map(m => ({ id: String(m.id), label: m.name })),
  ], [members])

  const filteredItems = useMemo(() => {
    let result = items.filter(i => i.type === 'liability' && i.isActive)
    if (activeMember !== null) {
      result = result.filter(i => i.memberId === activeMember)
    }
    if (activeCategory !== null) {
      result = result.filter(i => i.categoryId === activeCategory)
    }
    // 잔액 내림차순 정렬 — 큰 부채가 위로.
    const byItem = groupValuesByItem(allValues)
    return [...result].sort(
      (a, b) => valueAsOf(byItem.get(b.id!), today) - valueAsOf(byItem.get(a.id!), today)
    )
  }, [items, activeMember, activeCategory, allValues, today])

  const selectedItem = selectedId != null ? items.find((i) => i.id === selectedId) : undefined

  if (isLoading) {
    return (
      <div className="content-container p-4 lg:p-6 space-y-4">
        <div className="flex gap-2 mb-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-9 w-20 bg-surface-tertiary rounded-md animate-pulse" />
          ))}
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6">
      <div className="content-container space-y-4">
        {filteredItems.length > 0 && (
          <AssetSummaryHeader items={filteredItems} type="liability" />
        )}

        <Tabs
          tabs={memberTabs}
          activeTab={activeMember === null ? 'all' : String(activeMember)}
          onChange={(id) => { setActiveMember(id === 'all' ? null : Number(id)); setSelectedId(null) }}
        />

        <AssetCategoryTabs
          activeCategory={activeCategory}
          onChange={(c) => { setActiveCategory(c); setSelectedId(null) }}
          type="liability"
        />

        {filteredItems.length === 0 ? (
          <LiabilityEmptyState />
        ) : (
          <>
            {isDesktop && (
              <div className="mb-1 flex justify-end">
                <div className="inline-flex rounded-lg bg-surface-tertiary p-0.5" role="group" aria-label="보기 방식">
                  <button
                    type="button"
                    onClick={() => setViewMode('cards')}
                    aria-pressed={viewMode === 'cards'}
                    className={clsx('inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-label3 font-medium transition-colors', viewMode === 'cards' ? 'bg-surface-primary text-heading elevation-1' : 'text-sub hover:text-heading')}
                  >
                    <LayoutGrid className="h-4 w-4" /> 카드
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('table')}
                    aria-pressed={viewMode === 'table'}
                    className={clsx('inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-label3 font-medium transition-colors', viewMode === 'table' ? 'bg-surface-primary text-heading elevation-1' : 'text-sub hover:text-heading')}
                  >
                    <Table2 className="h-4 w-4" /> 표
                  </button>
                </div>
              </div>
            )}
            <div className={clsx('master-detail', isDesktop && selectedId != null && 'has-inspector')}>
              {isDesktop && viewMode === 'table' ? (
                <AssetTableView items={filteredItems} type="liability" selectedId={selectedId} onSelect={setSelectedId} />
              ) : (
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
                      <LiabilityItemCard
                        itemId={id}
                        name={item.name}
                        categoryId={item.categoryId}
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
              )}

              {isDesktop && (
                <InspectorPanel
                  open={selectedId != null}
                  onClose={() => setSelectedId(null)}
                  title={selectedItem?.name}
                >
                  {selectedId != null && (
                    <AssetInspectorBody
                      itemId={selectedId}
                      type="liability"
                      onEdit={() => openAssetEditModal(selectedId)}
                      onDelete={() => setDeleteId(selectedId)}
                    />
                  )}
                </InspectorPanel>
              )}
            </div>
          </>
        )}
      </div>

      <FAB onClick={openLiabilityCreateModal} label="새 부채 추가" />
      <LiabilityCreateModal />
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
        title="부채를 삭제할까요?"
        description="이 부채와 관련된 잔액 기록이 함께 삭제됩니다. 되돌릴 수 없습니다."
        variant="danger"
        confirmText="삭제"
      />
    </div>
  )
}
