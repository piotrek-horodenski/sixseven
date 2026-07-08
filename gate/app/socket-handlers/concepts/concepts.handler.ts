import { HandlerObject, AuthenticatedSocket } from '..'
import { hasPermission } from '../check-permission'
import { App } from '../../app'
import logger from '../../logger'

export const createConceptHandler: HandlerObject = {
  event: 'concepts:create',
  handler: async (socket: AuthenticatedSocket, { name, description }: {
    name: string, description?: string
  }) => {
    if (!hasPermission(socket, 'edit-unreal-projects')) {
      socket.emit('concepts:create-stopped', { message: 'insufficient permissions' })
      return
    }

    const ConceptModel = App.models.find(m => m.name === 'concepts')?.model
    if (!ConceptModel) return

    const existing = await ConceptModel.findOne({ name })
    if (existing) {
      socket.emit('concepts:create-stopped', { message: 'concept name already exists' })
      return
    }

    const concept = new ConceptModel({
      name,
      description: description || '',
    })
    await concept.save()

    logger.info({ name, by: socket.user?._id }, 'created concept')
    socket.emit('concepts:create-complete', { _id: concept._id })
  },
}

export const updateConceptHandler: HandlerObject = {
  event: 'concepts:update',
  handler: async (socket: AuthenticatedSocket, { _id, name, description }: {
    _id: string, name?: string, description?: string
  }) => {
    if (!hasPermission(socket, 'edit-unreal-projects')) {
      socket.emit('concepts:update-stopped', { message: 'insufficient permissions' })
      return
    }

    const ConceptModel = App.models.find(m => m.name === 'concepts')?.model
    if (!ConceptModel) return

    if (name) {
      const existing = await ConceptModel.findOne({ name, _id: { $ne: _id } })
      if (existing) {
        socket.emit('concepts:update-stopped', { message: 'concept name already exists' })
        return
      }
    }

    const $set: Record<string, unknown> = {}
    if (name !== undefined) $set.name = name
    if (description !== undefined) $set.description = description

    const concept = await ConceptModel.findByIdAndUpdate(_id, { $set })
    if (!concept) {
      socket.emit('concepts:update-stopped', { message: 'concept not found' })
      return
    }

    logger.info({ _id, by: socket.user?._id }, 'updated concept')
    socket.emit('concepts:update-complete', { _id })
  },
}

export const deleteConceptHandler: HandlerObject = {
  event: 'concepts:delete',
  handler: async (socket: AuthenticatedSocket, { _id }: { _id: string }) => {
    if (!hasPermission(socket, 'edit-unreal-projects')) {
      socket.emit('concepts:delete-stopped', { message: 'insufficient permissions' })
      return
    }

    const ConceptModel = App.models.find(m => m.name === 'concepts')?.model
    if (!ConceptModel) return

    const ProjectModel = App.models.find(m => m.name === 'projects')?.model
    if (ProjectModel) {
      const projectCount = await ProjectModel.countDocuments({ concept: _id })
      if (projectCount > 0) {
        socket.emit('concepts:delete-stopped', { message: 'concept has assigned projects' })
        return
      }
    }

    const concept = await ConceptModel.findByIdAndDelete(_id)
    if (!concept) {
      socket.emit('concepts:delete-stopped', { message: 'concept not found' })
      return
    }

    logger.info({ _id, by: socket.user?._id }, 'deleted concept')
    socket.emit('concepts:delete-complete', { _id })
  },
}
