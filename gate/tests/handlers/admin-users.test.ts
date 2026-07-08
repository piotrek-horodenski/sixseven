import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockFindById, mockUpdateOne, mockDeleteOne, mockRoleFind } = vi.hoisted(() => ({
  mockFindById: vi.fn(),
  mockUpdateOne: vi.fn(),
  mockDeleteOne: vi.fn(),
  mockRoleFind: vi.fn(),
}))

vi.mock('../../app/app', () => ({
  App: {
    models: [
      { name: 'users', model: { findById: mockFindById, updateOne: mockUpdateOne, deleteOne: mockDeleteOne, find: vi.fn().mockResolvedValue([]) } },
      { name: 'roles', model: { find: mockRoleFind } },
    ],
    subManager: { unsubscribe: vi.fn() },
    io: { sockets: { sockets: new Map() } },
  },
}))

vi.mock('../../app/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { updateUserRolesHandler, deleteUserHandler } from '../../app/socket-handlers/admin/users.handler'

describe('admin users handlers', () => {
  let socket: any

  beforeEach(() => {
    socket = {
      emit: vi.fn(),
      id: 'socket-1',
      user: {
        _id: 'admin-id',
        permissions: ['manage-users', 'manage-roles'],
        roles: ['admin'],
        allRoles: ['admin'],
      },
    }
    vi.clearAllMocks()
    mockRoleFind.mockReturnValue({ lean: () => Promise.resolve([]) })
  })

  describe('admin:users:update-roles', () => {
    it('rejects without manage-users permission', async () => {
      socket.user.permissions = []

      await updateUserRolesHandler.handler(socket, { userId: 'u1', roles: ['editor'] })

      expect(socket.emit).toHaveBeenCalledWith('admin:users:update-roles-stopped', { message: 'insufficient permissions' })
      expect(mockUpdateOne).not.toHaveBeenCalled()
    })

    it('rejects if user not found', async () => {
      mockFindById.mockResolvedValue(null)

      await updateUserRolesHandler.handler(socket, { userId: 'u1', roles: ['editor'] })

      expect(socket.emit).toHaveBeenCalledWith('admin:users:update-roles-stopped', { message: 'user not found' })
    })

    it('updates roles and emits complete', async () => {
      mockFindById.mockResolvedValue({ _id: 'u1', roles: [] })
      mockUpdateOne.mockResolvedValue({})

      await updateUserRolesHandler.handler(socket, { userId: 'u1', roles: ['editor'] })

      expect(mockUpdateOne).toHaveBeenCalledWith({ _id: 'u1' }, { $set: { roles: ['editor'] } })
      expect(socket.emit).toHaveBeenCalledWith('admin:users:update-roles-complete', { userId: 'u1' })
    })
  })

  describe('admin:users:delete', () => {
    it('rejects without manage-users permission', async () => {
      socket.user.permissions = []

      await deleteUserHandler.handler(socket, { userId: 'u1' })

      expect(socket.emit).toHaveBeenCalledWith('admin:users:delete-stopped', { message: 'insufficient permissions' })
      expect(mockDeleteOne).not.toHaveBeenCalled()
    })

    it('rejects deleting yourself', async () => {
      await deleteUserHandler.handler(socket, { userId: 'admin-id' })

      expect(socket.emit).toHaveBeenCalledWith('admin:users:delete-stopped', { message: 'cannot delete yourself' })
      expect(mockDeleteOne).not.toHaveBeenCalled()
    })

    it('deletes user and emits complete', async () => {
      mockDeleteOne.mockResolvedValue({})

      await deleteUserHandler.handler(socket, { userId: 'u1' })

      expect(mockDeleteOne).toHaveBeenCalledWith({ _id: 'u1' })
      expect(socket.emit).toHaveBeenCalledWith('admin:users:delete-complete', { userId: 'u1' })
    })
  })
})
