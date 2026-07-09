import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { IImage } from '../images.model'

vi.mock('../images.api', () => ({
  fetchImages: vi.fn().mockResolvedValue({ images: [], metadata: {} }),
  fetchTags: vi.fn().mockResolvedValue([]),
  fetchCollections: vi.fn().mockResolvedValue([]),
  uploadImage: vi.fn().mockResolvedValue(undefined),
  updateImage: vi.fn().mockResolvedValue(undefined),
  deleteImage: vi.fn().mockResolvedValue(undefined),
  batchUpdateImages: vi.fn().mockResolvedValue(undefined),
  createTag: vi.fn().mockResolvedValue(undefined),
  deleteTag: vi.fn().mockResolvedValue(undefined),
  createCollection: vi.fn().mockResolvedValue(undefined),
  deleteCollection: vi.fn().mockResolvedValue(undefined),
  getThumbUrl: vi.fn((id: string) => `/thumbs/${id}`),
  getImageUrl: vi.fn((id: string) => `/photos/${id}`),
}))

import { useImagesStore } from '../images.store'

function makeImage(id: string, overrides: Partial<IImage> = {}): IImage {
  return {
    _id: id,
    title: `Image ${id}`,
    description: '',
    tags: [],
    collections: [],
    meta: { originalName: '', mimeType: '', fileSize: 0, width: 0, height: 0, density: 0, aspect: 0 },
    ...overrides,
  }
}

describe('images store', () => {
  let store: ReturnType<typeof useImagesStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useImagesStore()
  })

  describe('toggleSelect', () => {
    it('adds id to selection', () => {
      store.toggleSelect('a')
      expect(store.selectedIds.has('a')).toBe(true)
    })

    it('removes id if already selected', () => {
      store.toggleSelect('a')
      store.toggleSelect('a')
      expect(store.selectedIds.has('a')).toBe(false)
    })

    it('tracks last selection for shift-select', () => {
      store.images = [makeImage('a'), makeImage('b'), makeImage('c')]
      store.toggleSelect('a')
      store.shiftSelect('c')

      // Should select range a-c based on last toggle
      expect(store.selectedIds.has('a')).toBe(true)
      expect(store.selectedIds.has('b')).toBe(true)
      expect(store.selectedIds.has('c')).toBe(true)
    })
  })

  describe('shiftSelect', () => {
    it('falls back to toggleSelect when no lastSelectedId', () => {
      store.images = [makeImage('a'), makeImage('b'), makeImage('c')]
      store.shiftSelect('b')

      expect(store.selectedIds.has('b')).toBe(true)
      expect(store.selectedCount).toBe(1)
    })

    it('selects range from last selected to target', () => {
      store.images = [makeImage('a'), makeImage('b'), makeImage('c'), makeImage('d')]
      store.toggleSelect('a') // sets lastSelectedId = 'a'

      store.shiftSelect('c')

      expect(store.selectedIds.has('a')).toBe(true)
      expect(store.selectedIds.has('b')).toBe(true)
      expect(store.selectedIds.has('c')).toBe(true)
      expect(store.selectedIds.has('d')).toBe(false)
    })

    it('selects range in reverse direction', () => {
      store.images = [makeImage('a'), makeImage('b'), makeImage('c'), makeImage('d')]
      store.toggleSelect('c') // lastSelectedId = 'c'

      store.shiftSelect('a')

      expect(store.selectedIds.has('a')).toBe(true)
      expect(store.selectedIds.has('b')).toBe(true)
      expect(store.selectedIds.has('c')).toBe(true)
      expect(store.selectedIds.has('d')).toBe(false)
    })

    it('adds to existing selection (does not clear)', () => {
      store.images = [makeImage('a'), makeImage('b'), makeImage('c'), makeImage('d')]
      store.toggleSelect('d') // select 'd' first
      store.toggleSelect('a') // lastSelectedId = 'a'

      store.shiftSelect('b')

      expect(store.selectedIds.has('a')).toBe(true)
      expect(store.selectedIds.has('b')).toBe(true)
      expect(store.selectedIds.has('d')).toBe(true) // still selected
    })

    it('falls back to toggleSelect if lastSelectedId not in images', () => {
      store.images = [makeImage('a'), makeImage('b')]
      store.toggleSelect('gone') // lastSelectedId = 'gone', not in images
      store.shiftSelect('a')

      expect(store.selectedIds.has('a')).toBe(true)
    })
  })

  describe('selectAll / deselectAll', () => {
    it('selectAll selects all image ids', () => {
      store.images = [makeImage('a'), makeImage('b'), makeImage('c')]
      store.selectAll()

      expect(store.selectedCount).toBe(3)
    })

    it('deselectAll clears selection', () => {
      store.images = [makeImage('a'), makeImage('b')]
      store.selectAll()
      store.deselectAll()

      expect(store.selectedCount).toBe(0)
    })
  })

  describe('selectedImages', () => {
    it('returns image objects for selected ids', () => {
      store.images = [makeImage('a'), makeImage('b'), makeImage('c')]
      store.toggleSelect('a')
      store.toggleSelect('c')

      expect(store.selectedImages.map(i => i._id)).toEqual(['a', 'c'])
    })
  })

  describe('sortedTags', () => {
    it('sorts tags by count descending', () => {
      store.tags = [
        { name: 'low', count: 1 },
        { name: 'high', count: 10 },
        { name: 'mid', count: 5 },
      ]

      expect(store.sortedTags.map(t => t.name)).toEqual(['high', 'mid', 'low'])
    })
  })

  describe('filter actions', () => {
    it('toggleTag adds and removes tags', () => {
      store.toggleTag('nature')
      expect(store.selectedTags).toContain('nature')

      store.toggleTag('nature')
      expect(store.selectedTags).not.toContain('nature')
    })

    it('clearTags empties selected tags', () => {
      store.toggleTag('a')
      store.toggleTag('b')
      store.clearTags()

      expect(store.selectedTags).toEqual([])
    })

    it('setCollection sets collection and clears tags', () => {
      store.toggleTag('nature')
      store.setCollection('favorites')

      expect(store.selectedCollection).toBe('favorites')
      expect(store.selectedTags).toEqual([])
    })

    it('clearCollection resets selectedCollection', () => {
      store.setCollection('favorites')
      store.clearCollection()

      expect(store.selectedCollection).toBe('')
    })

    it('setSort updates sort fields', () => {
      store.setSort('title', 1)

      expect(store.sortBy).toBe('title')
      expect(store.sortDirection).toBe(1)
    })

    it('toggleShowDeleted toggles the flag', () => {
      expect(store.showDeleted).toBe(false)
      store.toggleShowDeleted()
      expect(store.showDeleted).toBe(true)
      store.toggleShowDeleted()
      expect(store.showDeleted).toBe(false)
    })

    it('setViewMode updates view mode', () => {
      store.setViewMode('list')
      expect(store.viewMode).toBe('list')
      store.setViewMode('grid')
      expect(store.viewMode).toBe('grid')
    })
  })
})
