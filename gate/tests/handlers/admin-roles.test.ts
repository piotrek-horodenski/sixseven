import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockFindOne, mockFindById, mockUpdateOne, mockDeleteOne, mockRoleSave, mockRoleFind, mockUserFind, MockRoleModel } = vi.hoisted(() => {
  const mockFindOne = vi.fn()
  const mockFindById = vi.fn()
  const mockUpdateOne = vi.fn()
  const mockDeleteOne = vi.fn()
  const mockRoleSave = vi.fn()
  const mockRoleFind = vi.fn()
  const mockUserFind = vi.fn()

  const MockRoleModel: any = vi.fn().mockImplementation(function(this: any, data: any) {
    Object.assign(this, data)
    this._id = 'new-role-id'
    this.save = mockRoleSave.mockResolvedValue({})
  })
  MockRoleModel.findOne = mockFindOne
  MockRoleModel.findById = mockFindById
  MockRoleModel.updateOne = mockUpdateOne
  MockRoleModel.deleteOne = mockDeleteOne
  MockRoleModel.find = mockRoleFind

  return { mockFindOne, mockFindById, mockUpdateOne, mockDeleteOne, mockRoleSave, mockRoleFind, mockUserFind, MockRoleModel }
})

vi.mock('../../app/app', () => ({
  App: {
    models: [
      { name: 'roles', model: MockRoleModel },
      { name: 'users', model: { find: mockUserFind, findById: vi.fn(), updateOne: vi.fn() } },
    ],
    io: { sockets: { sockets: new Map() } },
  },
}))

vi.mock('../../app/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { createRoleHandler, updateRoleHandler, deleteRoleHandler, syncUsersHandler } from '../../app/socket-handlers/admin/roles.handler'

describe('admin roles handlers', () => {
  let socket: any

  beforeEach(() => {
    socket = {
      emit: vi.fn(),
      id: 'socket-1',
      user: {
        _id: 'admin-id',
        permissions: ['manage-roles'],
        roles: ['admin'],
        allRoles: ['admin'],
      },
    }
    vi.clearAllMocks()
    mockRoleFind.mockReturnValue({ lean: () => Promise.resolve([]) })
    mockUserFind.mockResolvedValue([])
  })

  describe('admin:roles:create', () => {
    it('rejects without manage-roles permission', async () => {
      socket.user.permissions = []

      await createRoleHandler.handler(socket, { name: 'test', display: 'Test', permissions: [], useRoles: [] })

      expect(socket.emit).toHaveBeenCalledWith('admin:roles:create-stopped', { message: 'insufficient permissions' })
    })

    it('rejects duplicate role name', async () => {
      mockFindOne.mockResolvedValue({ _id: 'existing', name: 'test' })

      await createRoleHandler.handler(socket, { name: 'test', display: 'Test', permissions: [], useRoles: [] })

      expect(socket.emit).toHaveBeenCalledWith('admin:roles:create-stopped', { message: 'role name already exists' })
    })

    it('creates role and emits complete', async () => {
      mockFindOne.mockResolvedValue(null)

      await createRoleHandler.handler(socket, { name: 'viewer', display: 'Viewer', permissions: ['view'], useRoles: ['guest'] })

      expect(mockRoleSave).toHaveBeenCalled()
      expect(socket.emit).toHaveBeenCalledWith('admin:roles:create-complete', { _id: 'new-role-id' })
    })
  })

  describe('admin:roles:update', () => {
    it('rejects without manage-roles permission', async () => {
      socket.user.permissions = []

      await updateRoleHandler.handler(socket, { _id: 'r1', display: 'X', permissions: [], useRoles: [] })

      expect(socket.emit).toHaveBeenCalledWith('admin:roles:update-stopped', { message: 'insufficient permissions' })
    })

    it('protects admin manage-roles permission', async () => {
      mockFindById.mockResolvedValue({ _id: 'r1', name: 'admin' })
      mockUpdateOne.mockResolvedValue({})

      await updateRoleHandler.handler(socket, { _id: 'r1', display: 'Admin', permissions: ['manage-users'], useRoles: [] })

      const updateCall = mockUpdateOne.mock.calls[0]
      expect(updateCall[1].$set.permissions).toContain('manage-roles')
    })

    it('updates role and emits complete', async () => {
      mockFindById.mockResolvedValue({ _id: 'r1', name: 'editor' })
      mockUpdateOne.mockResolvedValue({})

      await updateRoleHandler.handler(socket, { _id: 'r1', display: 'Editor', permissions: ['use-desktop'], useRoles: ['guest'] })

      expect(mockUpdateOne).toHaveBeenCalledWith(
        { _id: 'r1' },
        { $set: { display: 'Editor', permissions: ['use-desktop'], useRoles: ['guest'] } },
      )
      expect(socket.emit).toHaveBeenCalledWith('admin:roles:update-complete', { _id: 'r1' })
    })
  })

  describe('admin:roles:delete', () => {
    it('rejects without manage-roles permission', async () => {
      socket.user.permissions = []

      await deleteRoleHandler.handler(socket, { _id: 'r1' })

      expect(socket.emit).toHaveBeenCalledWith('admin:roles:delete-stopped', { message: 'insufficient permissions' })
    })

    it('rejects deleting admin role', async () => {
      mockFindById.mockResolvedValue({ _id: 'r1', name: 'admin' })

      await deleteRoleHandler.handler(socket, { _id: 'r1' })

      expect(socket.emit).toHaveBeenCalledWith('admin:roles:delete-stopped', { message: 'cannot delete admin role' })
      expect(mockDeleteOne).not.toHaveBeenCalled()
    })

    it('deletes role and emits complete', async () => {
      mockFindById.mockResolvedValue({ _id: 'r1', name: 'editor' })
      mockDeleteOne.mockResolvedValue({})

      await deleteRoleHandler.handler(socket, { _id: 'r1' })

      expect(mockDeleteOne).toHaveBeenCalledWith({ _id: 'r1' })
      expect(socket.emit).toHaveBeenCalledWith('admin:roles:delete-complete', { _id: 'r1' })
    })
  })

  describe('admin:sync-users', () => {
    it('rejects without manage-roles permission', async () => {
      socket.user.permissions = []

      await syncUsersHandler.handler(socket)

      expect(socket.emit).toHaveBeenCalledWith('admin:sync-users-stopped', { message: 'insufficient permissions' })
    })

    it('syncs and emits complete', async () => {
      await syncUsersHandler.handler(socket)

      expect(socket.emit).toHaveBeenCalledWith('admin:sync-users-complete')
    })
  })
})
