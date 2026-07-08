import { describe, it, expect, vi, beforeEach } from 'vitest'
import { batchUpdatePhotos } from '../../src/controllers/photo.controller'
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

function req(body: any = {}) {
  return { body, query: {}, params: {} } as any
}

async function createPhotoWithTags(tagIds: any[], collectionIds: any[] = []) {
  return Photo.create({
    title: 'Test Photo',
    imagePath: '/tmp/img.jpg',
    thumbPath: '/tmp/thumb.jpg',
    previewPath: '/tmp/preview.jpg',
    tags: tagIds,
    collections: collectionIds,
    meta: { originalName: 'img.jpg', mimeType: 'image/jpeg', fileSize: 100, width: 10, height: 10, density: 72, aspect: 1 },
    isDeleted: false,
  })
}

describe('batchUpdatePhotos (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('adds a new tag to multiple photos and updates counts', async () => {
    const tag1 = await Tag.create({ name: 'nature', count: 2 })
    const photo1 = await createPhotoWithTags([tag1._id])
    const photo2 = await createPhotoWithTags([tag1._id])

    const r = res()
    await batchUpdatePhotos(req({
      ids: [photo1._id.toString(), photo2._id.toString()],
      tagsToAdd: [{ name: 'landscape', count: 0 }],
      tagsToRemove: [],
      collectionsToAdd: [],
      collectionsToRemove: [],
    }), r)

    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ status: 0 }))

    // New tag should exist with count = 2 (added to both photos)
    const landscapeTag = await Tag.findOne({ name: 'landscape' })
    expect(landscapeTag).not.toBeNull()
    expect(landscapeTag!.count).toBe(2)

    // Both photos should have both tags
    const p1 = await Photo.findById(photo1._id)
    const p2 = await Photo.findById(photo2._id)
    expect(p1!.tags).toHaveLength(2)
    expect(p2!.tags).toHaveLength(2)
  })

  it('removes a tag from multiple photos and decrements count', async () => {
    const tag1 = await Tag.create({ name: 'nature', count: 3 })
    const tag2 = await Tag.create({ name: 'landscape', count: 2 })
    const photo1 = await createPhotoWithTags([tag1._id, tag2._id])
    const photo2 = await createPhotoWithTags([tag1._id, tag2._id])

    const r = res()
    await batchUpdatePhotos(req({
      ids: [photo1._id.toString(), photo2._id.toString()],
      tagsToAdd: [],
      tagsToRemove: [{ name: 'landscape', _id: tag2._id, count: 2 }],
      collectionsToAdd: [],
      collectionsToRemove: [],
    }), r)

    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ status: 0 }))

    // landscape count should drop by 2 (removed from both photos)
    const landscapeTag = await Tag.findById(tag2._id)
    expect(landscapeTag!.count).toBe(0)

    // Photos should only have nature tag
    const p1 = await Photo.findById(photo1._id)
    const p2 = await Photo.findById(photo2._id)
    expect(p1!.tags).toHaveLength(1)
    expect(p2!.tags).toHaveLength(1)
  })

  it('adds and removes tags simultaneously', async () => {
    const tag1 = await Tag.create({ name: 'old-tag', count: 1 })
    const photo = await createPhotoWithTags([tag1._id])

    const r = res()
    await batchUpdatePhotos(req({
      ids: [photo._id.toString()],
      tagsToAdd: [{ name: 'new-tag', count: 0 }],
      tagsToRemove: [{ name: 'old-tag', _id: tag1._id, count: 1 }],
      collectionsToAdd: [],
      collectionsToRemove: [],
    }), r)

    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ status: 0 }))

    const oldTag = await Tag.findById(tag1._id)
    expect(oldTag!.count).toBe(0)

    const newTag = await Tag.findOne({ name: 'new-tag' })
    expect(newTag!.count).toBe(1)

    const updated = await Photo.findById(photo._id)
    expect(updated!.tags).toHaveLength(1)
    expect(updated!.tags[0].toString()).toBe(newTag!._id.toString())
  })

  it('handles collection add and remove in batch', async () => {
    const col1 = await Collection.create({ name: 'Favorites', count: 1 })
    const tag = await Tag.create({ name: 'test', count: 1 })
    const photo = await createPhotoWithTags([tag._id], [col1._id])

    const r = res()
    await batchUpdatePhotos(req({
      ids: [photo._id.toString()],
      tagsToAdd: [],
      tagsToRemove: [],
      collectionsToAdd: [{ name: 'Wallpapers', count: 0 }],
      collectionsToRemove: [{ name: 'Favorites', _id: col1._id, count: 1 }],
    }), r)

    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ status: 0 }))

    const fav = await Collection.findById(col1._id)
    expect(fav!.count).toBe(0)

    const wall = await Collection.findOne({ name: 'Wallpapers' })
    expect(wall!.count).toBe(1)
  })

  it('returns error when no photos found', async () => {
    const r = res()
    await batchUpdatePhotos(req({
      ids: ['000000000000000000000000'],
      tagsToAdd: [],
      tagsToRemove: [],
      collectionsToAdd: [],
      collectionsToRemove: [],
    }), r)

    expect(r.status).toHaveBeenCalledWith(500)
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ status: 2 }))
  })

  it('skips adding tag that photo already has', async () => {
    const tag = await Tag.create({ name: 'nature', count: 1 })
    const photo = await createPhotoWithTags([tag._id])

    const r = res()
    await batchUpdatePhotos(req({
      ids: [photo._id.toString()],
      tagsToAdd: [{ name: 'nature', count: 1 }],
      tagsToRemove: [],
      collectionsToAdd: [],
      collectionsToRemove: [],
    }), r)

    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ status: 0 }))

    // Count should NOT increase since photo already had the tag
    const updatedTag = await Tag.findById(tag._id)
    expect(updatedTag!.count).toBe(1)

    const updated = await Photo.findById(photo._id)
    expect(updated!.tags).toHaveLength(1)
  })
})
