import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { IImage } from '../images.model'

const mockApi = vi.hoisted(() => ({
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

vi.mock('../images.api', () => mockApi)

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

describe('images store CRUD and loading', () => {
  let store: ReturnType<typeof useImagesStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    store = useImagesStore()
  })

  describe('loadImages', () => {
    it('sets images from API response', async () => {
      mockApi.fetchImages.mockResolvedValueOnce({
        images: [makeImage('a'), makeImage('b')],
        metadata: {},
      })

      await store.loadImages()

      expect(store.images).toHaveLength(2)
      expect(store.loading).toBe(false)
    })

    it('resets page to 0', async () => {
      store.page = 5
      mockApi.fetchImages.mockResolvedValueOnce({ images: [], metadata: {} })

      await store.loadImages()

      expect(store.page).toBe(0)
    })

    it('sets hasMore=false when fewer than PAGE_SIZE returned', async () => {
      mockApi.fetchImages.mockResolvedValueOnce({
        images: [makeImage('a')],
        metadata: {},
      })

      await store.loadImages()

      expect(store.hasMore).toBe(false)
    })

    it('sets hasMore=true when PAGE_SIZE returned', async () => {
      const images = Array.from({ length: 40 }, (_, i) => makeImage(`img${i}`))
      mockApi.fetchImages.mockResolvedValueOnce({ images, metadata: {} })

      await store.loadImages()

      expect(store.hasMore).toBe(true)
    })

    it('handles API error gracefully', async () => {
      mockApi.fetchImages.mockRejectedValueOnce(new Error('Network'))

      await store.loadImages()

      expect(store.images).toEqual([])
      expect(store.hasMore).toBe(false)
      expect(store.loading).toBe(false)
    })
  })

  describe('loadMore', () => {
    it('appends new images', async () => {
      store.images = [makeImage('a')]
      store.hasMore = true
      mockApi.fetchImages.mockResolvedValueOnce({
        images: [makeImage('b')],
        metadata: {},
      })

      await store.loadMore()

      expect(store.images).toHaveLength(2)
      expect(store.page).toBe(1)
    })

    it('does nothing when already loading more', async () => {
      store.loadingMore = true
      store.hasMore = true

      await store.loadMore()

      expect(mockApi.fetchImages).not.toHaveBeenCalled()
    })

    it('does nothing when no more to load', async () => {
      store.hasMore = false

      await store.loadMore()

      expect(mockApi.fetchImages).not.toHaveBeenCalled()
    })
  })

  describe('loadTags', () => {
    it('sets tags from API', async () => {
      mockApi.fetchTags.mockResolvedValueOnce([
        { name: 'nature', count: 5 },
        { name: 'sky', count: 3 },
      ])

      await store.loadTags()

      expect(store.tags).toHaveLength(2)
    })

    it('handles error gracefully', async () => {
      mockApi.fetchTags.mockRejectedValueOnce(new Error('fail'))

      await store.loadTags()

      expect(store.tags).toEqual([])
    })
  })

  describe('loadCollections', () => {
    it('sets collections from API', async () => {
      mockApi.fetchCollections.mockResolvedValueOnce([
        { name: 'favorites', count: 10 },
      ])

      await store.loadCollections()

      expect(store.collections).toHaveLength(1)
    })
  })

  describe('init and reload', () => {
    it('init loads images, tags, and collections', async () => {
      await store.init()

      expect(mockApi.fetchImages).toHaveBeenCalled()
      expect(mockApi.fetchTags).toHaveBeenCalled()
      expect(mockApi.fetchCollections).toHaveBeenCalled()
    })

    it('reload fetches all three again', async () => {
      await store.reload()

      expect(mockApi.fetchImages).toHaveBeenCalled()
      expect(mockApi.fetchTags).toHaveBeenCalled()
      expect(mockApi.fetchCollections).toHaveBeenCalled()
    })
  })

  describe('removeImage', () => {
    it('calls deleteImage API and removes from selection', async () => {
      store.images = [makeImage('a'), makeImage('b')]
      store.toggleSelect('a')
      store.toggleSelect('b')

      await store.removeImage('a')

      expect(mockApi.deleteImage).toHaveBeenCalledWith('a', false)
      expect(store.selectedIds.has('a')).toBe(false)
      expect(store.selectedIds.has('b')).toBe(true)
    })

    it('passes force flag', async () => {
      await store.removeImage('a', true)
      expect(mockApi.deleteImage).toHaveBeenCalledWith('a', true)
    })

    it('clears editingImage if deleting the edited image', async () => {
      const img = makeImage('a')
      store.editingImage = img

      await store.removeImage('a')

      expect(store.editingImage).toBeNull()
    })
  })

  describe('restoreImage', () => {
    it('calls updateImage with isDeleted=false', async () => {
      await store.restoreImage('a')
      expect(mockApi.updateImage).toHaveBeenCalledWith('a', { isDeleted: false })
    })
  })

  describe('batchUpdate', () => {
    it('calls batchUpdateImages and deselects all', async () => {
      store.toggleSelect('a')
      store.toggleSelect('b')

      const payload = {
        ids: ['a', 'b'],
        tagsToAdd: [{ name: 'new' }],
        tagsToRemove: [],
        collectionsToAdd: [],
        collectionsToRemove: [],
      }

      await store.batchUpdate(payload)

      expect(mockApi.batchUpdateImages).toHaveBeenCalledWith(payload)
      expect(store.selectedCount).toBe(0)
    })
  })

  describe('batchDelete', () => {
    it('deletes each image individually', async () => {
      await store.batchDelete(['a', 'b', 'c'])

      expect(mockApi.deleteImage).toHaveBeenCalledTimes(3)
      expect(mockApi.deleteImage).toHaveBeenCalledWith('a', false)
      expect(mockApi.deleteImage).toHaveBeenCalledWith('b', false)
      expect(mockApi.deleteImage).toHaveBeenCalledWith('c', false)
    })

    it('passes force flag to each', async () => {
      await store.batchDelete(['a'], true)
      expect(mockApi.deleteImage).toHaveBeenCalledWith('a', true)
    })

    it('deselects all after batch delete', async () => {
      store.toggleSelect('a')
      await store.batchDelete(['a'])
      expect(store.selectedCount).toBe(0)
    })
  })

  describe('tag management', () => {
    it('addTag creates and reloads', async () => {
      await store.addTag('nature')
      expect(mockApi.createTag).toHaveBeenCalledWith('nature')
      expect(mockApi.fetchTags).toHaveBeenCalled()
    })

    it('removeTag deletes and reloads', async () => {
      await store.removeTag('t1')
      expect(mockApi.deleteTag).toHaveBeenCalledWith('t1')
      expect(mockApi.fetchTags).toHaveBeenCalled()
    })
  })

  describe('collection management', () => {
    it('addCollection creates and reloads', async () => {
      await store.addCollection('favorites')
      expect(mockApi.createCollection).toHaveBeenCalledWith('favorites')
      expect(mockApi.fetchCollections).toHaveBeenCalled()
    })

    it('removeCollection deletes and reloads', async () => {
      await store.removeCollection('c1')
      expect(mockApi.deleteCollection).toHaveBeenCalledWith('c1')
      expect(mockApi.fetchCollections).toHaveBeenCalled()
    })
  })

  describe('upload', () => {
    it('calls uploadImage and reloads', async () => {
      const file = new File([''], 'test.jpg')
      const metadata = { title: 'Test', description: '', tags: 'nature', collections: [] }

      await store.upload(file, metadata)

      expect(mockApi.uploadImage).toHaveBeenCalledWith(file, metadata)
      expect(store.uploading).toBe(false)
    })

    it('resets uploading even on error', async () => {
      mockApi.uploadImage.mockRejectedValueOnce(new Error('fail'))
      const file = new File([''], 'test.jpg')

      await expect(store.upload(file, { title: '', description: '', tags: '', collections: [] })).rejects.toThrow()
      expect(store.uploading).toBe(false)
    })
  })
})
