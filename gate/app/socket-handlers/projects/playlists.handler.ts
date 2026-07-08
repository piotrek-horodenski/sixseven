import { HandlerObject, AuthenticatedSocket } from '..'
import { hasPermission } from '../check-permission'
import { App } from '../../app'
import logger from '../../logger'

export const createPlaylistHandler: HandlerObject = {
  event: 'playlists:create',
  handler: async (socket: AuthenticatedSocket, data: {
    pid: string, name: string
  }) => {
    if (!hasPermission(socket, 'edit-unreal-projects')) {
      socket.emit('playlists:create-stopped', { message: 'insufficient permissions' })
      return
    }

    const PlaylistModel = App.models.find(m => m.name === 'playlists')?.model
    if (!PlaylistModel) return

    const count = await PlaylistModel.countDocuments({ pid: data.pid })

    const playlist = new PlaylistModel({
      pid: data.pid,
      name: data.name,
      order: count,
      elements: [],
    })
    await playlist.save()

    logger.info({ pid: data.pid, name: data.name, by: socket.user?._id }, 'created playlist')
    socket.emit('playlists:create-complete', { _id: playlist._id })
  },
}

export const updatePlaylistHandler: HandlerObject = {
  event: 'playlists:update',
  handler: async (socket: AuthenticatedSocket, { _id, ...fields }: {
    _id: string, name?: string, order?: number, elements?: any[]
  }) => {
    if (!hasPermission(socket, 'edit-unreal-projects')) {
      socket.emit('playlists:update-stopped', { message: 'insufficient permissions' })
      return
    }

    const PlaylistModel = App.models.find(m => m.name === 'playlists')?.model
    if (!PlaylistModel) return

    const $set: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) $set[key] = value
    }

    const playlist = await PlaylistModel.findByIdAndUpdate(_id, { $set })
    if (!playlist) {
      socket.emit('playlists:update-stopped', { message: 'playlist not found' })
      return
    }

    logger.info({ _id, by: socket.user?._id }, 'updated playlist')
    socket.emit('playlists:update-complete', { _id })
  },
}

export const deletePlaylistHandler: HandlerObject = {
  event: 'playlists:delete',
  handler: async (socket: AuthenticatedSocket, { _id }: { _id: string }) => {
    if (!hasPermission(socket, 'edit-unreal-projects')) {
      socket.emit('playlists:delete-stopped', { message: 'insufficient permissions' })
      return
    }

    const PlaylistModel = App.models.find(m => m.name === 'playlists')?.model
    if (!PlaylistModel) return

    const playlist = await PlaylistModel.findByIdAndDelete(_id)
    if (!playlist) {
      socket.emit('playlists:delete-stopped', { message: 'playlist not found' })
      return
    }

    logger.info({ _id, by: socket.user?._id }, 'deleted playlist')
    socket.emit('playlists:delete-complete', { _id })
  },
}
