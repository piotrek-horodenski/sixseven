import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getPhoto, getPhotoMeta, updatePhoto, batchUpdatePhotos } from '../../src/controllers/photo.controller'

const { mockPhotoFind, mockPhotoFindById, mockPhotoFindByIdAndUpdate, mockPhotoSave } = vi.hoisted(() => ({
  mockPhotoFind: vi.fn(),
  mockPhotoFindById: vi.fn(),
  mockPhotoFindByIdAndUpdate: vi.fn(),
  mockPhotoSave: vi.fn(),
}))

const { mockTagFind, mockTagUpdateMany, mockTagInsertMany, mockTagFindByIdAndUpdate } = vi.hoisted(() => ({
  mockTagFind: vi.fn(),
  mockTagUpdateMany: vi.fn(),
  mockTagInsertMany: vi.fn(),
  mockTagFindByIdAndUpdate: vi.fn(),
}))

const { mockCollectionFind, mockCollectionUpdateMany, mockCollectionInsertMany, mockCollectionFindByIdAndUpdate } = vi.hoisted(() => ({
  mockCollectionFind: vi.fn(),
  mockCollectionUpdateMany: vi.fn(),
  mockCollectionInsertMany: vi.fn(),
  mockCollectionFindByIdAndUpdate: vi.fn(),
}))

vi.mock('@/db/models/Photo', () => ({
  default: vi.fn().mockImplementation(function (data: any) {
    Object.assign(this, data)
    this.save = mockPhotoSave
  }),
}))

vi.mock('@/db/models/Tag', () => ({
  default: {
    find: mockTagFind,
    findOne: vi.fn().mockResolvedValue(null),
    updateMany: mockTagUpdateMany,
    insertMany: mockTagInsertMany,
    findByIdAndUpdate: mockTagFindByIdAndUpdate,
  },
}))

vi.mock('@/db/models/Collection', () => ({
  default: {
    find: mockCollectionFind,
    findOne: vi.fn().mockResolvedValue(null),
    updateMany: mockCollectionUpdateMany,
    insertMany: mockCollectionInsertMany,
    findByIdAndUpdate: mockCollectionFindByIdAndUpdate,
  },
}))

vi.mock('@/settings', () => ({
  settings: {
    defaultPageSize: 10,
    uploads: '/tmp/uploads',
    thumbExtension: 'png',
    thumbWidth: 200,
    thumbHeight: 200,
    previewExtension: 'png',
    previewWidth: 300,
    previewHeight: 300,
  },
}))

vi.mock('@/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

vi.mock('sharp', () => {
  const chain: any = {
    resize: () => chain,
    withMetadata: () => chain,
    toFormat: () => chain,
    toFile: vi.fn().mockResolvedValue({}),
    metadata: vi.fn().mockResolvedValue({ width: 800, height: 600, orientation: 1, density: 72, format: 'jpeg' }),
  }
  return { default: vi.fn(() => chain) }
})

vi.mock('fs-extra', () => ({
  default: {
    ensureDir: vi.fn().mockResolvedValue(undefined),
    unlinkSync: vi.fn(),
    createReadStream: vi.fn().mockReturnValue({ pipe: vi.fn() }),
    promises: {
      unlink: vi.fn().mockResolvedValue(undefined),
    },
  },
}))

import Photo from '@/db/models/Photo'
import Tag from '@/db/models/Tag'
import Collection from '@/db/models/Collection'

const PhotoMock = Photo as any
const TagMock = Tag as any
const CollectionMock = Collection as any

function res() {
  const r: any = { json: vi.fn(), setHeader: vi.fn() }
  r.status = vi.fn().mockReturnValue(r)
  return r
}

function req(query: any = {}, body: any = {}, params: any = {}) {
  return { query, body, params } as any
}

describe('getPhoto', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns single photo by id with stream', async () => {
    const fakePhoto = {
      _id: 'p1',
      title: 'test photo',
      imagePath: '/tmp/photo.jpg',
      tags: ['t1'],
      collections: ['c1'],
    }
    PhotoMock.findById = vi.fn().mockResolvedValue(fakePhoto)

    const r = res()
    await getPhoto(req({}, {}, { id: 'p1' }), r)

    expect(PhotoMock.findById).toHaveBeenCalledWith('p1')
    expect(r.setHeader).toHaveBeenCalledWith('Content-type', 'image/jpeg')
  })

  it('returns status 3 when not found', async () => {
    PhotoMock.findById = vi.fn().mockResolvedValue(null)

    const r = res()
    await getPhoto(req({}, {}, { id: 'missing' }), r)

    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ status: 3 }))
  })
})

