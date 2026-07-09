import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockFindOne, mockFindByIdAndDelete, mockPresetSave, MockColorPresetModel } = vi.hoisted(() => {
  const mockFindOne = vi.fn()
  const mockFindByIdAndDelete = vi.fn()
  const mockPresetSave = vi.fn()

  const MockColorPresetModel: any = vi.fn().mockImplementation(function (this: any, data: any) {
    Object.assign(this, data)
    this._id = 'preset-1'
    this.save = mockPresetSave.mockResolvedValue({})
  })
  MockColorPresetModel.findOne = mockFindOne
  MockColorPresetModel.findByIdAndDelete = mockFindByIdAndDelete

  return { mockFindOne, mockFindByIdAndDelete, mockPresetSave, MockColorPresetModel }
})

vi.mock('../../app/app', () => ({
  App: {
    models: [
      { name: 'color-presets', model: MockColorPresetModel },
    ],
  },
}))

vi.mock('../../app/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { createColorPresetHandler, deleteColorPresetHandler } from '../../app/socket-handlers/color-presets/color-presets.handler'

describe('createColorPresetHandler', () => {
  let socket: any

  beforeEach(() => {
    socket = {
      emit: vi.fn(),
      id: 'socket-1',
      user: { _id: 'u1', permissions: [] },
    }
    vi.clearAllMocks()
  })

  it('returns silently when not authenticated', async () => {
    socket.user = null
    await createColorPresetHandler.handler(socket, { hex: '#ff0000' })
    expect(socket.emit).not.toHaveBeenCalled()
  })

  it('emits stopped when color already exists', async () => {
    mockFindOne.mockResolvedValue({ _id: 'existing', hex: '#ff0000' })

    await createColorPresetHandler.handler(socket, { hex: '#FF0000' })

    expect(mockFindOne).toHaveBeenCalledWith({ hex: '#ff0000' })
    expect(socket.emit).toHaveBeenCalledWith('color-presets:create-stopped', { message: 'color preset already exists' })
  })

  it('creates preset with normalized hex and emits complete', async () => {
    mockFindOne.mockResolvedValue(null)

    await createColorPresetHandler.handler(socket, { hex: '#AABB00' })

    expect(MockColorPresetModel).toHaveBeenCalledWith({ hex: '#aabb00' })
    expect(mockPresetSave).toHaveBeenCalled()
    expect(socket.emit).toHaveBeenCalledWith('color-presets:create-complete', { _id: 'preset-1' })
  })
})

describe('deleteColorPresetHandler', () => {
  let socket: any

  beforeEach(() => {
    socket = {
      emit: vi.fn(),
      id: 'socket-1',
      user: { _id: 'u1', permissions: [] },
    }
    vi.clearAllMocks()
  })

  it('returns silently when not authenticated', async () => {
    socket.user = null
    await deleteColorPresetHandler.handler(socket, { _id: 'preset-1' })
    expect(socket.emit).not.toHaveBeenCalled()
  })

  it('emits stopped when preset not found', async () => {
    mockFindByIdAndDelete.mockResolvedValue(null)

    await deleteColorPresetHandler.handler(socket, { _id: 'nonexistent' })

    expect(socket.emit).toHaveBeenCalledWith('color-presets:delete-stopped', { message: 'color preset not found' })
  })

  it('deletes preset and emits complete', async () => {
    mockFindByIdAndDelete.mockResolvedValue({ _id: 'preset-1', hex: '#ff0000' })

    await deleteColorPresetHandler.handler(socket, { _id: 'preset-1' })

    expect(mockFindByIdAndDelete).toHaveBeenCalledWith('preset-1')
    expect(socket.emit).toHaveBeenCalledWith('color-presets:delete-complete', { _id: 'preset-1' })
  })
})
