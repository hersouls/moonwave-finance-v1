import { useEffect, useState, useMemo } from 'react'
import { useAssetStore } from '@/stores/assetStore'
import { useDailyValueStore } from '@/stores/dailyValueStore'
import { useMemberStore } from '@/stores/memberStore'
import { useUIStore } from '@/stores/uiStore'
import { LiabilityItemCard } from './LiabilityItemCard'
import { LiabilityCreateModal } from './LiabilityCreateModal'
import { LiabilityEmptyState } from './LiabilityEmptyState'
import { AssetCategoryTabs } from '@/components/assets/AssetCategoryTabs'
import { FAB } from '@/components/ui/FAB'
import { Tabs } from '@/components/ui/Tabs'
import { SkeletonCard } from '@/components/ui/Skeleton'

export function LiabilityListPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [activeMember, setActiveMember] = useState<number | null>(null)
  const [activeCategory, setActiveCategory] = useState<number | null>(null)

  const loadAll = useAssetStore((s) => s.loadAll)
  const loadValues = useDailyValueStore((s) => s.loadValues)
  const loadMembers = useMemberStore((s) => s.loadMembers)
  const items = useAssetStore((s) => s.items)
  const members = useMemberStore((s) => s.members)
  const openLiabilityCreateModal = useUIStore((s) => s.openLiabilityCreateModal)

  useEffect(() => {
    const init = async () => {
      await Promise.all([loadAll(), loadValues(), loadMembers()])
      setIsLoading(false)
    }
    init()
  }, [])

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
    return result
  }, [items, activeMember, activeCategory])

  if (isLoading) {
    return (
      <div className="p-4 lg:p-6 space-y-4">
        <div className="flex gap-2 mb-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-9 w-20 bg-zinc-200 dark:bg-zinc-700 rounded-md animate-pulse" />
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
      <div className="space-y-4">
        <Tabs
          tabs={memberTabs}
          activeTab={activeMember === null ? 'all' : String(activeMember)}
          onChange={(id) => setActiveMember(id === 'all' ? null : Number(id))}
        />

        <AssetCategoryTabs
          activeCategory={activeCategory}
          onChange={setActiveCategory}
          type="liability"
        />

        {filteredItems.length === 0 ? (
          <LiabilityEmptyState />
        ) : (
          <div className="space-y-3">
            {filteredItems.map(item => (
              <LiabilityItemCard
                key={item.id}
                itemId={item.id!}
                name={item.name}
                categoryId={item.categoryId}
              />
            ))}
          </div>
        )}
      </div>

      <FAB onClick={openLiabilityCreateModal} label="새 부채 추가" />
      <LiabilityCreateModal />
    </div>
  )
}