describe('getPhotoMeta', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns metadata with populated tags and collections', async () => {
    const fakePhoto = {
      _id: 'p1',
      title: 'test photo',
      description: 'a photo',
      tags: [{ name: 'nature', count: 5 }],
      collections: [{ name: 'landscapes' }],
      isDeleted: false,
    }
    const mockPopulate2 = vi.fn().mockResolvedValue(fakePhoto)
    const mockPopulate1 = vi.fn().mockReturnValue({ populate: mockPopulate2 })
    PhotoMock.findById = vi.fn().mockReturnValue({ populate: mockPopulate1 })

    const r = res()
    await getPhotoMeta(req({}, {}, { id: 'p1' }), r)

    expect(r.json).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: 'p1',
        title: 'test photo',
        tags: [{ name: 'nature', count: 5 }],
      }),
    )
  })

  it('returns status 3 when photo not found', async () => {
    const mockPopulate2 = vi.fn().mockResolvedValue(null)
    const mockPopulate1 = vi.fn().mockReturnValue({ populate: mockPopulate2 })
    PhotoMock.findById = vi.fn().mockReturnValue({ populate: mockPopulate1 })

    const r = res()
    await getPhotoMeta(req({}, {}, { id: 'missing' }), r)

    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ status: 3 }))
  })
})

describe('updatePhoto', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates title field', async () => {
    const fakePhoto = {
      _id: 'p1',
      title: 'old title',
      tags: [],
      collections: [],
    }
    const mockPopulate = vi.fn().mockResolvedValue(fakePhoto)
    PhotoMock.findById = vi.fn().mockReturnValue({ populate: mockPopulate })
    PhotoMock.findByIdAndUpdate = vi.fn().mockResolvedValue(fakePhoto)

    const r = res()
    await updatePhoto(req({}, { title: 'new title' }, { id: 'p1' }), r)

    expect(PhotoMock.findByIdAndUpdate).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ title: 'new title' }),
    )
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ status: 0 }))
  })

  it('returns 404 when photo not found', async () => {
    const mockPopulate = vi.fn().mockResolvedValue(null)
    PhotoMock.findById = vi.fn().mockReturnValue({ populate: mockPopulate })

    const r = res()
    await updatePhoto(req({}, { title: 'new title' }, { id: 'missing' }), r)

    expect(r.status).toHaveBeenCalledWith(404)
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ status: 2 }))
  })
})

describe('batchUpdatePhotos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('applies batch tag and collection updates', async () => {
    const fakeTagId = { equals: (id: any) => id === 'tag1' || id === fakeTagId, toString: () => 'tag1' }
    const fakeColId = { equals: (id: any) => id === 'col1' || id === fakeColId, toString: () => 'col1' }

    const fakePhotos = [
      {
        _id: 'p1',
        tags: [],
        collections: [],
        toJSON: () => ({ _id: 'p1', tags: [], collections: [] }),
      },
    ]
    const fakeTags = [
      {
        _id: fakeTagId,
        name: 'nature',
        count: 3,
        toJSON: () => ({ _id: fakeTagId, name: 'nature', count: 3 }),
      },
    ]
    const fakeCollections = [
      {
        _id: fakeColId,
        name: 'landscapes',
        count: 1,
        toJSON: () => ({ _id: fakeColId, name: 'landscapes', count: 1 }),
      },
    ]

    mockPhotoFind.mockResolvedValue(fakePhotos)
    PhotoMock.find = mockPhotoFind
    mockTagFind.mockResolvedValue(fakeTags)
    mockCollectionFind.mockResolvedValue(fakeCollections)
    PhotoMock.findByIdAndUpdate = mockPhotoFindByIdAndUpdate.mockResolvedValue({})
    mockTagFindByIdAndUpdate.mockResolvedValue({})
    mockCollectionFindByIdAndUpdate.mockResolvedValue({})

    const r = res()
    await batchUpdatePhotos(
      req({}, {
        ids: ['p1'],
        tagsToAdd: [{ name: 'nature', count: 3 }],
        tagsToRemove: [],
        collectionsToAdd: [{ name: 'landscapes', count: 1 }],
        collectionsToRemove: [],
      }),
      r,
    )

    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ status: 0 }))
  })

  it('returns error when no photos found', async () => {
    mockPhotoFind.mockResolvedValue([])
    PhotoMock.find = mockPhotoFind
    mockTagFind.mockResolvedValue([])
    mockCollectionFind.mockResolvedValue([])

    const r = res()
    await batchUpdatePhotos(
      req({}, {
        ids: ['nonexistent'],
        tagsToAdd: [],
        tagsToRemove: [],
        collectionsToAdd: [],
        collectionsToRemove: [],
      }),
      r,
    )

    expect(r.status).toHaveBeenCalledWith(500)
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ status: 2 }))
  })
})
