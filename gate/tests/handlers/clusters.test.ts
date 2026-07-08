import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockClusterSave, MockClusterModel, mockFindOne, mockFindByIdAndUpdate, mockFindByIdAndDelete } = vi.hoisted(() => {
  const mockClusterSave = vi.fn()
  const mockFindOne = vi.fn()
  const mockFindByIdAndUpdate = vi.fn()
  const mockFindByIdAndDelete = vi.fn()

  const MockClusterModel: any = vi.fn().mockImplementation(function (this: any, data: any) {
    Object.assign(this, data)
    this._id = 'cluster-1'
    this.save = mockClusterSave.mockResolvedValue({})
  })
  MockClusterModel.findOne = mockFindOne
  MockClusterModel.findByIdAndUpdate = mockFindByIdAndUpdate
  MockClusterModel.findByIdAndDelete = mockFindByIdAndDelete

  return { mockClusterSave, MockClusterModel, mockFindOne, mockFindByIdAndUpdate, mockFindByIdAndDelete }
})

vi.mock('../../app/app', () => ({
  App: {
    models: [
      { name: 'clusters', model: MockClusterModel },
    ],
  },
}))

vi.mock('../../app/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import {
  createClusterHandler,
  updateClusterHandler,
  deleteClusterHandler,
} from '../../app/socket-handlers/engines/clusters.handler'

describe('createClusterHandler', () => {
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
    await createClusterHandler.handler(socket, { alias: 'Cluster-A' })
    expect(socket.emit).toHaveBeenCalledWith('clusters:create-stopped', { message: 'insufficient permissions' })
  })

  it('rejects duplicate alias', async () => {
    mockFindOne.mockResolvedValue({ _id: 'existing', alias: 'Cluster-A' })
    await createClusterHandler.handler(socket, { alias: 'Cluster-A' })
    expect(socket.emit).toHaveBeenCalledWith('clusters:create-stopped', { message: 'cluster alias already exists' })
  })

  it('creates cluster with engines and emits complete', async () => {
    mockFindOne.mockResolvedValue(null)

    await createClusterHandler.handler(socket, { alias: 'Cluster-A', engines: ['eng-1', 'eng-2'] })

    expect(MockClusterModel).toHaveBeenCalledWith({ alias: 'Cluster-A', engines: ['eng-1', 'eng-2'] })
    expect(mockClusterSave).toHaveBeenCalled()
    expect(socket.emit).toHaveBeenCalledWith('clusters:create-complete', { _id: 'cluster-1' })
  })

  it('creates cluster with empty engines when none provided', async () => {
    mockFindOne.mockResolvedValue(null)

    await createClusterHandler.handler(socket, { alias: 'Cluster-B' })

    expect(MockClusterModel).toHaveBeenCalledWith({ alias: 'Cluster-B', engines: [] })
  })
})

describe('updateClusterHandler', () => {
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
    await updateClusterHandler.handler(socket, { _id: 'cluster-1', alias: 'New' })
    expect(socket.emit).toHaveBeenCalledWith('clusters:update-stopped', { message: 'insufficient permissions' })
  })

  it('rejects duplicate alias on rename', async () => {
    mockFindOne.mockResolvedValue({ _id: 'other', alias: 'Taken' })
    await updateClusterHandler.handler(socket, { _id: 'cluster-1', alias: 'Taken' })
    expect(socket.emit).toHaveBeenCalledWith('clusters:update-stopped', { message: 'cluster alias already exists' })
  })

  it('emits stopped when cluster not found', async () => {
    mockFindOne.mockResolvedValue(null)
    mockFindByIdAndUpdate.mockResolvedValue(null)

    await updateClusterHandler.handler(socket, { _id: 'nonexistent', alias: 'New' })

    expect(socket.emit).toHaveBeenCalledWith('clusters:update-stopped', { message: 'cluster not found' })
  })

  it('updates alias and emits complete', async () => {
    mockFindOne.mockResolvedValue(null)
    mockFindByIdAndUpdate.mockResolvedValue({ _id: 'cluster-1' })

    await updateClusterHandler.handler(socket, { _id: 'cluster-1', alias: 'Renamed' })

    expect(mockFindByIdAndUpdate).toHaveBeenCalledWith('cluster-1', { $set: { alias: 'Renamed' } })
    expect(socket.emit).toHaveBeenCalledWith('clusters:update-complete', { _id: 'cluster-1' })
  })

  it('updates engines list', async () => {
    mockFindByIdAndUpdate.mockResolvedValue({ _id: 'cluster-1' })

    await updateClusterHandler.handler(socket, { _id: 'cluster-1', engines: ['eng-1', 'eng-3'] })

    expect(mockFindByIdAndUpdate).toHaveBeenCalledWith('cluster-1', { $set: { engines: ['eng-1', 'eng-3'] } })
  })
})

describe('deleteClusterHandler', () => {
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
    await deleteClusterHandler.handler(socket, { _id: 'cluster-1' })
    expect(socket.emit).toHaveBeenCalledWith('clusters:delete-stopped', { message: 'insufficient permissions' })
  })

  it('emits stopped when cluster not found', async () => {
    mockFindByIdAndDelete.mockResolvedValue(null)
    await deleteClusterHandler.handler(socket, { _id: 'nonexistent' })
    expect(socket.emit).toHaveBeenCalledWith('clusters:delete-stopped', { message: 'cluster not found' })
  })

  it('deletes cluster and emits complete', async () => {
    mockFindByIdAndDelete.mockResolvedValue({ _id: 'cluster-1' })

    await deleteClusterHandler.handler(socket, { _id: 'cluster-1' })

    expect(mockFindByIdAndDelete).toHaveBeenCalledWith('cluster-1')
    expect(socket.emit).toHaveBeenCalledWith('clusters:delete-complete', { _id: 'cluster-1' })
  })
})
