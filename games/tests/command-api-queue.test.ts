import { describe, it, expect, afterEach, vi } from 'vitest'
import express from 'express'
import { Server } from 'http'

import {
  createCommandRouter,
  CommandDeps,
  CatalogStore,
  QueueStore,
  QueueEntryDoc,
  GameCatalogDoc,
} from '../app/command-api'

/**
 * Endpointy kolejki szybkiego meczu + abandon (Etap 4e, kontrakt §2 + §5 GAMES
 * unit) w stylu DI — bez bazy: magazyn kolejki/katalogu w pamięci, silnik z vi.fn.
 * Pełny przepływ z realnym Mongo: ranked-queue.integration.test.ts.
 */

const SECRET = 'internal-test-secret'
const NOW = 1_700_000_000_000

function rpsDoc(over: Partial<GameCatalogDoc> = {}): GameCatalogDoc {
  return {
    gameId: 'rps',
    name: 'Papier, kamień, nożyce',
    builtin: true,
    status: 'published',
    devAccountId: null,
    uiUrl: null,
    rankedEligible: true,
    manifest: { version: '1.0.0', minPlayers: 2, maxPlayers: 8, planningPhaseMs: 15000, defaultTarget: 5 },
    ...over,
  }
}

function memoryCatalog(initial: GameCatalogDoc[] = [rpsDoc()]) {
  const docs = new Map(initial.map((d) => [d.gameId, { ...d }]))
  const store: CatalogStore = {
    get: async (gameId) => (docs.get(gameId) ? { ...docs.get(gameId)! } : null),
    countByDev: async () => 0,
    insert: async () => {},
    update: async () => true,
  }
  return { docs, store }
}

/** Magazyn kolejki w pamięci — semantyka jak defaultQueueStore (kontrakt §1). */
function memoryQueue(initial: QueueEntryDoc[] = []) {
  const map = new Map<string, QueueEntryDoc>(initial.map((e) => [`${e.gameId}_${e.userId}`, { ...e }]))
  const key = (g: string, u: string) => `${g}_${u}`
  const store: QueueStore = {
    async get(gameId, userId) {
      const e = map.get(key(gameId, userId))
      return e ? { ...e } : null
    },
    async joinWaiting(entry) {
      // Idempotentnie: istniejący wpis NIETKNIĘTY (zachowuje since/status).
      if (map.has(key(entry.gameId, entry.userId))) return
      map.set(key(entry.gameId, entry.userId), {
        gameId: entry.gameId,
        userId: entry.userId,
        elo: entry.elo,
        since: entry.since,
        status: 'waiting',
        accepted: false,
        proposalId: null,
        proposalDeadline: null,
        matchId: null,
      })
    },
    async remove(gameId, userId) {
      const e = map.get(key(gameId, userId))
      map.delete(key(gameId, userId))
      return e ? { ...e } : null
    },
    async releaseProposal(proposalId) {
      for (const e of map.values()) {
        if (e.proposalId === proposalId && e.status === 'proposed') {
          e.status = 'waiting'
          e.proposalId = null
          e.proposalDeadline = null
          e.accepted = false
        }
      }
    },
    async markAccepted(gameId, userId, proposalId) {
      const e = map.get(key(gameId, userId))
      if (!e || e.proposalId !== proposalId) return 'not-proposed'
      if (e.status === 'proposed' && !e.accepted) {
        e.accepted = true
        return 'accepted'
      }
      if (e.accepted) return 'already'
      return 'not-proposed'
    },
    async getByProposal(proposalId) {
      return [...map.values()].filter((e) => e.proposalId === proposalId).map((e) => ({ ...e }))
    },
    async markMatched(proposalId, matchId) {
      for (const e of map.values()) {
        if (e.proposalId === proposalId) {
          e.status = 'matched'
          e.matchId = matchId
          e.proposalDeadline = null
        }
      }
    },
  }
  return { map, store }
}

