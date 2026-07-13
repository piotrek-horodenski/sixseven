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
    getMatch: vi.fn().mockResolvedValue({
      ok: true,
      data: { matchId: 'm1', gameId: 'rps', players: ['u1', 'u2'], guestIds: [], phase: 'planning' },
    }),
    joinMatch: vi.fn().mockResolvedValue({ ok: true, data: { full: false } }),
    cancelMatch: vi.fn().mockResolvedValue({ ok: true, data: {} }),
    getPrefs: vi.fn().mockResolvedValue({ ok: true, data: { prefs: {} } }),
    setPrefs: vi.fn().mockResolvedValue({ ok: true, data: {} }),
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

  it('ignoruje `ranked` z payloadu — ranked ustawia wyłącznie ścieżka kolejki (kontrakt 4d/4e §1)', async () => {
    const client = fakeClient()
    await handlerFor('games:create-match', client).handler(socket, {
      gameId: 'rps',
      players: ['u2'],
      ranked: true, // próba samodeklaracji meczu rankingowego przez klienta
    } as any)
    expect(client.createMatch).toHaveBeenCalledTimes(1)
    const input = (client.createMatch as any).mock.calls[0][0]
    expect(input).not.toHaveProperty('ranked')
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

  it('start emits complete, playerId z tożsamości JWT (user)', async () => {
    const client = fakeClient()
    await handlerFor('games:start', client).handler(socket, { matchId: 'm1' })
    expect(client.start).toHaveBeenCalledWith('m1', 'u1')
    expect(socket.emit).toHaveBeenCalledWith('games:start-complete', { matchId: 'm1' })
  })

  it('start: playerId z tożsamości NIGDY z payloadu (próba podszycia)', async () => {
    const client = fakeClient()
    await handlerFor('games:start', client).handler(socket, { matchId: 'm1', playerId: 'attacker' })
    expect(client.start).toHaveBeenCalledWith('m1', 'u1')
  })

  it('start: playerId z tokenu meczu (matchScope), gdy brak user', async () => {
    const client = fakeClient()
    socket.user = null
    socket.match = { matchId: 'm1', playerId: 'match-player-1' }
    await handlerFor('games:start', client).handler(socket, { matchId: 'm1' })
    expect(client.start).toHaveBeenCalledWith('m1', 'match-player-1')
    expect(socket.emit).toHaveBeenCalledWith('games:start-complete', { matchId: 'm1' })
  })

  it('start: odrzuca niezgodność scope tokenu meczu', async () => {
    const client = fakeClient()
    socket.user = null
    socket.match = { matchId: 'm1', playerId: 'match-player-1' }
    await handlerFor('games:start', client).handler(socket, { matchId: 'm2' })
    expect(client.start).not.toHaveBeenCalled()
    expect(socket.emit).toHaveBeenCalledWith('games:start-error', { message: 'match token scope mismatch' })
  })

  it('start: returns silently when neither user nor match scope', async () => {
    const client = fakeClient()
    socket.user = null
    await handlerFor('games:start', client).handler(socket, { matchId: 'm1' })
    expect(socket.emit).not.toHaveBeenCalled()
    expect(client.start).not.toHaveBeenCalled()
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

describe('games:get-prefs / games:set-prefs (Etap 3B pkt 5)', () => {
  let socket: any
  beforeEach(() => {
    socket = makeSocket()
    vi.clearAllMocks()
  })

  it('get-prefs: playerId ZAWSZE z JWT (nigdy z payloadu), zwraca prefs', async () => {
    const client = fakeClient({ getPrefs: vi.fn().mockResolvedValue({ ok: true, data: { prefs: { fallbackMove: 'rock' } } }) })
    await handlerFor('games:get-prefs', client).handler(socket, { gameId: 'rps', playerId: 'attacker' })
    expect(client.getPrefs).toHaveBeenCalledWith('rps', 'u1')
    expect(socket.emit).toHaveBeenCalledWith('games:get-prefs-complete', { gameId: 'rps', prefs: { fallbackMove: 'rock' } })
  })

  it('get-prefs: returns silently when not authenticated (guest bez sesji user)', async () => {
    const client = fakeClient()
    socket.user = null
    await handlerFor('games:get-prefs', client).handler(socket, { gameId: 'rps' })
    expect(socket.emit).not.toHaveBeenCalled()
    expect(client.getPrefs).not.toHaveBeenCalled()
  })

  it('get-prefs: errors when gameId missing', async () => {
    const client = fakeClient()
    await handlerFor('games:get-prefs', client).handler(socket, {})
    expect(client.getPrefs).not.toHaveBeenCalled()
    expect(socket.emit).toHaveBeenCalledWith('games:get-prefs-error', { message: 'gameId required' })
  })

  it('get-prefs: propagates client error', async () => {
    const client = fakeClient({ getPrefs: vi.fn().mockResolvedValue({ ok: false, status: 500, error: 'boom' }) })
    await handlerFor('games:get-prefs', client).handler(socket, { gameId: 'rps' })
    expect(socket.emit).toHaveBeenCalledWith('games:get-prefs-error', { message: 'boom' })
  })

  it('set-prefs: playerId ZAWSZE z JWT (nigdy z payloadu)', async () => {
    const client = fakeClient()
    await handlerFor('games:set-prefs', client).handler(socket, { gameId: 'rps', prefs: { fallbackMove: 'paper' }, playerId: 'attacker' })
    expect(client.setPrefs).toHaveBeenCalledWith('rps', 'u1', { fallbackMove: 'paper' })
    expect(socket.emit).toHaveBeenCalledWith('games:set-prefs-complete', { gameId: 'rps' })
  })

  it('set-prefs: returns silently when not authenticated', async () => {
    const client = fakeClient()
    socket.user = null
    await handlerFor('games:set-prefs', client).handler(socket, { gameId: 'rps', prefs: {} })
    expect(socket.emit).not.toHaveBeenCalled()
    expect(client.setPrefs).not.toHaveBeenCalled()
  })

  it('set-prefs: errors when prefs is not an object', async () => {
    const client = fakeClient()
    await handlerFor('games:set-prefs', client).handler(socket, { gameId: 'rps', prefs: ['x'] })
    expect(client.setPrefs).not.toHaveBeenCalled()
    expect(socket.emit).toHaveBeenCalledWith('games:set-prefs-error', { message: 'prefs must be an object' })
  })

  it('set-prefs: propagates client error', async () => {
    const client = fakeClient({ setPrefs: vi.fn().mockResolvedValue({ ok: false, status: 413, error: 'prefs too large' }) })
    await handlerFor('games:set-prefs', client).handler(socket, { gameId: 'rps', prefs: {} })
    expect(socket.emit).toHaveBeenCalledWith('games:set-prefs-error', { message: 'prefs too large' })
  })
})
