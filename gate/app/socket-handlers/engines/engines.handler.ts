import { HandlerObject, AuthenticatedSocket } from '..'
import { hasPermission } from '../check-permission'
import { App } from '../../app'
import logger from '../../logger'

export const createEngineHandler: HandlerObject = {
  event: 'engines:create',
  handler: async (socket: AuthenticatedSocket, { alias, address, port, rePort, cameraNumber }: {
    alias: string, address: string, port?: number, rePort?: number, cameraNumber?: number
  }) => {
    if (!hasPermission(socket, 'manage-engines')) {
      socket.emit('engines:create-stopped', { message: 'insufficient permissions' })
      return
    }

    const EngineModel = App.models.find(m => m.name === 'engines')?.model
    if (!EngineModel) return

    const engine = new EngineModel({
      alias,
      address,
      port: port ?? 30011,
      rePort: rePort ?? 30010,
      cameraNumber: cameraNumber ?? 0,
    })
    await engine.save()

    logger.info({ alias, address, by: socket.user?._id }, 'created engine')
    socket.emit('engines:create-complete', { _id: engine._id })
  },
}

export const updateEngineHandler: HandlerObject = {
  event: 'engines:update',
  handler: async (socket: AuthenticatedSocket, { _id, alias, cameraNumber }: {
    _id: string, alias?: string, cameraNumber?: number
  }) => {
    if (!hasPermission(socket, 'manage-engines')) {
      socket.emit('engines:update-stopped', { message: 'insufficient permissions' })
      return
    }

    const EngineModel = App.models.find(m => m.name === 'engines')?.model
    if (!EngineModel) return

    const $set: Record<string, unknown> = {}
    if (alias !== undefined) $set.alias = alias
    if (cameraNumber !== undefined) $set.cameraNumber = cameraNumber

    const engine = await EngineModel.findByIdAndUpdate(_id, { $set })
    if (!engine) {
      socket.emit('engines:update-stopped', { message: 'engine not found' })
      return
    }

    logger.info({ _id, by: socket.user?._id }, 'updated engine')
    socket.emit('engines:update-complete', { _id })
  },
}

export const deleteEngineHandler: HandlerObject = {
  event: 'engines:delete',
  handler: async (socket: AuthenticatedSocket, { _id }: { _id: string }) => {
    if (!hasPermission(socket, 'manage-engines')) {
      socket.emit('engines:delete-stopped', { message: 'insufficient permissions' })
      return
    }

    const EngineModel = App.models.find(m => m.name === 'engines')?.model
    if (!EngineModel) return

    const engine = await EngineModel.findByIdAndDelete(_id)
    if (!engine) {
      socket.emit('engines:delete-stopped', { message: 'engine not found' })
      return
    }

    // Remove engine from any clusters
    const ClusterModel = App.models.find(m => m.name === 'clusters')?.model
    if (ClusterModel) {
      await ClusterModel.updateMany(
        { engines: _id },
        { $pull: { engines: _id } },
      )
    }

    logger.info({ _id, by: socket.user?._id }, 'deleted engine')
    socket.emit('engines:delete-complete', { _id })
  },
}

export const wakeUpEngineHandler: HandlerObject = {
  event: 'engines:wake-up',
  handler: async (socket: AuthenticatedSocket, { _id }: { _id: string }) => {
    if (!hasPermission(socket, 'manage-engines')) {
      socket.emit('engines:wake-up-stopped', { message: 'insufficient permissions' })
      return
    }

    const EngineModel = App.models.find(m => m.name === 'engines')?.model
    if (!EngineModel) return

    await EngineModel.findByIdAndUpdate(_id, {
      $set: { lastAttempt: Date.now() },
    })

    logger.info({ _id, by: socket.user?._id }, 'woke up engine')
    socket.emit('engines:wake-up-complete', { _id })
  },
}
