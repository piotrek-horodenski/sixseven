import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mockujemy cienki socket, żeby test nie tworzył realnej instancji io().
const tokenSocket = {
  subscribe: vi.fn((_collection: string, _filter: any, docs?: any) => docs ?? { value: [] }),
  call: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  socket: { value: null },
  connected: { value: false },
}

vi.mock('../useTokenSocket', () => ({
  useTokenSocket: vi.fn(() => tokenSocket),
}))

import { useMatchClient } from '../useMatchClient'
import { useTokenSocket } from '../useTokenSocket'

const OK_PAYLOAD = {
  token: 'match-token-xyz',
  matchId: 'm1',
  playerId: 'p1',
  gameId: 'rps',
  expiresAt: 123,
}

function makeFetch(response: { ok: boolean; body: any }) {
  return vi.fn(async () => ({
    ok: response.ok,
    json: async () => response.body,
  })) as unknown as typeof fetch
}

describe('useMatchClient — wymiana handoff → token meczu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('POSTuje kod handoffu na /auth/match-token', async () => {
    const fetchFn = makeFetch({ ok: true, body: OK_PAYLOAD })
    const client = useMatchClient(fetchFn)

    await client.start('HANDOFF1')

    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [url, opts] = (fetchFn as any).mock.calls[0]
    expect(String(url)).toMatch(/\/auth\/match-token$/)
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body)).toEqual({ code: 'HANDOFF1' })
  })

  it('po sukcesie zapisuje matchId/playerId/gameId i łączy socket tokenem', async () => {
    const fetchFn = makeFetch({ ok: true, body: OK_PAYLOAD })
    const client = useMatchClient(fetchFn)

    const ok = await client.start('HANDOFF1')

    expect(ok).toBe(true)
    expect(client.status.value).toBe('ready')
    expect(client.matchId.value).toBe('m1')
    expect(client.playerId.value).toBe('p1')
    expect(client.gameId.value).toBe('rps')
    expect(useTokenSocket).toHaveBeenCalledWith('match-token-xyz')
    expect(tokenSocket.connect).toHaveBeenCalled()
  })

  it('subskrybuje matches({_id}) i match_views({playerId, matchId})', async () => {
    const fetchFn = makeFetch({ ok: true, body: OK_PAYLOAD })
    const client = useMatchClient(fetchFn)
    await client.start('HANDOFF1')

    expect(tokenSocket.subscribe).toHaveBeenCalledWith('matches', { _id: 'm1' }, expect.anything())
    expect(tokenSocket.subscribe).toHaveBeenCalledWith(
      'match_views',
      { playerId: 'p1', matchId: 'm1' },
      expect.anything(),
    )
  })

  it('submitMove i revealDone wołają scope’owane eventy z matchId', async () => {
    const fetchFn = makeFetch({ ok: true, body: OK_PAYLOAD })
    const client = useMatchClient(fetchFn)
    await client.start('HANDOFF1')

    client.submitMove('rock')
    client.revealDone()

    expect(tokenSocket.call).toHaveBeenCalledWith('games:submit-move', { matchId: 'm1', move: 'rock' })
    expect(tokenSocket.call).toHaveBeenCalledWith('games:reveal-done', { matchId: 'm1' })
  })

  it('startMatch emituje games:start tylko z matchId (playerId dokłada gate z tożsamości tokenu)', async () => {
    const fetchFn = makeFetch({ ok: true, body: OK_PAYLOAD })
    const client = useMatchClient(fetchFn)
    await client.start('HANDOFF1')

    client.startMatch()

    expect(tokenSocket.call).toHaveBeenCalledWith('games:start', { matchId: 'm1' })
  })

  it('błąd HTTP (4xx) ustawia status error i komunikat z body.message', async () => {
    const fetchFn = makeFetch({ ok: false, body: { message: 'Kod wygasł' } })
    const client = useMatchClient(fetchFn)

    const ok = await client.start('BAD')

    expect(ok).toBe(false)
    expect(client.status.value).toBe('error')
    expect(client.error.value).toBe('Kod wygasł')
    expect(tokenSocket.connect).not.toHaveBeenCalled()
  })
})
