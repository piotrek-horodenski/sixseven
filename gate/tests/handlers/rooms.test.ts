import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../app/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import {
  createRoomsHandlers,
  generateRoomCode,
  Room,
  RoomsStore,
  CreateRoomInput,
} from '../../app/socket-handlers/rooms/rooms.handler'

/** In-memory store — testy handlerów bez mongo. */
function makeStore(seed: Room[] = []): RoomsStore & { rooms: Map<string, Room> } {
  const rooms = new Map<string, Room>()
  let seq = 0
  seed.forEach(r => rooms.set(r._id, r))
  return {
    rooms,
    async create(input: CreateRoomInput): Promise<Room> {
      const _id = `room-${++seq}`
      const room: Room = { _id, matchId: null, status: 'open', ...input }
      rooms.set(_id, room)
      return room
    },
    async findByCode(code) {
      return [...rooms.values()].find(r => r.code === code) ?? null
    },
    async findById(id) {
      return rooms.get(id) ?? null
    },
    async addMember(id, member) {
      const r = rooms.get(id)
      if (r && !r.members.some(m => m.id === member.id)) r.members.push(member)
    },
    async removeMember(id, memberId) {
      const r = rooms.get(id)
      if (r) r.members = r.members.filter(m => m.id !== memberId)
    },
    async setStatus(id, status) {
      const r = rooms.get(id)
      if (r) r.status = status
    },
    async setMatched(id, matchId) {
      const r = rooms.get(id)
      if (r) { r.matchId = matchId; r.status = 'matched' }
    },
    async setMatchId(id, matchId) {
      const r = rooms.get(id)
      if (r) { r.matchId = matchId } // status NIEZMIENIONY (Etap 3B pkt 1)
    },
  }
}

function fakeClient(over: any = {}) {
  return {
    createMatch: vi.fn().mockResolvedValue({ ok: true, data: { matchId: 'match-99' } }),
    joinMatch: vi.fn().mockResolvedValue({ ok: true, data: { full: false } }),
    getMatch: vi.fn().mockResolvedValue({ ok: true, data: { matchId: 'match-99', gameId: 'rps', players: [], guestIds: [], phase: 'lobby' } }),
    cancelMatch: vi.fn().mockResolvedValue({ ok: true, data: {} }),
    ...over,
  }
}

function handlerFor(event: string, deps: any) {
  const h = createRoomsHandlers(deps).find(x => x.event === event)
  if (!h) throw new Error(`no handler ${event}`)
  return h
}

function userSocket(id: string, username = 'user') {
  return { emit: vi.fn(), id: 'sock', user: { _id: id, username } } as any
}

describe('generateRoomCode', () => {
  it('produces 6 chars from the [A-Z2-9] alphabet (no 0/1/O/I)', () => {
    const code = generateRoomCode(() => 0.5)
    expect(code).toHaveLength(6)
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
  })
})

