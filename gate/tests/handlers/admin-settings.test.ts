import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockFindOne, mockFindOneAndUpdate, mockFindOneAndDelete, mockSettingSave, MockSettingModel } = vi.hoisted(() => {
  const mockFindOne = vi.fn()
  const mockFindOneAndUpdate = vi.fn()
  const mockFindOneAndDelete = vi.fn()
  const mockSettingSave = vi.fn()

  const MockSettingModel: any = vi.fn().mockImplementation(function(this: any, data: any) {
    Object.assign(this, data)
    this._id = 'new-setting-id'
    this.save = mockSettingSave.mockResolvedValue({})
  })
  MockSettingModel.findOne = mockFindOne
  MockSettingModel.findOneAndUpdate = mockFindOneAndUpdate
  MockSettingModel.findOneAndDelete = mockFindOneAndDelete

  return { mockFindOne, mockFindOneAndUpdate, mockFindOneAndDelete, mockSettingSave, MockSettingModel }
})

vi.mock('../../app/app', () => ({
  App: {
    models: [
      { name: 'settings', model: MockSettingModel },
    ],
  },
}))

vi.mock('../../app/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { createSettingHandler, updateSettingHandler, deleteSettingHandler } from '../../app/socket-handlers/admin/settings.handler'

describe('admin settings handlers', () => {
  let socket: any

  beforeEach(() => {
    socket = {
      emit: vi.fn(),
      id: 'socket-1',
      user: {
        _id: 'admin-id',
        permissions: ['manage-settings'],
        roles: ['admin'],
        allRoles: ['admin'],
      },
    }
    vi.clearAllMocks()
  })

  describe('admin:settings:create', () => {
    it('rejects without manage-settings permission', async () => {
      socket.user.permissions = []

      await createSettingHandler.handler(socket, { name: 'test', display: 'Test', type: 'boolean', value: true })

      expect(socket.emit).toHaveBeenCalledWith('admin:settings:create-stopped', { message: 'insufficient permissions' })
    })

    it('rejects duplicate setting name', async () => {
      mockFindOne.mockResolvedValue({ _id: 'existing', name: 'test' })

      await createSettingHandler.handler(socket, { name: 'test', display: 'Test', type: 'boolean', value: true })

      expect(socket.emit).toHaveBeenCalledWith('admin:settings:create-stopped', { message: 'setting name already exists' })
    })

    it('creates setting and emits complete', async () => {
      mockFindOne.mockResolvedValue(null)

      await createSettingHandler.handler(socket, { name: 'notify', display: 'Notify', type: 'text', value: '' })

      expect(mockSettingSave).toHaveBeenCalled()
      expect(socket.emit).toHaveBeenCalledWith('admin:settings:create-complete', { _id: 'new-setting-id' })
    })
  })

  describe('admin:settings:update', () => {
    it('rejects without manage-settings permission', async () => {
      socket.user.permissions = []

      await updateSettingHandler.handler(socket, { _id: 's1', value: false })

      expect(socket.emit).toHaveBeenCalledWith('admin:settings:update-stopped', { message: 'insufficient permissions' })
    })

    it('rejects when setting not found', async () => {
      mockFindOneAndUpdate.mockResolvedValue(null)

      await updateSettingHandler.handler(socket, { _id: 's1', value: false })

      expect(socket.emit).toHaveBeenCalledWith('admin:settings:update-stopped', { message: 'setting not found' })
    })

    it('updates setting value and emits complete', async () => {
      mockFindOneAndUpdate.mockResolvedValue({ _id: 's1', name: 'register' })

      await updateSettingHandler.handler(socket, { _id: 's1', value: false })

      expect(mockFindOneAndUpdate).toHaveBeenCalledWith({ _id: 's1' }, { $set: { value: false } })
      expect(socket.emit).toHaveBeenCalledWith('admin:settings:update-complete', { _id: 's1' })
    })
  })

  describe('admin:settings:delete', () => {
    it('rejects without manage-settings permission', async () => {
      socket.user.permissions = []

      await deleteSettingHandler.handler(socket, { _id: 's1' })

      expect(socket.emit).toHaveBeenCalledWith('admin:settings:delete-stopped', { message: 'insufficient permissions' })
    })

    it('rejects when setting not found', async () => {
      mockFindOneAndDelete.mockResolvedValue(null)

      await deleteSettingHandler.handler(socket, { _id: 's1' })

      expect(socket.emit).toHaveBeenCalledWith('admin:settings:delete-stopped', { message: 'setting not found' })
    })

    it('deletes setting and emits complete', async () => {
      mockFindOneAndDelete.mockResolvedValue({ _id: 's1', name: 'register' })

      await deleteSettingHandler.handler(socket, { _id: 's1' })

      expect(mockFindOneAndDelete).toHaveBeenCalledWith({ _id: 's1' })
      expect(socket.emit).toHaveBeenCalledWith('admin:settings:delete-complete', { _id: 's1' })
    })
  })
})
