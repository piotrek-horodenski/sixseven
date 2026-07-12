import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../app/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import {
  createChatHandlers,
  ChatHandlerDeps,
  ChatMessageInput,
} from '../../app/socket-handlers/chat/chat.handler'

/** In-memory messages store — testy bez mongo. Zapamiętuje ostatni zapis. */
function makeStore() {
  const saved: ChatMessageInput[] = []
  let seq = 0
  return {
    saved,
    async create(msg: ChatMessageInput) {
      saved.push(msg)
      return { _id: `msg-${++seq}` }
    },
  }
}

function makeDeps(over: Partial<ChatHandlerDeps> = {}): ChatHandlerDeps {
  return {
    store: makeStore(),
    findRoom: vi.fn().mockResolvedValue({ members: [{ id: 'u1', kind: 'user' }, { id: 'u2', kind: 'user' }] }),
    getMatch: vi.fn().mockResolvedValue({ ok: true, data: { matchId: 'm1', gameId: 'rps', players: ['u1', 'u2'], guestIds: ['g_1'], phase: 'planning' } }),
    maxLen: 20,
    ...over,
  }
}

function handler(deps: ChatHandlerDeps) {
  const h = createChatHandlers(deps).find(x => x.event === 'chat:send')
  if (!h) throw new Error('no chat:send handler')
  return h
}

function userSocket(id: string, username = 'user') {
  return { emit: vi.fn(), id: 'sock', user: { _id: id, username }, handshake: {} } as any
}

function matchSocket(matchId: string, playerId: string) {
  return { emit: vi.fn(), id: 'sock', match: { matchId, playerId }, handshake: {} } as any
}

