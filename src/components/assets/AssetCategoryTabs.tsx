import { useMemo } from 'react'
import { useAssetStore } from '@/stores/assetStore'
import { Tabs } from '@/components/ui/Tabs'

interface AssetCategoryTabsProps {
  activeCategory: number | null
  onChange: (categoryId: number | null) => void
  type: 'asset' | 'liability'
}

export function AssetCategoryTabs({ activeCategory, onChange, type }: AssetCategoryTabsProps) {
  const categories = useAssetStore((s) => s.categories)

  const tabs = useMemo(() => {
    const typeCats = categories.filter(c => c.type === type)
    return [
      { id: 'all', label: '전체' },
      ...typeCats.map(c => ({ id: String(c.id), label: c.name })),
    ]
  }, [categories, type])

  return (
    <Tabs
      tabs={tabs}
      activeTab={activeCategory === null ? 'all' : String(activeCategory)}
      onChange={(tabId) => onChange(tabId === 'all' ? null : Number(tabId))}
      className="overflow-x-auto"
    />
  )
}
