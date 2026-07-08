import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getTags, addTag, removeTag } from '../../src/controllers/tag.controller'

const { mockFind, mockFindOne, mockFindById, mockSave, mockDeleteOne } = vi.hoisted(() => ({
  mockFind: vi.fn(),
  mockFindOne: vi.fn(),
  mockFindById: vi.fn(),
  mockSave: vi.fn(),
  mockDeleteOne: vi.fn(),
}))

vi.mock('@/db/models/Tag', () => ({
  default: vi.fn().mockImplementation(function (data: any) {
    Object.assign(this, data)
    this.save = mockSave
  }),
}))

vi.mock('@/db/models/Photo', () => ({
  default: { find: vi.fn() },
}))

vi.mock('@/settings', () => ({
  settings: { defaultPageSize: 10 },
}))

vi.mock('@/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

import Tag from '@/db/models/Tag'
import Photo from '@/db/models/Photo'

const TagMock = Tag as any
const PhotoMock = Photo as any

function res() {
  const r: any = { json: vi.fn(), setHeader: vi.fn() }
  r.status = vi.fn().mockReturnValue(r)
  return r
}

function req(query: any = {}, body: any = {}, params: any = {}) {
  return { query, body, params } as any
}

describe('getTags', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns paginated tags', async () => {
    const fakeTags = [
      { _id: 't1', name: 'nature', count: 5, createdAt: new Date() },
      { _id: 't2', name: 'city', count: 3, createdAt: new Date() },
    ]
    TagMock.find = vi.fn().mockReturnValue({
      sort: vi.fn().mockReturnValue({
        skip: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(fakeTags),
        }),
      }),
    })

    const r = res()
    await getTags(req(), r)
    expect(r.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 0 }),
    )
    const call = r.json.mock.calls[0][0]
    expect(call.tags).toHaveLength(2)
    expect(call.metadata).toEqual(expect.objectContaining({ page: 0 }))
  })

  it('applies phrase filter', async () => {
    const fakeTags = [{ _id: 't1', name: 'nature', count: 5, createdAt: new Date() }]
    TagMock.find = vi.fn().mockReturnValue({
      sort: vi.fn().mockReturnValue({
        skip: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(fakeTags),
        }),
      }),
    })

    const r = res()
    await getTags(req({ phrase: 'nat' }), r)
    const query = TagMock.find.mock.calls[0][0]
    expect(query.name.$regex).toContain('nat')
    expect(r.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 0 }),
    )
  })
})

describe('addTag', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns error when name is missing', async () => {
    const r = res()
    await addTag(req({}, {}), r)
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ status: 2 }))
  })

  it('returns error when tag already exists', async () => {
    TagMock.findOne = vi.fn().mockResolvedValue({ _id: 'existing' })
    const r = res()
    await addTag(req({}, { name: 'nature' }), r)
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ status: 3 }))
  })

  it('saves and returns success', async () => {
    TagMock.findOne = vi.fn().mockResolvedValue(null)
    mockSave.mockResolvedValue({})
    const r = res()
    await addTag(req({}, { name: 'Nature' }), r)
    expect(mockSave).toHaveBeenCalled()
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ status: 0 }))
  })
})

describe('removeTag', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 404 when tag not found', async () => {
    TagMock.findById = vi.fn().mockResolvedValue(null)
    const r = res()
    await removeTag(req({}, {}, { id: 'abc' }), r)
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ status: 2 }))
  })

  it('returns error when photos reference the tag', async () => {
    const fakeTag = { _id: 'tag1', name: 'nature' }
    TagMock.findById = vi.fn().mockResolvedValue(fakeTag)
    PhotoMock.find = vi.fn().mockResolvedValue([{ _id: 'p1' }])
    const r = res()
    await removeTag(req({}, {}, { id: 'tag1' }), r)
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ status: 3 }))
  })

  it('deletes tag and returns success', async () => {
    const fakeTag = { _id: 'tag1', name: 'nature' }
    TagMock.findById = vi.fn().mockResolvedValue(fakeTag)
    PhotoMock.find = vi.fn().mockResolvedValue([])
    TagMock.deleteOne = vi.fn().mockResolvedValue({})
    const r = res()
    await removeTag(req({}, {}, { id: 'tag1' }), r)
    expect(TagMock.deleteOne).toHaveBeenCalledWith({ _id: 'tag1' })
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ status: 0 }))
  })
})
