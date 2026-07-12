import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import express from 'express'
import { Server } from 'http'

import { createCommandRouter, CommandDeps } from '../../app/command-api'
import { Match, Annotation } from '../../app/models'

/**
 * Integracyjne A3 (Etap 4b/4c) na REALNYM Mongo (setup.ts): adnotacje zapis/odczyt,
 * player-history (win/loss/draw z `matches.score`), guest-matches (okno) oraz
 * attach-guest (przeniesienie tylko meczów danego guestId z okna 7 dni + idempotencja).
 *
 * Endpointy A3 nie dotykają silnika — bootujemy `createCommandRouter` z atrapą
 * `engine` i DOMYŚLNYMI implementacjami A3 (prawdziwe kolekcje). `now` wstrzykujemy
 * tam, gdzie liczy się okno 7 dni (attach-guest), by test był deterministyczny.
 *
 * Odpala Piotr (replica set :27140): npm run test:integration --workspace games
 */

const INTERNAL_SECRET = 'internal-a3-secret'

function fakeEngine(): CommandDeps['engine'] {
  const notUsed = async () => {
    throw new Error('engine not used by A3 endpoints')
  }
  return {
    createMatch: notUsed as never,
    playerReady: notUsed as never,
    submitMove: notUsed as never,
    revealDone: notUsed as never,
    addPlayer: notUsed as never,
    cancel: notUsed as never,
  }
}

interface Api {
  base: string
  stop: () => Promise<void>
  post: (path: string, body: unknown, headers?: Record<string, string>) => Promise<{ status: number; body: any }>
}

async function boot(now?: () => number): Promise<Api> {
  const app = express()
  app.use(express.json())
  const deps: CommandDeps = {
    engine: fakeEngine(),
    internalSecret: INTERNAL_SECRET,
    getRegistration: async () => null,
    init: async () => ({ ok: true, state: null }),
    ...(now ? { now } : {}),
  }
  app.use('/command', createCommandRouter(deps))
  const server: Server = app.listen(0)
  await new Promise<void>((r) => server.once('listening', () => r()))
  const port = (server.address() as any).port
  const base = `http://127.0.0.1:${port}/command`
  return {
    base,
    stop: () => new Promise<void>((r) => server.close(() => r())),
    post: (path, body, headers = {}) =>
      fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-sixseven-internal': INTERNAL_SECRET, ...headers },
        body: JSON.stringify(body),
      }).then(async (res) => ({ status: res.status, body: await res.json() })),
  }
}