function proposedPair(proposalId = 'prop-1'): QueueEntryDoc[] {
  return [
    { gameId: 'rps', userId: 'u1', elo: 1200, since: NOW - 5000, status: 'proposed', accepted: false, proposalId, proposalDeadline: NOW + 10_000, matchId: null },
    { gameId: 'rps', userId: 'u2', elo: 1200, since: NOW - 3000, status: 'proposed', accepted: false, proposalId, proposalDeadline: NOW + 10_000, matchId: null },
  ]
}

describe('command API — kolejka ranked + abandon (Etap 4e)', () => {
  let server: Server
  let deps: CommandDeps

  function makeDeps(over: Partial<CommandDeps> = {}): CommandDeps {
    return {
      engine: {
        createMatch: vi.fn(async () => 'ranked-match-1'),
        playerReady: vi.fn(async () => {}),
        submitMove: vi.fn(async () => 'accepted' as const),
        revealDone: vi.fn(async () => {}),
        addPlayer: vi.fn(async () => 'added' as const),
        cancel: vi.fn(async () => {}),
        finishWalkover: vi.fn(async () => 'noop' as const),
      },
      internalSecret: SECRET,
      getRegistration: vi.fn(async () => ({
        version: '1.0.0',
        endpoint: { url: 'http://127.0.0.1:9/', secret: 'gsecret' },
      })),
      init: vi.fn(async () => ({ ok: true, state: { round: 1 }, manifest: { planningPhaseMs: 15000 } })),
      genId: () => 'ranked-match-1',
      genSeed: () => 'seed-abc',
      loadPlayerMemory: vi.fn(async () => ({})),
      now: () => NOW,
      getRating: vi.fn(async () => null),
      ...over,
    }
  }

  async function start(d: CommandDeps) {
    deps = d
    const app = express()
    app.use(express.json())
    app.use('/command', createCommandRouter(d))
    server = app.listen(0)
    await new Promise<void>((r) => server.once('listening', () => r()))
  }

  function post(path: string, body: unknown) {
    const port = (server.address() as any).port
    return fetch(`http://127.0.0.1:${port}/command${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-sixseven-internal': SECRET },
      body: JSON.stringify(body),
    }).then(async (res) => ({ status: res.status, body: await res.json() }))
  }

  afterEach(async () => {
    if (server) await new Promise<void>((r) => server.close(() => r()))
  })

  describe('queue-join', () => {
    it('user wchodzi do kolejki: wpis waiting ze snapshotem elo z ratings', async () => {
      const { map, store } = memoryQueue()
      await start(makeDeps({ queue: store, catalog: memoryCatalog().store, getRating: vi.fn(async () => ({ elo: 1350, matches: 12 })) }))
      const res = await post('/queue-join', { gameId: 'rps', userId: 'u1' })
      expect(res.status).toBe(200)
      const entry = map.get('rps_u1')!
      expect(entry.status).toBe('waiting')
      expect(entry.elo).toBe(1350)
      expect(entry.since).toBe(NOW)
    })

    it('brak ratingu → elo 1200 (startElo z konfigu)', async () => {
      const { map, store } = memoryQueue()
      await start(makeDeps({ queue: store, catalog: memoryCatalog().store }))
      await post('/queue-join', { gameId: 'rps', userId: 'u1' })
      expect(map.get('rps_u1')!.elo).toBe(1200)
    })

    it('ponowny join jest idempotentny — ZACHOWUJE since (nie odświeża)', async () => {
      const { map, store } = memoryQueue([
        { gameId: 'rps', userId: 'u1', elo: 1200, since: NOW - 60_000, status: 'waiting', accepted: false, proposalId: null, proposalDeadline: null, matchId: null },
      ])
      await start(makeDeps({ queue: store, catalog: memoryCatalog().store }))
      const res = await post('/queue-join', { gameId: 'rps', userId: 'u1' })
      expect(res.status).toBe(200)
      expect(map.get('rps_u1')!.since).toBe(NOW - 60_000)
    })

    it('gość (g_*) NIGDY nie wchodzi do kolejki → 403', async () => {
      const { map, store } = memoryQueue()
      await start(makeDeps({ queue: store, catalog: memoryCatalog().store }))
      const res = await post('/queue-join', { gameId: 'rps', userId: 'g_abc' })
      expect(res.status).toBe(403)
      expect(map.size).toBe(0)
    })

    it('nieznana gra → 404; gra bez rankedEligible → 409; gra niepublikowana → 409', async () => {
      const { store } = memoryCatalog([
        rpsDoc(),
        rpsDoc({ gameId: 'zewnetrzna', builtin: false, rankedEligible: false }),
        rpsDoc({ gameId: 'ukryta', status: 'unpublished' }),
      ])
      await start(makeDeps({ queue: memoryQueue().store, catalog: store }))
      expect((await post('/queue-join', { gameId: 'nie-ma', userId: 'u1' })).status).toBe(404)
      expect((await post('/queue-join', { gameId: 'zewnetrzna', userId: 'u1' })).status).toBe(409)
      expect((await post('/queue-join', { gameId: 'ukryta', userId: 'u1' })).status).toBe(409)
    })
  })

  describe('queue-leave', () => {
    it('usuwa wpis waiting', async () => {
      const { map, store } = memoryQueue([
        { gameId: 'rps', userId: 'u1', elo: 1200, since: NOW, status: 'waiting', accepted: false, proposalId: null, proposalDeadline: null, matchId: null },
      ])
      await start(makeDeps({ queue: store, catalog: memoryCatalog().store }))
      const res = await post('/queue-leave', { gameId: 'rps', userId: 'u1' })
      expect(res.status).toBe(200)
      expect(map.size).toBe(0)
    })

    it('leave w stanie proposed = jak brak accept: partner wraca do waiting BEZ zmiany since', async () => {
      const { map, store } = memoryQueue(proposedPair())
      await start(makeDeps({ queue: store, catalog: memoryCatalog().store }))
      await post('/queue-leave', { gameId: 'rps', userId: 'u1' })
      expect(map.has('rps_u1')).toBe(false)
      const partner = map.get('rps_u2')!
      expect(partner.status).toBe('waiting')
      expect(partner.proposalId).toBeNull()
      expect(partner.since).toBe(NOW - 3000) // bez zmiany
    })

    it('leave bez wpisu jest bezpieczny (ok)', async () => {
      await start(makeDeps({ queue: memoryQueue().store, catalog: memoryCatalog().store }))
      expect((await post('/queue-leave', { gameId: 'rps', userId: 'u9' })).status).toBe(200)
    })
  })

  describe('queue-accept', () => {
    it('pierwszy accept → { ok, matchId: null } (czeka na drugiego), bez create-match', async () => {
      const { map, store } = memoryQueue(proposedPair())
      await start(makeDeps({ queue: store, catalog: memoryCatalog().store }))
      const res = await post('/queue-accept', { gameId: 'rps', userId: 'u1', proposalId: 'prop-1' })
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ ok: true, matchId: null })
      expect(map.get('rps_u1')!.accepted).toBe(true)
      expect(deps.engine.createMatch).not.toHaveBeenCalled()
    })

    it('drugi accept → create-match (ranked:true, capacity:2, opcje z manifestu) + oba wpisy matched z matchId', async () => {
      const entries = proposedPair()
      entries[0].accepted = true // u1 już zaakceptował
      const { map, store } = memoryQueue(entries)
      await start(makeDeps({ queue: store, catalog: memoryCatalog().store }))

      const res = await post('/queue-accept', { gameId: 'rps', userId: 'u2', proposalId: 'prop-1' })
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ ok: true, matchId: 'ranked-match-1' })

      // ranked ustawia WYŁĄCZNIE ścieżka kolejki; gracze w kolejności FIFO (since).
      expect(deps.engine.createMatch).toHaveBeenCalledWith(
        expect.objectContaining({
          gameId: 'rps',
          players: ['u1', 'u2'],
          ranked: true,
          capacity: 2,
          options: expect.objectContaining({ target: 5, planningPhaseMs: 15000 }),
        }),
      )
      // /init dostał opcje domyślne z manifestu katalogu (defaultTarget).
      expect(deps.init).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ playerIds: ['u1', 'u2'], options: { target: 5 } }),
      )
      expect(map.get('rps_u1')!).toMatchObject({ status: 'matched', matchId: 'ranked-match-1' })
      expect(map.get('rps_u2')!).toMatchObject({ status: 'matched', matchId: 'ranked-match-1' })
    })

    it('accept po fakcie (wpis już matched) → idempotentnie zwraca matchId', async () => {
      const entries = proposedPair()
      for (const e of entries) {
        e.status = 'matched'
        e.accepted = true
        e.matchId = 'ranked-match-1'
      }
      const { store } = memoryQueue(entries)
      await start(makeDeps({ queue: store, catalog: memoryCatalog().store }))
      const res = await post('/queue-accept', { gameId: 'rps', userId: 'u1', proposalId: 'prop-1' })
      expect(res.body).toEqual({ ok: true, matchId: 'ranked-match-1' })
      expect(deps.engine.createMatch).not.toHaveBeenCalled()
    })

    it('zły/nieaktualny proposalId → 409', async () => {
      const { store } = memoryQueue(proposedPair())
      await start(makeDeps({ queue: store, catalog: memoryCatalog().store }))
      expect((await post('/queue-accept', { gameId: 'rps', userId: 'u1', proposalId: 'stary' })).status).toBe(409)
      expect((await post('/queue-accept', { gameId: 'rps', userId: 'u9', proposalId: 'prop-1' })).status).toBe(409)
    })

    it('padnięty create-match przy komplecie → propozycja wraca do waiting (nie gubimy graczy)', async () => {
      const entries = proposedPair()
      entries[0].accepted = true
      const { map, store } = memoryQueue(entries)
      await start(makeDeps({
        queue: store,
        catalog: memoryCatalog().store,
        getRegistration: vi.fn(async () => null), // gra zniknęła z registrations
      }))
      const res = await post('/queue-accept', { gameId: 'rps', userId: 'u2', proposalId: 'prop-1' })
      expect(res.status).toBe(404)
      expect(map.get('rps_u1')!.status).toBe('waiting')
      expect(map.get('rps_u2')!.status).toBe('waiting')
      expect(map.get('rps_u1')!.since).toBe(NOW - 5000) // bez zmiany since
    })
  })

  describe('abandon', () => {
    it('mecz ranked w toku → walkower przez engine.finishWalkover(matchId, playerId, abandoned)', async () => {
      const finishWalkover = vi.fn(async () => 'finished' as const)
      await start(makeDeps({ engine: { ...makeDeps().engine, finishWalkover } }))
      const res = await post('/abandon', { matchId: 'm1', playerId: 'u2' })
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ ok: true, walkover: true })
      expect(finishWalkover).toHaveBeenCalledWith('m1', 'u2', 'abandoned')
    })

    it('mecz casual → { ok: true, noop: true } (wyjście nie kończy meczu — defaultMove gra dalej)', async () => {
      const finishWalkover = vi.fn(async () => 'noop' as const)
      await start(makeDeps({ engine: { ...makeDeps().engine, finishWalkover } }))
      const res = await post('/abandon', { matchId: 'm1', playerId: 'u2' })
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ ok: true, noop: true })
    })

    it('mecz nie istnieje → 404; gracz spoza meczu → 403', async () => {
      const base = makeDeps()
      await start(makeDeps({ engine: { ...base.engine, finishWalkover: vi.fn(async () => 'not-found' as const) } }))
      expect((await post('/abandon', { matchId: 'nie-ma', playerId: 'u1' })).status).toBe(404)
      await new Promise<void>((r) => server.close(() => r()))
      await start(makeDeps({ engine: { ...base.engine, finishWalkover: vi.fn(async () => 'not-member' as const) } }))
      expect((await post('/abandon', { matchId: 'm1', playerId: 'obcy' })).status).toBe(403)
    })

    it('brak matchId/playerId → 400', async () => {
      await start(makeDeps())
      expect((await post('/abandon', { matchId: 'm1' })).status).toBe(400)
      expect((await post('/abandon', { playerId: 'u1' })).status).toBe(400)
    })
  })
})
