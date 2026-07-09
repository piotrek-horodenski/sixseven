import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import { Match, Move, MatchState, MatchView, MatchEvent } from '../../app/models'
import { MatchEngine } from '../../app/engine/engine'
import { startFakeService, FakeService, FakeDirective } from '../helpers/fake-game-service'

/**
 * S2 — „Głuchy dev" (2c, sekcja „Testy do CI"). Mock serwisu gry rejestruje
 * WSZYSTKIE wywołania; sprawdzamy, że dev po drugiej stronie /resolve nie jest w
 * stanie podsłuchać ani nadpisań ruchu, ani czasu decyzji — słyszy WYŁĄCZNIE
 * komplet zapieczętowanych ruchów, dopiero po zamknięciu fazy.
 *
 * Trzy własności:
 *  (a) I2 — żadne wywołanie /resolve nie zawiera treści ruchu przed sealem;
 *      treść opuszcza platformę dopiero po zapieczętowaniu rundy (i tylko w `moves`).
 *  (b) A3 — nadpisania ruchu w fazie planowania NIE tworzą zdarzeń z treścią w
 *      kolekcjach subskrybowalnych (matches/match_views/match_events) — dowód na
 *      żywym change-streamie.
 *  (c) „ready" to fakt bez treści ani mierzalnego timingu decyzji: mapa boolowska
 *      w `matches`, nigdy nie trafia do żądania /resolve.
 *
 * Wymaga replica setu (jak reszta integracyjnych; change stream + engine na
 * Mongo). Odpala Piotr: `npm run test:integration --workspace games`.
 * Zegar wstrzykiwany (jak w engine.integration) — zakotwiczony w realnym czasie,
 * żeby podpis HMAC mieścił się w oknie fake-serwisu.
 */

const SECRET = 'shared-secret-for-tests'
const GAME = 'rps'
const VERSION = '1.0.0'
const CONTENT = /rock|paper|scissors/

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function waitFor(pred: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!pred() && Date.now() < deadline) await delay(25)
}

function makeResp(over: Partial<{
  state: unknown
  events: unknown[]
  points: Record<string, number>
  views: { playerId: string; view: unknown }[]
  finished: boolean
  revealDurationMs: number
}> = {}) {
  return {
    state: over.state ?? { tick: 1 },
    events: over.events ?? [{ kind: 'reveal' }],
    points: over.points ?? {},
    views: over.views ?? [
      { playerId: 'p1', view: { me: 'p1' } },
      { playerId: 'p2', view: { me: 'p2' } },
    ],
    finished: over.finished ?? true,
    revealDurationMs: over.revealDurationMs ?? 0,
  }
}

