import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getCollections, addCollection, removeCollection } from '../../src/controllers/collection.controller'

const { mockFind, mockFindOne, mockFindById, mockSave, mockDeleteOne } = vi.hoisted(() => ({
  mockFind: vi.fn(),
  mockFindOne: vi.fn(),
  mockFindById: vi.fn(),
  mockSave: vi.fn(),
  mockDeleteOne: vi.fn(),
}))

vi.mock('@/db/models/Collection', () => ({
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

import Collection from '@/db/models/Collection'
import Photo from '@/db/models/Photo'

// Attach static methods after mock is set up
const CollectionMock = Collection as any
const PhotoMock = Photo as any

function makeChain(result: any) {
  const chain: any = {
    sort: () => chain,
    skip: () => chain,
    limit: () => chain,
    then: (res: any, rej: any) => Promise.resolve(result).then(res, rej),
    catch: (fn: any) => Promise.resolve(result).catch(fn),
  }
  // make it thenable properly
  chain[Symbol.toStringTag] = 'Promise'
  return {
    sort: vi.fn().mockReturnValue({
      skip: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(result),
      }),
      then: (_: any, __: any) => Promise.resolve(result),
    }),
    then: undefined as any,
  }
}

function res() {
  const r: any = { json: vi.fn() }
  r.status = vi.fn().mockReturnValue(r)
  return r
}

function req(query: any = {}, body: any = {}, params: any = {}) {
  return { query, body, params } as any
}

describe('getCollections', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns paginated collections without ?full', async () => {
    const fakeCollections = [{ name: 'a', count: 1 }, { name: 'b', count: 2 }]
    CollectionMock.find = vi.fn().mockReturnValue({
      sort: vi.fn().mockReturnValue({
        skip: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(fakeCollections),
        }),
      }),
    })

    const r = res()
    await getCollections(req(), r)
    expect(r.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 0, collections: fakeCollections }),
    )
  })

  it('returns all collections when ?full=1 (no skip/limit)', async () => {
    const fakeCollections = [{ name: 'a', count: 1 }]
    CollectionMock.find = vi.fn().mockReturnValue({
      sort: vi.fn().mockResolvedValue(fakeCollections),
    })

    const r = res()
    await getCollections(req({ full: '1' }), r)
    expect(r.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 0,
        metadata: expect.objectContaining({ page: -1 }),
      }),
    )
  })
})

describe('addCollection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns error when name is missing', async () => {
    const r = res()
    await addCollection(req({}, {}), r)
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ status: 2 }))
  })

  it('returns error when collection already exists', async () => {
    CollectionMock.findOne = vi.fn().mockResolvedValue({ _id: 'existing' })
    const r = res()
    await addCollection(req({}, { name: 'nature' }), r)
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ status: 3 }))
  })

  it('saves and returns success', async () => {
    CollectionMock.findOne = vi.fn().mockResolvedValue(null)
    mockSave.mockResolvedValue({})
    const r = res()
    await addCollection(req({}, { name: 'Nature' }), r)
    expect(mockSave).toHaveBeenCalled()
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ status: 0 }))
  })
})

describe('removeCollection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 404 when collection not found', async () => {
    CollectionMock.findById = vi.fn().mockResolvedValue(null)
    const r = res()
    await removeCollection(req({}, {}, { id: 'abc' }), r)
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ status: 2 }))
  })

  it('returns error when photos reference the collection', async () => {
    const fakeCollection = { _id: 'col1', name: 'nature' }
    CollectionMock.findById = vi.fn().mockResolvedValue(fakeCollection)
    PhotoMock.find = vi.fn().mockResolvedValue([{ _id: 'p1' }])
    const r = res()
    await removeCollection(req({}, {}, { id: 'col1' }), r)
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ status: 3 }))
  })

  it('deletes collection and returns success', async () => {
    const fakeCollection = { _id: 'col1', name: 'nature' }
    CollectionMock.findById = vi.fn().mockResolvedValue(fakeCollection)
    PhotoMock.find = vi.fn().mockResolvedValue([])
    CollectionMock.deleteOne = vi.fn().mockResolvedValue({})
    const r = res()
    await removeCollection(req({}, {}, { id: 'col1' }), r)
    expect(CollectionMock.deleteOne).toHaveBeenCalledWith({ _id: 'col1' })
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ status: 0 }))
  })
})
