import { describe, it, expect, afterEach, vi } from 'vitest'
import express from 'express'
import { Server } from 'http'

import {
  createCommandRouter,
  CommandDeps,
  CatalogStore,
  GameCatalogDoc,
} from '../app/command-api'

/**
 * Endpointy rejestru gier zewnętrznych (Etap 4d, kontrakt §2 + §5 GAMES unit):
 * register-game / update-game / approve-game / unpublish-game w stylu DI —
 * BEZ bazy (magazyn katalogu i rejestracji w pamięci / vi.fn).
 */

const SECRET = 'internal-test-secret'
const NOW = 1_700_000_000_000

/** Magazyn katalogu w pamięci: kształt kontraktu CatalogStore, bez Mongo. */
function memoryCatalog(initial: GameCatalogDoc[] = []) {
  const docs = new Map<string, GameCatalogDoc & Record<string, unknown>>(
    initial.map((d) => [d.gameId, { ...d }]),
  )
  const store: CatalogStore = {
    async get(gameId) {
      const d = docs.get(gameId)
      return d ? { ...d } : null
    },
    async countByDev(devAccountId) {
      return [...docs.values()].filter((d) => d.devAccountId === devAccountId).length
    },
    async insert(doc) {
      if (docs.has(doc.gameId)) {
        const err: any = new Error('duplicate key')
        err.code = 11000
        throw err
      }
      docs.set(doc.gameId, { ...doc })
    },
    async update(gameId, set) {
      const d = docs.get(gameId)
      if (!d) return false
      Object.assign(d, set)
      return true
    },
  }
  return { docs, store }
}

function validManifest(over: Record<string, unknown> = {}) {
  return {
    version: '1.0.0',
    minPlayers: 2,
    maxPlayers: 4,
    planningPhaseMs: 5000,
    defaultTarget: 3,
    badges: [{ badgeId: 'sharp', sentiment: 'positive' }],
    ...over,
  }
}

function registerBody(over: Record<string, unknown> = {}) {
  return {
    devAccountId: 'dev1',
    gameId: 'moja-gra',
    name: 'Moja Gra',
    manifest: validManifest(),
    serviceUrl: 'https://gra.example.com/api',
    uiUrl: 'https://gra.example.com',
    ...over,
  }
}

function externalDoc(over: Partial<GameCatalogDoc> = {}): GameCatalogDoc {
  return {
    gameId: 'cudza-gra',
    name: 'Cudza gra',
    builtin: false,
    status: 'published',
    devAccountId: 'dev2',
    uiUrl: 'https://cudza.example.com',
    rankedEligible: false,
    manifest: validManifest(),
    ...over,
  }
}

