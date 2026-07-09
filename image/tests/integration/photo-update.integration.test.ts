import { describe, it, expect, vi, beforeEach } from 'vitest'
import { updatePhoto } from '../../src/controllers/photo.controller'
import Photo from '@/db/models/Photo'
import Tag from '@/db/models/Tag'
import Collection from '@/db/models/Collection'

vi.mock('@/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

function res() {
  const r: any = { json: vi.fn() }
  r.status = vi.fn().mockReturnValue(r)
  return r
}

function req(params: any = {}, body: any = {}) {
  return { params, body, query: {} } as any
}

describe('updatePhoto (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 404 when photo not found', async () => {
    const r = res()
    await updatePhoto(req({ id: '000000000000000000000000' }, {}), r)
    expect(r.status).toHaveBeenCalledWith(404)
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ status: 2 }))
  })

  it('updates title and description', async () => {
    const tag = await Tag.create({ name: 'nature', count: 1 })
    const photo = await Photo.create({
      title: 'Old Title',
      description: 'Old Desc',
      imagePath: '/tmp/img.jpg',
      thumbPath: '/tmp/thumb.jpg',
      previewPath: '/tmp/preview.jpg',
      tags: [tag._id],
      collections: [],
      meta: { originalName: 'img.jpg', mimeType: 'image/jpeg', fileSize: 100, width: 10, height: 10, density: 72, aspect: 1 },
      isDeleted: false,
    })

    const r = res()
    await updatePhoto(req({ id: photo._id.toString() }, { title: 'New Title', description: 'New Desc' }), r)
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ status: 0 }))

    const updated = await Photo.findById(photo._id)
    expect(updated!.title).toBe('New Title')
    expect(updated!.description).toBe('New Desc')
  })

  it('adds new tags and increments their count', async () => {
    const existingTag = await Tag.create({ name: 'nature', count: 1 })
    const photo = await Photo.create({
      title: 'Test',
      imagePath: '/tmp/img.jpg',
      thumbPath: '/tmp/thumb.jpg',
      previewPath: '/tmp/preview.jpg',
      tags: [existingTag._id],
      collections: [],
      meta: { originalName: 'img.jpg', mimeType: 'image/jpeg', fileSize: 100, width: 10, height: 10, density: 72, aspect: 1 },
      isDeleted: false,
    })

    const r = res()
    await updatePhoto(req({ id: photo._id.toString() }, { tags: 'nature landscape' }), r)
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ status: 0 }))

    // 'nature' was already on the photo — count should stay 1
    const natureTag = await Tag.findOne({ name: 'nature' })
    expect(natureTag!.count).toBe(1)

    // 'landscape' is new — should be created with count 1
    const landscapeTag = await Tag.findOne({ name: 'landscape' })
    expect(landscapeTag).not.toBeNull()
    expect(landscapeTag!.count).toBe(1)

    // Photo should now have both tags
    const updated = await Photo.findById(photo._id)
    expect(updated!.tags).toHaveLength(2)
  })

  it('removes old tags and decrements their count', async () => {
    const tag1 = await Tag.create({ name: 'nature', count: 2 })
    const tag2 = await Tag.create({ name: 'landscape', count: 1 })
    const photo = await Photo.create({
      title: 'Test',
      imagePath: '/tmp/img.jpg',
      thumbPath: '/tmp/thumb.jpg',
      previewPath: '/tmp/preview.jpg',
      tags: [tag1._id, tag2._id],
      collections: [],
      meta: { originalName: 'img.jpg', mimeType: 'image/jpeg', fileSize: 100, width: 10, height: 10, density: 72, aspect: 1 },
      isDeleted: false,
    })

    const r = res()
    // Only keep 'nature', remove 'landscape'
    await updatePhoto(req({ id: photo._id.toString() }, { tags: 'nature' }), r)
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ status: 0 }))

    const natureTag = await Tag.findById(tag1._id)
    expect(natureTag!.count).toBe(2) // unchanged — was already on photo

    const landscapeTag = await Tag.findById(tag2._id)
    expect(landscapeTag!.count).toBe(0) // decremented

    const updated = await Photo.findById(photo._id)
    expect(updated!.tags).toHaveLength(1)
  })

  it('handles collection updates with count tracking', async () => {
    const col1 = await Collection.create({ name: 'Favorites', count: 1 })
    const tag = await Tag.create({ name: 'test', count: 1 })
    const photo = await Photo.create({
      title: 'Test',
      imagePath: '/tmp/img.jpg',
      thumbPath: '/tmp/thumb.jpg',
      previewPath: '/tmp/preview.jpg',
      tags: [tag._id],
      collections: [col1._id],
      meta: { originalName: 'img.jpg', mimeType: 'image/jpeg', fileSize: 100, width: 10, height: 10, density: 72, aspect: 1 },
      isDeleted: false,
    })

    const r = res()
    // Switch from Favorites to a new collection 'Wallpapers'
    await updatePhoto(req({ id: photo._id.toString() }, { collections: ['Wallpapers'] }), r)
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ status: 0 }))

    const fav = await Collection.findById(col1._id)
    expect(fav!.count).toBe(0) // decremented

    const wall = await Collection.findOne({ name: 'Wallpapers' })
    expect(wall).not.toBeNull()
    expect(wall!.count).toBe(1) // new, created with count 1
  })

  it('swaps all tags when entirely new set provided', async () => {
    const oldTag = await Tag.create({ name: 'old', count: 1 })
    const newTag = await Tag.create({ name: 'new', count: 0 })
    const photo = await Photo.create({
      title: 'Test',
      imagePath: '/tmp/img.jpg',
      thumbPath: '/tmp/thumb.jpg',
      previewPath: '/tmp/preview.jpg',
      tags: [oldTag._id],
      collections: [],
      meta: { originalName: 'img.jpg', mimeType: 'image/jpeg', fileSize: 100, width: 10, height: 10, density: 72, aspect: 1 },
      isDeleted: false,
    })

    const r = res()
    await updatePhoto(req({ id: photo._id.toString() }, { tags: 'new' }), r)
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ status: 0 }))

    const updatedOld = await Tag.findById(oldTag._id)
    expect(updatedOld!.count).toBe(0) // decremented

    const updatedNew = await Tag.findById(newTag._id)
    expect(updatedNew!.count).toBe(1) // incremented

    const updated = await Photo.findById(photo._id)
    expect(updated!.tags).toHaveLength(1)
  })
})
