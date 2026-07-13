import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../app/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { createGamesClient } from '../../app/services/games-client'

/** Fake-fetch zapisujący ostatnie żądanie (wzorzec games-client.test.ts). */
function fakeFetch(status: number, body: unknown) {
  const calls: Array<{ url: string; init: any }> = []
  const impl = vi.fn(async (url: string, init: any) => {
    calls.push({ url, init })
    return { status, json: async () => body } as any
  })
  return { impl: impl as unknown as typeof fetch, calls }
}

function clientWith(f: { impl: typeof fetch }) {
  return createGamesClient({ baseUrl: 'http://g', internalSecret: 's', fetchImpl: f.impl })
}

describe('games-client — metody 4d (rejestr gier)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('registerGame: POST /command/register-game i sekret wraca JEDEN raz', async () => {
    const f = fakeFetch(200, { gameId: 'moja-gra', hmacSecret: 'aabbcc' })
    const res = await clientWith(f).registerGame({
      devAccountId: 'dev1',
      gameId: 'moja-gra',
      name: 'Moja gra',
      manifest: { version: '1.0.0' },
      serviceUrl: 'https://gra.example.com/api',
      uiUrl: 'https://gra.example.com',
    })
    expect(f.calls[0].url).toBe('http://g/command/register-game')
    expect(JSON.parse(f.calls[0].init.body).devAccountId).toBe('dev1')
    expect(res).toEqual({ ok: true, data: { gameId: 'moja-gra', hmacSecret: 'aabbcc' } })
  })

  it('registerGame: 200 bez sekretu = błąd (kontrakt wymaga hmacSecret)', async () => {
    const f = fakeFetch(200, { gameId: 'moja-gra' })
    const res = await clientWith(f).registerGame({
      devAccountId: 'dev1', gameId: 'moja-gra', name: 'x', manifest: {}, serviceUrl: 'https://a', uiUrl: 'https://b',
    })
    expect(res.ok).toBe(false)
  })

  it('updateGame: przenosi tylko podane pola', async () => {
    const f = fakeFetch(200, { ok: true })
    await clientWith(f).updateGame({ devAccountId: 'dev1', gameId: 'moja-gra', uiUrl: 'https://nowy' })
    expect(f.calls[0].url).toBe('http://g/command/update-game')
    expect(JSON.parse(f.calls[0].init.body)).toEqual({ devAccountId: 'dev1', gameId: 'moja-gra', uiUrl: 'https://nowy' })
  })

  it('approveGame / unpublishGame: właściwe ścieżki i payload', async () => {
    const fa = fakeFetch(200, { ok: true })
    await clientWith(fa).approveGame('moja-gra')
    expect(fa.calls[0].url).toBe('http://g/command/approve-game')
    expect(JSON.parse(fa.calls[0].init.body)).toEqual({ gameId: 'moja-gra' })

    const fu = fakeFetch(200, { ok: true })
    await clientWith(fu).unpublishGame('moja-gra')
    expect(fu.calls[0].url).toBe('http://g/command/unpublish-game')
    expect(JSON.parse(fu.calls[0].init.body)).toEqual({ gameId: 'moja-gra' })
  })
})

describe('games-client — metody 4e (kolejka + abandon)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('queueJoin/queueLeave/queueAccept: ścieżki i payload', async () => {
    const fj = fakeFetch(200, { ok: true })
    await clientWith(fj).queueJoin('rps', 'u1')
    expect(fj.calls[0].url).toBe('http://g/command/queue-join')
    expect(JSON.parse(fj.calls[0].init.body)).toEqual({ gameId: 'rps', userId: 'u1' })

    const fl = fakeFetch(200, { ok: true })
    await clientWith(fl).queueLeave('rps', 'u1')
    expect(fl.calls[0].url).toBe('http://g/command/queue-leave')

    const fa = fakeFetch(200, { ok: true })
    await clientWith(fa).queueAccept('rps', 'u1', 'p1')
    expect(fa.calls[0].url).toBe('http://g/command/queue-accept')
    expect(JSON.parse(fa.calls[0].init.body)).toEqual({ gameId: 'rps', userId: 'u1', proposalId: 'p1' })
  })

  it('abandon: mapuje noop z odpowiedzi (casual=true, ranked=false)', async () => {
    const casual = clientWith(fakeFetch(200, { ok: true, noop: true }))
    expect(await casual.abandon('m1', 'u1')).toEqual({ ok: true, data: { noop: true } })

    const ranked = clientWith(fakeFetch(200, { ok: true }))
    expect(await ranked.abandon('m1', 'u1')).toEqual({ ok: true, data: { noop: false } })
  })

  it('abandon: błąd domenowy przechodzi jako ok:false', async () => {
    const res = await clientWith(fakeFetch(404, { error: 'match not found' })).abandon('nie-ma', 'u1')
    expect(res).toEqual({ ok: false, status: 404, error: 'match not found' })
  })
})
