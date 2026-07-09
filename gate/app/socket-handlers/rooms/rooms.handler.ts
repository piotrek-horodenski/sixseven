import { HandlerObject, AuthenticatedSocket } from '..'
import { GamesClient } from '../../services/games-client'
import logger from '../../logger'

/**
 * Socket-handlery pokoi (2d, sekcja A). Host (zalogowany użytkownik) tworzy
 * pokój z linkiem-kodem; dołączają gracze zalogowani (socket) i goście (REST).
 * `rooms:start` woła games `create-match` przez wstrzykiwany klient i wiąże
 * `matchId`.
 *
 * Zależności są WSTRZYKIWANE (klient games, store DB, generator kodu) — rdzeń
 * handlerów testuje się bez sieci i bazy.
 */

export interface RoomMember {
  id: string
  kind: 'user' | 'guest'
  nick?: string
}

export interface Room {
  _id: string
  code: string
  gameId: string
  name: string
  hostId: string
  hostKind: 'user' | 'guest'
  visibility: 'public' | 'private'
  status: 'open' | 'matched' | 'closed'
  members: RoomMember[]
  matchId: string | null
}

export interface CreateRoomInput {
  code: string
  gameId: string
  name: string
  hostId: string
  hostKind: 'user' | 'guest'
  visibility: 'public' | 'private'
  members: RoomMember[]
}

/** Abstrakcja składu DB — pozwala testować handlery bez mongo. */
export interface RoomsStore {
  create(input: CreateRoomInput): Promise<Room>
  findByCode(code: string): Promise<Room | null>
  findById(roomId: string): Promise<Room | null>
  /** Dodaje membera idempotentnie (po `member.id`). */
  addMember(roomId: string, member: RoomMember): Promise<void>
  removeMember(roomId: string, memberId: string): Promise<void>
  setStatus(roomId: string, status: Room['status']): Promise<void>
  setMatched(roomId: string, matchId: string): Promise<void>
}

export interface RoomsHandlerDeps {
  client: Pick<GamesClient, 'createMatch'>
  store: RoomsStore
  /** Generuje kandydata na kod (6× [A-Z2-9]); kolizje rozwiązuje handler. */
  genCode: () => string
  /** Ile prób alokacji unikalnego kodu przy kolizji. */
  maxCodeRetries?: number
}

// Alfabet bez 0/1/O/I — czytelność linku/kodu.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** Domyślny generator kodu pokoju: 6 znaków [A-Z2-9]. */
export function generateRoomCode(rand: () => number = Math.random): string {
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)]
  }
  return code
}

interface CreatePayload { gameId?: unknown; name?: unknown; visibility?: unknown }
interface JoinPayload { code?: unknown }
interface RoomIdPayload { roomId?: unknown }

