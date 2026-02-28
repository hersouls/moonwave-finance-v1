import { useEffect, useState, useMemo } from 'react'
import { useAssetStore } from '@/stores/assetStore'
import { useDailyValueStore } from '@/stores/dailyValueStore'
import { useMemberStore } from '@/stores/memberStore'
import { useUIStore } from '@/stores/uiStore'
import { AssetItemCard } from './AssetItemCard'
import { AssetCategoryTabs } from './AssetCategoryTabs'
import { AssetCreateModal } from './AssetCreateModal'
import { AssetEmptyState } from './AssetEmptyState'
import { AssetListSkeleton } from './AssetListSkeleton'
import { FAB } from '@/components/ui/FAB'
import { Tabs } from '@/components/ui/Tabs'
import { ErrorEmptyState } from '@/components/ui/EmptyState'

export function AssetListPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeMember, setActiveMember] = useState<number | null>(null)
  const [activeCategory, setActiveCategory] = useState<number | null>(null)

  const loadAll = useAssetStore((s) => s.loadAll)
  const loadValues = useDailyValueStore((s) => s.loadValues)
  const loadMembers = useMemberStore((s) => s.loadMembers)
  const items = useAssetStore((s) => s.items)
  const members = useMemberStore((s) => s.members)
  const openAssetCreateModal = useUIStore((s) => s.openAssetCreateModal)

  const loadData = async () => {
    setError(null)
    setIsLoading(true)
    try {
      await Promise.all([loadAll(), loadValues(), loadMembers()])
    } catch {
      setError('데이터를 불러오는데 실패했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

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
    return result
  }, [items, activeMember, activeCategory])

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
          <div className="space-y-3">
            {filteredItems.map(item => (
              <AssetItemCard
                key={item.id}
                itemId={item.id!}
                name={item.name}
                categoryId={item.categoryId}

                type="asset"
              />
            ))}
          </div>
        )}
      </div>

      <FAB onClick={openAssetCreateModal} label="새 자산 추가" />
      <AssetCreateModal />
    </div>
  )
}
