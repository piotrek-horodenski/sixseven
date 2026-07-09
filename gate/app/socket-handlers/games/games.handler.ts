import { HandlerObject, AuthenticatedSocket } from '..'
import { GamesClient } from '../../services/games-client'
import { issueHandoffCode } from '../../services/tokens.service'
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

export interface GamesHandlersDeps {
  /**
   * Wystawia jednorazowy kod handoff dla (matchId, subjectId). Wstrzykiwalny
   * (testy). Domyślnie czyta sekret z settings LENIWIE, więc import tego modułu
   * nie odpala walidacji env.
   */
  issueHandoff?: (claims: { matchId: string; subjectId: string }) => string
}

function defaultIssueHandoff(claims: { matchId: string; subjectId: string }): string {
  // Leniwy odczyt settings — bez efektu ubocznego przy imporcie barrela/testach.
  const { SettingsService } = require('../../settings.service') as typeof import('../../settings.service')
  return issueHandoffCode(SettingsService().jwtSecret, claims)
}

export function createGamesHandlers(client: GamesClient, deps: GamesHandlersDeps = {}): HandlerObject[] {
  const issueHandoff = deps.issueHandoff ?? defaultIssueHandoff
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
      const matchScope = socket.match
      const user = socket.user
      // Gra składa ruch albo pełnym JWT (user), albo tokenem meczu (match).
      // Gość (socket.guest) NIE składa ruchów — gra tokenem match po handoffie.
      if (!matchScope && !user) return

      const { matchId, move } = payload
      if (typeof matchId !== 'string' || !matchId) {
        socket.emit('games:submit-move-error', { message: 'matchId required' })
        return
      }

      // playerId ZAWSZE z tożsamości tokenu — nigdy z payloadu. Token meczu jest
      // scoped do jednego meczu: wymuszamy zgodność matchId.
      let playerId: string
      if (matchScope) {
        if (matchId !== matchScope.matchId) {
          socket.emit('games:submit-move-error', { message: 'match token scope mismatch' })
          return
        }
        playerId = matchScope.playerId
      } else {
        playerId = user!._id
      }

      const result = await client.submitMove(matchId, playerId, move)
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
      const matchScope = socket.match
      const user = socket.user
      if (!matchScope && !user) return

      const { matchId } = payload
      if (typeof matchId !== 'string' || !matchId) {
        socket.emit('games:reveal-done-error', { message: 'matchId required' })
        return
      }
      if (matchScope && matchId !== matchScope.matchId) {
        socket.emit('games:reveal-done-error', { message: 'match token scope mismatch' })
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

  const requestHandoffHandler: HandlerObject = {
    event: 'games:request-handoff',
    handler: async (socket: AuthenticatedSocket, payload: MatchIdPayload = {}) => {
      // Handoff wystawia gracz z pełną sesją (user) LUB gość (guest). Socket
      // meczowy (match) NIE prosi o handoff — już ma token meczu.
      if (socket.match) {
        socket.emit('games:handoff-error', { message: 'not allowed for match token' })
        return
      }
      const subjectId = socket.user?._id ?? socket.guest?.guestId
      if (!subjectId) return

      const { matchId } = payload
      if (typeof matchId !== 'string' || !matchId) {
        socket.emit('games:handoff-error', { message: 'matchId required' })
        return
      }

      // Członkostwo weryfikuje games (get-match): subjectId ∈ players ∪ guestIds.
      const result = await client.getMatch(matchId)
      if (!result.ok) {
        socket.emit('games:handoff-error', { message: result.error })
        return
      }
      const { players, guestIds, gameId } = result.data
      if (!players.includes(subjectId) && !guestIds.includes(subjectId)) {
        socket.emit('games:handoff-error', { message: 'not a member of this match' })
        return
      }

      const code = issueHandoff({ matchId, subjectId })
      logger.info({ matchId, subjectId }, 'issued match handoff code')
      socket.emit('games:handoff-complete', { code, gameId, playerId: subjectId })
    },
  }

  return [createMatchHandler, startHandler, submitMoveHandler, revealDoneHandler, requestHandoffHandler]
}
