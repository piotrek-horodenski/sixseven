import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../app/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { createGamesClient } from '../../app/services/games-client'

/** Buduje fake-fetch zwracający zadany status/body i zapisujący ostatnie żądanie. */
function fakeFetch(status: number, body: unknown) {
  const calls: Array<{ url: string; init: any }> = []
  const impl = vi.fn(async (url: string, init: any) => {
    calls.push({ url, init })
    return {
      status,
      json: async () => body,
    } as any
  })
  return { impl: impl as unknown as typeof fetch, calls }
}

describe('games-client', () => {
  beforeEach(() => vi.clearAllMocks())

  it('posts to /command/* with the internal secret header and no trailing-slash doubling', async () => {
    const f = fakeFetch(200, { ok: true, matchId: 'm1' })
    const client = createGamesClient({
      baseUrl: 'http://games:4120/',
      internalSecret: 'sekret',
      fetchImpl: f.impl,
    })

    await client.createMatch({ gameId: 'rps', players: ['u1', 'u2'] })

    expect(f.calls).toHaveLength(1)
    expect(f.calls[0].url).toBe('http://games:4120/command/create-match')
    expect(f.calls[0].init.method).toBe('POST')
    expect(f.calls[0].init.headers['x-sixseven-internal']).toBe('sekret')
    expect(f.calls[0].init.redirect).toBe('error')
    expect(JSON.parse(f.calls[0].init.body)).toEqual({ gameId: 'rps', players: ['u1', 'u2'] })
  })

  it('createMatch maps 200+matchId to ok', async () => {
    const f = fakeFetch(200, { ok: true, matchId: 'abc' })
    const client = createGamesClient({ baseUrl: 'http://g', internalSecret: 's', fetchImpl: f.impl })
    const res = await client.createMatch({ gameId: 'rps', players: ['a', 'b'] })
    expect(res).toEqual({ ok: true, data: { matchId: 'abc' } })
  })

  it('createMatch maps 404 to error with server message', async () => {
    const f = fakeFetch(404, { error: 'game not registered' })
    const client = createGamesClient({ baseUrl: 'http://g', internalSecret: 's', fetchImpl: f.impl })
    const res = await client.createMatch({ gameId: 'x', players: ['a', 'b'] })
    expect(res).toEqual({ ok: false, status: 404, error: 'game not registered' })
  })

  it('submitMove maps 200 to accepted and 409 to rejected (both ok)', async () => {
    const accepted = createGamesClient({ baseUrl: 'http://g', internalSecret: 's', fetchImpl: fakeFetch(200, { ok: true }).impl })
    expect(await accepted.submitMove('m', 'p', 'rock')).toEqual({ ok: true, data: { status: 'accepted' } })

    const rejected = createGamesClient({ baseUrl: 'http://g', internalSecret: 's', fetchImpl: fakeFetch(409, { ok: false, status: 'rejected' }).impl })
    expect(await rejected.submitMove('m', 'p', 'rock')).toEqual({ ok: true, data: { status: 'rejected' } })
  })

  it('submitMove sends the playerId it was given', async () => {
    const f = fakeFetch(200, { ok: true })
    const client = createGamesClient({ baseUrl: 'http://g', internalSecret: 's', fetchImpl: f.impl })
    await client.submitMove('m1', 'u1', 'paper')
    expect(JSON.parse(f.calls[0].init.body)).toEqual({ matchId: 'm1', playerId: 'u1', move: 'paper' })
  })

  it('maps a network error to status 0 / games unreachable', async () => {
    const impl = vi.fn(async () => {
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof fetch
    const client = createGamesClient({ baseUrl: 'http://g', internalSecret: 's', fetchImpl: impl })
    const res = await client.start('m1')
    expect(res).toEqual({ ok: false, status: 0, error: 'games unreachable' })
  })

  it('start and revealDone map 200 to ok', async () => {
    const client = createGamesClient({ baseUrl: 'http://g', internalSecret: 's', fetchImpl: fakeFetch(200, { ok: true }).impl })
    expect(await client.start('m')).toEqual({ ok: true, data: {} })
    expect(await client.revealDone('m')).toEqual({ ok: true, data: {} })
  })
})
