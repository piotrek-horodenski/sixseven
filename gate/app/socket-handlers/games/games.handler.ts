import { HandlerObject, AuthenticatedSocket } from '..'
import { GamesClient } from '../../services/games-client'
import logger from '../../logger'

/**
 * Socket-handlery komend meczu (2c). Klient (zalogowany gracz) wysyła komendę
 * socketem; gate mapuje JWT → `playerId` i proxuje ją do games command API.
 * Stan gracz dostaje osobno subskrypcją `matches`/`match_views`.
 *
 * ZASADA BEZPIECZEŃSTWA: `playerId` bierzemy WYŁĄCZNIE z `socket.user._id`
 * (uwierzytelnione JWT) — nigdy z payloadu. Klient nie może podszyć się pod
 * innego gracza. Silnik games dodatkowo waliduje, że gracz należy do meczu.
 *
 * 2c gra na pełnym JWT (bez handoffu/tokenów meczu — to 2d), więc goście
 * (`socket.guest`) jeszcze nie grają: handlery wymagają `socket.user`.
 *
 * Fabryka wstrzykuje klienta games → testy bez sieci.
 */

interface CreateMatchPayload {
  gameId?: unknown
  players?: unknown
  ranked?: unknown
  options?: unknown
}

interface MatchIdPayload {
  matchId?: unknown
}

interface SubmitMovePayload {
  matchId?: unknown
  move?: unknown
}

export function createGamesHandlers(client: GamesClient): HandlerObject[] {
  const createMatchHandler: HandlerObject = {
    event: 'games:create-match',
    handler: async (socket: AuthenticatedSocket, payload: CreateMatchPayload = {}) => {
      const user = socket.user
      if (!user) return

      const { gameId, players, ranked, options } = payload
      if (typeof gameId !== 'string' || !gameId) {
        socket.emit('games:create-match-error', { message: 'gameId required' })
        return
      }

      // Lista graczy z payloadu; twórca (uwierzytelniony) zawsze wchodzi jako
      // pierwszy. 2c bez pokoi/matchmakingu — dobór graczy uszczelnia 2d/Etap 3.
      const requested = Array.isArray(players) ? players.filter((p): p is string => typeof p === 'string') : []
      const playerList = requested.includes(user._id) ? requested : [user._id, ...requested]
      if (playerList.length < 2) {
        socket.emit('games:create-match-error', { message: 'need at least two players' })
        return
      }

      const result = await client.createMatch({
        gameId,
        players: playerList,
        ranked: typeof ranked === 'boolean' ? ranked : undefined,
        options: options && typeof options === 'object' ? (options as Record<string, unknown>) : undefined,
      })

      if (!result.ok) {
        logger.warn({ userId: user._id, gameId, status: result.status }, 'create-match failed')
        socket.emit('games:create-match-error', { message: result.error })
        return
      }

      logger.info({ userId: user._id, gameId, matchId: result.data.matchId }, 'match created')
      socket.emit('games:create-match-complete', { matchId: result.data.matchId })
    },
  }

  const startHandler: HandlerObject = {
    event: 'games:start',
    handler: async (socket: AuthenticatedSocket, payload: MatchIdPayload = {}) => {
      if (!socket.user) return
      const { matchId } = payload
      if (typeof matchId !== 'string' || !matchId) {
        socket.emit('games:start-error', { message: 'matchId required' })
        return
      }

      const result = await client.start(matchId)
      if (!result.ok) {
        socket.emit('games:start-error', { message: result.error })
        return
      }
      socket.emit('games:start-complete', { matchId })
    },
  }

  const submitMoveHandler: HandlerObject = {
    event: 'games:submit-move',
    handler: async (socket: AuthenticatedSocket, payload: SubmitMovePayload = {}) => {
      const user = socket.user
      if (!user) return
      const { matchId, move } = payload
      if (typeof matchId !== 'string' || !matchId) {
        socket.emit('games:submit-move-error', { message: 'matchId required' })
        return
      }

      // playerId ZAWSZE z JWT — nie z payloadu.
      const result = await client.submitMove(matchId, user._id, move)
      if (!result.ok) {
        socket.emit('games:submit-move-error', { message: result.error })
        return
      }
      if (result.data.status === 'rejected') {
        socket.emit('games:submit-move-rejected', { matchId })
        return
      }
      socket.emit('games:submit-move-complete', { matchId })
    },
  }

  const revealDoneHandler: HandlerObject = {
    event: 'games:reveal-done',
    handler: async (socket: AuthenticatedSocket, payload: MatchIdPayload = {}) => {
      if (!socket.user) return
      const { matchId } = payload
      if (typeof matchId !== 'string' || !matchId) {
        socket.emit('games:reveal-done-error', { message: 'matchId required' })
        return
      }

      const result = await client.revealDone(matchId)
      if (!result.ok) {
        socket.emit('games:reveal-done-error', { message: result.error })
        return
      }
      socket.emit('games:reveal-done-complete', { matchId })
    },
  }

  return [createMatchHandler, startHandler, submitMoveHandler, revealDoneHandler]
}