describe('S2 — głuchy dev (integration)', () => {
  let clock: { t: number }
  let fake: FakeService

  async function makeEngine(handler: (req: any, i: number) => FakeDirective) {
    fake = await startFakeService({ secret: SECRET, handler })
    const engine = new MatchEngine({
      resolveEndpoint: async () => ({ url: fake.url, secret: fake.secret }),
      now: () => clock.t,
    })
    return engine
  }

  async function newMatch(engine: MatchEngine) {
    const id = await engine.createMatch({
      gameId: GAME,
      manifestVersion: VERSION,
      players: ['p1', 'p2'],
      initialState: { tick: 0 },
    })
    await engine.start(id)
    return id
  }

  beforeEach(() => { clock = { t: Date.now() } })
  afterEach(async () => { if (fake) await fake.stop() })

  it('(a)+(c): nadpisania ruchu nie wołają /resolve; treść opuszcza platformę dopiero po sealu, a żądanie niesie tylko komplet ruchów (bez ready/timingu)', async () => {
    const engine = await makeEngine(() => ({ kind: 'ok', response: makeResp() }))
    const id = await newMatch(engine)

    // Faza planowania: p1 zmienia zdanie trzy razy, p2 jeszcze nie złożył ruchu.
    await engine.submitMove(id, 'p1', 'rock')
    await engine.submitMove(id, 'p1', 'paper')
    await engine.submitMove(id, 'p1', 'scissors')

    // (a) Głuchy dev NIC nie słyszy przed sealem — zero wywołań /resolve.
    expect(fake.calls).toHaveLength(0)

    // Nadpisania żyją WYŁĄCZNIE w prywatnej `moves`, w jednym dokumencie (I4/A3):
    // widoczna jest tylko ostatnia decyzja, historia zmian nie wycieka.
    const moves = await Move.find({ matchId: id, round: 1 })
    expect(moves).toHaveLength(1)
    expect(moves[0].move).toBe('scissors')

    // (c) `ready` to fakt boolowski bez treści; matches nie zawiera żadnego ruchu.
    const mid = await Match.findById(id)
    expect((mid?.ready as any).p1).toBe(true)
    expect(typeof (mid?.ready as any).p1).toBe('boolean')
    expect(JSON.stringify(mid?.ready)).not.toMatch(CONTENT)
    expect(JSON.stringify(mid)).not.toMatch(CONTENT)

    // Komplet ruchów → seal PRZED /resolve, potem (i dopiero potem) treść wychodzi.
    await engine.submitMove(id, 'p2', 'rock')

    const st = await MatchState.findOne({ matchId: id, round: 1 })
    expect(st?.sealed).toBe(true) // zapieczętowano (A1)

    expect(fake.calls).toHaveLength(1) // dokładnie jedno wywołanie, po sealu
    const body = fake.calls[0].body
    expect(fake.calls[0].signatureValid).toBe(true)

    // Treść ruchu pojawia się WYŁĄCZNIE w `moves[]` zapieczętowanego żądania —
    // i to najświeższa decyzja p1 ('scissors'), nie historia nadpisań.
    const picks = body.moves.map((m: any) => m.move).sort()
    expect(picks).toEqual(['rock', 'scissors'])

    // (c) Żądanie nie niesie mapy `ready` ani żadnego znacznika czasu decyzji —
    // timing „gotowości" jest faktem, który zostaje na platformie.
    expect(body).not.toHaveProperty('ready')
    expect(Object.keys(body).sort()).toEqual([
      'idempotencyKey', 'latePlayers', 'manifestVersion', 'matchId', 'moves', 'round', 'state',
    ])
  })

  it('(b) A3: nadpisania ruchu nie produkują zdarzeń z treścią w kolekcjach subskrybowalnych (change stream)', async () => {
    const engine = await makeEngine(() => ({ kind: 'ok', response: makeResp() }))
    const id = await newMatch(engine)

    const seen = { matches: [] as any[], views: [] as any[], events: [] as any[] }
    const csMatch = Match.watch([], { fullDocument: 'updateLookup' })
    csMatch.on('change', (e: any) => seen.matches.push(e))
    const csView = MatchView.watch()
    csView.on('change', (e: any) => seen.views.push(e))
    const csEvent = MatchEvent.watch()
    csEvent.on('change', (e: any) => seen.events.push(e))

    try {
      // Daj change-streamom czas na ustanowienie kursora, zanim zaczniemy pisać.
      await delay(300)

      // Trzy nadpisania tego samego gracza w fazie planowania (p2 wstrzymany).
      // Przesuwamy zegar między nimi, żeby każdy zapis realnie zmienił dokument
      // (inny `updatedAt`) i wyemitował osobne zdarzenie change-streamu — inaczej
      // identyczny $set jest no-opem bez wpisu w oplogu.
      clock.t += 1000
      await engine.submitMove(id, 'p1', 'rock')
      clock.t += 1000
      await engine.submitMove(id, 'p1', 'paper')
      clock.t += 1000
      await engine.submitMove(id, 'p1', 'scissors')

      // Poczekaj aż change-stream dostarczy zdarzenia z `matches` (po 1 na submit).
      await waitFor(() => seen.matches.length >= 3)
    } finally {
      await csMatch.close()
      await csView.close()
      await csEvent.close()
    }

    // match_views i match_events: NIC się nie dzieje w fazie planowania — brak
    // dokumentów, brak zdarzeń dla subskrybenta.
    expect(seen.views).toHaveLength(0)
    expect(seen.events).toHaveLength(0)

    // matches: zmiany istnieją (fakt gotowości), ale NIGDY nie niosą treści ruchu…
    expect(JSON.stringify(seen.matches)).not.toMatch(CONTENT)
    // …i dotykają wyłącznie faktu `ready.*` / `updatedAt` — nie treści decyzji.
    for (const e of seen.matches) {
      const fields = Object.keys(e.updateDescription?.updatedFields ?? {})
      expect(fields.every((f: string) => f === 'updatedAt' || f.startsWith('ready.'))).toBe(true)
    }
  })
})
