import { HandlerObject, AuthenticatedSocket } from '..'
import { CommandResult, MatchInfo } from '../../services/games-client'
import logger from '../../logger'

/**
 * Socket-handler czatu (Etap 4b). Jeden event `chat:send` obsługuje czat pokoju
 * (`scope:'room'`) i meczu (`scope:'match'`). Wiadomość trafia do kolekcji
 * `messages`; klienci dostają ją SUBSKRYPCJĄ (`messages`) — handler nie emituje
 * treści ręcznie. Widoczność wymusza polityka po `members` (snapshot uprawnionych).
 *
 * ZASADY BEZPIECZEŃSTWA (serwerowo, nie „na UI"):
 *  - tożsamość autora ZAWSZE z tokenu (`socket.user._id` lub `socket.match.playerId`),
 *    NIGDY z payloadu,
 *  - długość `text` egzekwowana serwerowo (`maxLen`),
 *  - rate-limit per autor (okno licznikowe),
 *  - członkostwo w `scopeId` weryfikowane serwerowo (pokój z modelu `rooms`,
 *    mecz przez `games-client.getMatch`); nie-członek nie wyśle.
 *
 * Zależności WSTRZYKIWANE → testy bez sieci i bazy.
 */

export interface ChatMessageInput {
  scope: 'room' | 'match' | 'dm'
  scopeId: string
  authorId: string
  authorNick: string
  text: string
  members: string[]
  ts: number
}

/** Abstrakcja składu wiadomości — pozwala testować handler bez mongo. */
export interface MessagesStore {
  create(msg: ChatMessageInput): Promise<{ _id: string }>
}

export interface ChatRoomMember {
  id: string
  kind: 'user' | 'guest'
}

export interface ChatRoom {
  members: ChatRoomMember[]
}

export interface ChatHandlerDeps {
  store: MessagesStore
  /** Odczyt pokoju (członkostwo + snapshot składu). `null` gdy pokój nie istnieje. */
  findRoom: (roomId: string) => Promise<ChatRoom | null>
  /** Odczyt meczu (członkostwo + snapshot players∪guestIds). */
  getMatch: (matchId: string) => Promise<CommandResult<MatchInfo>>
  /** Czy dwaj użytkownicy są zaakceptowanymi znajomymi (dla scope 'dm'). */
  areFriends?: (a: string, b: string) => Promise<boolean>
  /** Maks długość wiadomości (config). */
  maxLen?: number
  /** Rate-limit: maks wiadomości na okno per autor. */
  rateMax?: number
  /** Rate-limit: długość okna (ms). */
  rateWindowMs?: number
  /** Wstrzykiwalny limiter (test). Domyślnie licznik okienkowy per autor. */
  allow?: (key: string) => boolean
}

const DEFAULT_MAX_LEN = 500
const DEFAULT_RATE_MAX = 10
const DEFAULT_RATE_WINDOW_MS = 10_000

/** Licznik okienkowy per klucz (autor). Reset po upływie okna. */
function makeCounterLimiter(max: number, windowMs: number): (key: string) => boolean {
  const buckets = new Map<string, { count: number; resetAt: number }>()
  return (key: string): boolean => {
    const now = Date.now()
    const b = buckets.get(key)
    if (!b || now > b.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + windowMs })
      return true
    }
    b.count++
    return b.count <= max
  }
}

interface SendPayload {
  scope?: unknown
  scopeId?: unknown
  text?: unknown
}