describe('command API — rejestr gier (Etap 4d)', () => {
  let server: Server
  let deps: CommandDeps

  function makeDeps(over: Partial<CommandDeps> = {}): CommandDeps {
    return {
      engine: {
        createMatch: vi.fn(async () => 'm-x'),
        playerReady: vi.fn(async () => {}),
        submitMove: vi.fn(async () => 'accepted' as const),
        revealDone: vi.fn(async () => {}),
        addPlayer: vi.fn(async () => 'added' as const),
        cancel: vi.fn(async () => {}),
        finishWalkover: vi.fn(async () => 'noop' as const),
      },
      internalSecret: SECRET,
      getRegistration: vi.fn(async () => null),
      init: vi.fn(async () => ({ ok: true, state: {} })),
      now: () => NOW,
      saveRegistration: vi.fn(async () => {}),
      updateRegistration: vi.fn(async () => {}),
      genSecret: () => 'sekret-raz-i-nigdy-wiecej',
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

  describe('register-game', () => {
    it('happy path: zwraca { gameId, hmacSecret } TEN JEDEN RAZ, zapisuje katalog (registered, bez sekretów) i rejestrację', async () => {
      const { docs, store } = memoryCatalog()
      const saveRegistration = vi.fn(async () => {})
      await start(makeDeps({ catalog: store, saveRegistration }))

      const res = await post('/register-game', registerBody())
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ gameId: 'moja-gra', hmacSecret: 'sekret-raz-i-nigdy-wiecej' })

      const doc = docs.get('moja-gra')!
      expect(doc.status).toBe('registered')
      expect(doc.builtin).toBe(false)
      expect(doc.rankedEligible).toBe(false) // gry zewnętrzne NIGDY ranked (ADR)
      expect(doc.devAccountId).toBe('dev1')
      expect(doc.uiUrl).toBe('https://gra.example.com')
      // Dokument katalogowy NIE zawiera serviceUrl ani sekretu (I1).
      expect(JSON.stringify(doc)).not.toContain('gra.example.com/api')
      expect(JSON.stringify(doc)).not.toContain('sekret-raz')

      expect(saveRegistration).toHaveBeenCalledWith({
        gameId: 'moja-gra',
        name: 'Moja Gra',
        version: '1.0.0',
        serviceUrl: 'https://gra.example.com/api',
        hmacSecret: 'sekret-raz-i-nigdy-wiecej',
        manifest: expect.objectContaining({ version: '1.0.0', planningPhaseMs: 5000 }),
      })
    })

    it('manifest jest NORMALIZOWANY do podzbioru publicznego (nieznane pola odcięte)', async () => {
      const { docs, store } = memoryCatalog()
      await start(makeDeps({ catalog: store }))
      const res = await post('/register-game', registerBody({
        manifest: validManifest({ hmacSecret: 'proba-przemytu', internal: { x: 1 } }),
      }))
      expect(res.status).toBe(200)
      const manifest = docs.get('moja-gra')!.manifest as Record<string, unknown>
      expect(manifest.hmacSecret).toBeUndefined()
      expect(manifest.internal).toBeUndefined()
      expect(manifest.version).toBe('1.0.0')
    })

    it('planningPhaseMs < 2000 → 400 (walidacja twarda)', async () => {
      await start(makeDeps({ catalog: memoryCatalog().store }))
      const res = await post('/register-game', registerBody({ manifest: validManifest({ planningPhaseMs: 1999 }) }))
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('planningPhaseMs')
    })

    it('zły slug → 400 (za krótki, wielkie litery, znaki spoza [a-z0-9-])', async () => {
      await start(makeDeps({ catalog: memoryCatalog().store }))
      for (const gameId of ['ab', 'MojaGra', 'gra_z_podkr', 'x'.repeat(33)]) {
        const res = await post('/register-game', registerBody({ gameId }))
        expect(res.status).toBe(400)
      }
    })

    it("'rps' jest zarezerwowane (builtin) → 400", async () => {
      await start(makeDeps({ catalog: memoryCatalog().store }))
      const res = await post('/register-game', registerBody({ gameId: 'rps' }))
      expect(res.status).toBe(400)
    })

    it('duplikat gameId → 409', async () => {
      const { store } = memoryCatalog([externalDoc({ gameId: 'moja-gra' })])
      await start(makeDeps({ catalog: store }))
      const res = await post('/register-game', registerBody())
      expect(res.status).toBe(409)
    })

    it('wyścig o slug: duplikat na insercie (E11000) → 409', async () => {
      const { store } = memoryCatalog()
      const racy: CatalogStore = {
        ...store,
        get: async () => null, // druga rejestracja "nie widzi" pierwszej…
        insert: async () => {  // …ale unikalny _id ją odcina
          const err: any = new Error('E11000 duplicate key')
          err.code = 11000
          throw err
        },
      }
      await start(makeDeps({ catalog: racy }))
      const res = await post('/register-game', registerBody())
      expect(res.status).toBe(409)
    })

    it('limit gier per dev (konfig, default 5) → 409', async () => {
      const owned = Array.from({ length: 2 }, (_, i) => externalDoc({ gameId: `gra-${i}`, devAccountId: 'dev1' }))
      const { store } = memoryCatalog(owned)
      await start(makeDeps({ catalog: store, catalogConfig: { maxGamesPerDev: 2 } }))
      const res = await post('/register-game', registerBody())
      expect(res.status).toBe(409)
      expect(res.body.error).toContain('limit')
    })

    it('walidacja manifestu: minPlayers < 2, maxPlayers < minPlayers, zły sentiment, zła wersja → 400', async () => {
      await start(makeDeps({ catalog: memoryCatalog().store }))
      const bad = [
        validManifest({ minPlayers: 1 }),
        validManifest({ minPlayers: 4, maxPlayers: 2 }),
        validManifest({ badges: [{ badgeId: 'x', sentiment: 'meh' }] }),
        validManifest({ version: 'najnowsza' }),
      ]
      for (const manifest of bad) {
        const res = await post('/register-game', registerBody({ manifest }))
        expect(res.status).toBe(400)
      }
    })

    it('serviceUrl/uiUrl muszą być poprawnymi http(s) URL → 400', async () => {
      await start(makeDeps({ catalog: memoryCatalog().store }))
      expect((await post('/register-game', registerBody({ serviceUrl: 'ftp://x.example' }))).status).toBe(400)
      expect((await post('/register-game', registerBody({ uiUrl: 'nie-url' }))).status).toBe(400)
    })

    it('brak devAccountId → 400', async () => {
      await start(makeDeps({ catalog: memoryCatalog().store }))
      const res = await post('/register-game', registerBody({ devAccountId: undefined }))
      expect(res.status).toBe(400)
    })
  })

  describe('update-game', () => {
    it('właściciel zmienia uiUrl → status wraca do registered (ponowny approve)', async () => {
      const { docs, store } = memoryCatalog([externalDoc({ gameId: 'gra-a', devAccountId: 'dev1', status: 'published' })])
      await start(makeDeps({ catalog: store }))
      const res = await post('/update-game', { devAccountId: 'dev1', gameId: 'gra-a', uiUrl: 'https://nowy.example.com' })
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ ok: true, status: 'registered' })
      expect(docs.get('gra-a')!.status).toBe('registered')
      expect(docs.get('gra-a')!.uiUrl).toBe('https://nowy.example.com')
    })

    it('zmiana manifestu aktualizuje rejestrację (version) i cofa status', async () => {
      const { docs, store } = memoryCatalog([externalDoc({ gameId: 'gra-a', devAccountId: 'dev1' })])
      const updateRegistration = vi.fn(async () => {})
      await start(makeDeps({ catalog: store, updateRegistration }))
      const res = await post('/update-game', {
        devAccountId: 'dev1',
        gameId: 'gra-a',
        manifest: validManifest({ version: '1.1.0' }),
      })
      expect(res.status).toBe(200)
      expect((docs.get('gra-a')!.manifest as any).version).toBe('1.1.0')
      expect(updateRegistration).toHaveBeenCalledWith('gra-a', expect.objectContaining({ version: '1.1.0' }))
    })

    it('zmiana serviceUrl idzie TYLKO do rejestracji (katalog bez serviceUrl), status registered', async () => {
      const { docs, store } = memoryCatalog([externalDoc({ gameId: 'gra-a', devAccountId: 'dev1' })])
      const updateRegistration = vi.fn(async () => {})
      await start(makeDeps({ catalog: store, updateRegistration }))
      const res = await post('/update-game', { devAccountId: 'dev1', gameId: 'gra-a', serviceUrl: 'https://api2.example.com' })
      expect(res.status).toBe(200)
      expect(updateRegistration).toHaveBeenCalledWith('gra-a', { serviceUrl: 'https://api2.example.com' })
      expect(JSON.stringify(docs.get('gra-a'))).not.toContain('api2.example.com')
      expect(docs.get('gra-a')!.status).toBe('registered')
    })

    it('nie-właściciel → 403 (błąd domenowy), bez zmian', async () => {
      const { docs, store } = memoryCatalog([externalDoc({ gameId: 'gra-a', devAccountId: 'dev2', status: 'published' })])
      await start(makeDeps({ catalog: store }))
      const res = await post('/update-game', { devAccountId: 'dev1', gameId: 'gra-a', uiUrl: 'https://haker.example.com' })
      expect(res.status).toBe(403)
      expect(docs.get('gra-a')!.status).toBe('published')
    })

    it('builtin (devAccountId null) nie jest edytowalny → 403', async () => {
      const { store } = memoryCatalog([
        externalDoc({ gameId: 'rps', builtin: true, devAccountId: null, uiUrl: null, rankedEligible: true }),
      ])
      await start(makeDeps({ catalog: store }))
      const res = await post('/update-game', { devAccountId: 'dev1', gameId: 'rps', uiUrl: 'https://x.example.com' })
      expect(res.status).toBe(403)
    })

    it('nieznana gra → 404; brak pól do zmiany → 400; zły manifest → 400', async () => {
      const { store } = memoryCatalog([externalDoc({ gameId: 'gra-a', devAccountId: 'dev1' })])
      await start(makeDeps({ catalog: store }))
      expect((await post('/update-game', { devAccountId: 'dev1', gameId: 'nie-ma', uiUrl: 'https://x.example.com' })).status).toBe(404)
      expect((await post('/update-game', { devAccountId: 'dev1', gameId: 'gra-a' })).status).toBe(400)
      expect((await post('/update-game', { devAccountId: 'dev1', gameId: 'gra-a', manifest: validManifest({ planningPhaseMs: 100 }) })).status).toBe(400)
    })
  })

  describe('approve-game / unpublish-game', () => {
    it('approve: registered → published z publishedAt', async () => {
      const { docs, store } = memoryCatalog([externalDoc({ gameId: 'gra-a', status: 'registered' })])
      await start(makeDeps({ catalog: store }))
      const res = await post('/approve-game', { gameId: 'gra-a' })
      expect(res.status).toBe(200)
      expect(docs.get('gra-a')!.status).toBe('published')
      expect((docs.get('gra-a') as any).publishedAt).toBe(NOW)
    })

    it('unpublish: published → unpublished', async () => {
      const { docs, store } = memoryCatalog([externalDoc({ gameId: 'gra-a', status: 'published' })])
      await start(makeDeps({ catalog: store }))
      const res = await post('/unpublish-game', { gameId: 'gra-a' })
      expect(res.status).toBe(200)
      expect(docs.get('gra-a')!.status).toBe('unpublished')
    })

    it('nieznana gra → 404; brak gameId → 400', async () => {
      await start(makeDeps({ catalog: memoryCatalog().store }))
      expect((await post('/approve-game', { gameId: 'nie-ma' })).status).toBe(404)
      expect((await post('/approve-game', {})).status).toBe(400)
      expect((await post('/unpublish-game', { gameId: 'nie-ma' })).status).toBe(404)
    })
  })
})
