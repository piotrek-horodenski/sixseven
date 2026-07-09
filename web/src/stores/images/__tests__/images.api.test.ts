import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/stores/gate/gate.store', () => ({
  useGateStore: vi.fn(() => ({
    authToken: 'test-token',
  })),
}))

// Must import after mock setup
import { getThumbUrl, getImageUrl } from '../images.api'

// buildPhotosQuery is not exported, so we test it indirectly via fetchImages
// But we can test the URL helpers and the fetch calls

describe('images.api', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  describe('getThumbUrl', () => {
    it('returns thumb URL for given id', () => {
      expect(getThumbUrl('abc123')).toBe('http://localhost:5179/api/thumbs/abc123')
    })
  })

  describe('getImageUrl', () => {
    it('returns image URL for given id', () => {
      expect(getImageUrl('abc123')).toBe('http://localhost:5179/api/photos/abc123')
    })
  })

  describe('fetchImages', () => {
    it('builds query string from filters', async () => {
      const { fetchImages } = await import('../images.api')
      const mockResponse = { images: [], metadata: {} }
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      })

      await fetchImages({
        phrase: 'sunset',
        sortBy: 'createdAt',
        sortDirection: -1,
        page: 0,
        limit: 40,
        tags: ['nature', 'sky'],
        collection: 'favorites',
      })

      const url = (globalThis.fetch as any).mock.calls[0][0] as string
      expect(url).toContain('phrase=sunset')
      expect(url).toContain('sortBy=createdAt')
      expect(url).toContain('sortDirection=-1')
      expect(url).toContain('page=0')
      expect(url).toContain('limit=40')
      expect(url).toContain('tag=nature')
      expect(url).toContain('tag=sky')
      expect(url).toContain('collection=favorites')
    })

    it('omits empty filters', async () => {
      const { fetchImages } = await import('../images.api')
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ images: [] }),
      })

      await fetchImages({})

      const url = (globalThis.fetch as any).mock.calls[0][0] as string
      expect(url).not.toContain('phrase')
      expect(url).not.toContain('tag=')
      expect(url).not.toContain('collection=')
    })

    it('sets deleted and active flags correctly', async () => {
      const { fetchImages } = await import('../images.api')
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ images: [] }),
      })

      await fetchImages({ deleted: true, active: false })

      const url = (globalThis.fetch as any).mock.calls[0][0] as string
      expect(url).toContain('deleted=1')
      expect(url).toContain('active=0')
    })

    it('throws on non-ok response', async () => {
      const { fetchImages } = await import('../images.api')
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false })

      await expect(fetchImages({})).rejects.toThrow('Failed to fetch images')
    })
  })

  describe('deleteImage', () => {
    it('sends DELETE request without force by default', async () => {
      const { deleteImage } = await import('../images.api')
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })

      await deleteImage('abc123')

      const [url, opts] = (globalThis.fetch as any).mock.calls[0]
      expect(url).toBe('http://localhost:5179/api/photos/abc123')
      expect(opts.method).toBe('DELETE')
    })

    it('appends force query param when force=true', async () => {
      const { deleteImage } = await import('../images.api')
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })

      await deleteImage('abc123', true)

      const url = (globalThis.fetch as any).mock.calls[0][0]
      expect(url).toBe('http://localhost:5179/api/photos/abc123?force=1')
    })
  })

  describe('updateImage', () => {
    it('sends PUT with JSON body and auth headers', async () => {
      const { updateImage } = await import('../images.api')
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })

      await updateImage('id1', { title: 'New Title' })

      const [url, opts] = (globalThis.fetch as any).mock.calls[0]
      expect(url).toBe('http://localhost:5179/api/photos/id1')
      expect(opts.method).toBe('PUT')
      expect(opts.headers['Authorization']).toBe('Bearer test-token')
      expect(opts.headers['Content-Type']).toBe('application/json')
      expect(JSON.parse(opts.body)).toEqual({ title: 'New Title' })
    })
  })
})
