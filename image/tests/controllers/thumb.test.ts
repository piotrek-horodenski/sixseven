import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getThumb } from '../../src/controllers/thumb.controller'

const { mockPhotoFindById } = vi.hoisted(() => ({
  mockPhotoFindById: vi.fn(),
}))

vi.mock('@/db/models/Photo', () => ({
  default: {
    findById: mockPhotoFindById,
  },
}))

vi.mock('@/settings', () => ({
  settings: { defaultPageSize: 10 },
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
    metadata: vi.fn().mockResolvedValue({ width: 800, height: 600, format: 'png' }),
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

function res() {
  const r: any = { json: vi.fn(), setHeader: vi.fn() }
  r.status = vi.fn().mockReturnValue(r)
  return r
}

function req(query: any = {}, body: any = {}, params: any = {}) {
  return { query, body, params } as any
}

describe('getThumb', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns thumbnail file stream with correct content-type headers', async () => {
    const fakePhoto = {
      _id: 'p1',
      title: 'test photo',
      thumbPath: '/tmp/thumb.png',
      previewPath: '/tmp/preview.png',
    }
    mockPhotoFindById.mockResolvedValue(fakePhoto)

    const r = res()
    await getThumb(req({}, {}, { id: 'p1' }), r)

    expect(r.setHeader).toHaveBeenCalledWith('Content-type', 'image/png')
    expect(r.setHeader).toHaveBeenCalledWith(
      'Content-disposition',
      expect.stringContaining('thumb_'),
    )
  })

  it('returns preview when type=preview query param', async () => {
    const { default: fs } = await import('fs-extra')
    const fakePhoto = {
      _id: 'p1',
      title: 'test photo',
      thumbPath: '/tmp/thumb.png',
      previewPath: '/tmp/preview.png',
    }
    mockPhotoFindById.mockResolvedValue(fakePhoto)

    const r = res()
    await getThumb(req({ preview: '1' }, {}, { id: 'p1' }), r)

    expect(fs.createReadStream).toHaveBeenCalledWith('/tmp/preview.png')
    expect(r.setHeader).toHaveBeenCalledWith(
      'Content-disposition',
      expect.stringContaining('preview_'),
    )
  })

  it('returns 404 when photo not found', async () => {
    mockPhotoFindById.mockResolvedValue(null)

    const r = res()
    await getThumb(req({}, {}, { id: 'missing' }), r)

    expect(r.status).toHaveBeenCalledWith(404)
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ status: 2 }))
  })
})
