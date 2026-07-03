import { describe, it, expect, beforeEach } from 'vitest'
import { useAssetStore } from '@/stores/assetStore'

describe('assetStore', () => {
  beforeEach(async () => {
    // Reset store state
    useAssetStore.setState({ categories: [], items: [], isLoading: false })
  })

  it('initializes with empty state', () => {
    const state = useAssetStore.getState()
    expect(state.categories).toEqual([])
    expect(state.items).toEqual([])
    expect(state.isLoading).toBe(false)
  })

  it('loads all data', async () => {
    await useAssetStore.getState().loadAll()
    const state = useAssetStore.getState()
    // After loadAll, categories should contain the default seeded categories
    expect(state.isLoading).toBe(false)
    expect(Array.isArray(state.categories)).toBe(true)
  })

  it('filters categories by type', async () => {
    await useAssetStore.getState().loadAll()
    const assetCats = useAssetStore.getState().getCategoriesByType('asset')
    const liabilityCats = useAssetStore.getState().getCategoriesByType('liability')
    expect(assetCats.every(c => c.type === 'asset')).toBe(true)
    expect(liabilityCats.every(c => c.type === 'liability')).toBe(true)
  })

  it('addCategory returns a string id and the category is queryable by it', async () => {
    await useAssetStore.getState().loadAll()
    const id = await useAssetStore.getState().addCategory('테스트분류', 'asset', '#123456')
    // Sync v2: add*는 새 레코드의 전역 문자열 id를 반환한다.
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
    const cat = useAssetStore.getState().categories.find(c => c.id === id)
    expect(cat?.name).toBe('테스트분류')
  })
})
