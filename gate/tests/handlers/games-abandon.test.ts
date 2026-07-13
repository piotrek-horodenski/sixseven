import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../app/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { createGamesHandlers } from '../../app/socket-handlers/games/games.handler'
import type { GamesClient } from '../../app/services/games-client'

/**
 * games:abandon (4e/backlog „wyjście z gry") — WYŁĄCZNIE na sockecie tokenu
 * meczu; matchId i playerId biorą się Z TOKENU (payload pusty). Ranked =
 * walkower po stronie games, casual = noop.
 */

function fakeClient(overrides: Partial<GamesClient> = {}): GamesClient {
  return {
    abandon: vi.fn().mockResolvedValue({ ok: true, data: { noop: false } }),
    ...overrides,
  } as unknown as GamesClient
}

function abandonHandler(client: GamesClient) {
  const h = createGamesHandlers(client).find(x => x.event === 'games:abandon')
  if (!h) throw new Error('brak handlera games:abandon')
  return h
}

describe('games:abandon', () => {
  beforeEach(() => vi.clearAllMocks())

  it('pełny JWT (socket.user) NIE porzuca meczu — wymagany token meczu', async () => {
    const client = fakeClient()
    const socket: any = { id: 's-u', emit: vi.fn(), user: { _id: 'u1', permissions: [] } }
    await abandonHandler(client).handler(socket, {})
    expect(client.abandon).not.toHaveBeenCalled()
    expect(socket.emit).toHaveBeenCalledWith('games:abandon-error', { message: 'match token required' })
  })

  it('gość (socket.guest) też odrzucony', async () => {
    const client = fakeClient()
    const socket: any = { id: 's-g', emit: vi.fn(), guest: { guestId: 'g_1', roomId: 'r1' } }
    await abandonHandler(client).handler(socket, {})
    expect(client.abandon).not.toHaveBeenCalled()
    expect(socket.emit).toHaveBeenCalledWith('games:abandon-error', { message: 'match token required' })
  })

  it('matchId i playerId Z TOKENU meczu — payload jest ignorowany', async () => {
    const client = fakeClient()
    const socket: any = { id: 's-m', emit: vi.fn(), match: { matchId: 'm1', playerId: 'u1' } }
    await abandonHandler(client).handler(socket, { matchId: 'cudzy-mecz', playerId: 'ofiara' })
    expect(client.abandon).toHaveBeenCalledWith('m1', 'u1')
    expect(socket.emit).toHaveBeenCalledWith('games:abandon-complete', { matchId: 'm1', noop: false })
  })

  it('mecz casual: propaguje noop=true (wyjście nie kończy meczu)', async () => {
    const client = fakeClient({
      abandon: vi.fn().mockResolvedValue({ ok: true, data: { noop: true } }),
    })
    const socket: any = { id: 's-m', emit: vi.fn(), match: { matchId: 'm2', playerId: 'u1' } }
    await abandonHandler(client).handler(socket, {})
    expect(socket.emit).toHaveBeenCalledWith('games:abandon-complete', { matchId: 'm2', noop: true })
  })

  it('propaguje błąd z games', async () => {
    const client = fakeClient({
      abandon: vi.fn().mockResolvedValue({ ok: false, status: 409, error: 'match already finished' }),
    })
    const socket: any = { id: 's-m', emit: vi.fn(), match: { matchId: 'm3', playerId: 'u1' } }
    await abandonHandler(client).handler(socket, {})
    expect(socket.emit).toHaveBeenCalledWith('games:abandon-error', { message: 'match already finished' })
  })
})