describe('rooms:create', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a room with the host as first member, creates a match right away, and returns roomId + code + matchId', async () => {
    const store = makeStore()
    const client = fakeClient()
    const socket = userSocket('u1', 'alice')
    await handlerFor('rooms:create', { client, store, genCode: () => 'ABC234' })
      .handler(socket, { gameId: 'rps', name: 'Fun', visibility: 'public' })

    const room = store.rooms.get('room-1')!
    expect(room.code).toBe('ABC234')
    expect(room.hostId).toBe('u1')
    expect(room.members).toEqual([{ id: 'u1', kind: 'user', nick: 'alice' }])
    expect(client.createMatch).toHaveBeenCalledWith({ gameId: 'rps', players: ['u1'], capacity: 2, options: { target: 2 } })
    expect(room.matchId).toBe('match-99')
    expect(room.status).toBe('open') // wciąż dołączalny (Etap 3B pkt 1)
    expect(socket.emit).toHaveBeenCalledWith('rooms:create-complete', { roomId: 'room-1', code: 'ABC234', matchId: 'match-99' })
  })

  it('errors without gameId', async () => {
    const socket = userSocket('u1')
    await handlerFor('rooms:create', { client: fakeClient(), store: makeStore(), genCode: () => 'AAA222' })
      .handler(socket, { name: 'x' })
    expect(socket.emit).toHaveBeenCalledWith('rooms:create-error', { message: 'gameId required' })
  })

  it('retries the code on collision', async () => {
    const store = makeStore([{ _id: 'r0', code: 'DUP222', gameId: 'rps', name: '', hostId: 'x', hostKind: 'user', visibility: 'public', status: 'open', members: [], matchId: null } as any])
    // First candidate collides with existing, second is free.
    const codes = ['DUP222', 'FREE22']
    let i = 0
    const socket = userSocket('u1')
    await handlerFor('rooms:create', { client: fakeClient(), store, genCode: () => codes[i++] })
      .handler(socket, { gameId: 'rps' })
    expect(socket.emit).toHaveBeenCalledWith('rooms:create-complete', expect.objectContaining({ code: 'FREE22' }))
  })

  it('returns silently when not authenticated', async () => {
    const socket = { emit: vi.fn(), user: null } as any
    await handlerFor('rooms:create', { client: fakeClient(), store: makeStore(), genCode: () => 'AAA222' })
      .handler(socket, { gameId: 'rps' })
    expect(socket.emit).not.toHaveBeenCalled()
  })

  it('closes the room and emits an error when match creation fails', async () => {
    const store = makeStore()
    const client = fakeClient({ createMatch: vi.fn().mockResolvedValue({ ok: false, status: 502, error: 'games unreachable' }) })
    const socket = userSocket('u1')
    await handlerFor('rooms:create', { client, store, genCode: () => 'ABC234' })
      .handler(socket, { gameId: 'rps' })

    expect(store.rooms.get('room-1')!.status).toBe('closed')
    expect(socket.emit).toHaveBeenCalledWith('rooms:create-error', { message: 'games unreachable' })
    expect(socket.emit).not.toHaveBeenCalledWith('rooms:create-complete', expect.anything())
  })
})

describe('rooms:join', () => {
  beforeEach(() => vi.clearAllMocks())

  const openRoom = (): Room => ({
    _id: 'room-1', code: 'JOIN22', gameId: 'rps', name: '', hostId: 'host', hostKind: 'user',
    visibility: 'public', status: 'open', members: [{ id: 'host', kind: 'user', nick: 'host' }], matchId: null,
  })

  it('adds the user as a member (idempotent) and acks — no matchId, no games join call', async () => {
    const store = makeStore([openRoom()])
    const client = fakeClient()
    const socket = userSocket('u2', 'bob')
    const h = handlerFor('rooms:join', { client, store, genCode: () => 'x' })
    await h.handler(socket, { code: 'join22' }) // lowercase — normalized
    await h.handler(socket, { code: 'JOIN22' }) // repeat — no duplicate
    expect(store.rooms.get('room-1')!.members.filter(m => m.id === 'u2')).toHaveLength(1)
    expect(client.joinMatch).not.toHaveBeenCalled()
    expect(socket.emit).toHaveBeenCalledWith('rooms:join-complete', { roomId: 'room-1', matchId: null })
  })

  it('errors on unknown code', async () => {
    const socket = userSocket('u2')
    await handlerFor('rooms:join', { client: fakeClient(), store: makeStore(), genCode: () => 'x' })
      .handler(socket, { code: 'NOPE22' })
    expect(socket.emit).toHaveBeenCalledWith('rooms:join-error', { message: 'room not found' })
  })

  it('errors when the room is not open', async () => {
    const room = openRoom(); room.status = 'matched'
    const socket = userSocket('u2')
    await handlerFor('rooms:join', { client: fakeClient(), store: makeStore([room]), genCode: () => 'x' })
      .handler(socket, { code: 'JOIN22' })
    expect(socket.emit).toHaveBeenCalledWith('rooms:join-error', { message: 'room is not open' })
  })

  it('joins the linked match (Etap 3B pkt 2) and stays open when the slot is not yet full', async () => {
    const room = openRoom(); room.matchId = 'match-99'
    const store = makeStore([room])
    const client = fakeClient({ joinMatch: vi.fn().mockResolvedValue({ ok: true, data: { full: false } }) })
    const socket = userSocket('u2', 'bob')
    await handlerFor('rooms:join', { client, store, genCode: () => 'x' })
      .handler(socket, { code: 'JOIN22' })

    expect(client.joinMatch).toHaveBeenCalledWith('match-99', 'u2', 'user')
    expect(store.rooms.get('room-1')!.status).toBe('open')
    expect(socket.emit).toHaveBeenCalledWith('rooms:join-complete', { roomId: 'room-1', matchId: 'match-99' })
  })

  it('sets the room to matched when joining fills the last slot', async () => {
    const room = openRoom(); room.matchId = 'match-99'
    const store = makeStore([room])
    const client = fakeClient({ joinMatch: vi.fn().mockResolvedValue({ ok: true, data: { full: true } }) })
    const socket = userSocket('u2', 'bob')
    await handlerFor('rooms:join', { client, store, genCode: () => 'x' })
      .handler(socket, { code: 'JOIN22' })

    const stored = store.rooms.get('room-1')!
    expect(stored.status).toBe('matched')
    expect(stored.matchId).toBe('match-99')
  })

  it('errors when the match join fails (room member is already added, best-effort)', async () => {
    const room = openRoom(); room.matchId = 'match-99'
    const store = makeStore([room])
    const client = fakeClient({ joinMatch: vi.fn().mockResolvedValue({ ok: false, status: 409, error: 'match is full' }) })
    const socket = userSocket('u2', 'bob')
    await handlerFor('rooms:join', { client, store, genCode: () => 'x' })
      .handler(socket, { code: 'JOIN22' })

    expect(socket.emit).toHaveBeenCalledWith('rooms:join-error', { message: 'match is full' })
    expect(socket.emit).not.toHaveBeenCalledWith('rooms:join-complete', expect.anything())
  })
})

