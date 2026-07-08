import { HandlerObject, AuthenticatedSocket } from '..'
import { hasPermission } from '../check-permission'
import { App } from '../../app'
import logger from '../../logger'
import crypto from 'crypto'

function randomId() {
  return crypto.randomBytes(8).toString('hex')
}

export const createDatasetHandler: HandlerObject = {
  event: 'datasets:create',
  handler: async (socket: AuthenticatedSocket, data: {
    pid: string, label: string, name?: string
  }) => {
    if (!hasPermission(socket, 'edit-unreal-projects')) {
      socket.emit('datasets:create-stopped', { message: 'insufficient permissions' })
      return
    }

    const DatasetModel = App.models.find(m => m.name === 'datasets')?.model
    if (!DatasetModel) return

    const datasetId = randomId()
    const versionId = randomId()

    const dataset = new DatasetModel({
      pid: data.pid,
      label: data.label,
      name: data.name || data.label,
      datasetId,
      versionId,
      currentVersionId: versionId,
    })
    await dataset.save()

    // Create initial version
    const VersionModel = App.models.find(m => m.name === 'dataset-versions')?.model
    if (VersionModel) {
      const version = new VersionModel({
        pid: data.pid,
        datasetId,
        versionId,
        stats: {},
      })
      await version.save()
    }

    logger.info({ pid: data.pid, label: data.label, by: socket.user?._id }, 'created dataset')
    socket.emit('datasets:create-complete', { _id: dataset._id, datasetId })
  },
}

export const updateDatasetHandler: HandlerObject = {
  event: 'datasets:update',
  handler: async (socket: AuthenticatedSocket, { _id, ...fields }: {
    _id: string, label?: string, name?: string, currentVersionId?: string
  }) => {
    if (!hasPermission(socket, 'edit-unreal-projects')) {
      socket.emit('datasets:update-stopped', { message: 'insufficient permissions' })
      return
    }

    const DatasetModel = App.models.find(m => m.name === 'datasets')?.model
    if (!DatasetModel) return

    const $set: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) $set[key] = value
    }

    const dataset = await DatasetModel.findByIdAndUpdate(_id, { $set })
    if (!dataset) {
      socket.emit('datasets:update-stopped', { message: 'dataset not found' })
      return
    }

    logger.info({ _id, by: socket.user?._id }, 'updated dataset')
    socket.emit('datasets:update-complete', { _id })
  },
}

export const deleteDatasetHandler: HandlerObject = {
  event: 'datasets:delete',
  handler: async (socket: AuthenticatedSocket, { _id, datasetId }: { _id: string, datasetId: string }) => {
    if (!hasPermission(socket, 'edit-unreal-projects')) {
      socket.emit('datasets:delete-stopped', { message: 'insufficient permissions' })
      return
    }

    const DatasetModel = App.models.find(m => m.name === 'datasets')?.model
    if (!DatasetModel) return

    const dataset = await DatasetModel.findByIdAndDelete(_id)
    if (!dataset) {
      socket.emit('datasets:delete-stopped', { message: 'dataset not found' })
      return
    }

    // Clean up versions and items
    const VersionModel = App.models.find(m => m.name === 'dataset-versions')?.model
    if (VersionModel) await VersionModel.deleteMany({ datasetId })

    const ItemModel = App.models.find(m => m.name === 'dataset-items')?.model
    if (ItemModel) await ItemModel.deleteMany({ datasetId })

    logger.info({ _id, datasetId, by: socket.user?._id }, 'deleted dataset')
    socket.emit('datasets:delete-complete', { _id })
  },
}
