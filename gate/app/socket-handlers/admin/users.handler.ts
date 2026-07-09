import { HandlerObject, AuthenticatedSocket } from '..'
import { hasPermission } from '../check-permission'
import { App } from '../../app'
import { syncUser } from '../../services/sync-users.service'
import logger from '../../logger'

export const updateUserRolesHandler: HandlerObject = {
  event: 'admin:users:update-roles',
  handler: async (socket: AuthenticatedSocket, { userId, roles }: { userId: string, roles: string[] }) => {
    if (!hasPermission(socket, 'manage-users')) {
      socket.emit('admin:users:update-roles-stopped', { message: 'insufficient permissions' })
      return
    }

    const UserModel = App.models.find(m => m.name === 'users')?.model
    if (!UserModel) return

    const user = await UserModel.findById(userId)
    if (!user) {
      socket.emit('admin:users:update-roles-stopped', { message: 'user not found' })
      return
    }

    await UserModel.updateOne({ _id: userId }, { $set: { roles } })
    await syncUser(userId)

    logger.info({ userId, roles, by: socket.user?._id }, 'updated user roles')
    socket.emit('admin:users:update-roles-complete', { userId })
  },
}

export const deleteUserHandler: HandlerObject = {
  event: 'admin:users:delete',
  handler: async (socket: AuthenticatedSocket, { userId }: { userId: string }) => {
    if (!hasPermission(socket, 'manage-users')) {
      socket.emit('admin:users:delete-stopped', { message: 'insufficient permissions' })
      return
    }

    if (userId === String(socket.user?._id)) {
      socket.emit('admin:users:delete-stopped', { message: 'cannot delete yourself' })
      return
    }

    const UserModel = App.models.find(m => m.name === 'users')?.model
    if (!UserModel) return

    const user = await UserModel.findById(userId)
    if (!user) {
      socket.emit('admin:users:delete-stopped', { message: 'user not found' })
      return
    }

    if ((user as any).roles?.includes('admin')) {
      socket.emit('admin:users:delete-stopped', { message: 'cannot delete a user with admin role' })
      return
    }

    await UserModel.deleteOne({ _id: userId })
    App.subManager.unsubscribe(userId, [])

    logger.info({ userId, by: socket.user?._id }, 'deleted user')
    socket.emit('admin:users:delete-complete', { userId })
  },
}