describe('rooms:leave', () => {
  beforeEach(() => vi.clearAllMocks())

  it('removes a member and closes the room when the host leaves', async () => {
    const store = makeStore([{
      _id: 'room-1', code: 'C', gameId: 'rps', name: '', hostId: 'host', hostKind: 'user',
      visibility: 'public', status: 'open', members: [{ id: 'host', kind: 'user' }, { id: 'u2', kind: 'user' }], matchId: null,
    }])
    const socket = userSocket('host')
    await handlerFor('rooms:leave', { client: fakeClient(), store, genCode: () => 'x' })
      .handler(socket, { roomId: 'room-1' })
    const room = store.rooms.get('room-1')!
    expect(room.status).toBe('closed')
    expect(room.members.some(m => m.id === 'host')).toBe(false)
    expect(socket.emit).toHaveBeenCalledWith('rooms:leave-complete', { roomId: 'room-1' })
  })

  it('removing a non-host keeps the room open', async () => {
    const store = makeStore([{
      _id: 'room-1', code: 'C', gameId: 'rps', name: '', hostId: 'host', hostKind: 'user',
      visibility: 'public', status: 'open', members: [{ id: 'host', kind: 'user' }, { id: 'u2', kind: 'user' }], matchId: null,
    }])
    const socket = userSocket('u2')
    await handlerFor('rooms:leave', { client: fakeClient(), store, genCode: () => 'x' })
      .handler(socket, { roomId: 'room-1' })
    expect(store.rooms.get('room-1')!.status).toBe('open')
  })

  it('Etap 3B pkt 6: host leaves with a linked match still in lobby → cancels the match', async () => {
    const store = makeStore([{
      _id: 'room-1', code: 'C', gameId: 'rps', name: '', hostId: 'host', hostKind: 'user',
      visibility: 'public', status: 'open', members: [{ id: 'host', kind: 'user' }], matchId: 'match-99',
    }])
    const client = fakeClient({
      getMatch: vi.fn().mockResolvedValue({ ok: true, data: { matchId: 'match-99', gameId: 'rps', players: ['host'], guestIds: [], phase: 'lobby' } }),
      cancelMatch: vi.fn().mockResolvedValue({ ok: true, data: {} }),
    })
    const socket = userSocket('host')
    await handlerFor('rooms:leave', { client, store, genCode: () => 'x' })
      .handler(socket, { roomId: 'room-1' })

    expect(client.getMatch).toHaveBeenCalledWith('match-99')
    expect(client.cancelMatch).toHaveBeenCalledWith('match-99', 'cancelled_lobby')
  })

  it('Etap 3B pkt 6: host leaves but the match already started → does NOT cancel it', async () => {
    const store = makeStore([{
      _id: 'room-1', code: 'C', gameId: 'rps', name: '', hostId: 'host', hostKind: 'user',
      visibility: 'public', status: 'matched', members: [{ id: 'host', kind: 'user' }, { id: 'u2', kind: 'user' }], matchId: 'match-99',
    }])
    const client = fakeClient({
      getMatch: vi.fn().mockResolvedValue({ ok: true, data: { matchId: 'match-99', gameId: 'rps', players: ['host', 'u2'], guestIds: [], phase: 'planning' } }),
      cancelMatch: vi.fn().mockResolvedValue({ ok: true, data: {} }),
    })
    const socket = userSocket('host')
    await handlerFor('rooms:leave', { client, store, genCode: () => 'x' })
      .handler(socket, { roomId: 'room-1' })

    expect(client.cancelMatch).not.toHaveBeenCalled()
  })

  it('non-host leaving does not touch the match', async () => {
    const store = makeStore([{
      _id: 'room-1', code: 'C', gameId: 'rps', name: '', hostId: 'host', hostKind: 'user',
      visibility: 'public', status: 'open', members: [{ id: 'host', kind: 'user' }, { id: 'u2', kind: 'user' }], matchId: 'match-99',
    }])
    const client = fakeClient()
    const socket = userSocket('u2')
    await handlerFor('rooms:leave', { client, store, genCode: () => 'x' })
      .handler(socket, { roomId: 'room-1' })

    expect(client.getMatch).not.toHaveBeenCalled()
    expect(client.cancelMatch).not.toHaveBeenCalled()
  })
})

