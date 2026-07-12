import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../app/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { createGamesClient } from '../../app/services/games-client'

/** Fake-fetch (jak w games-client.test.ts) — zwraca status/body i zapisuje żądania. */
function fakeFetch(status: number, body: unknown) {
  const calls: Array<{ url: string; init: any }> = []
  const impl = vi.fn(async (url: string, init: any) => {
    calls.push({ url, init })
    return { status, json: async () => body } as any
  })
  return { impl: impl as unknown as typeof fetch, calls }
}

describe('games-client social methods (4b/4c)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('playerHistory posts { userId } and maps history', async () => {
    const history = { games: [{ gameId: 'rps', played: 3, wins: 2, losses: 1, draws: 0 }], recent: [{ matchId: 'm1', gameId: 'rps', finishedAt: 1, result: 'win', score: 5 }] }
    const f = fakeFetch(200, { history })
    const client = createGamesClient({ baseUrl: 'http://g', internalSecret: 's', fetchImpl: f.impl })
    const res = await client.playerHistory('u1')
    expect(f.calls[0].url).toBe('http://g/command/player-history')
    expect(JSON.parse(f.calls[0].init.body)).toEqual({ userId: 'u1' })
    expect(f.calls[0].init.headers['x-sixseven-internal']).toBe('s')
    expect(res).toEqual({ ok: true, data: history })
  })

  it('playerHistory includes gameId only when provided', async () => {
    const f = fakeFetch(200, { history: { games: [], recent: [] } })
    const client = createGamesClient({ baseUrl: 'http://g', internalSecret: 's', fetchImpl: f.impl })
    await client.playerHistory('u1', 'rps')
    expect(JSON.parse(f.calls[0].init.body)).toEqual({ userId: 'u1', gameId: 'rps' })
  })

  it('playerHistory defaults missing arrays to empty', async () => {
    const f = fakeFetch(200, { history: {} })
    const client = createGamesClient({ baseUrl: 'http://g', internalSecret: 's', fetchImpl: f.impl })
    const res = await client.playerHistory('u1')
    expect(res).toEqual({ ok: true, data: { games: [], recent: [] } })
  })

  it('playerHistory maps a non-200 to error', async () => {
    const client = createGamesClient({ baseUrl: 'http://g', internalSecret: 's', fetchImpl: fakeFetch(404, { error: 'no such user' }).impl })
    expect(await client.playerHistory('gone')).toEqual({ ok: false, status: 404, error: 'no such user' })
  })

  it('guestMatches posts { guestId, sinceMs } and maps matches', async () => {
    const matches = [{ matchId: 'm1', gameId: 'rps', finishedAt: 111 }]
    const f = fakeFetch(200, { matches })
    const client = createGamesClient({ baseUrl: 'http://g', internalSecret: 's', fetchImpl: f.impl })
    const res = await client.guestMatches('g_1', 5000)
    expect(f.calls[0].url).toBe('http://g/command/guest-matches')
    expect(JSON.parse(f.calls[0].init.body)).toEqual({ guestId: 'g_1', sinceMs: 5000 })
    expect(res).toEqual({ ok: true, data: { matches } })
  })

  it('attachGuest posts { guestId, userId } and maps attached count', async () => {
    const f = fakeFetch(200, { attached: 4 })
    const client = createGamesClient({ baseUrl: 'http://g', internalSecret: 's', fetchImpl: f.impl })
    const res = await client.attachGuest({ guestId: 'g_1', userId: 'u1' })
    expect(f.calls[0].url).toBe('http://g/command/attach-guest')
    expect(JSON.parse(f.calls[0].init.body)).toEqual({ guestId: 'g_1', userId: 'u1' })
    expect(res).toEqual({ ok: true, data: { attached: 4 } })
  })

  it('attachGuest defaults attached to 0 when absent', async () => {
    const f = fakeFetch(200, { ok: true })
    const client = createGamesClient({ baseUrl: 'http://g', internalSecret: 's', fetchImpl: f.impl })
    expect(await client.attachGuest({ guestId: 'g_1', userId: 'u1' })).toEqual({ ok: true, data: { attached: 0 } })
  })

  it('maps a network error to status 0 / games unreachable', async () => {
    const impl = vi.fn(async () => { throw new Error('ECONNREFUSED') }) as unknown as typeof fetch
    const client = createGamesClient({ baseUrl: 'http://g', internalSecret: 's', fetchImpl: impl })
    expect(await client.attachGuest({ guestId: 'g', userId: 'u' })).toEqual({ ok: false, status: 0, error: 'games unreachable' })
  })
})
