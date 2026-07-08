import { HandlerObject, AuthenticatedSocket } from '..'
import { hasPermission } from '../check-permission'
import { App } from '../../app'
import logger from '../../logger'

async function getProjectEngines(projectId: string): Promise<any[]> {
  const ProjectModel = App.models.find(m => m.name === 'projects')?.model
  if (!ProjectModel) return []

  const project = await ProjectModel.findById(projectId).lean()
  if (!project) return []

  const p = project as any
  const EngineModel = App.models.find(m => m.name === 'engines')?.model
  if (!EngineModel) return []

  if (p.type === 'cluster') {
    const ClusterModel = App.models.find(m => m.name === 'clusters')?.model
    if (!ClusterModel) return []
    const cluster = await ClusterModel.findById(p.env).lean() as any
    if (!cluster?.engines?.length) return []
    const engines = await EngineModel.find({ _id: { $in: cluster.engines } }).lean()
    return engines
  }

  if (p.env) {
    const engine = await EngineModel.findById(p.env).lean()
    return engine ? [engine] : []
  }

  return []
}

export const loadProjectHandler: HandlerObject = {
  event: 'projects:load',
  handler: async (socket: AuthenticatedSocket, { _id, editor }: { _id: string, editor?: boolean }) => {
    if (!hasPermission(socket, 'load-and-clear-unreal-projects')) {
      socket.emit('projects:load-stopped', { message: 'insufficient permissions' })
      return
    }

    const ProjectModel = App.models.find(m => m.name === 'projects')?.model
    if (!ProjectModel) return

    const project = await ProjectModel.findById(_id).lean() as any
    if (!project) {
      socket.emit('projects:load-stopped', { message: 'project not found' })
      return
    }

    if (project.locked) {
      socket.emit('projects:load-stopped', { message: 'project is locked' })
      return
    }

    const engines = await getProjectEngines(_id)
    if (!engines.length) {
      socket.emit('projects:load-stopped', { message: 'no engines configured' })
      return
    }

    const errors: string[] = []

    for (const engine of engines) {
      try {
        const url = `http://${engine.address}:${engine.port}/start`
        const body = {
          id: project.name,
          map: project.map,
          source: project.source,
          standalone: project.useStandalone,
          editor: !!editor,
        }

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10000),
        })

        if (!response.ok) {
          errors.push(`${engine.alias}: HTTP ${response.status}`)
        }
      } catch (err: any) {
        errors.push(`${engine.alias}: ${err.message}`)
      }
    }

    // Update engine states
    const EngineModel = App.models.find(m => m.name === 'engines')?.model
    if (EngineModel) {
      for (const engine of engines) {
        await EngineModel.findByIdAndUpdate(engine._id, {
          $set: {
            assignedProject: project.name,
            assignedProjectId: _id,
            locked: true,
          },
        })
      }
    }

    if (errors.length) {
      logger.warn({ _id, errors, by: socket.user?._id }, 'loaded project with errors')
      socket.emit('projects:load-complete', { _id, errors })
    } else {
      logger.info({ _id, engineCount: engines.length, by: socket.user?._id }, 'loaded project')
      socket.emit('projects:load-complete', { _id })
    }
  },
}

export const unloadProjectHandler: HandlerObject = {
  event: 'projects:unload',
  handler: async (socket: AuthenticatedSocket, { _id }: { _id: string }) => {
    if (!hasPermission(socket, 'load-and-clear-unreal-projects')) {
      socket.emit('projects:unload-stopped', { message: 'insufficient permissions' })
      return
    }

    const ProjectModel = App.models.find(m => m.name === 'projects')?.model
    if (!ProjectModel) return

    const project = await ProjectModel.findById(_id).lean() as any
    if (!project) {
      socket.emit('projects:unload-stopped', { message: 'project not found' })
      return
    }

    const engines = await getProjectEngines(_id)
    const errors: string[] = []

    for (const engine of engines) {
      try {
        const url = `http://${engine.address}:${engine.port}/stop`
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(10000),
        })

        if (!response.ok) {
          errors.push(`${engine.alias}: HTTP ${response.status}`)
        }
      } catch (err: any) {
        errors.push(`${engine.alias}: ${err.message}`)
      }
    }

    // Reset engine states
    const EngineModel = App.models.find(m => m.name === 'engines')?.model
    if (EngineModel) {
      for (const engine of engines) {
        await EngineModel.findByIdAndUpdate(engine._id, {
          $set: {
            assignedProject: '',
            assignedProjectId: '',
            initialized: false,
            locked: false,
          },
        })
      }
    }

    if (errors.length) {
      logger.warn({ _id, errors, by: socket.user?._id }, 'unloaded project with errors')
    } else {
      logger.info({ _id, by: socket.user?._id }, 'unloaded project')
    }
    socket.emit('projects:unload-complete', { _id, errors: errors.length ? errors : undefined })
  },
}