describe('rooms:start', () => {
  beforeEach(() => vi.clearAllMocks())

  const room = (over: Partial<Room> = {}): Room => ({
    _id: 'room-1', code: 'C', gameId: 'rps', name: '', hostId: 'host', hostKind: 'user',
    visibility: 'public', status: 'open',
    members: [{ id: 'host', kind: 'user' }, { id: 'u2', kind: 'user' }, { id: 'g_1', kind: 'guest' }],
    matchId: null, ...over,
  })

  it('host starts: maps user/guest members to games create-match and stores matchId', async () => {
    const store = makeStore([room()])
    const client = fakeClient()
    const socket = userSocket('host')
    await handlerFor('rooms:start', { client, store, genCode: () => 'x' })
      .handler(socket, { roomId: 'room-1' })
    expect(client.createMatch).toHaveBeenCalledWith({
      gameId: 'rps', players: ['host', 'u2'], guestIds: ['g_1'], options: { target: 2 },
    })
    const stored = store.rooms.get('room-1')!
    expect(stored.matchId).toBe('match-99')
    expect(stored.status).toBe('matched')
    expect(socket.emit).toHaveBeenCalledWith('rooms:start-complete', { roomId: 'room-1', matchId: 'match-99' })
  })

  it('rejects a non-host', async () => {
    const store = makeStore([room()])
    const client = fakeClient()
    const socket = userSocket('u2')
    await handlerFor('rooms:start', { client, store, genCode: () => 'x' })
      .handler(socket, { roomId: 'room-1' })
    expect(client.createMatch).not.toHaveBeenCalled()
    expect(socket.emit).toHaveBeenCalledWith('rooms:start-error', { message: 'only the host can start' })
  })

  it('requires at least two members', async () => {
    const store = makeStore([room({ members: [{ id: 'host', kind: 'user' }] })])
    const client = fakeClient()
    const socket = userSocket('host')
    await handlerFor('rooms:start', { client, store, genCode: () => 'x' })
      .handler(socket, { roomId: 'room-1' })
    expect(client.createMatch).not.toHaveBeenCalled()
    expect(socket.emit).toHaveBeenCalledWith('rooms:start-error', { message: 'need at least two members' })
  })

  it('propagates a games create-match failure', async () => {
    const store = makeStore([room()])
    const client = fakeClient({ createMatch: vi.fn().mockResolvedValue({ ok: false, status: 502, error: 'games unreachable' }) })
    const socket = userSocket('host')
    await handlerFor('rooms:start', { client, store, genCode: () => 'x' })
      .handler(socket, { roomId: 'room-1' })
    expect(socket.emit).toHaveBeenCalledWith('rooms:start-error', { message: 'games unreachable' })
    expect(store.rooms.get('room-1')!.status).toBe('open')
  })
})
