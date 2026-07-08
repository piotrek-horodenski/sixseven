import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getPhotos, createPhoto, deletePhoto } from '../../src/controllers/photo.controller'

const { mockPhotoFind, mockPhotoFindById, mockPhotoFindOneAndUpdate, mockPhotoDeleteOne, mockPhotoSave } = vi.hoisted(() => ({
  mockPhotoFind: vi.fn(),
  mockPhotoFindById: vi.fn(),
  mockPhotoFindOneAndUpdate: vi.fn(),
  mockPhotoDeleteOne: vi.fn(),
  mockPhotoSave: vi.fn(),
}))

const { mockTagFind, mockTagUpdateMany, mockTagInsertMany } = vi.hoisted(() => ({
  mockTagFind: vi.fn(),
  mockTagUpdateMany: vi.fn(),
  mockTagInsertMany: vi.fn(),
}))

const { mockCollectionFind, mockCollectionUpdateMany } = vi.hoisted(() => ({
  mockCollectionFind: vi.fn(),
  mockCollectionUpdateMany: vi.fn(),
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
    updateMany: mockTagUpdateMany,
    insertMany: mockTagInsertMany,
  },
}))

vi.mock('@/db/models/Collection', () => ({
  default: {
    find: mockCollectionFind,
    findOne: vi.fn().mockResolvedValue(null),
    updateMany: mockCollectionUpdateMany,
    insertMany: vi.fn().mockResolvedValue([]),
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
    metadata: vi.fn().mockResolvedValue({ width: 800, height: 600, orientation: 1, density: 72 }),
  }
  return { default: vi.fn(() => chain) }
})

vi.mock('fs-extra', () => ({
  default: {
    ensureDir: vi.fn().mockResolvedValue(undefined),
    unlinkSync: vi.fn(),
    createReadStream: vi.fn(),
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
  const r: any = { json: vi.fn() }
  r.status = vi.fn().mockReturnValue(r)
  return r
}

function req(query: any = {}, body: any = {}, params: any = {}, file: any = null) {
  return { query, body, params, file } as any
}

describe('getPhotos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns photos with default isDeleted:false filter', async () => {
    const fakePhotos = [{ _id: 'p1', title: 'test', tags: [], collections: [], meta: {}, isDeleted: false }]
    PhotoMock.find = vi.fn().mockReturnValue({
      sort: vi.fn().mockReturnValue({
        skip: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            populate: vi.fn().mockReturnValue({
              populate: vi.fn().mockResolvedValue(fakePhotos),
            }),
          }),
        }),
      }),
    })

    const r = res()
    await getPhotos(req(), r)
    expect(PhotoMock.find).toHaveBeenCalledWith({ isDeleted: false })
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ status: 0 }))
  })

  it('applies phrase regex filter', async () => {
    PhotoMock.find = vi.fn().mockReturnValue({
      sort: vi.fn().mockReturnValue({
        skip: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            populate: vi.fn().mockReturnValue({
              populate: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      }),
    })

    const r = res()
    await getPhotos(req({ phrase: 'cat' }), r)
    const query = PhotoMock.find.mock.calls[0][0]
    expect(JSON.stringify(query)).toContain('cat')
  })

  it('returns status 0 with empty results', async () => {
    PhotoMock.find = vi.fn().mockReturnValue({
      sort: vi.fn().mockReturnValue({
        skip: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            populate: vi.fn().mockReturnValue({
              populate: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      }),
    })
    const r = res()
    await getPhotos(req(), r)
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ status: 0, images: [] }))
  })
})

describe('createPhoto', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns error when no file attached', async () => {
    const r = res()
    await createPhoto(req({}, { tags: 'nature' }, {}, null), r)
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ status: 2 }))
  })

  it('returns error when no tags provided', async () => {
    const fakeFile = { path: '/tmp/photo.jpg', originalname: 'photo.jpg', mimetype: 'image/jpeg', size: 1000 }
    const r = res()
    await createPhoto(req({}, { tags: '' }, {}, fakeFile), r)
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ status: 3 }))
  })

  it('saves photo and returns success', async () => {
    const fakeFile = { path: '/tmp/photo.jpg', originalname: 'photo.jpg', mimetype: 'image/jpeg', size: 1000 }
    mockTagFind.mockResolvedValue([])
    mockTagInsertMany.mockResolvedValue([{ _id: 'tag1' }])
    mockCollectionFind.mockResolvedValue([])
    mockPhotoSave.mockResolvedValue({})

    const r = res()
    await createPhoto(req({}, { tags: 'nature', collections: [] }, {}, fakeFile), r)
    expect(mockPhotoSave).toHaveBeenCalled()
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ status: 0 }))
  })
})

describe('deletePhoto', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('soft delete sets isDeleted=true without unlinking files', async () => {
    PhotoMock.findOneAndUpdate = mockPhotoFindOneAndUpdate.mockResolvedValue({ _id: 'p1', isDeleted: false })
    const r = res()
    await deletePhoto(req({}, {}, { id: 'p1' }), r)
    expect(mockPhotoFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'p1' },
      expect.objectContaining({ $set: expect.objectContaining({ isDeleted: true }) }),
    )
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ status: 0 }))
  })

  it('force delete calls unlinkSync and decrements tag/collection counts', async () => {
    const { default: fs } = await import('fs-extra')
    const fakePhoto = {
      _id: 'p1',
      isDeleted: true,
      imagePath: '/tmp/photo.jpg',
      thumbPath: '/tmp/thumb.jpg',
      previewPath: '/tmp/preview.jpg',
      tags: ['t1'],
      collections: ['c1'],
    }
    PhotoMock.findById = mockPhotoFindById.mockResolvedValue(fakePhoto)
    TagMock.updateMany = mockTagUpdateMany.mockResolvedValue({})
    CollectionMock.updateMany = mockCollectionUpdateMany.mockResolvedValue({})
    PhotoMock.deleteOne = mockPhotoDeleteOne.mockResolvedValue({})

    const r = res()
    await deletePhoto(req({ force: '1' }, {}, { id: 'p1' }), r)
    expect(fs.promises.unlink).toHaveBeenCalledWith('/tmp/photo.jpg')
    expect(mockTagUpdateMany).toHaveBeenCalled()
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ status: 0 }))
  })

  it('force delete does not unlink when photo is not soft-deleted', async () => {
    const { default: fs } = await import('fs-extra')
    const fakePhoto = {
      _id: 'p1',
      isDeleted: false,
      imagePath: '/tmp/photo.jpg',
      thumbPath: '/tmp/thumb.jpg',
      previewPath: '/tmp/preview.jpg',
      tags: ['t1'],
      collections: [],
    }
    PhotoMock.findById = mockPhotoFindById.mockResolvedValue(fakePhoto)
    TagMock.updateMany = mockTagUpdateMany.mockResolvedValue({})
    CollectionMock.updateMany = mockCollectionUpdateMany.mockResolvedValue({})

    const r = res()
    await deletePhoto(req({ force: '1' }, {}, { id: 'p1' }), r)
    expect(fs.promises.unlink).not.toHaveBeenCalled()
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ status: 0 }))
  })
})