export function createRoomsHandlers(deps: RoomsHandlerDeps): HandlerObject[] {
  const maxCodeRetries = deps.maxCodeRetries ?? 8

  async function allocateCode(): Promise<string | null> {
    let attempts = 0
    while (attempts < maxCodeRetries) {
      const code = deps.genCode()
      const existing = await deps.store.findByCode(code)
      if (!existing) return code
      attempts++
    }
    return null
  }

  const createHandler: HandlerObject = {
    event: 'rooms:create',
    handler: async (socket: AuthenticatedSocket, payload: CreatePayload = {}) => {
      const user = socket.user
      if (!user) return

      const { gameId, name, visibility } = payload
      if (typeof gameId !== 'string' || !gameId) {
        socket.emit('rooms:create-error', { message: 'gameId required' })
        return
      }
      const vis: Room['visibility'] = visibility === 'private' ? 'private' : 'public'
      const roomName = typeof name === 'string' && name.trim() ? name.trim() : `${user.username}'s room`

      const code = await allocateCode()
      if (!code) {
        socket.emit('rooms:create-error', { message: 'could not allocate a room code' })
        return
      }

      const room = await deps.store.create({
        code,
        gameId,
        name: roomName,
        hostId: user._id,
        hostKind: 'user',
        visibility: vis,
        members: [{ id: user._id, kind: 'user', nick: user.username }],
      })

      logger.info({ roomId: room._id, code: room.code, by: user._id }, 'room created')
      socket.emit('rooms:create-complete', { roomId: room._id, code: room.code })
    },
  }

  const joinHandler: HandlerObject = {
    event: 'rooms:join',
    handler: async (socket: AuthenticatedSocket, payload: JoinPayload = {}) => {
      const user = socket.user
      if (!user) return

      const { code } = payload
      if (typeof code !== 'string' || !code) {
        socket.emit('rooms:join-error', { message: 'code required' })
        return
      }

      const room = await deps.store.findByCode(code.toUpperCase())
      if (!room) {
        socket.emit('rooms:join-error', { message: 'room not found' })
        return
      }
      if (room.status !== 'open') {
        socket.emit('rooms:join-error', { message: 'room is not open' })
        return
      }

      // Idempotentne: powtórny join tego samego usera nie duplikuje membera.
      await deps.store.addMember(room._id, { id: user._id, kind: 'user', nick: user.username })

      logger.info({ roomId: room._id, by: user._id }, 'room joined')
      socket.emit('rooms:join-complete', { roomId: room._id })
    },
  }

  const leaveHandler: HandlerObject = {
    event: 'rooms:leave',
    handler: async (socket: AuthenticatedSocket, payload: RoomIdPayload = {}) => {
      const user = socket.user
      if (!user) return

      const { roomId } = payload
      if (typeof roomId !== 'string' || !roomId) {
        socket.emit('rooms:leave-error', { message: 'roomId required' })
        return
      }

      const room = await deps.store.findById(roomId)
      if (room) {
        await deps.store.removeMember(roomId, user._id)
        // Host wychodzi → pokój zamknięty (nie da się już do niego dołączyć).
        if (room.hostId === user._id) {
          await deps.store.setStatus(roomId, 'closed')
        }
      }

      logger.info({ roomId, by: user._id }, 'room left')
      socket.emit('rooms:leave-complete', { roomId })
    },
  }

  const startHandler: HandlerObject = {
    event: 'rooms:start',
    handler: async (socket: AuthenticatedSocket, payload: RoomIdPayload = {}) => {
      const user = socket.user
      if (!user) return

      const { roomId } = payload
      if (typeof roomId !== 'string' || !roomId) {
        socket.emit('rooms:start-error', { message: 'roomId required' })
        return
      }

      const room = await deps.store.findById(roomId)
      if (!room) {
        socket.emit('rooms:start-error', { message: 'room not found' })
        return
      }
      if (room.hostId !== user._id) {
        socket.emit('rooms:start-error', { message: 'only the host can start' })
        return
      }
      if (room.status !== 'open') {
        socket.emit('rooms:start-error', { message: 'room is not open' })
        return
      }
      if (room.members.length < 2) {
        socket.emit('rooms:start-error', { message: 'need at least two members' })
        return
      }

      const players = room.members.filter(m => m.kind === 'user').map(m => m.id)
      const guestIds = room.members.filter(m => m.kind === 'guest').map(m => m.id)

      const result = await deps.client.createMatch({
        gameId: room.gameId,
        players,
        guestIds,
        options: { target: 2 },
      })
      if (!result.ok) {
        logger.warn({ roomId, status: result.status }, 'rooms:start create-match failed')
        socket.emit('rooms:start-error', { message: result.error })
        return
      }

      await deps.store.setMatched(roomId, result.data.matchId)

      logger.info({ roomId, matchId: result.data.matchId, by: user._id }, 'room matched')
      socket.emit('rooms:start-complete', { roomId, matchId: result.data.matchId })
    },
  }

  return [createHandler, joinHandler, leaveHandler, startHandler]
}