describe('chat:send', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns silently when neither user nor match token is present', async () => {
    const deps = makeDeps()
    const socket = { emit: vi.fn(), user: null } as any
    await handler(deps).handler(socket, { scope: 'room', scopeId: 'room-1', text: 'hi' })
    expect(socket.emit).not.toHaveBeenCalled()
  })

  it('enforces max length SERVER-SIDE (rejects over-long text, does not save)', async () => {
    const store = makeStore()
    const deps = makeDeps({ store, maxLen: 5 })
    const socket = userSocket('u1')
    await handler(deps).handler(socket, { scope: 'room', scopeId: 'room-1', text: 'way too long text' })
    expect(socket.emit).toHaveBeenCalledWith('chat:send-error', { message: 'text too long' })
    expect(store.saved).toHaveLength(0)
  })

  it('dm: saves with members = the sorted pair when the two are friends', async () => {
    const store = makeStore()
    const areFriends = vi.fn().mockResolvedValue(true)
    const deps = makeDeps({ store, areFriends })
    const socket = userSocket('u1', 'gracz1')
    await handler(deps).handler(socket, { scope: 'dm', scopeId: 'u1_u2', text: 'hej' })

    expect(areFriends).toHaveBeenCalledWith('u1', 'u2')
    expect(store.saved).toHaveLength(1)
    expect(store.saved[0]).toMatchObject({ scope: 'dm', scopeId: 'u1_u2', authorId: 'u1', members: ['u1', 'u2'] })
    expect(socket.emit).toHaveBeenCalledWith('chat:send-complete', { id: 'msg-1' })
  })

  it('dm: rejects when the two are NOT friends (no save)', async () => {
    const store = makeStore()
    const areFriends = vi.fn().mockResolvedValue(false)
    const deps = makeDeps({ store, areFriends })
    const socket = userSocket('u1')
    await handler(deps).handler(socket, { scope: 'dm', scopeId: 'u1_u2', text: 'hej' })
    expect(socket.emit).toHaveBeenCalledWith('chat:send-error', { message: 'not friends' })
    expect(store.saved).toHaveLength(0)
  })

  it('dm: rejects when the author is not part of the channel pair', async () => {
    const areFriends = vi.fn().mockResolvedValue(true)
    const deps = makeDeps({ areFriends })
    const socket = userSocket('u9') // nie w parze u1_u2
    await handler(deps).handler(socket, { scope: 'dm', scopeId: 'u1_u2', text: 'hej' })
    expect(socket.emit).toHaveBeenCalledWith('chat:send-error', { message: 'invalid dm channel' })
  })

  it('dm: a match-token socket (guest) cannot DM', async () => {
    const deps = makeDeps({ areFriends: vi.fn().mockResolvedValue(true) })
    const socket = matchSocket('m1', 'g_1')
    await handler(deps).handler(socket, { scope: 'dm', scopeId: 'g_1_u2', text: 'hej' })
    expect(socket.emit).toHaveBeenCalledWith('chat:send-error', { message: 'dm requires a user session' })
  })

  it('rejects empty / whitespace-only text', async () => {
    const deps = makeDeps()
    const socket = userSocket('u1')
    await handler(deps).handler(socket, { scope: 'room', scopeId: 'room-1', text: '   ' })
    expect(socket.emit).toHaveBeenCalledWith('chat:send-error', { message: 'text required' })
  })

  it('enforces a rate-limit SERVER-SIDE per author', async () => {
    const store = makeStore()
    // rateMax=2 → third send from same author is rate_limited.
    const deps = makeDeps({ store, rateMax: 2, rateWindowMs: 60_000 })
    const h = handler(deps)
    const socket = userSocket('u1')
    await h.handler(socket, { scope: 'room', scopeId: 'room-1', text: 'one' })
    await h.handler(socket, { scope: 'room', scopeId: 'room-1', text: 'two' })
    await h.handler(socket, { scope: 'room', scopeId: 'room-1', text: 'three' })
    expect(store.saved).toHaveLength(2)
    expect(socket.emit).toHaveBeenLastCalledWith('chat:send-error', { message: 'rate_limited' })
  })

  it('rejects a non-member of a room (membership checked server-side)', async () => {
    const store = makeStore()
    const findRoom = vi.fn().mockResolvedValue({ members: [{ id: 'u2', kind: 'user' }] })
    const deps = makeDeps({ store, findRoom })
    const socket = userSocket('u1') // not a member
    await handler(deps).handler(socket, { scope: 'room', scopeId: 'room-1', text: 'hi' })
    expect(socket.emit).toHaveBeenCalledWith('chat:send-error', { message: 'not a member' })
    expect(store.saved).toHaveLength(0)
  })

  it('rejects when the room does not exist', async () => {
    const findRoom = vi.fn().mockResolvedValue(null)
    const deps = makeDeps({ findRoom })
    const socket = userSocket('u1')
    await handler(deps).handler(socket, { scope: 'room', scopeId: 'nope', text: 'hi' })
    expect(socket.emit).toHaveBeenCalledWith('chat:send-error', { message: 'not a member' })
  })

  it('saves a room message with a members snapshot and acks with id', async () => {
    const store = makeStore()
    const deps = makeDeps({ store })
    const socket = userSocket('u1', 'alice')
    await handler(deps).handler(socket, { scope: 'room', scopeId: 'room-1', text: '  hello  ' })
    expect(store.saved).toHaveLength(1)
    expect(store.saved[0]).toMatchObject({
      scope: 'room', scopeId: 'room-1', authorId: 'u1', authorNick: 'alice', text: 'hello',
      members: ['u1', 'u2'],
    })
    expect(socket.emit).toHaveBeenCalledWith('chat:send-complete', { id: 'msg-1' })
  })

  it('rejects a non-member of a match (membership via getMatch)', async () => {
    const store = makeStore()
    const getMatch = vi.fn().mockResolvedValue({ ok: true, data: { matchId: 'm1', gameId: 'rps', players: ['x', 'y'], guestIds: [], phase: 'planning' } })
    const deps = makeDeps({ store, getMatch })
    const socket = userSocket('u1')
    await handler(deps).handler(socket, { scope: 'match', scopeId: 'm1', text: 'hi' })
    expect(socket.emit).toHaveBeenCalledWith('chat:send-error', { message: 'not a member' })
    expect(store.saved).toHaveLength(0)
  })

  it('lets a match-token player send to their own match and snapshots players∪guestIds', async () => {
    const store = makeStore()
    const getMatch = vi.fn().mockResolvedValue({ ok: true, data: { matchId: 'm1', gameId: 'rps', players: ['u1', 'u2'], guestIds: ['g_1'], phase: 'planning' } })
    const deps = makeDeps({ store, getMatch })
    const socket = matchSocket('m1', 'g_1') // guest playing via match token
    await handler(deps).handler(socket, { scope: 'match', scopeId: 'm1', text: 'gg' })
    expect(store.saved[0]).toMatchObject({
      scope: 'match', scopeId: 'm1', authorId: 'g_1', members: ['u1', 'u2', 'g_1'],
    })
    expect(socket.emit).toHaveBeenCalledWith('chat:send-complete', { id: 'msg-1' })
  })

  it('rejects when a match token is used for a different match (scope mismatch)', async () => {
    const store = makeStore()
    const deps = makeDeps({ store })
    const socket = matchSocket('m1', 'g_1')
    await handler(deps).handler(socket, { scope: 'match', scopeId: 'other-match', text: 'hi' })
    expect(socket.emit).toHaveBeenCalledWith('chat:send-error', { message: 'match token scope mismatch' })
    expect(store.saved).toHaveLength(0)
  })

  it('does not trust a payload author — authorId comes from the token', async () => {
    const store = makeStore()
    const deps = makeDeps({ store })
    const socket = userSocket('u1', 'alice')
    // Malicious extra fields in payload must be ignored.
    await handler(deps).handler(socket, { scope: 'room', scopeId: 'room-1', text: 'hi', authorId: 'u2', authorNick: 'mallory' } as any)
    expect(store.saved[0].authorId).toBe('u1')
    expect(store.saved[0].authorNick).toBe('alice')
  })
})
