import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../app/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { createGamesHandlers } from '../../app/socket-handlers/games/games.handler'
import type { GamesClient } from '../../app/services/games-client'

function fakeClient(overrides: Partial<GamesClient> = {}): GamesClient {
  return {
    createMatch: vi.fn().mockResolvedValue({ ok: true, data: { matchId: 'm1' } }),
    start: vi.fn().mockResolvedValue({ ok: true, data: {} }),
    submitMove: vi.fn().mockResolvedValue({ ok: true, data: { status: 'accepted' } }),
    revealDone: vi.fn().mockResolvedValue({ ok: true, data: {} }),
    getMatch: vi.fn().mockResolvedValue({
      ok: true,
      data: { matchId: 'm1', gameId: 'rps', players: ['u1'], guestIds: ['g_1'], phase: 'lobby' },
    }),
    ...overrides,
  }
}

const issueHandoff = vi.fn((claims: { matchId: string; subjectId: string }) => `code-${claims.matchId}-${claims.subjectId}`)

function handlerFor(event: string, client: GamesClient) {
  const h = createGamesHandlers(client, { issueHandoff }).find((x) => x.event === event)
  if (!h) throw new Error(`no handler for ${event}`)
  return h
}

function matchSocket(matchId: string, playerId: string) {
  return { emit: vi.fn(), id: 's', user: null, match: { matchId, playerId } } as any
}

describe('games:submit-move — match token scope', () => {
  beforeEach(() => vi.clearAllMocks())

  it('takes playerId from the match token, never from the payload (spy defense)', async () => {
    const client = fakeClient()
    const socket = matchSocket('m1', 'player-A')
    // Payload próbuje podszyć się pod innego gracza.
    await handlerFor('games:submit-move', client).handler(socket, { matchId: 'm1', move: 'rock', playerId: 'player-B' })
    expect(client.submitMove).toHaveBeenCalledWith('m1', 'player-A', 'rock')
    expect(socket.emit).toHaveBeenCalledWith('games:submit-move-complete', { matchId: 'm1' })
  })

  it('rejects a matchId that differs from the token scope', async () => {
    const client = fakeClient()
    const socket = matchSocket('m1', 'player-A')
    await handlerFor('games:submit-move', client).handler(socket, { matchId: 'other-match', move: 'rock' })
    expect(client.submitMove).not.toHaveBeenCalled()
    expect(socket.emit).toHaveBeenCalledWith('games:submit-move-error', { message: 'match token scope mismatch' })
  })

  it('still works for a plain user socket (playerId from JWT)', async () => {
    const client = fakeClient()
    const socket = { emit: vi.fn(), id: 's', user: { _id: 'u9' } } as any
    await handlerFor('games:submit-move', client).handler(socket, { matchId: 'm1', move: 'paper' })
    expect(client.submitMove).toHaveBeenCalledWith('m1', 'u9', 'paper')
  })
})

describe('games:reveal-done — match token scope', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects mismatched matchId for a match token', async () => {
    const client = fakeClient()
    const socket = matchSocket('m1', 'player-A')
    await handlerFor('games:reveal-done', client).handler(socket, { matchId: 'nope' })
    expect(client.revealDone).not.toHaveBeenCalled()
    expect(socket.emit).toHaveBeenCalledWith('games:reveal-done-error', { message: 'match token scope mismatch' })
  })

  it('accepts the scoped matchId', async () => {
    const client = fakeClient()
    const socket = matchSocket('m1', 'player-A')
    await handlerFor('games:reveal-done', client).handler(socket, { matchId: 'm1' })
    expect(client.revealDone).toHaveBeenCalledWith('m1')
    expect(socket.emit).toHaveBeenCalledWith('games:reveal-done-complete', { matchId: 'm1' })
  })
})

describe('games:request-handoff — membership verification', () => {
  beforeEach(() => vi.clearAllMocks())

  it('issues a handoff code for a user who is a match player', async () => {
    const client = fakeClient()
    const socket = { emit: vi.fn(), id: 's', user: { _id: 'u1' } } as any
    await handlerFor('games:request-handoff', client).handler(socket, { matchId: 'm1' })
    expect(client.getMatch).toHaveBeenCalledWith('m1')
    expect(issueHandoff).toHaveBeenCalledWith({ matchId: 'm1', subjectId: 'u1' })
    expect(socket.emit).toHaveBeenCalledWith('games:handoff-complete', {
      code: 'code-m1-u1',
      gameId: 'rps',
      playerId: 'u1',
    })
  })

  it('issues a handoff code for a guest who is in guestIds', async () => {
    const client = fakeClient()
    const socket = { emit: vi.fn(), id: 's', user: null, guest: { guestId: 'g_1', roomId: 'r1' } } as any
    await handlerFor('games:request-handoff', client).handler(socket, { matchId: 'm1' })
    expect(socket.emit).toHaveBeenCalledWith('games:handoff-complete', {
      code: 'code-m1-g_1',
      gameId: 'rps',
      playerId: 'g_1',
    })
  })

  it('rejects a subject who is not a member of the match', async () => {
    const client = fakeClient()
    const socket = { emit: vi.fn(), id: 's', user: { _id: 'intruder' } } as any
    await handlerFor('games:request-handoff', client).handler(socket, { matchId: 'm1' })
    expect(issueHandoff).not.toHaveBeenCalled()
    expect(socket.emit).toHaveBeenCalledWith('games:handoff-error', { message: 'not a member of this match' })
  })

  it('propagates a get-match failure (e.g. 404)', async () => {
    const client = fakeClient({
      getMatch: vi.fn().mockResolvedValue({ ok: false, status: 404, error: 'match not found' }),
    })
    const socket = { emit: vi.fn(), id: 's', user: { _id: 'u1' } } as any
    await handlerFor('games:request-handoff', client).handler(socket, { matchId: 'gone' })
    expect(socket.emit).toHaveBeenCalledWith('games:handoff-error', { message: 'match not found' })
  })

  it('is not allowed for a match-token socket', async () => {
    const client = fakeClient()
    const socket = matchSocket('m1', 'player-A')
    await handlerFor('games:request-handoff', client).handler(socket, { matchId: 'm1' })
    expect(client.getMatch).not.toHaveBeenCalled()
    expect(socket.emit).toHaveBeenCalledWith('games:handoff-error', { message: 'not allowed for match token' })
  })

  it('returns silently with no identity', async () => {
    const client = fakeClient()
    const socket = { emit: vi.fn(), id: 's', user: null } as any
    await handlerFor('games:request-handoff', client).handler(socket, { matchId: 'm1' })
    expect(socket.emit).not.toHaveBeenCalled()
  })
})
