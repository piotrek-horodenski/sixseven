import { HandlerObject, AuthenticatedSocket } from '..'
import { CommandResult, PlayerHistory } from '../../services/games-client'
import logger from '../../logger'

/**
 * Socket-handler ODCZYTU publicznego profilu innego gracza (Etap 4b). Osobny od
 * `general/profile.handler` (który AKTUALIZUJE własny profil) — inny folder, inny
 * event (`profile:get`).
 *
 * Zwraca WYŁĄCZNIE sanityzowany publiczny widok: `userId`, `display`, historia
 * meczów. NIGDY nie ujawnia email/roles/permissions/sessions/hasła. Odznaki
 * (annotations) idą osobno SUBSKRYPCJĄ `annotations` po stronie web (polityka
 * filtruje positive+własne) — nie tym RPC.
 *
 * Dostęp: dowolny zalogowany user (`socket.user`). Zależności wstrzykiwane → testy
 * bez sieci i bazy.
 */

export interface PublicUser {
  userId: string
  display: string
}

export interface ProfileHandlerDeps {
  /** Odczyt publicznych pól usera. `null` gdy user nie istnieje / błędny id. */
  findPublicUser: (userId: string) => Promise<PublicUser | null>
  /** Historia meczów gracza z games (A3). */
  playerHistory: (userId: string) => Promise<CommandResult<PlayerHistory>>
}

interface GetPayload {
  userId?: unknown
}

const EMPTY_HISTORY: PlayerHistory = { games: [], recent: [] }

export function createProfileHandlers(deps: ProfileHandlerDeps): HandlerObject[] {
  const getHandler: HandlerObject = {
    event: 'profile:get',
    handler: async (socket: AuthenticatedSocket, payload: GetPayload = {}) => {
      // Odczyt publiczny — wymaga dowolnej sesji usera (nie gościa/tokenu meczu).
      if (!socket.user) return

      const { userId } = payload
      if (typeof userId !== 'string' || !userId) {
        socket.emit('profile:get-error', { message: 'userId required' })
        return
      }

      const target = await deps.findPublicUser(userId)
      if (!target) {
        socket.emit('profile:get-error', { message: 'user not found' })
        return
      }

      // Historia z games; awaria games NIE wywraca profilu — degradujemy do pustej.
      let history = EMPTY_HISTORY
      const res = await deps.playerHistory(userId)
      if (res.ok) {
        history = res.data
      } else {
        logger.warn({ userId, status: res.status }, 'profile:get player-history failed')
      }

      socket.emit('profile:get-complete', {
        profile: {
          userId: target.userId,
          display: target.display,
          history,
        },
      })
    },
  }

  return [getHandler]
}
