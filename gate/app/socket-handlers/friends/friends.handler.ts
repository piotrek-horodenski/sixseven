import { HandlerObject, AuthenticatedSocket } from '..'
import type { PresenceService } from '../../services/presence.service'
import logger from '../../logger'

/**
 * Socket-handlery znajomych + trybu niewidzialnego (4a). Zależności WSTRZYKIWANE
 * (store friendships, presence.service, setter `privacy.invisible`) → rdzeń
 * testuje się bez mongo i bez sieci.
 *
 * ZASADA BEZPIECZEŃSTWA: tożsamość `me` bierzemy WYŁĄCZNIE z `socket.user._id`
 * (uwierzytelnione JWT) — NIGDY z payloadu. Payload dostarcza tylko `userId`
 * DRUGIEJ strony. Dzięki temu nie da się zaakceptować cudzego zaproszenia ani
 * podszyć się pod innego inicjatora.
 *
 * NORMALIZACJA PARY: relacja to jeden dokument z `a = min(x, y)`, `b = max(x, y)`
 * (leksykalnie). Kierunek zaproszenia trzyma `invitedBy`.
 */

export interface FriendshipRecord {
  a: string
  b: string
  status: 'invited' | 'accepted'
  invitedBy: string
}

/** Abstrakcja składu friendships — operuje na ZNORMALIZOWANEJ parze (a < b). */
export interface FriendsStore {
  find(a: string, b: string): Promise<FriendshipRecord | null>
  /** Tworzy zaproszenie (upsert; status='invited', invitedBy). */
  invite(a: string, b: string, invitedBy: string): Promise<void>
  /** Ustawia status='accepted' istniejącej relacji. */
  accept(a: string, b: string): Promise<void>
  /** Usuwa relację (invited albo accepted). */
  remove(a: string, b: string): Promise<void>
}

export interface FriendsHandlerDeps {
  store: FriendsStore
  presence: Pick<PresenceService, 'onFriendChange' | 'refreshStatus'>
  /** Zapis `privacy.invisible` na użytkowniku (persist). */
  setInvisible: (userId: string, invisible: boolean) => Promise<void>
}

interface UserIdPayload { userId?: unknown }
interface InvisiblePayload { invisible?: unknown }

/** Znormalizowana para: [min, max] leksykalnie. */
export function normalizePair(x: string, y: string): [string, string] {
  return x < y ? [x, y] : [y, x]
}

export function createFriendsHandlers(deps: FriendsHandlerDeps): HandlerObject[] {
  const inviteHandler: HandlerObject = {
    event: 'friends:invite',
    handler: async (socket: AuthenticatedSocket, payload: UserIdPayload = {}) => {
      const user = socket.user
      if (!user) return
      const me = String(user._id)

      const { userId } = payload
      if (typeof userId !== 'string' || !userId) {
        socket.emit('friends:invite-error', { message: 'userId required' })
        return
      }
      if (userId === me) {
        socket.emit('friends:invite-error', { message: 'cannot invite yourself' })
        return
      }

      const [a, b] = normalizePair(me, userId)
      const existing = await deps.store.find(a, b)
      if (existing) {
        const message = existing.status === 'accepted' ? 'already friends' : 'invite already pending'
        socket.emit('friends:invite-error', { message })
        return
      }

      await deps.store.invite(a, b, me)
      logger.info({ me, other: userId }, 'friend invite sent')
      socket.emit('friends:invite-complete', { userId })
    },
  }

  const acceptHandler: HandlerObject = {
    event: 'friends:accept',
    handler: async (socket: AuthenticatedSocket, payload: UserIdPayload = {}) => {
      const user = socket.user
      if (!user) return
      const me = String(user._id)

      const { userId } = payload
      if (typeof userId !== 'string' || !userId) {
        socket.emit('friends:accept-error', { message: 'userId required' })
        return
      }

      const [a, b] = normalizePair(me, userId)
      const existing = await deps.store.find(a, b)

      // Idempotentny: ponowny accept już-zaakceptowanej relacji → complete (no-op).
      if (existing && existing.status === 'accepted') {
        socket.emit('friends:accept-complete', { userId })
        return
      }

      // Akceptować można TYLKO cudze zaproszenie (invitedBy != me). `me` jest
      // stroną z definicji (a lub b). Brak invited / własne zaproszenie → błąd.
      if (!existing || existing.status !== 'invited' || existing.invitedBy === me) {
        socket.emit('friends:accept-error', { message: 'no invite to accept' })
        return
      }

      await deps.store.accept(a, b)
      await deps.presence.onFriendChange(me, userId)
      logger.info({ me, other: userId }, 'friend invite accepted')
      socket.emit('friends:accept-complete', { userId })
    },
  }

  const removeHandler: HandlerObject = {
    event: 'friends:remove',
    handler: async (socket: AuthenticatedSocket, payload: UserIdPayload = {}) => {
      const user = socket.user
      if (!user) return
      const me = String(user._id)

      const { userId } = payload
      if (typeof userId !== 'string' || !userId) {
        socket.emit('friends:remove-error', { message: 'userId required' })
        return
      }

      const [a, b] = normalizePair(me, userId)
      await deps.store.remove(a, b)
      // Odśwież visibleTo dla obu — były znajomy przestaje widzieć presence.
      await deps.presence.onFriendChange(me, userId)
      logger.info({ me, other: userId }, 'friend removed')
      socket.emit('friends:remove-complete', { userId })
    },
  }

  const setInvisibleHandler: HandlerObject = {
    event: 'presence:set-invisible',
    handler: async (socket: AuthenticatedSocket, payload: InvisiblePayload = {}) => {
      const user = socket.user
      if (!user) return
      const me = String(user._id)

      const { invisible } = payload
      if (typeof invisible !== 'boolean') {
        socket.emit('presence:set-invisible-error', { message: 'invisible must be a boolean' })
        return
      }

      await deps.setInvisible(me, invisible)
      // Przelicz bieżący dokument presence: włączenie trybu zdejmie currentMatchId,
      // wyłączenie przywróci pełną widoczność (w granicach zapisanego statusu).
      await deps.presence.refreshStatus(me)
      logger.info({ me, invisible }, 'presence invisibility toggled')
      socket.emit('presence:set-invisible-complete', { invisible })
    },
  }

  return [inviteHandler, acceptHandler, removeHandler, setInvisibleHandler]
}
