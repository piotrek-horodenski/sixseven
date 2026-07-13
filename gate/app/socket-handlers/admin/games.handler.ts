import { HandlerObject, AuthenticatedSocket } from '..'
import { hasPermission } from '../check-permission'
import { GamesClient } from '../../services/games-client'
import logger from '../../logger'

/**
 * Moderacja katalogu gier (4d): approve/unpublish. Autoryzacja PO STRONIE GATE
 * uprawnieniem `manage-games` (istniejący mechanizm check-permission — rola
 * admin z seedu); games wykonuje samą zmianę statusu przez command API.
 *
 * Błędy wg wzorca `<event>-error { message }` (kontrakt §3). Klient games
 * WSTRZYKIWANY → testy bez sieci.
 */

interface GameIdPayload {
  gameId?: unknown
}

export function createAdminGamesHandlers(client: GamesClient): HandlerObject[] {
  const approveHandler: HandlerObject = {
    event: 'admin:games-approve',
    handler: async (socket: AuthenticatedSocket, payload: GameIdPayload = {}) => {
      if (!hasPermission(socket, 'manage-games')) {
        socket.emit('admin:games-approve-error', { message: 'insufficient permissions' })
        return
      }

      const { gameId } = payload
      if (typeof gameId !== 'string' || !gameId) {
        socket.emit('admin:games-approve-error', { message: 'gameId required' })
        return
      }

      const result = await client.approveGame(gameId)
      if (!result.ok) {
        socket.emit('admin:games-approve-error', { message: result.error })
        return
      }
      logger.info({ gameId, by: socket.user?._id }, 'game approved (published)')
      socket.emit('admin:games-approve-complete', { gameId })
    },
  }

  const unpublishHandler: HandlerObject = {
    event: 'admin:games-unpublish',
    handler: async (socket: AuthenticatedSocket, payload: GameIdPayload = {}) => {
      if (!hasPermission(socket, 'manage-games')) {
        socket.emit('admin:games-unpublish-error', { message: 'insufficient permissions' })
        return
      }

      const { gameId } = payload
      if (typeof gameId !== 'string' || !gameId) {
        socket.emit('admin:games-unpublish-error', { message: 'gameId required' })
        return
      }

      const result = await client.unpublishGame(gameId)
      if (!result.ok) {
        socket.emit('admin:games-unpublish-error', { message: result.error })
        return
      }
      logger.info({ gameId, by: socket.user?._id }, 'game unpublished')
      socket.emit('admin:games-unpublish-complete', { gameId })
    },
  }

  return [approveHandler, unpublishHandler]
}