/** Zasiej mecz zakończony (lub inny) wprost w kolekcji — `_id` jest STRINGIEM. */
async function seedMatch(over: Record<string, unknown>) {
  const base = {
    _id: `m_${Math.random().toString(16).slice(2, 10)}`,
    gameId: 'rps',
    manifestVersion: '1.0.0',
    players: [] as string[],
    guestIds: [] as string[],
    phase: 'finished',
    endReason: 'finished',
    score: {} as Record<string, number>,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  const doc = { ...base, ...over }
  await Match.collection.insertOne(doc as any)
  return doc._id as string
}

describe('A3 integracyjne: annotations + player-history + guest queries', () => {
  let api: Api

  beforeEach(async () => {
    api = await boot()
  })
  afterEach(async () => {
    await api.stop()
  })

  describe('annotate (zapis/odczyt)', () => {
    it('zapisuje adnotację do kolekcji annotations', async () => {
      const res = await api.post('/annotate', {
        playerId: 'u1',
        gameId: 'rps',
        badgeId: 'first_win',
        sentiment: 'positive',
        params: { streak: 3 },
      })
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ ok: true })

      const docs = await Annotation.find({ playerId: 'u1' })
      expect(docs).toHaveLength(1)
      const a = docs[0] as any
      expect(a.gameId).toBe('rps')
      expect(a.badgeId).toBe('first_win')
      expect(a.sentiment).toBe('positive')
      expect(a.params).toEqual({ streak: 3 })
      expect(typeof a.earnedAt).toBe('number')
      expect(typeof a.createdAt).toBe('number')
    })

    it('params domyślnie {} gdy pominięte', async () => {
      const res = await api.post('/annotate', { playerId: 'u2', gameId: 'rps', badgeId: 'b', sentiment: 'neutral' })
      expect(res.status).toBe(200)
      const a = (await Annotation.findOne({ playerId: 'u2' })) as any
      expect(a.params).toEqual({})
      expect(a.sentiment).toBe('neutral')
    })

    it('odrzuca zły sentiment (400) i nic nie zapisuje', async () => {
      const res = await api.post('/annotate', { playerId: 'u3', gameId: 'rps', badgeId: 'b', sentiment: 'ecstatic' })
      expect(res.status).toBe(400)
      expect(await Annotation.countDocuments({ playerId: 'u3' })).toBe(0)
    })

    it('odrzuca params > ~1KB (413)', async () => {
      const big = { blob: 'x'.repeat(2000) }
      const res = await api.post('/annotate', { playerId: 'u4', gameId: 'rps', badgeId: 'b', sentiment: 'positive', params: big })
      expect(res.status).toBe(413)
      expect(await Annotation.countDocuments({ playerId: 'u4' })).toBe(0)
    })

    it('wymaga sekretu wewnętrznego (401)', async () => {
      const res = await api.post('/annotate', { playerId: 'u5', gameId: 'rps', badgeId: 'b', sentiment: 'positive' }, {
        'x-sixseven-internal': 'wrong',
      })
      expect(res.status).toBe(401)
    })
  })

  describe('player-history (win/loss/draw z score)', () => {
    beforeEach(async () => {
      // u1: wygrana (unikalny max), przegrana, remis (współdzielony max) w rps
      await seedMatch({ gameId: 'rps', players: ['u1', 'u2'], score: { u1: 2, u2: 1 }, updatedAt: 300 })
      await seedMatch({ gameId: 'rps', players: ['u1', 'u2'], score: { u1: 0, u2: 2 }, updatedAt: 200 })
      await seedMatch({ gameId: 'rps', players: ['u1', 'u2'], score: { u1: 1, u2: 1 }, updatedAt: 100 })
      // mecz innej gry
      await seedMatch({ gameId: 'ttt', players: ['u1', 'u3'], score: { u1: 5, u3: 1 }, updatedAt: 400 })
      // anulowany — NIE liczy się (phase finished, ale endReason cancelled_*)
      await seedMatch({ gameId: 'rps', players: ['u1', 'u2'], phase: 'finished', endReason: 'cancelled_paused', score: { u1: 9, u2: 0 }, updatedAt: 50 })
      // niezakończony — NIE liczy się
      await seedMatch({ gameId: 'rps', players: ['u1', 'u2'], phase: 'planning', endReason: null, score: { u1: 9 }, updatedAt: 60 })
      // mecz bez u1 — nie należy do historii u1
      await seedMatch({ gameId: 'rps', players: ['u2', 'u3'], score: { u2: 2, u3: 0 }, updatedAt: 70 })
    })

    it('agreguje win/loss/draw per gra i zwraca recent malejąco po finishedAt', async () => {
      const res = await api.post('/player-history', { userId: 'u1' })
      expect(res.status).toBe(200)
      const h = res.body.history
      const rps = h.games.find((g: any) => g.gameId === 'rps')
      const ttt = h.games.find((g: any) => g.gameId === 'ttt')
      expect(rps).toEqual({ gameId: 'rps', played: 3, wins: 1, losses: 1, draws: 1 })
      expect(ttt).toEqual({ gameId: 'ttt', played: 1, wins: 1, losses: 0, draws: 0 })

      // recent: 4 policzone mecze, malejąco po updatedAt (400,300,200,100)
      expect(h.recent.map((r: any) => r.finishedAt)).toEqual([400, 300, 200, 100])
      const first = h.recent[0]
      expect(first).toMatchObject({ gameId: 'ttt', result: 'win', score: { u1: 5, u3: 1 } })
      expect(h.recent.map((r: any) => r.result)).toEqual(['win', 'win', 'loss', 'draw'])
    })

    it('gameId zawęża do jednej gry', async () => {
      const res = await api.post('/player-history', { userId: 'u1', gameId: 'ttt' })
      expect(res.body.history.games).toEqual([{ gameId: 'ttt', played: 1, wins: 1, losses: 0, draws: 0 }])
      expect(res.body.history.recent).toHaveLength(1)
    })

    it('brak userId → 400', async () => {
      const res = await api.post('/player-history', {})
      expect(res.status).toBe(400)
    })

    it('gracz bez meczów → pusta historia', async () => {
      const res = await api.post('/player-history', { userId: 'nobody' })
      expect(res.body.history).toEqual({ games: [], recent: [] })
    })
  })

  describe('guest-matches (okno sinceMs)', () => {
    beforeEach(async () => {
      await seedMatch({ gameId: 'rps', guestIds: ['g1'], createdAt: 1000, updatedAt: 1500, phase: 'finished' })
      await seedMatch({ gameId: 'rps', guestIds: ['g1'], createdAt: 2000, updatedAt: 2500, phase: 'planning', endReason: null })
      await seedMatch({ gameId: 'rps', guestIds: ['g1'], createdAt: 500, updatedAt: 600, phase: 'finished' }) // przed oknem
      await seedMatch({ gameId: 'rps', guestIds: ['g2'], createdAt: 3000, updatedAt: 3500, phase: 'finished' }) // inny gość
    })

    it('zwraca mecze g1 z createdAt >= sinceMs (granica włącznie), finishedAt tylko dla zakończonych', async () => {
      const res = await api.post('/guest-matches', { guestId: 'g1', sinceMs: 1000 })
      expect(res.status).toBe(200)
      const matches = res.body.matches
      // createdAt 1000 (włącznie) i 2000; NIE 500 (przed oknem), NIE g2
      expect(matches).toHaveLength(2)
      const byCreated = [...matches].sort((a: any, b: any) => a.matchId.localeCompare(b.matchId))
      expect(byCreated.every((m: any) => m.gameId === 'rps')).toBe(true)
      // finishedAt: 1500 dla zakończonego (updatedAt), null dla 'planning'.
      // Kolejność niegwarantowana → porównanie niezależne od kolejności.
      const finishedVals = matches.map((m: any) => m.finishedAt)
      expect(finishedVals).toContain(1500)
      expect(finishedVals).toContain(null)
      expect(finishedVals).toHaveLength(2)
    })

    it('sinceMs powyżej wszystkich → pusto', async () => {
      const res = await api.post('/guest-matches', { guestId: 'g1', sinceMs: 5000 })
      expect(res.body.matches).toEqual([])
    })

    it('brak guestId lub sinceMs → 400', async () => {
      expect((await api.post('/guest-matches', { sinceMs: 1 })).status).toBe(400)
      expect((await api.post('/guest-matches', { guestId: 'g1' })).status).toBe(400)
    })
  })

  describe('attach-guest (okno 7 dni, idempotencja, izolacja gości)', () => {
    const T = 10_000_000_000 // stały „teraz"
    const DAY = 24 * 60 * 60 * 1000

    beforeEach(async () => {
      api = await boot(() => T) // wstrzyknięty zegar → okno = T-7d
      // g1: dwa mecze w oknie (1d, 6d temu) + jeden POZA oknem (8d temu)
      await seedMatch({ _id: 'g1_in_a', players: ['other'], guestIds: ['g1'], createdAt: T - 1 * DAY })
      await seedMatch({ _id: 'g1_in_b', players: [], guestIds: ['g1', 'gx'], createdAt: T - 6 * DAY })
      await seedMatch({ _id: 'g1_old', players: [], guestIds: ['g1'], createdAt: T - 8 * DAY })
      // g2: mecz w oknie — NIE może zostać ruszony przez attach g1
      await seedMatch({ _id: 'g2_in', players: [], guestIds: ['g2'], createdAt: T - 2 * DAY })
    })

    it('przenosi tylko mecze g1 z okna 7 dni; g1 znika z guestIds, user dochodzi do players', async () => {
      const res = await api.post('/attach-guest', { guestId: 'g1', userId: 'u9' })
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ attached: 2 })

      const inA = (await Match.findById('g1_in_a')) as any
      expect(inA.guestIds).not.toContain('g1')
      expect(inA.players).toContain('u9')
      expect(inA.players).toContain('other') // istniejący gracz zostaje

      const inB = (await Match.findById('g1_in_b')) as any
      expect(inB.guestIds).toEqual(['gx']) // usunięto TYLKO g1, inny gość zostaje
      expect(inB.players).toEqual(['u9'])

      // Poza oknem — nietknięty
      const old = (await Match.findById('g1_old')) as any
      expect(old.guestIds).toEqual(['g1'])
      expect(old.players).toEqual([])

      // Inny gość — nietknięty
      const g2 = (await Match.findById('g2_in')) as any
      expect(g2.guestIds).toEqual(['g2'])
      expect(g2.players).toEqual([])
    })

    it('idempotentne: ponowne wywołanie zwraca attached=0', async () => {
      const first = await api.post('/attach-guest', { guestId: 'g1', userId: 'u9' })
      expect(first.body).toEqual({ attached: 2 })
      const second = await api.post('/attach-guest', { guestId: 'g1', userId: 'u9' })
      expect(second.body).toEqual({ attached: 0 })

      // Bez duplikatów userId w players
      const inA = (await Match.findById('g1_in_a')) as any
      expect(inA.players.filter((p: string) => p === 'u9')).toHaveLength(1)
    })

    it('brak guestId lub userId → 400', async () => {
      expect((await api.post('/attach-guest', { userId: 'u9' })).status).toBe(400)
      expect((await api.post('/attach-guest', { guestId: 'g1' })).status).toBe(400)
    })
  })
})
