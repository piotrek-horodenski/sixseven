import { HandlerObject, AuthenticatedSocket } from '..'
import { hasPermission } from '../check-permission'
import { App } from '../../app'
import logger from '../../logger'

export const createStudioPresetHandler: HandlerObject = {
  event: 'studio-presets:create',
  handler: async (socket: AuthenticatedSocket, data: {
    pid: string, name: string, cameraIndex?: number,
    position?: Record<string, number>, rotation?: Record<string, number>, aperture?: number
  }) => {
    if (!hasPermission(socket, 'configure-unreal-studio')) {
      socket.emit('studio-presets:create-stopped', { message: 'insufficient permissions' })
      return
    }

    const PresetModel = App.models.find(m => m.name === 'studio-presets')?.model
    if (!PresetModel) return

    const preset = new PresetModel({
      pid: data.pid,
      name: data.name,
      cameraIndex: data.cameraIndex ?? 0,
      position: data.position ?? { X: 0, Y: 0, Z: 0 },
      rotation: data.rotation ?? { Pitch: 0, Roll: 0, Yaw: 0 },
      aperture: data.aperture ?? 0,
    })
    await preset.save()

    logger.info({ pid: data.pid, name: data.name, by: socket.user?._id }, 'created studio preset')
    socket.emit('studio-presets:create-complete', { _id: preset._id })
  },
}

export const deleteStudioPresetHandler: HandlerObject = {
  event: 'studio-presets:delete',
  handler: async (socket: AuthenticatedSocket, { _id }: { _id: string }) => {
    if (!hasPermission(socket, 'configure-unreal-studio')) {
      socket.emit('studio-presets:delete-stopped', { message: 'insufficient permissions' })
      return
    }

    const PresetModel = App.models.find(m => m.name === 'studio-presets')?.model
    if (!PresetModel) return

    const preset = await PresetModel.findByIdAndDelete(_id)
    if (!preset) {
      socket.emit('studio-presets:delete-stopped', { message: 'preset not found' })
      return
    }

    logger.info({ _id, by: socket.user?._id }, 'deleted studio preset')
    socket.emit('studio-presets:delete-complete', { _id })
  },
}

export const createMasksPresetHandler: HandlerObject = {
  event: 'masks-presets:create',
  handler: async (socket: AuthenticatedSocket, data: {
    pid: string, name: string, masks?: any[]
  }) => {
    if (!hasPermission(socket, 'configure-unreal-studio')) {
      socket.emit('masks-presets:create-stopped', { message: 'insufficient permissions' })
      return
    }

    const MasksModel = App.models.find(m => m.name === 'masks-presets')?.model
    if (!MasksModel) return

    const defaultMask = {
      active: false,
      position: { X: 0, Y: 0, Z: 0 },
      rotation: { Pitch: 0, Roll: 0, Yaw: 0 },
      scale: { X: 1, Y: 1, Z: 1 },
    }

    const preset = new MasksModel({
      pid: data.pid,
      name: data.name,
      masks: data.masks ?? Array.from({ length: 6 }, () => ({ ...defaultMask })),
    })
    await preset.save()

    logger.info({ pid: data.pid, name: data.name, by: socket.user?._id }, 'created masks preset')
    socket.emit('masks-presets:create-complete', { _id: preset._id })
  },
}

export const deleteMasksPresetHandler: HandlerObject = {
  event: 'masks-presets:delete',
  handler: async (socket: AuthenticatedSocket, { _id }: { _id: string }) => {
    if (!hasPermission(socket, 'configure-unreal-studio')) {
      socket.emit('masks-presets:delete-stopped', { message: 'insufficient permissions' })
      return
    }

    const MasksModel = App.models.find(m => m.name === 'masks-presets')?.model
    if (!MasksModel) return

    const preset = await MasksModel.findByIdAndDelete(_id)
    if (!preset) {
      socket.emit('masks-presets:delete-stopped', { message: 'preset not found' })
      return
    }

    logger.info({ _id, by: socket.user?._id }, 'deleted masks preset')
    socket.emit('masks-presets:delete-complete', { _id })
  },
}
