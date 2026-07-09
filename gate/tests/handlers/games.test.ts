import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../app/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { createGamesHandlers } from '../../app/socket-handlers/games/games.handler'
import type { GamesClient } from '../../app/services/games-client'

/** Fake klienta games — testy handlerów bez sieci. */
function fakeClient(overrides: Partial<GamesClient> = {}): GamesClient {
  return {
    createMatch: vi.fn().mockResolvedValue({ ok: true, data: { matchId: 'm1' } }),
    start: vi.fn().mockResolvedValue({ ok: true, data: {} }),
    submitMove: vi.fn().mockResolvedValue({ ok: true, data: { status: 'accepted' } }),
    revealDone: vi.fn().mockResolvedValue({ ok: true, data: {} }),
    ...overrides,
  }
}

function handlerFor(event: string, client: GamesClient) {
  const h = createGamesHandlers(client).find((x) => x.event === event)
  if (!h) throw new Error(`no handler for ${event}`)
  return h
}

function makeSocket() {
  return {
    emit: vi.fn(),
    id: 'socket-1',
    user: { _id: 'u1', username: 'u', email: 'e', permissions: [] },
  } as any
}

describe('games:create-match', () => {
  let socket: any
  beforeEach(() => {
    socket = makeSocket()
    vi.clearAllMocks()
  })

  it('returns silently when not authenticated', async () => {
    const client = fakeClient()
    socket.user = null
    await handlerFor('games:create-match', client).handler(socket, { gameId: 'rps', players: ['u2'] })
    expect(socket.emit).not.toHaveBeenCalled()
    expect(client.createMatch).not.toHaveBeenCalled()
  })

  it('errors when gameId missing', async () => {
    const client = fakeClient()
    await handlerFor('games:create-match', client).handler(socket, { players: ['u2'] })
    expect(client.createMatch).not.toHaveBeenCalled()
    expect(socket.emit).toHaveBeenCalledWith('games:create-match-error', { message: 'gameId required' })
  })

  it('errors when fewer than two players', async () => {
    const client = fakeClient()
    await handlerFor('games:create-match', client).handler(socket, { gameId: 'rps', players: [] })
    expect(client.createMatch).not.toHaveBeenCalled()
    expect(socket.emit).toHaveBeenCalledWith('games:create-match-error', { message: 'need at least two players' })
  })

  it('includes the authenticated creator as a player and emits matchId', async () => {
    const client = fakeClient()
    await handlerFor('games:create-match', client).handler(socket, { gameId: 'rps', players: ['u2'] })
    expect(client.createMatch).toHaveBeenCalledWith(
      expect.objectContaining({ gameId: 'rps', players: ['u1', 'u2'] }),
    )
    expect(socket.emit).toHaveBeenCalledWith('games:create-match-complete', { matchId: 'm1' })
  })

  it('does not duplicate the creator if already listed', async () => {
    const client = fakeClient()
    await handlerFor('games:create-match', client).handler(socket, { gameId: 'rps', players: ['u2', 'u1'] })
    expect(client.createMatch).toHaveBeenCalledWith(
      expect.objectContaining({ players: ['u2', 'u1'] }),
    )
  })

  it('ignores non-string entries in players', async () => {
    const client = fakeClient()
    await handlerFor('games:create-match', client).handler(socket, { gameId: 'rps', players: ['u2', 42, null] })
    expect(client.createMatch).toHaveBeenCalledWith(
      expect.objectContaining({ players: ['u1', 'u2'] }),
    )
  })

  it('propagates client error', async () => {
    const client = fakeClient({
      createMatch: vi.fn().mockResolvedValue({ ok: false, status: 404, error: 'game not registered' }),
    })
    await handlerFor('games:create-match', client).handler(socket, { gameId: 'nope', players: ['u2'] })
    expect(socket.emit).toHaveBeenCalledWith('games:create-match-error', { message: 'game not registered' })
  })
})

describe('games:submit-move', () => {
  let socket: any
  beforeEach(() => {
    socket = makeSocket()
    vi.clearAllMocks()
  })

  it('returns silently when not authenticated', async () => {
    const client = fakeClient()
    socket.user = null
    await handlerFor('games:submit-move', client).handler(socket, { matchId: 'm1', move: 'rock' })
    expect(socket.emit).not.toHaveBeenCalled()
    expect(client.submitMove).not.toHaveBeenCalled()
  })

  it('forces playerId from JWT, never from payload', async () => {
    const client = fakeClient()
    // payload próbuje podszyć się pod innego gracza:
    await handlerFor('games:submit-move', client).handler(socket, { matchId: 'm1', move: 'rock', playerId: 'attacker' })
    expect(client.submitMove).toHaveBeenCalledWith('m1', 'u1', 'rock')
    expect(socket.emit).toHaveBeenCalledWith('games:submit-move-complete', { matchId: 'm1' })
  })

  it('errors when matchId missing', async () => {
    const client = fakeClient()
    await handlerFor('games:submit-move', client).handler(socket, { move: 'rock' })
    expect(client.submitMove).not.toHaveBeenCalled()
    expect(socket.emit).toHaveBeenCalledWith('games:submit-move-error', { message: 'matchId required' })
  })

  it('emits rejected when move rejected (a valid game outcome)', async () => {
    const client = fakeClient({
      submitMove: vi.fn().mockResolvedValue({ ok: true, data: { status: 'rejected' } }),
    })
    await handlerFor('games:submit-move', client).handler(socket, { matchId: 'm1', move: 'bad' })
    expect(socket.emit).toHaveBeenCalledWith('games:submit-move-rejected', { matchId: 'm1' })
  })

  it('emits error on command failure', async () => {
    const client = fakeClient({
      submitMove: vi.fn().mockResolvedValue({ ok: false, status: 0, error: 'games unreachable' }),
    })
    await handlerFor('games:submit-move', client).handler(socket, { matchId: 'm1', move: 'rock' })
    expect(socket.emit).toHaveBeenCalledWith('games:submit-move-error', { message: 'games unreachable' })
  })
})

describe('games:start and games:reveal-done', () => {
  let socket: any
  beforeEach(() => {
    socket = makeSocket()
    vi.clearAllMocks()
  })

  it('start requires matchId', async () => {
    const client = fakeClient()
    await handlerFor('games:start', client).handler(socket, {})
    expect(client.start).not.toHaveBeenCalled()
    expect(socket.emit).toHaveBeenCalledWith('games:start-error', { message: 'matchId required' })
  })

  it('start emits complete', async () => {
    const client = fakeClient()
    await handlerFor('games:start', client).handler(socket, { matchId: 'm1' })
    expect(client.start).toHaveBeenCalledWith('m1')
    expect(socket.emit).toHaveBeenCalledWith('games:start-complete', { matchId: 'm1' })
  })

  it('reveal-done emits complete', async () => {
    const client = fakeClient()
    await handlerFor('games:reveal-done', client).handler(socket, { matchId: 'm1' })
    expect(client.revealDone).toHaveBeenCalledWith('m1')
    expect(socket.emit).toHaveBeenCalledWith('games:reveal-done-complete', { matchId: 'm1' })
  })

  it('reveal-done returns silently when not authenticated', async () => {
    const client = fakeClient()
    socket.user = null
    await handlerFor('games:reveal-done', client).handler(socket, { matchId: 'm1' })
    expect(socket.emit).not.toHaveBeenCalled()
    expect(client.revealDone).not.toHaveBeenCalled()
  })
})
