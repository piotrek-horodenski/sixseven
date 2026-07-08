import { HandlerObject, AuthenticatedSocket } from '..'
import { hasPermission } from '../check-permission'
import { App } from '../../app'
import { syncAllUsers } from '../../services/sync-users.service'
import logger from '../../logger'

export const createRoleHandler: HandlerObject = {
  event: 'admin:roles:create',
  handler: async (socket: AuthenticatedSocket, { name, display, permissions, useRoles }: {
    name: string, display: string, permissions: string[], useRoles: string[]
  }) => {
    if (!hasPermission(socket, 'manage-roles')) {
      socket.emit('admin:roles:create-stopped', { message: 'insufficient permissions' })
      return
    }

    const RoleModel = App.models.find(m => m.name === 'roles')?.model
    if (!RoleModel) return

    const existing = await RoleModel.findOne({ name })
    if (existing) {
      socket.emit('admin:roles:create-stopped', { message: 'role name already exists' })
      return
    }

    const role = new RoleModel({ name, display, permissions: permissions || [], useRoles: useRoles || [] })
    await role.save()
    await syncAllUsers()

    logger.info({ name, by: socket.user?._id }, 'created role')
    socket.emit('admin:roles:create-complete', { _id: role._id })
  },
}

export const updateRoleHandler: HandlerObject = {
  event: 'admin:roles:update',
  handler: async (socket: AuthenticatedSocket, { _id, display, permissions, useRoles }: {
    _id: string, display: string, permissions: string[], useRoles: string[]
  }) => {
    if (!hasPermission(socket, 'manage-roles')) {
      socket.emit('admin:roles:update-stopped', { message: 'insufficient permissions' })
      return
    }

    const RoleModel = App.models.find(m => m.name === 'roles')?.model
    if (!RoleModel) return

    const role = await RoleModel.findById(_id)
    if (!role) {
      socket.emit('admin:roles:update-stopped', { message: 'role not found' })
      return
    }

    // Protect admin role's core permissions
    const roleName = (role as any).name
    let safePermissions = permissions
    if (roleName === 'admin') {
      const protectedPerms = ['manage-users', 'manage-roles', 'view-admin']
      for (const p of protectedPerms) {
        if (!safePermissions.includes(p)) {
          safePermissions = [...safePermissions, p]
        }
      }
    }

    await RoleModel.updateOne({ _id }, {
      $set: {
        display,
        permissions: safePermissions,
        useRoles: useRoles || [],
      },
    })
    await syncAllUsers()

    logger.info({ _id, roleName, by: socket.user?._id }, 'updated role')
    socket.emit('admin:roles:update-complete', { _id })
  },
}

export const deleteRoleHandler: HandlerObject = {
  event: 'admin:roles:delete',
  handler: async (socket: AuthenticatedSocket, { _id }: { _id: string }) => {
    if (!hasPermission(socket, 'manage-roles')) {
      socket.emit('admin:roles:delete-stopped', { message: 'insufficient permissions' })
      return
    }

    const RoleModel = App.models.find(m => m.name === 'roles')?.model
    if (!RoleModel) return

    const role = await RoleModel.findById(_id)
    if (!role) {
      socket.emit('admin:roles:delete-stopped', { message: 'role not found' })
      return
    }

    if ((role as any).name === 'admin') {
      socket.emit('admin:roles:delete-stopped', { message: 'cannot delete admin role' })
      return
    }

    await RoleModel.deleteOne({ _id })
    await syncAllUsers()

    logger.info({ _id, roleName: (role as any).name, by: socket.user?._id }, 'deleted role')
    socket.emit('admin:roles:delete-complete', { _id })
  },
}

export const syncUsersHandler: HandlerObject = {
  event: 'admin:sync-users',
  handler: async (socket: AuthenticatedSocket) => {
    if (!hasPermission(socket, 'manage-roles')) {
      socket.emit('admin:sync-users-stopped', { message: 'insufficient permissions' })
      return
    }

    await syncAllUsers()
    socket.emit('admin:sync-users-complete')
  },
}
