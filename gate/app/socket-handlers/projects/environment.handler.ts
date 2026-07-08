import { HandlerObject, AuthenticatedSocket } from '..'
import { hasPermission } from '../check-permission'
import { App } from '../../app'
import logger from '../../logger'

export const saveEnvironmentHandler: HandlerObject = {
  event: 'environments:save',
  handler: async (socket: AuthenticatedSocket, data: {
    pid: string, id?: string, items: any[]
  }) => {
    if (!hasPermission(socket, 'edit-unreal-projects')) {
      socket.emit('environments:save-stopped', { message: 'insufficient permissions' })
      return
    }

    const EnvModel = App.models.find(m => m.name === 'environments')?.model
    if (!EnvModel) return

    const envId = data.id || '_'

    const existing = await EnvModel.findOne({ pid: data.pid, id: envId })
    if (existing) {
      await EnvModel.findByIdAndUpdate(existing._id, { $set: { items: data.items } })
    } else {
      const env = new EnvModel({
        pid: data.pid,
        id: envId,
        items: data.items,
      })
      await env.save()
    }

    logger.info({ pid: data.pid, id: envId, by: socket.user?._id }, 'saved environment parameters')
    socket.emit('environments:save-complete', { pid: data.pid, id: envId })
  },
}

export const deleteEnvironmentHandler: HandlerObject = {
  event: 'environments:delete',
  handler: async (socket: AuthenticatedSocket, { _id }: { _id: string }) => {
    if (!hasPermission(socket, 'edit-unreal-projects')) {
      socket.emit('environments:delete-stopped', { message: 'insufficient permissions' })
      return
    }

    const EnvModel = App.models.find(m => m.name === 'environments')?.model
    if (!EnvModel) return

    const env = await EnvModel.findByIdAndDelete(_id)
    if (!env) {
      socket.emit('environments:delete-stopped', { message: 'environment not found' })
      return
    }

    logger.info({ _id, by: socket.user?._id }, 'deleted environment')
    socket.emit('environments:delete-complete', { _id })
  },
}
