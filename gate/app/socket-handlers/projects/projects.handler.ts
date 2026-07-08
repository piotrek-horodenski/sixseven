import { HandlerObject, AuthenticatedSocket } from '..'
import { hasPermission } from '../check-permission'
import { App } from '../../app'
import logger from '../../logger'

export const createProjectHandler: HandlerObject = {
  event: 'projects:create',
  handler: async (socket: AuthenticatedSocket, data: {
    name: string, displayName?: string, map?: string, source?: string,
    type?: string, env?: string, concept?: string
  }) => {
    if (!hasPermission(socket, 'edit-unreal-projects')) {
      socket.emit('projects:create-stopped', { message: 'insufficient permissions' })
      return
    }

    const ProjectModel = App.models.find(m => m.name === 'projects')?.model
    if (!ProjectModel) return

    const project = new ProjectModel({
      name: data.name,
      displayName: data.displayName || '',
      map: data.map || '',
      source: data.source || '',
      type: data.type || 'standalone',
      env: data.env || '',
      concept: data.concept || '',
    })
    await project.save()

    logger.info({ name: data.name, by: socket.user?._id }, 'created project')
    socket.emit('projects:create-complete', { _id: project._id })
  },
}

export const updateProjectHandler: HandlerObject = {
  event: 'projects:update',
  handler: async (socket: AuthenticatedSocket, { _id, ...fields }: {
    _id: string, name?: string, displayName?: string, map?: string, source?: string,
    type?: string, env?: string, devEngine?: string, concept?: string,
    useStandalone?: boolean, useBatch?: boolean, productionReady?: boolean
  }) => {
    if (!hasPermission(socket, 'edit-unreal-projects')) {
      socket.emit('projects:update-stopped', { message: 'insufficient permissions' })
      return
    }

    const ProjectModel = App.models.find(m => m.name === 'projects')?.model
    if (!ProjectModel) return

    const $set: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) $set[key] = value
    }

    const project = await ProjectModel.findByIdAndUpdate(_id, { $set })
    if (!project) {
      socket.emit('projects:update-stopped', { message: 'project not found' })
      return
    }

    logger.info({ _id, by: socket.user?._id }, 'updated project')
    socket.emit('projects:update-complete', { _id })
  },
}

export const deleteProjectHandler: HandlerObject = {
  event: 'projects:delete',
  handler: async (socket: AuthenticatedSocket, { _id }: { _id: string }) => {
    if (!hasPermission(socket, 'edit-unreal-projects')) {
      socket.emit('projects:delete-stopped', { message: 'insufficient permissions' })
      return
    }

    const ProjectModel = App.models.find(m => m.name === 'projects')?.model
    if (!ProjectModel) return

    const project = await ProjectModel.findByIdAndDelete(_id)
    if (!project) {
      socket.emit('projects:delete-stopped', { message: 'project not found' })
      return
    }

    logger.info({ _id, by: socket.user?._id }, 'deleted project')
    socket.emit('projects:delete-complete', { _id })
  },
}

export const assignConceptHandler: HandlerObject = {
  event: 'projects:assign-concept',
  handler: async (socket: AuthenticatedSocket, { _id, concept }: {
    _id: string, concept: string
  }) => {
    if (!hasPermission(socket, 'edit-unreal-projects')) {
      socket.emit('projects:assign-concept-stopped', { message: 'insufficient permissions' })
      return
    }

    const ProjectModel = App.models.find(m => m.name === 'projects')?.model
    if (!ProjectModel) return

    const project = await ProjectModel.findByIdAndUpdate(_id, { $set: { concept } })
    if (!project) {
      socket.emit('projects:assign-concept-stopped', { message: 'project not found' })
      return
    }

    logger.info({ _id, concept, by: socket.user?._id }, 'assigned concept to project')
    socket.emit('projects:assign-concept-complete', { _id })
  },
}

export const lockProjectHandler: HandlerObject = {
  event: 'projects:lock',
  handler: async (socket: AuthenticatedSocket, { _id }: { _id: string }) => {
    if (!hasPermission(socket, 'control-unreal-projects')) {
      socket.emit('projects:lock-stopped', { message: 'insufficient permissions' })
      return
    }

    const ProjectModel = App.models.find(m => m.name === 'projects')?.model
    if (!ProjectModel) return

    const project = await ProjectModel.findByIdAndUpdate(_id, { $set: { locked: true } })
    if (!project) {
      socket.emit('projects:lock-stopped', { message: 'project not found' })
      return
    }

    logger.info({ _id, by: socket.user?._id }, 'locked project')
    socket.emit('projects:lock-complete', { _id })
  },
}

export const unlockProjectHandler: HandlerObject = {
  event: 'projects:unlock',
  handler: async (socket: AuthenticatedSocket, { _id }: { _id: string }) => {
    if (!hasPermission(socket, 'control-unreal-projects')) {
      socket.emit('projects:unlock-stopped', { message: 'insufficient permissions' })
      return
    }

    const ProjectModel = App.models.find(m => m.name === 'projects')?.model
    if (!ProjectModel) return

    const project = await ProjectModel.findByIdAndUpdate(_id, { $set: { locked: false } })
    if (!project) {
      socket.emit('projects:unlock-stopped', { message: 'project not found' })
      return
    }

    logger.info({ _id, by: socket.user?._id }, 'unlocked project')
    socket.emit('projects:unlock-complete', { _id })
  },
}
