import { HandlerObject, AuthenticatedSocket } from '..'
import { hasPermission } from '../check-permission'
import { App } from '../../app'
import logger from '../../logger'
import crypto from 'crypto'

function randomId() {
  return crypto.randomBytes(8).toString('hex')
}

export const createBoardHandler: HandlerObject = {
  event: 'boards:create',
  handler: async (socket: AuthenticatedSocket, data: {
    pid: string, name: string
  }) => {
    if (!hasPermission(socket, 'edit-unreal-projects')) {
      socket.emit('boards:create-stopped', { message: 'insufficient permissions' })
      return
    }

    const BoardModel = App.models.find(m => m.name === 'boards')?.model
    if (!BoardModel) return

    const boardId = randomId()
    const panelId = randomId()

    const board = new BoardModel({
      pid: data.pid,
      name: data.name,
      boardId,
      panelId,
      root: false,
      default: false,
      elements: [],
    })
    await board.save()

    logger.info({ pid: data.pid, name: data.name, by: socket.user?._id }, 'created board')
    socket.emit('boards:create-complete', { _id: board._id })
  },
}

export const updateBoardHandler: HandlerObject = {
  event: 'boards:update',
  handler: async (socket: AuthenticatedSocket, { _id, ...fields }: {
    _id: string, name?: string, public?: boolean, preventAutoLoad?: boolean, elements?: any[]
  }) => {
    if (!hasPermission(socket, 'edit-unreal-projects')) {
      socket.emit('boards:update-stopped', { message: 'insufficient permissions' })
      return
    }

    const BoardModel = App.models.find(m => m.name === 'boards')?.model
    if (!BoardModel) return

    const $set: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) $set[key] = value
    }

    const board = await BoardModel.findByIdAndUpdate(_id, { $set })
    if (!board) {
      socket.emit('boards:update-stopped', { message: 'board not found' })
      return
    }

    logger.info({ _id, by: socket.user?._id }, 'updated board')
    socket.emit('boards:update-complete', { _id })
  },
}

export const deleteBoardHandler: HandlerObject = {
  event: 'boards:delete',
  handler: async (socket: AuthenticatedSocket, { _id }: { _id: string }) => {
    if (!hasPermission(socket, 'edit-unreal-projects')) {
      socket.emit('boards:delete-stopped', { message: 'insufficient permissions' })
      return
    }

    const BoardModel = App.models.find(m => m.name === 'boards')?.model
    if (!BoardModel) return

    const board = await BoardModel.findByIdAndDelete(_id)
    if (!board) {
      socket.emit('boards:delete-stopped', { message: 'board not found' })
      return
    }

    logger.info({ _id, by: socket.user?._id }, 'deleted board')
    socket.emit('boards:delete-complete', { _id })
  },
}
