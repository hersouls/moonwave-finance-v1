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
})