export const syncProjectHandler: HandlerObject = {
  event: 'projects:sync',
  handler: async (socket: AuthenticatedSocket, { _id }: { _id: string }) => {
    if (!hasPermission(socket, 'load-and-clear-unreal-projects')) {
      socket.emit('projects:sync-stopped', { message: 'insufficient permissions' })
      return
    }

    const ProjectModel = App.models.find(m => m.name === 'projects')?.model
    if (!ProjectModel) return

    const project = await ProjectModel.findById(_id).lean() as any
    if (!project) {
      socket.emit('projects:sync-stopped', { message: 'project not found' })
      return
    }

    const engines = await getProjectEngines(_id)
    const errors: string[] = []

    for (const engine of engines) {
      try {
        const url = `http://${engine.address}:${engine.port}/sync`
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: project.name,
            source: project.source,
            map: project.map,
          }),
          signal: AbortSignal.timeout(10000),
        })

        if (!response.ok) {
          errors.push(`${engine.alias}: HTTP ${response.status}`)
        }
      } catch (err: any) {
        errors.push(`${engine.alias}: ${err.message}`)
      }
    }

    logger.info({ _id, by: socket.user?._id }, 'synced project')
    socket.emit('projects:sync-complete', { _id, errors: errors.length ? errors : undefined })
  },
}

export const resetProjectHandler: HandlerObject = {
  event: 'projects:reset',
  handler: async (socket: AuthenticatedSocket, { _id }: { _id: string }) => {
    if (!hasPermission(socket, 'edit-unreal-projects')) {
      socket.emit('projects:reset-stopped', { message: 'insufficient permissions' })
      return
    }

    const ProjectModel = App.models.find(m => m.name === 'projects')?.model
    if (!ProjectModel) return

    await ProjectModel.findByIdAndUpdate(_id, {
      $set: {
        locked: false,
        globalAdjustments: {
          position: { X: 0, Y: 0, Z: 0 },
          rotation: { Pitch: 0, Roll: 0, Yaw: 0 },
          temporaryPosition: { X: 0, Y: 0, Z: 0 },
          temporaryRotation: { Pitch: 0, Roll: 0, Yaw: 0 },
        },
      },
    })

    // Unlock related engines
    const engines = await getProjectEngines(_id)
    const EngineModel = App.models.find(m => m.name === 'engines')?.model
    if (EngineModel) {
      for (const engine of engines) {
        await EngineModel.findByIdAndUpdate(engine._id, {
          $set: {
            assignedProject: '',
            assignedProjectId: '',
            initialized: false,
            locked: false,
          },
        })
      }
    }

    logger.info({ _id, by: socket.user?._id }, 'reset project')
    socket.emit('projects:reset-complete', { _id })
  },
}

export const loadDefsHandler: HandlerObject = {
  event: 'projects:load-defs',
  handler: async (socket: AuthenticatedSocket, { _id }: { _id: string }) => {
    if (!hasPermission(socket, 'edit-unreal-projects')) {
      socket.emit('projects:load-defs-stopped', { message: 'insufficient permissions' })
      return
    }

    const ProjectModel = App.models.find(m => m.name === 'projects')?.model
    if (!ProjectModel) return

    const project = await ProjectModel.findById(_id).lean() as any
    if (!project) {
      socket.emit('projects:load-defs-stopped', { message: 'project not found' })
      return
    }

    // Find target engine (devEngine or first available)
    const EngineModel = App.models.find(m => m.name === 'engines')?.model
    if (!EngineModel) return

    let engine: any = null
    if (project.devEngine) {
      engine = await EngineModel.findById(project.devEngine).lean()
    }
    if (!engine) {
      const engines = await getProjectEngines(_id)
      engine = engines[0]
    }
    if (!engine) {
      socket.emit('projects:load-defs-stopped', { message: 'no engine available' })
      return
    }

    try {
      // Fetch presets from Remote Control API
      const presetsUrl = `http://${engine.address}:${engine.rePort}/remote/presets`
      const presetsResponse = await fetch(presetsUrl, {
        signal: AbortSignal.timeout(10000),
      })

      if (!presetsResponse.ok) {
        socket.emit('projects:load-defs-stopped', { message: `engine responded with ${presetsResponse.status}` })
        return
      }

      const presetsData = await presetsResponse.json()

      // Store definitions
      await ProjectModel.findByIdAndUpdate(_id, {
        $set: { definitions: presetsData },
      })

      logger.info({ _id, engine: engine.alias, by: socket.user?._id }, 'loaded project definitions')
      socket.emit('projects:load-defs-complete', { _id })
    } catch (err: any) {
      logger.error({ _id, error: err.message }, 'failed to load project definitions')
      socket.emit('projects:load-defs-stopped', { message: err.message })
    }
  },
}
