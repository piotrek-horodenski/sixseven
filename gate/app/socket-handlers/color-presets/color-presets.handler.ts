import { HandlerObject, AuthenticatedSocket } from '..'
import { App } from '../../app'
import logger from '../../logger'

export const createColorPresetHandler: HandlerObject = {
  event: 'color-presets:create',
  handler: async (socket: AuthenticatedSocket, { hex }: { hex: string }) => {
    if (!socket.user) return

    const Model = App.models.find(m => m.name === 'color-presets')?.model
    if (!Model) return

    const normalized = hex.toLowerCase()
    const existing = await Model.findOne({ hex: normalized })
    if (existing) {
      socket.emit('color-presets:create-stopped', { message: 'color preset already exists' })
      return
    }

    const preset = new Model({ hex: normalized })
    await preset.save()

    logger.info({ hex: normalized, by: socket.user._id }, 'created color preset')
    socket.emit('color-presets:create-complete', { _id: preset._id })
  },
}

export const deleteColorPresetHandler: HandlerObject = {
  event: 'color-presets:delete',
  handler: async (socket: AuthenticatedSocket, { _id }: { _id: string }) => {
    if (!socket.user) return

    const Model = App.models.find(m => m.name === 'color-presets')?.model
    if (!Model) return

    const preset = await Model.findByIdAndDelete(_id)
    if (!preset) {
      socket.emit('color-presets:delete-stopped', { message: 'color preset not found' })
      return
    }

    logger.info({ _id, by: socket.user._id }, 'deleted color preset')
    socket.emit('color-presets:delete-complete', { _id })
  },
}
