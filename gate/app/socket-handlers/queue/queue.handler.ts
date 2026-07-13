import { HandlerObject, AuthenticatedSocket } from '..'
import { GamesClient } from '../../services/games-client'
import logger from '../../logger'

/**
 * Socket-handlery kolejki szybkiego meczu (4e). Gate proxuje komendy do games
 * (`/command/queue-*`); stan wpisu gracz dostaje SUBSKRYPCJĄ `queue` (polityka
 * row-level: tylko własne wpisy). Dobór par robi matchmaker w games.
 *
 * ZASADY BEZPIECZEŃSTWA:
 *  - `userId` ZAWSZE z `socket.user._id` (uwierzytelnione JWT) — NIGDY z payloadu,
 *  - kolejka WYŁĄCZNIE dla pełnych kont: gość (socket.guest) i socket tokenu
 *    meczu (socket.match) dostają jawny błąd (kontrakt §3 — „tylko socket.user");
 *    games dodatkowo odrzuca `g_*` (podwójna gwarancja),
 *  - walidację domenową (gra istnieje, rankedEligible) robi games.
 *
 * Klient games WSTRZYKIWANY → testy bez sieci.
 */

interface QueuePayload {
  gameId?: unknown
  proposalId?: unknown
}

export function createQueueHandlers(client: GamesClient): HandlerObject[] {
  /**
   * Wspólna bramka tożsamości: zwraca userId z tokenu albo emituje błąd.
   * Gość/token meczu → jawne odrzucenie; brak tożsamości → cisza (wzorzec repo).
   */
  function requireUser(socket: AuthenticatedSocket, errorEvent: string): string | null {
    if (socket.user) return String(socket.user._id)
    if (socket.guest || socket.match) {
      socket.emit(errorEvent, { message: 'queue requires a user session' })
    }
    return null
  }

  const joinHandler: HandlerObject = {
    event: 'queue:join',
    handler: async (socket: AuthenticatedSocket, payload: QueuePayload = {}) => {
      const uid = requireUser(socket, 'queue:join-error')
      if (!uid) return

      const { gameId } = payload
      if (typeof gameId !== 'string' || !gameId) {
        socket.emit('queue:join-error', { message: 'gameId required' })
        return
      }

      const result = await client.queueJoin(gameId, uid)
      if (!result.ok) {
        logger.warn({ userId: uid, gameId, status: result.status }, 'queue join failed')
        socket.emit('queue:join-error', { message: result.error })
        return
      }
      logger.info({ userId: uid, gameId }, 'queue joined')
      socket.emit('queue:join-complete', { gameId })
    },
  }

  const leaveHandler: HandlerObject = {
    event: 'queue:leave',
    handler: async (socket: AuthenticatedSocket, payload: QueuePayload = {}) => {
      const uid = requireUser(socket, 'queue:leave-error')
      if (!uid) return

      const { gameId } = payload
      if (typeof gameId !== 'string' || !gameId) {
        socket.emit('queue:leave-error', { message: 'gameId required' })
        return
      }

      const result = await client.queueLeave(gameId, uid)
      if (!result.ok) {
        socket.emit('queue:leave-error', { message: result.error })
        return
      }
      logger.info({ userId: uid, gameId }, 'queue left')
      socket.emit('queue:leave-complete', { gameId })
    },
  }

  const acceptHandler: HandlerObject = {
    event: 'queue:accept',
    handler: async (socket: AuthenticatedSocket, payload: QueuePayload = {}) => {
      const uid = requireUser(socket, 'queue:accept-error')
      if (!uid) return

      const { gameId, proposalId } = payload
      if (typeof gameId !== 'string' || !gameId) {
        socket.emit('queue:accept-error', { message: 'gameId required' })
        return
      }
      if (typeof proposalId !== 'string' || !proposalId) {
        socket.emit('queue:accept-error', { message: 'proposalId required' })
        return
      }

      const result = await client.queueAccept(gameId, uid, proposalId)
      if (!result.ok) {
        socket.emit('queue:accept-error', { message: result.error })
        return
      }
      // Po obu akceptach games tworzy mecz ranked; klient zobaczy `matched` +
      // matchId we własnym wpisie `queue` (subskrypcja) i weźmie handoff.
      logger.info({ userId: uid, gameId, proposalId }, 'queue proposal accepted')
      socket.emit('queue:accept-complete', { gameId, proposalId })
    },
  }

  return [joinHandler, leaveHandler, acceptHandler]
}
