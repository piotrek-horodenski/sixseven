import { HandlerObject, AuthenticatedSocket } from '..'
import { hasPermission } from '../check-permission'
import { GamesClient } from '../../services/games-client'
import logger from '../../logger'

/**
 * Socket-handlery konta dewelopera (4d). Self-service: `dev:enroll` nadaje
 * zalogowanemu userowi istniejącą rolę `developer` (hierarchia
 * guest→player→developer→admin, seed.service); rejestracja/edycja gry idzie
 * proxem do games command API (`/command/register-game`, `/command/update-game`).
 *
 * ZASADY BEZPIECZEŃSTWA:
 *  - `devAccountId` ZAWSZE z `socket.user._id` (uwierzytelnione JWT) — payload
 *    z cudzym id jest IGNOROWANY (kontrakt §1/§6),
 *  - `dev:register-game`/`dev:update-game` wymagają uprawnienia `register-games`
 *    (rola developer; admin dziedziczy),
 *  - `hmacSecret` przechodzi przez gate JEDEN raz (event complete) — nie jest
 *    logowany ani przechowywany,
 *  - twarde walidacje (slug, manifest, limit gier per dev, unikalność, własność)
 *    egzekwuje games — gate waliduje tylko kształt payloadu.
 *
 * Zależności WSTRZYKIWANE (klient games, nadanie roli) → testy bez mongo i sieci.
 */

export interface DevHandlersDeps {
  /** Idempotentne nadanie roli `developer` + przeliczenie uprawnień (syncUser). */
  grantDeveloperRole: (userId: string) => Promise<void>
}

interface RegisterGamePayload {
  gameId?: unknown
  name?: unknown
  manifest?: unknown
  serviceUrl?: unknown
  uiUrl?: unknown
}

interface UpdateGamePayload {
  gameId?: unknown
  serviceUrl?: unknown
  uiUrl?: unknown
  manifest?: unknown
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function createDevHandlers(client: GamesClient, deps: DevHandlersDeps): HandlerObject[] {
  const enrollHandler: HandlerObject = {
    event: 'dev:enroll',
    handler: async (socket: AuthenticatedSocket, _payload: unknown = {}) => {
      const user = socket.user
      if (!user) return
      const uid = String(user._id)

      // Idempotencja: rola już nadana (wprost albo przez dziedziczenie — admin
      // ma developer w allRoles) → complete bez zapisu.
      const allRoles = user.allRoles ?? user.roles ?? []
      if (allRoles.includes('developer')) {
        socket.emit('dev:enroll-complete', {})
        return
      }

      await deps.grantDeveloperRole(uid)
      logger.info({ userId: uid }, 'developer role self-enrolled')
      socket.emit('dev:enroll-complete', {})
    },
  }

  const registerGameHandler: HandlerObject = {
    event: 'dev:register-game',
    handler: async (socket: AuthenticatedSocket, payload: RegisterGamePayload = {}) => {
      const user = socket.user
      if (!user) return
      if (!hasPermission(socket, 'register-games')) {
        socket.emit('dev:register-game-error', { message: 'insufficient permissions' })
        return
      }
      // devAccountId ZAWSZE z tokenu — ewentualne pole w payloadzie ignorujemy.
      const uid = String(user._id)

      const { gameId, name, manifest, serviceUrl, uiUrl } = payload
      if (typeof gameId !== 'string' || !gameId) {
        socket.emit('dev:register-game-error', { message: 'gameId required' })
        return
      }
      if (typeof name !== 'string' || !name.trim()) {
        socket.emit('dev:register-game-error', { message: 'name required' })
        return
      }
      if (!isPlainObject(manifest)) {
        socket.emit('dev:register-game-error', { message: 'manifest must be an object' })
        return
      }
      if (typeof serviceUrl !== 'string' || !serviceUrl) {
        socket.emit('dev:register-game-error', { message: 'serviceUrl required' })
        return
      }
      if (typeof uiUrl !== 'string' || !uiUrl) {
        socket.emit('dev:register-game-error', { message: 'uiUrl required' })
        return
      }

      const result = await client.registerGame({
        devAccountId: uid,
        gameId,
        name: name.trim(),
        manifest,
        serviceUrl,
        uiUrl,
      })
      if (!result.ok) {
        logger.warn({ userId: uid, gameId, status: result.status }, 'register-game failed')
        socket.emit('dev:register-game-error', { message: result.error })
        return
      }

      // Sekret NIE trafia do logów — przechodzi jednorazowo do klienta.
      logger.info({ userId: uid, gameId: result.data.gameId }, 'external game registered')
      socket.emit('dev:register-game-complete', { gameId: result.data.gameId, hmacSecret: result.data.hmacSecret })
    },
  }

  const updateGameHandler: HandlerObject = {
    event: 'dev:update-game',
    handler: async (socket: AuthenticatedSocket, payload: UpdateGamePayload = {}) => {
      const user = socket.user
      if (!user) return
      if (!hasPermission(socket, 'register-games')) {
        socket.emit('dev:update-game-error', { message: 'insufficient permissions' })
        return
      }
      const uid = String(user._id)

      const { gameId, serviceUrl, uiUrl, manifest } = payload
      if (typeof gameId !== 'string' || !gameId) {
        socket.emit('dev:update-game-error', { message: 'gameId required' })
        return
      }
      if (serviceUrl !== undefined && (typeof serviceUrl !== 'string' || !serviceUrl)) {
        socket.emit('dev:update-game-error', { message: 'serviceUrl must be a non-empty string' })
        return
      }
      if (uiUrl !== undefined && (typeof uiUrl !== 'string' || !uiUrl)) {
        socket.emit('dev:update-game-error', { message: 'uiUrl must be a non-empty string' })
        return
      }
      if (manifest !== undefined && !isPlainObject(manifest)) {
        socket.emit('dev:update-game-error', { message: 'manifest must be an object' })
        return
      }
      if (serviceUrl === undefined && uiUrl === undefined && manifest === undefined) {
        socket.emit('dev:update-game-error', { message: 'nothing to update' })
        return
      }

      // Własność (devAccountId == games.devAccountId) egzekwuje games — 403-owy
      // błąd domenowy wraca jako message. Każda zmiana cofa status do 'registered'.
      const result = await client.updateGame({ devAccountId: uid, gameId, serviceUrl, uiUrl, manifest })
      if (!result.ok) {
        logger.warn({ userId: uid, gameId, status: result.status }, 'update-game failed')
        socket.emit('dev:update-game-error', { message: result.error })
        return
      }

      logger.info({ userId: uid, gameId }, 'external game updated (status back to registered)')
      socket.emit('dev:update-game-complete', { gameId })
    },
  }

  return [enrollHandler, registerGameHandler, updateGameHandler]
}
