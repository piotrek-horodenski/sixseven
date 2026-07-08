import { HandlerObject, AuthenticatedSocket } from '..'
import { hasPermission } from '../check-permission'
import { App } from '../../app'
import logger from '../../logger'

export const createSettingHandler: HandlerObject = {
  event: 'admin:settings:create',
  handler: async (socket: AuthenticatedSocket, { name, display, type, value }: {
    name: string, display: string, type: string, value: unknown
  }) => {
    if (!hasPermission(socket, 'manage-settings')) {
      socket.emit('admin:settings:create-stopped', { message: 'insufficient permissions' })
      return
    }

    const SettingModel = App.models.find(m => m.name === 'settings')?.model
    if (!SettingModel) return

    const existing = await SettingModel.findOne({ name })
    if (existing) {
      socket.emit('admin:settings:create-stopped', { message: 'setting name already exists' })
      return
    }

    const setting = new SettingModel({ name, display, type, value })
    await setting.save()

    logger.info({ name, by: socket.user?._id }, 'created setting')
    socket.emit('admin:settings:create-complete', { _id: setting._id })
  },
}

export const updateSettingHandler: HandlerObject = {
  event: 'admin:settings:update',
  handler: async (socket: AuthenticatedSocket, { _id, value }: {
    _id: string, value: unknown
  }) => {
    if (!hasPermission(socket, 'manage-settings')) {
      socket.emit('admin:settings:update-stopped', { message: 'insufficient permissions' })
      return
    }

    const SettingModel = App.models.find(m => m.name === 'settings')?.model
    if (!SettingModel) return

    const setting = await SettingModel.findOneAndUpdate({ _id }, { $set: { value } })
    if (!setting) {
      socket.emit('admin:settings:update-stopped', { message: 'setting not found' })
      return
    }

    logger.info({ _id, name: (setting as any).name, by: socket.user?._id }, 'updated setting')
    socket.emit('admin:settings:update-complete', { _id })
  },
}

export const deleteSettingHandler: HandlerObject = {
  event: 'admin:settings:delete',
  handler: async (socket: AuthenticatedSocket, { _id }: { _id: string }) => {
    if (!hasPermission(socket, 'manage-settings')) {
      socket.emit('admin:settings:delete-stopped', { message: 'insufficient permissions' })
      return
    }

    const SettingModel = App.models.find(m => m.name === 'settings')?.model
    if (!SettingModel) return

    const setting = await SettingModel.findOneAndDelete({ _id })
    if (!setting) {
      socket.emit('admin:settings:delete-stopped', { message: 'setting not found' })
      return
    }

    logger.info({ _id, name: (setting as any).name, by: socket.user?._id }, 'deleted setting')
    socket.emit('admin:settings:delete-complete', { _id })
  },
}
