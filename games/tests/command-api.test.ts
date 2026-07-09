import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import express from 'express'
import { Server } from 'http'

import { createCommandRouter, CommandDeps } from '../app/command-api'

const SECRET = 'internal-test-secret'

function makeDeps(over: Partial<CommandDeps> = {}): CommandDeps {
  return {
    engine: {
      createMatch: vi.fn(async () => 'generated-id'),
      start: vi.fn(async () => {}),
      submitMove: vi.fn(async () => 'accepted' as const),
      revealDone: vi.fn(async () => {}),
    },
    internalSecret: SECRET,
    getRegistration: vi.fn(async () => ({
      version: '1.0.0',
      endpoint: { url: 'http://127.0.0.1:9/', secret: 'gsecret' },
    })),
    init: vi.fn(async () => ({ ok: true, state: { round: 1 } })),
    genId: () => 'match-123',
    genSeed: () => 'seed-abc',
    ...over,
  }
}

describe('command API', () => {
  let server: Server
  let base: string
  let deps: CommandDeps

  function boot(d: CommandDeps) {
    const app = express()
    app.use(express.json())
    app.use('/command', createCommandRouter(d))
    return app
  }

  async function start(d: CommandDeps) {
    deps = d
    server = boot(d).listen(0)
    await new Promise<void>((r) => server.once('listening', () => r()))
    base = `http://127.0.0.1:${(server.address() as any).port}`
  }

  function post(path: string, body: unknown, headers: Record<string, string> = {}) {
    return fetch(`${base}/command${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })
  }

  const auth = { 'x-sixseven-internal': SECRET }

  afterEach(async () => {
    if (server) await new Promise<void>((r) => server.close(() => r()))
  })

  it('odrzuca żądanie bez sekretu wewnętrznego (401)', async () => {
    await start(makeDeps())
    const res = await post('/start', { matchId: 'm1' })
    expect(res.status).toBe(401)
  })

  it('odrzuca zły sekret (401, stały czas)', async () => {
    await start(makeDeps())
    const res = await post('/start', { matchId: 'm1' }, { 'x-sixseven-internal': 'wrong' })
    expect(res.status).toBe(401)
  })

  it('create-match: init + createMatch, zwraca matchId', async () => {
    await start(makeDeps())
    const res = await post('/create-match', { gameId: 'rps', players: ['p1', 'p2'], options: { target: 2 } }, auth)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true, matchId: 'match-123' })
    expect(deps.init).toHaveBeenCalledOnce()
    expect(deps.engine.createMatch).toHaveBeenCalledWith(
      expect.objectContaining({ matchId: 'match-123', gameId: 'rps', manifestVersion: '1.0.0', initialState: { round: 1 } }),
    )
  })

  it('create-match: nieznana gra → 404', async () => {
    await start(makeDeps({ getRegistration: vi.fn(async () => null) }))
    const res = await post('/create-match', { gameId: 'nope', players: ['p1'] }, auth)
    expect(res.status).toBe(404)
  })

  it('create-match: init gry padł → 502', async () => {
    await start(makeDeps({ init: vi.fn(async () => ({ ok: false, state: null })) }))
    const res = await post('/create-match', { gameId: 'rps', players: ['p1', 'p2'] }, auth)
    expect(res.status).toBe(502)
  })

  it('create-match: brak players → 400', async () => {
    await start(makeDeps())
    const res = await post('/create-match', { gameId: 'rps', players: [] }, auth)
    expect(res.status).toBe(400)
  })

  it('submit-move: przyjęty → 200', async () => {
    await start(makeDeps())
    const res = await post('/submit-move', { matchId: 'm1', playerId: 'p1', move: 'rock' }, auth)
    expect(res.status).toBe(200)
    expect(deps.engine.submitMove).toHaveBeenCalledWith('m1', 'p1', 'rock')
  })

  it('submit-move: odrzucony przez silnik → 409', async () => {
    await start(makeDeps({ engine: { ...makeDeps().engine, submitMove: vi.fn(async () => 'rejected' as const) } }))
    const res = await post('/submit-move', { matchId: 'm1', playerId: 'x', move: 'rock' }, auth)
    expect(res.status).toBe(409)
  })

  it('start i reveal-done wołają silnik', async () => {
    await start(makeDeps())
    expect((await post('/start', { matchId: 'm1' }, auth)).status).toBe(200)
    expect(deps.engine.start).toHaveBeenCalledWith('m1')
    expect((await post('/reveal-done', { matchId: 'm1' }, auth)).status).toBe(200)
    expect(deps.engine.revealDone).toHaveBeenCalledWith('m1')
  })
})
