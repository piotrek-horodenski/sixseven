import { HandlerObject, AuthenticatedSocket } from '..'
import { hasPermission } from '../check-permission'
import { App } from '../../app'
import logger from '../../logger'

export const createClusterHandler: HandlerObject = {
  event: 'clusters:create',
  handler: async (socket: AuthenticatedSocket, { alias, engines }: {
    alias: string, engines?: string[]
  }) => {
    if (!hasPermission(socket, 'manage-engines')) {
      socket.emit('clusters:create-stopped', { message: 'insufficient permissions' })
      return
    }

    const ClusterModel = App.models.find(m => m.name === 'clusters')?.model
    if (!ClusterModel) return

    const existing = await ClusterModel.findOne({ alias })
    if (existing) {
      socket.emit('clusters:create-stopped', { message: 'cluster alias already exists' })
      return
    }

    const cluster = new ClusterModel({
      alias,
      engines: engines || [],
    })
    await cluster.save()

    logger.info({ alias, by: socket.user?._id }, 'created cluster')
    socket.emit('clusters:create-complete', { _id: cluster._id })
  },
}

export const updateClusterHandler: HandlerObject = {
  event: 'clusters:update',
  handler: async (socket: AuthenticatedSocket, { _id, alias, engines }: {
    _id: string, alias?: string, engines?: string[]
  }) => {
    if (!hasPermission(socket, 'manage-engines')) {
      socket.emit('clusters:update-stopped', { message: 'insufficient permissions' })
      return
    }

    const ClusterModel = App.models.find(m => m.name === 'clusters')?.model
    if (!ClusterModel) return

    if (alias) {
      const existing = await ClusterModel.findOne({ alias, _id: { $ne: _id } })
      if (existing) {
        socket.emit('clusters:update-stopped', { message: 'cluster alias already exists' })
        return
      }
    }

    const $set: Record<string, unknown> = {}
    if (alias !== undefined) $set.alias = alias
    if (engines !== undefined) $set.engines = engines

    const cluster = await ClusterModel.findByIdAndUpdate(_id, { $set })
    if (!cluster) {
      socket.emit('clusters:update-stopped', { message: 'cluster not found' })
      return
    }

    logger.info({ _id, by: socket.user?._id }, 'updated cluster')
    socket.emit('clusters:update-complete', { _id })
  },
}

export const deleteClusterHandler: HandlerObject = {
  event: 'clusters:delete',
  handler: async (socket: AuthenticatedSocket, { _id }: { _id: string }) => {
    if (!hasPermission(socket, 'manage-engines')) {
      socket.emit('clusters:delete-stopped', { message: 'insufficient permissions' })
      return
    }

    const ClusterModel = App.models.find(m => m.name === 'clusters')?.model
    if (!ClusterModel) return

    const cluster = await ClusterModel.findByIdAndDelete(_id)
    if (!cluster) {
      socket.emit('clusters:delete-stopped', { message: 'cluster not found' })
      return
    }

    logger.info({ _id, by: socket.user?._id }, 'deleted cluster')
    socket.emit('clusters:delete-complete', { _id })
  },
}
