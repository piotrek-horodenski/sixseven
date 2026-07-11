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
  /**
   * Wiąże matchId z pokojem BEZ zmiany statusu (Etap 3B pkt 1) — mecz powstaje od
   * razu przy zakładaniu gry, ale pokój zostaje `open` (wciąż dołączalny), dopóki
   * slot meczu jest wolny.
   */
  setMatchId(roomId: string, matchId: string): Promise<void>
  /** Zamyka wszystkie OTWARTE pokoje danego hosta (jeden aktywny pokój / user). */
  closeOpenByHost?(hostId: string): Promise<void>
}

export interface RoomsHandlerDeps {
  client: Pick<GamesClient, 'createMatch' | 'joinMatch' | 'getMatch' | 'cancelMatch'>
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
      // user._id to ObjectId (mongoose) — normalizujemy do stringa, bo dane
      // (members.id, hostId) trzymamy jako stringi i tak porownuje je klient.
      const uid = String(user._id)

      const { gameId, name, visibility } = payload
      if (typeof gameId !== 'string' || !gameId) {
        socket.emit('rooms:create-error', { message: 'gameId required' })
        return
      }
      const vis: Room['visibility'] = visibility === 'private' ? 'private' : 'public'
      const roomName = typeof name === 'string' && name.trim() ? name.trim() : `${user.username}'s room`

      // Jeden aktywny pokój na użytkownika: zamykamy jego poprzednie otwarte pokoje,
      // żeby lista publiczna nie zapełniała się porzuconymi lobby.
      await deps.store.closeOpenByHost?.(uid)

      const code = await allocateCode()
      if (!code) {
        socket.emit('rooms:create-error', { message: 'could not allocate a room code' })
        return
      }

      const room = await deps.store.create({
        code,
        gameId,
        name: roomName,
        hostId: uid,
        hostKind: 'user',
        visibility: vis,
        members: [{ id: uid, kind: 'user', nick: user.username }],
      })

      // Etap 3B pkt 1: mecz powstaje OD RAZU (twórca ląduje na ekranie gry i czeka
      // na przeciwnika). Pokój zostaje `open` — nadal dołączalny, dopóki slot wolny.
      let matchId: string | null = null
      const matchResult = await deps.client.createMatch({
        gameId,
        players: [uid],
        capacity: 2,
        options: { target: 2 },
      })
      if (matchResult.ok) {
        matchId = matchResult.data.matchId
        await deps.store.setMatchId(room._id, matchId)
      } else {
        // Bez meczu pokój jest bezużyteczny (UI oczekuje matchId) — zamykamy go.
        logger.warn({ roomId: room._id, status: matchResult.status }, 'rooms:create match creation failed')
        await deps.store.setStatus(room._id, 'closed')
        socket.emit('rooms:create-error', { message: matchResult.error })
        return
      }

      logger.info({ roomId: room._id, code: room.code, matchId, by: user._id }, 'room created')
      socket.emit('rooms:create-complete', { roomId: room._id, code: room.code, matchId })
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

      const uid = String(user._id)
      // Idempotentne: powtórny join tego samego usera nie duplikuje membera.
      await deps.store.addMember(room._id, { id: uid, kind: 'user', nick: user.username })

      // Etap 3B pkt 2: dołączenie do ROOMU dopisuje gracza także do MECZU (re-init).
      // Gdy slot się zapełnił — pokój przechodzi na `matched` (znika z listy otwartych).
      if (room.matchId) {
        const joinResult = await deps.client.joinMatch(room.matchId, uid, 'user')
        if (!joinResult.ok) {
          logger.warn({ roomId: room._id, matchId: room.matchId, status: joinResult.status }, 'rooms:join match join failed')
          socket.emit('rooms:join-error', { message: joinResult.error })
          return
        }
        if (joinResult.data.full) {
          await deps.store.setMatched(room._id, room.matchId)
        }
      }

      logger.info({ roomId: room._id, matchId: room.matchId, by: uid }, 'room joined')
      socket.emit('rooms:join-complete', { roomId: room._id, matchId: room.matchId })
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

      const uid = String(user._id)
      const room = await deps.store.findById(roomId)
      if (room) {
        await deps.store.removeMember(roomId, uid)
        // Host wychodzi → pokój zamknięty (nie da się już do niego dołączyć).
        if (room.hostId === uid) {
          await deps.store.setStatus(roomId, 'closed')
          // Etap 3B pkt 6: twórca wychodzi przed startem → anuluj mecz, JEŚLI wciąż
          // w lobby (nikt jeszcze nie zaczął grać). Sprawdzamy fazę przez getMatch,
          // żeby nie ubić meczu, który już wystartował. `cancelMatch`/`engine.cancel`
          // jest samo-guardowane (no-op poza lobby/planning/resolving/paused), więc
          // to dodatkowe sprawdzenie jest ostrożnością, nie wymogiem poprawności.
          if (room.matchId) {
            const info = await deps.client.getMatch(room.matchId)
            if (info.ok && info.data.phase === 'lobby') {
              const cancelResult = await deps.client.cancelMatch(room.matchId, 'cancelled_lobby')
              if (!cancelResult.ok) {
                logger.warn({ roomId, matchId: room.matchId, status: cancelResult.status }, 'rooms:leave cancel match failed')
              }
            }
          }
        }
        // MVP (Etap 3B pkt 6): dołączający wychodzący z lobby NIE jest usuwany z
        // meczu (slot nie wraca) — re-init przy leave nie jest wymagany do MVP.
        // Prostsze i bezpieczne: gracz zostaje w rosterze, może wrócić przez handoff.
      }

      logger.info({ roomId, by: uid }, 'room left')
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
      if (room.hostId !== String(user._id)) {
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
