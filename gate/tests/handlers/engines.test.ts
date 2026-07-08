import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockEngineSave, MockEngineModel, mockFindByIdAndUpdate, mockFindByIdAndDelete, mockClusterUpdateMany } = vi.hoisted(() => {
  const mockEngineSave = vi.fn()
  const mockFindByIdAndUpdate = vi.fn()
  const mockFindByIdAndDelete = vi.fn()
  const mockClusterUpdateMany = vi.fn()

  const MockEngineModel: any = vi.fn().mockImplementation(function (this: any, data: any) {
    Object.assign(this, data)
    this._id = 'eng-1'
    this.save = mockEngineSave.mockResolvedValue({})
  })
  MockEngineModel.findByIdAndUpdate = mockFindByIdAndUpdate
  MockEngineModel.findByIdAndDelete = mockFindByIdAndDelete

  return { mockEngineSave, MockEngineModel, mockFindByIdAndUpdate, mockFindByIdAndDelete, mockClusterUpdateMany }
})

vi.mock('../../app/app', () => ({
  App: {
    models: [
      { name: 'engines', model: MockEngineModel },
      { name: 'clusters', model: { updateMany: mockClusterUpdateMany } },
    ],
  },
}))

vi.mock('../../app/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import {
  createEngineHandler,
  updateEngineHandler,
  deleteEngineHandler,
  wakeUpEngineHandler,
} from '../../app/socket-handlers/engines/engines.handler'

describe('createEngineHandler', () => {
  let socket: any

  beforeEach(() => {
    socket = {
      emit: vi.fn(),
      id: 'socket-1',
      user: { _id: 'admin-id', permissions: ['manage-engines'] },
    }
    vi.clearAllMocks()
  })

  it('rejects without manage-engines permission', async () => {
    socket.user.permissions = []
    await createEngineHandler.handler(socket, { alias: 'Render-01', address: '10.0.0.1' })
    expect(socket.emit).toHaveBeenCalledWith('engines:create-stopped', { message: 'insufficient permissions' })
  })

  it('creates engine with defaults and emits complete', async () => {
    await createEngineHandler.handler(socket, { alias: 'Render-01', address: '10.0.0.1' })

    expect(MockEngineModel).toHaveBeenCalledWith({
      alias: 'Render-01',
      address: '10.0.0.1',
      port: 30011,
      rePort: 30010,
      cameraNumber: 0,
    })
    expect(mockEngineSave).toHaveBeenCalled()
    expect(socket.emit).toHaveBeenCalledWith('engines:create-complete', { _id: 'eng-1' })
  })

  it('creates engine with custom port values', async () => {
    await createEngineHandler.handler(socket, {
      alias: 'Render-01', address: '10.0.0.1', port: 7777, rePort: 7778, cameraNumber: 2,
    })

    expect(MockEngineModel).toHaveBeenCalledWith({
      alias: 'Render-01',
      address: '10.0.0.1',
      port: 7777,
      rePort: 7778,
      cameraNumber: 2,
    })
  })
})

describe('updateEngineHandler', () => {
  let socket: any

  beforeEach(() => {
    socket = {
      emit: vi.fn(),
      id: 'socket-1',
      user: { _id: 'admin-id', permissions: ['manage-engines'] },
    }
    vi.clearAllMocks()
  })

  it('rejects without manage-engines permission', async () => {
    socket.user.permissions = []
    await updateEngineHandler.handler(socket, { _id: 'eng-1', alias: 'New' })
    expect(socket.emit).toHaveBeenCalledWith('engines:update-stopped', { message: 'insufficient permissions' })
  })

  it('emits stopped when engine not found', async () => {
    mockFindByIdAndUpdate.mockResolvedValue(null)
    await updateEngineHandler.handler(socket, { _id: 'nonexistent', alias: 'New' })
    expect(socket.emit).toHaveBeenCalledWith('engines:update-stopped', { message: 'engine not found' })
  })

  it('updates alias and emits complete', async () => {
    mockFindByIdAndUpdate.mockResolvedValue({ _id: 'eng-1' })
    await updateEngineHandler.handler(socket, { _id: 'eng-1', alias: 'Renamed' })

    expect(mockFindByIdAndUpdate).toHaveBeenCalledWith('eng-1', { $set: { alias: 'Renamed' } })
    expect(socket.emit).toHaveBeenCalledWith('engines:update-complete', { _id: 'eng-1' })
  })

  it('updates cameraNumber only', async () => {
    mockFindByIdAndUpdate.mockResolvedValue({ _id: 'eng-1' })
    await updateEngineHandler.handler(socket, { _id: 'eng-1', cameraNumber: 3 })

    expect(mockFindByIdAndUpdate).toHaveBeenCalledWith('eng-1', { $set: { cameraNumber: 3 } })
  })
})

describe('deleteEngineHandler', () => {
  let socket: any

  beforeEach(() => {
    socket = {
      emit: vi.fn(),
      id: 'socket-1',
      user: { _id: 'admin-id', permissions: ['manage-engines'] },
    }
    vi.clearAllMocks()
  })

  it('rejects without manage-engines permission', async () => {
    socket.user.permissions = []
    await deleteEngineHandler.handler(socket, { _id: 'eng-1' })
    expect(socket.emit).toHaveBeenCalledWith('engines:delete-stopped', { message: 'insufficient permissions' })
  })

  it('emits stopped when engine not found', async () => {
    mockFindByIdAndDelete.mockResolvedValue(null)
    await deleteEngineHandler.handler(socket, { _id: 'nonexistent' })
    expect(socket.emit).toHaveBeenCalledWith('engines:delete-stopped', { message: 'engine not found' })
  })

  it('deletes engine, removes from clusters, and emits complete', async () => {
    mockFindByIdAndDelete.mockResolvedValue({ _id: 'eng-1' })
    mockClusterUpdateMany.mockResolvedValue({})

    await deleteEngineHandler.handler(socket, { _id: 'eng-1' })

    expect(mockFindByIdAndDelete).toHaveBeenCalledWith('eng-1')
    expect(mockClusterUpdateMany).toHaveBeenCalledWith(
      { engines: 'eng-1' },
      { $pull: { engines: 'eng-1' } },
    )
    expect(socket.emit).toHaveBeenCalledWith('engines:delete-complete', { _id: 'eng-1' })
  })
})

describe('wakeUpEngineHandler', () => {
  let socket: any

  beforeEach(() => {
    socket = {
      emit: vi.fn(),
      id: 'socket-1',
      user: { _id: 'admin-id', permissions: ['manage-engines'] },
    }
    vi.clearAllMocks()
  })

  it('rejects without manage-engines permission', async () => {
    socket.user.permissions = []
    await wakeUpEngineHandler.handler(socket, { _id: 'eng-1' })
    expect(socket.emit).toHaveBeenCalledWith('engines:wake-up-stopped', { message: 'insufficient permissions' })
  })

  it('updates lastAttempt and emits complete', async () => {
    mockFindByIdAndUpdate.mockResolvedValue({})
    const before = Date.now()

    await wakeUpEngineHandler.handler(socket, { _id: 'eng-1' })

    expect(mockFindByIdAndUpdate).toHaveBeenCalledWith('eng-1', {
      $set: { lastAttempt: expect.any(Number) },
    })
    expect(socket.emit).toHaveBeenCalledWith('engines:wake-up-complete', { _id: 'eng-1' })
  })
})