export function createChatHandlers(deps: ChatHandlerDeps): HandlerObject[] {
  // Config i limiter rozwiązywane LENIWIE (przy pierwszym evencie), żeby import
  // barrela socket-handlers nie odpalał `SettingsService()` (walidacja env).
  let limiter: ((key: string) => boolean) | null = null
  function getAllow(): (key: string) => boolean {
    if (deps.allow) return deps.allow
    if (!limiter) {
      limiter = makeCounterLimiter(deps.rateMax ?? DEFAULT_RATE_MAX, deps.rateWindowMs ?? DEFAULT_RATE_WINDOW_MS)
    }
    return limiter
  }

  const sendHandler: HandlerObject = {
    event: 'chat:send',
    handler: async (socket: AuthenticatedSocket, payload: SendPayload = {}) => {
      const user = socket.user
      const matchScope = socket.match
      // Czat wysyła zalogowany user LUB gracz z tokenem meczu (gość po handoffie).
      if (!user && !matchScope) return
      const maxLen = deps.maxLen ?? DEFAULT_MAX_LEN

      // Tożsamość autora ZAWSZE z tokenu — nigdy z payloadu.
      const authorId = matchScope?.playerId ?? String(user!._id)
      const authorNick = user?.username ?? 'guest'

      const { scope, scopeId, text } = payload
      if (scope !== 'room' && scope !== 'match' && scope !== 'dm') {
        socket.emit('chat:send-error', { message: 'scope must be room, match or dm' })
        return
      }
      // DM: tylko zalogowany user (nie gość z tokenem meczu).
      if (scope === 'dm' && !user) {
        socket.emit('chat:send-error', { message: 'dm requires a user session' })
        return
      }
      if (typeof scopeId !== 'string' || !scopeId) {
        socket.emit('chat:send-error', { message: 'scopeId required' })
        return
      }
      if (typeof text !== 'string') {
        socket.emit('chat:send-error', { message: 'text required' })
        return
      }
      const trimmed = text.trim()
      if (!trimmed) {
        socket.emit('chat:send-error', { message: 'text required' })
        return
      }
      if (trimmed.length > maxLen) {
        socket.emit('chat:send-error', { message: 'text too long' })
        return
      }

      // Token meczu jest scoped do jednego meczu — wymuszamy zgodność (jak submit-move).
      if (matchScope && scope === 'match' && scopeId !== matchScope.matchId) {
        socket.emit('chat:send-error', { message: 'match token scope mismatch' })
        return
      }

      // Rate-limit per autor (serwerowo).
      if (!getAllow()(authorId)) {
        socket.emit('chat:send-error', { message: 'rate_limited' })
        return
      }

      // Członkostwo + snapshot odbiorców.
      let members: string[]
      if (scope === 'dm') {
        // Kanał DM = posortowana para userId ('a_b'). Autor MUSI być w parze, a
        // druga strona MUSI być zaakceptowanym znajomym (anty-spam do obcych).
        const ids = scopeId.split('_')
        if (ids.length !== 2 || !ids.includes(authorId)) {
          socket.emit('chat:send-error', { message: 'invalid dm channel' })
          return
        }
        const peer = ids[0] === authorId ? ids[1] : ids[0]
        const friends = deps.areFriends ? await deps.areFriends(authorId, peer) : false
        if (!friends) {
          socket.emit('chat:send-error', { message: 'not friends' })
          return
        }
        members = [ids[0], ids[1]]
      } else if (scope === 'room') {
        const room = await deps.findRoom(scopeId)
        if (!room || !room.members.some(m => m.id === authorId)) {
          socket.emit('chat:send-error', { message: 'not a member' })
          return
        }
        members = room.members.map(m => m.id)
      } else {
        const res = await deps.getMatch(scopeId)
        if (!res.ok) {
          socket.emit('chat:send-error', { message: res.error })
          return
        }
        const { players, guestIds } = res.data
        if (!players.includes(authorId) && !guestIds.includes(authorId)) {
          socket.emit('chat:send-error', { message: 'not a member' })
          return
        }
        members = [...players, ...guestIds]
      }

      // Bezpiecznik: autor zawsze widzi własną wiadomość.
      if (!members.includes(authorId)) members.push(authorId)

      const saved = await deps.store.create({
        scope,
        scopeId,
        authorId,
        authorNick,
        text: trimmed,
        members,
        ts: Date.now(),
      })

      logger.info({ scope, scopeId, authorId, id: saved._id }, 'chat message sent')
      socket.emit('chat:send-complete', { id: saved._id })
    },
  }

  return [sendHandler]
}
