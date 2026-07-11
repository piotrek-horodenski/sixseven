import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import express from 'express'
import { Server } from 'http'

import { createCommandRouter, CommandDeps } from '../app/command-api'

const SECRET = 'internal-test-secret'

function makeDeps(over: Partial<CommandDeps> = {}): CommandDeps {
  return {
    engine: {
      createMatch: vi.fn(async () => 'generated-id'),
      playerReady: vi.fn(async () => {}),
      submitMove: vi.fn(async () => 'accepted' as const),
      revealDone: vi.fn(async () => {}),
      addPlayer: vi.fn(async () => 'added' as const),
      cancel: vi.fn(async () => {}),
    },
    internalSecret: SECRET,
    getRegistration: vi.fn(async () => ({
      version: '1.0.0',
      endpoint: { url: 'http://127.0.0.1:9/', secret: 'gsecret' },
    })),
    init: vi.fn(async () => ({ ok: true, state: { round: 1 } })),
    genId: () => 'match-123',
    genSeed: () => 'seed-abc',
    // Domyślnie w testach BEZ bazy — nadpisywane w testach, które chcą asercji na wywołaniu.
    loadPlayerMemory: vi.fn(async () => ({})),
    getPrefs: vi.fn(async () => ({})),
    setPrefs: vi.fn(async () => {}),
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

  it('start (lobby-ready) woła engine.playerReady(matchId, playerId)', async () => {
    await start(makeDeps())
    expect((await post('/start', { matchId: 'm1', playerId: 'p1' }, auth)).status).toBe(200)
    expect(deps.engine.playerReady).toHaveBeenCalledWith('m1', 'p1')
  })

  it('start: brak playerId → 400 (nie woła silnika)', async () => {
    await start(makeDeps())
    const res = await post('/start', { matchId: 'm1' }, auth)
    expect(res.status).toBe(400)
    expect(deps.engine.playerReady).not.toHaveBeenCalled()
  })

  it('start: brak matchId → 400', async () => {
    await start(makeDeps())
    const res = await post('/start', { playerId: 'p1' }, auth)
    expect(res.status).toBe(400)
    expect(deps.engine.playerReady).not.toHaveBeenCalled()
  })

  it('reveal-done woła silnik', async () => {
    await start(makeDeps())
    expect((await post('/reveal-done', { matchId: 'm1' }, auth)).status).toBe(200)
    expect(deps.engine.revealDone).toHaveBeenCalledWith('m1')
  })

  it('get-match: zwraca metadane meczu (członkostwo dla 2d)', async () => {
    const getMatch = vi.fn(async () => ({
      matchId: 'm1', gameId: 'rps', players: ['p1', 'p2'], guestIds: ['g_1'], phase: 'planning',
    }))
    await start(makeDeps({ getMatch }))
    const res = await post('/get-match', { matchId: 'm1' }, auth)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      matchId: 'm1', gameId: 'rps', players: ['p1', 'p2'], guestIds: ['g_1'], phase: 'planning',
    })
    expect(getMatch).toHaveBeenCalledWith('m1')
  })

  it('get-match: brak meczu → 404', async () => {
    await start(makeDeps({ getMatch: vi.fn(async () => null) }))
    const res = await post('/get-match', { matchId: 'nope' }, auth)
    expect(res.status).toBe(404)
  })

  it('get-match: wymaga sekretu wewnętrznego', async () => {
    await start(makeDeps({ getMatch: vi.fn(async () => null) }))
    const res = await post('/get-match', { matchId: 'm1' })
    expect(res.status).toBe(401)
  })

  describe('create-match: playerData z player_memory (Etap 3B pkt 4)', () => {
    it('buduje playerData przez loadPlayerMemory i przekazuje do /init', async () => {
      const loadPlayerMemory = vi.fn(async () => ({
        p1: { data: {}, prefs: { fallbackMove: 'paper' } },
        p2: { data: {}, prefs: {} },
      }))
      await start(makeDeps({ loadPlayerMemory }))
      const res = await post('/create-match', { gameId: 'rps', players: ['p1', 'p2'] }, auth)
      expect(res.status).toBe(200)
      expect(loadPlayerMemory).toHaveBeenCalledWith('rps', ['p1', 'p2'])
      expect(deps.init).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          playerData: { p1: { data: {}, prefs: { fallbackMove: 'paper' } }, p2: { data: {}, prefs: {} } },
        }),
      )
    })
  })

  describe('join-match (Etap 3B pkt 2)', () => {
    function lobbyMatch(over: Partial<any> = {}) {
      return vi.fn(async () => ({
        matchId: 'm1', gameId: 'rps', players: ['p1'], guestIds: [], phase: 'lobby',
        capacity: 2, options: {}, manifestVersion: '1.0.0', ...over,
      }))
    }

    it('dołącza gracza: guard OK → init + engine.addPlayer, zwraca full=true przy zapełnieniu', async () => {
      const loadPlayerMemory = vi.fn(async () => ({}))
      const getMatch = lobbyMatch()
      await start(makeDeps({ getMatch, loadPlayerMemory }))
      const res = await post('/join-match', { matchId: 'm1', playerId: 'p2', kind: 'user' }, auth)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true, matchId: 'm1', playerId: 'p2', full: true })
      expect(loadPlayerMemory).toHaveBeenCalledWith('rps', ['p1', 'p2'])
      expect(deps.init).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ matchId: 'm1', playerIds: ['p1', 'p2'], manifestVersion: '1.0.0' }),
      )
      expect(deps.engine.addPlayer).toHaveBeenCalledWith('m1', 'p2', 'user', { round: 1 })
    })

    it('brak matchId/playerId → 400', async () => {
      await start(makeDeps())
      const res = await post('/join-match', { matchId: 'm1' }, auth)
      expect(res.status).toBe(400)
      expect(deps.engine.addPlayer).not.toHaveBeenCalled()
    })

    it('mecz nie istnieje → 404', async () => {
      await start(makeDeps({ getMatch: vi.fn(async () => null) }))
      const res = await post('/join-match', { matchId: 'gone', playerId: 'p2' }, auth)
      expect(res.status).toBe(404)
    })

    it('mecz poza lobby → 409, bez wołania /init', async () => {
      await start(makeDeps({ getMatch: lobbyMatch({ phase: 'planning' }) }))
      const res = await post('/join-match', { matchId: 'm1', playerId: 'p2' }, auth)
      expect(res.status).toBe(409)
      expect(deps.init).not.toHaveBeenCalled()
    })

    it('gracz już w składzie → idempotentnie 200, bez ponownego /init', async () => {
      await start(makeDeps({ getMatch: lobbyMatch({ players: ['p1', 'p2'] }) }))
      const res = await post('/join-match', { matchId: 'm1', playerId: 'p2' }, auth)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true, matchId: 'm1', playerId: 'p2', full: true })
      expect(deps.init).not.toHaveBeenCalled()
      expect(deps.engine.addPlayer).not.toHaveBeenCalled()
    })

    it('brak wolnego slotu → 409, bez /init', async () => {
      await start(makeDeps({ getMatch: lobbyMatch({ players: ['p1', 'p3'] }) }))
      const res = await post('/join-match', { matchId: 'm1', playerId: 'p2' }, auth)
      expect(res.status).toBe(409)
      expect(deps.init).not.toHaveBeenCalled()
    })

    it('/init gry padł → 502', async () => {
      await start(makeDeps({ getMatch: lobbyMatch(), init: vi.fn(async () => ({ ok: false, state: null })) }))
      const res = await post('/join-match', { matchId: 'm1', playerId: 'p2' }, auth)
      expect(res.status).toBe(502)
      expect(deps.engine.addPlayer).not.toHaveBeenCalled()
    })

    it('engine.addPlayer odrzuca (wyścig) → mapuje status', async () => {
      await start(makeDeps({
        getMatch: lobbyMatch(),
        engine: { ...makeDeps().engine, addPlayer: vi.fn(async () => 'full' as const) },
      }))
      const res = await post('/join-match', { matchId: 'm1', playerId: 'p2' }, auth)
      expect(res.status).toBe(409)
    })
  })

  describe('cancel-match (Etap 3B pkt 6)', () => {
    it('woła engine.cancel z podanym powodem', async () => {
      await start(makeDeps())
      const res = await post('/cancel-match', { matchId: 'm1', reason: 'cancelled_lobby' }, auth)
      expect(res.status).toBe(200)
      expect(deps.engine.cancel).toHaveBeenCalledWith('m1', 'cancelled_lobby')
    })

    it('domyślny powód to cancelled_lobby, nieznany powód jest ignorowany', async () => {
      await start(makeDeps())
      await post('/cancel-match', { matchId: 'm1', reason: 'nonsense' }, auth)
      expect(deps.engine.cancel).toHaveBeenCalledWith('m1', 'cancelled_lobby')
    })

    it('brak matchId → 400', async () => {
      await start(makeDeps())
      const res = await post('/cancel-match', {}, auth)
      expect(res.status).toBe(400)
      expect(deps.engine.cancel).not.toHaveBeenCalled()
    })
  })

  describe('get-prefs / set-prefs (Etap 3B pkt 5)', () => {
    it('get-prefs zwraca prefs z wstrzykniętego loadera', async () => {
      const getPrefs = vi.fn(async () => ({ fallbackMove: 'rock' }))
      await start(makeDeps({ getPrefs }))
      const res = await post('/get-prefs', { gameId: 'rps', playerId: 'p1' }, auth)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ prefs: { fallbackMove: 'rock' } })
      expect(getPrefs).toHaveBeenCalledWith('rps', 'p1')
    })

    it('get-prefs: brak gameId/playerId → 400', async () => {
      await start(makeDeps())
      const res = await post('/get-prefs', { gameId: 'rps' }, auth)
      expect(res.status).toBe(400)
    })

    it('set-prefs zapisuje przez wstrzyknięty setter', async () => {
      const setPrefs = vi.fn(async () => {})
      await start(makeDeps({ setPrefs }))
      const res = await post('/set-prefs', { gameId: 'rps', playerId: 'p1', prefs: { fallbackMove: 'paper' } }, auth)
      expect(res.status).toBe(200)
      expect(setPrefs).toHaveBeenCalledWith('rps', 'p1', { fallbackMove: 'paper' })
    })

    it('set-prefs: prefs musi być obiektem (nie tablicą/prymitywem)', async () => {
      await start(makeDeps())
      expect((await post('/set-prefs', { gameId: 'rps', playerId: 'p1', prefs: ['x'] }, auth)).status).toBe(400)
      expect((await post('/set-prefs', { gameId: 'rps', playerId: 'p1', prefs: 'x' }, auth)).status).toBe(400)
      expect((await post('/set-prefs', { gameId: 'rps', playerId: 'p1', prefs: null }, auth)).status).toBe(400)
    })

    it('set-prefs: limit rozmiaru ~4KB → 413', async () => {
      await start(makeDeps())
      const big = { blob: 'x'.repeat(5000) }
      const res = await post('/set-prefs', { gameId: 'rps', playerId: 'p1', prefs: big }, auth)
      expect(res.status).toBe(413)
    })
  })
})
