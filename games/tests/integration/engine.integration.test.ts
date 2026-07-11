import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import { Match, Move, MatchState, MatchView, MatchEvent, ResolveLog } from '../../app/models'
import { MatchEngine } from '../../app/engine/engine'
import { Scheduler } from '../../app/engine/scheduler'
import { startFakeService, FakeService, FakeDirective } from '../helpers/fake-game-service'

/**
 * Testy integracyjne silnika 2a (I1–I5, retry/pause, atomowość). Wymagają
 * replica setu — patrz setup.ts. Zegar jest wstrzykiwany, więc backoffy i
 * timeouty nie wymagają realnego czekania: przesuwamy `clock.t` i wołamy
 * scheduler.tick() ręcznie.
 */

const SECRET = 'shared-secret-for-tests'
const GAME = 'rps'
const VERSION = '1.0.0'

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
    finished: over.finished ?? false,
    revealDurationMs: over.revealDurationMs ?? 0,
  }
}

describe('MatchEngine (integration)', () => {
  let clock: { t: number }
  let fake: FakeService

  async function makeEngine(handler: (req: any, i: number) => FakeDirective) {
    fake = await startFakeService({ secret: SECRET, handler })
    const engine = new MatchEngine({
      resolveEndpoint: async () => ({ url: fake.url, secret: fake.secret }),
      now: () => clock.t,
    })
    const scheduler = new Scheduler(engine, () => clock.t)
    return { engine, scheduler }
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

  // Zegar wirtualny ZAKOTWICZONY w realnym czasie: podpis HMAC ma timestamp
  // bliski „teraz", więc mieści się w oknie ±30 s weryfikowanym przez fake-serwis
  // (który używa realnego Date.now()). Przesuwanie clock.t o sekundy w teście
  // zostaje w oknie.
  beforeEach(() => { clock = { t: Date.now() } })
  afterEach(async () => { if (fake) await fake.stop() })

  it('I1/I2: podczas planowania ruch jest w prywatnej moves, ale nie w matches ani match_views, i /resolve NIE jest wołane', async () => {
    const { engine } = await makeEngine(() => ({ kind: 'ok', response: makeResp() }))
    const id = await newMatch(engine)

    // Tylko JEDEN gracz składa ruch → mecz zostaje w planowaniu (brak auto-close).
    await engine.submitMove(id, 'p1', { pick: 'rock' })

    const move = await Move.findOne({ matchId: id, round: 1, playerId: 'p1' })
    expect(move?.move).toEqual({ pick: 'rock' }) // treść w prywatnej kolekcji (I1)

    const match = await Match.findById(id)
    expect(match?.phase).toBe('planning')
    expect((match?.ready as any).p1).toBe(true)          // fakt gotowości
    expect(JSON.stringify(match)).not.toContain('rock')  // treść ruchu NIGDY w matches (I1)

    const views = await MatchView.find({ matchId: id })
    expect(views).toHaveLength(0)                         // brak widoków przed reveal

    expect(fake.calls).toHaveLength(0)                    // /resolve nie wołane w planowaniu (I2)
  })

  it('S2/A1: po komplecie ruchów runda jest zapieczętowana PRZED /resolve, a żądanie jest podpisane i niesie ruchy + wersję', async () => {
    const { engine } = await makeEngine(() => ({ kind: 'ok', response: makeResp({ revealDurationMs: 0, finished: true }) }))
    const id = await newMatch(engine)

    await engine.submitMove(id, 'p1', { pick: 'rock' })
    await engine.submitMove(id, 'p2', { pick: 'scissors' }) // komplet → auto close → resolve

    // Zapieczętowanie rundy 1 (A1).
    const st = await MatchState.findOne({ matchId: id, round: 1 })
    expect(st?.sealed).toBe(true)

    expect(fake.calls).toHaveLength(1)
    const call = fake.calls[0]
    expect(call.signatureValid).toBe(true)               // engine podpisuje poprawnie (S2)
    expect(call.body.manifestVersion).toBe(VERSION)      // wersja w żądaniu (C3)
    expect(call.body.idempotencyKey).toBe(`${id}:1`)     // klucz idempotencji (A4)
    const picks = call.body.moves.map((m: any) => m.move.pick).sort()
    expect(picks).toEqual(['rock', 'scissors'])          // ruchy opuszczają platformę dopiero tu (stan 4)
  })

  it('happy path: 2 rundy (reveal → timeout → runda 2 → finish), wynik i widoki zapisane atomowo', async () => {
    const { engine, scheduler } = await makeEngine((_req, i) => {
      if (i === 0) return { kind: 'ok', response: makeResp({ points: { p1: 1 }, finished: false, revealDurationMs: 1000, state: { round: 2 } }) }
      return { kind: 'ok', response: makeResp({ points: { p2: 2 }, finished: true, revealDurationMs: 0, state: { done: true } }) }
    })
    const id = await newMatch(engine)

    // Runda 1.
    await engine.submitMove(id, 'p1', { pick: 'rock' })
    await engine.submitMove(id, 'p2', { pick: 'scissors' })

    let match = await Match.findById(id)
    expect(match?.phase).toBe('revealing')
    expect((match?.score as any).p1).toBe(1)

    // Atomowość (A2): event + widoki + stan kolejnej rundy są razem po commicie.
    expect(await MatchEvent.findOne({ matchId: id, round: 1 })).not.toBeNull()
    expect(await MatchView.countDocuments({ matchId: id, round: 1 })).toBe(2)
    expect(await MatchState.findOne({ matchId: id, round: 2 })).not.toBeNull()

    // Reveal timeout przez scheduler (deadline = now + 1000 + margines).
    clock.t += 1000 + 5000
    await scheduler.tick()

    match = await Match.findById(id)
    expect(match?.phase).toBe('planning')
    expect(match?.round).toBe(2)

    // Runda 2 → finish.
    await engine.submitMove(id, 'p1', { pick: 'paper' })
    await engine.submitMove(id, 'p2', { pick: 'rock' })

    match = await Match.findById(id)
    expect(match?.phase).toBe('finished')
    expect(match?.endReason).toBe('finished')
    expect((match?.score as any).p2).toBe(2)

    // Row-level: każdy gracz ma własny widok rundy.
    const p1views = await MatchView.find({ matchId: id, playerId: 'p1' })
    const p2views = await MatchView.find({ matchId: id, playerId: 'p2' })
    expect(p1views.length).toBeGreaterThan(0)
    expect(p2views.length).toBeGreaterThan(0)
    expect(p1views.every((v: any) => v.playerId === 'p1')).toBe(true)
  })

  it('I5/A4: resolve_log zapisuje każdą próbę, oznacza użytą i niesie wersję manifestu', async () => {
    const { engine } = await makeEngine(() => ({ kind: 'ok', response: makeResp({ finished: true, revealDurationMs: 0 }) }))
    const id = await newMatch(engine)
    await engine.submitMove(id, 'p1', { pick: 'rock' })
    await engine.submitMove(id, 'p2', { pick: 'paper' })

    const logs = await ResolveLog.find({ matchId: id, round: 1 })
    expect(logs).toHaveLength(1)
    expect(logs[0].outcome).toBe('ok')
    expect(logs[0].used).toBe(true)
    expect(logs[0].manifestVersion).toBe(VERSION)
    expect(logs[0].request).not.toBeNull()
    expect(logs[0].response).not.toBeNull()
  })

  it('retry → pause → resume: 3 błędy /resolve pauzują mecz, po resume sukces dograją rundę', async () => {
    const { engine, scheduler } = await makeEngine((_req, i) => {
      if (i < 3) return { kind: 'error', status: 500 }        // 3 pierwsze próby padają
      return { kind: 'ok', response: makeResp({ finished: true, revealDurationMs: 0 }) }
    })
    const id = await newMatch(engine)

    await engine.submitMove(id, 'p1', { pick: 'rock' })
    await engine.submitMove(id, 'p2', { pick: 'paper' }) // auto close → próba 1 (fail)

    let match = await Match.findById(id)
    expect(match?.phase).toBe('resolving')
    expect(match?.failCount).toBe(1)

    // Próba 2 (backoff) i 3 (fail) → Paused.
    clock.t += 20; await scheduler.tick()
    match = await Match.findById(id)
    expect(match?.failCount).toBe(2)

    clock.t += 20; await scheduler.tick()
    match = await Match.findById(id)
    expect(match?.phase).toBe('paused')

    expect(await ResolveLog.countDocuments({ matchId: id, round: 1 })).toBe(3)

    // Resume — health OK → ponowny /resolve (próba 4) → sukces → finished.
    await engine.resume(id)
    match = await Match.findById(id)
    expect(match?.phase).toBe('finished')
  })

  it('odrzuca ruch od kogoś spoza rostera i po zakończeniu fazy planowania', async () => {
    const { engine } = await makeEngine(() => ({ kind: 'ok', response: makeResp({ finished: true, revealDurationMs: 0 }) }))
    const id = await newMatch(engine)

    expect(await engine.submitMove(id, 'intruder', { pick: 'rock' })).toBe('rejected')

    await engine.submitMove(id, 'p1', { pick: 'rock' })
    await engine.submitMove(id, 'p2', { pick: 'paper' }) // komplet → finished
    // Mecz już nie jest w planowaniu → kolejny ruch odrzucony.
    expect(await engine.submitMove(id, 'p1', { pick: 'rock' })).toBe('rejected')
  })

  describe('playerReady — brama gotowości lobby (Etap 3 pkt 5)', () => {
    it('pojedyncze zgłoszenie gotowości: mecz zostaje w lobby (nie startuje Planning)', async () => {
      const { engine } = await makeEngine(() => ({ kind: 'ok', response: makeResp() }))
      const id = await engine.createMatch({
        gameId: GAME,
        manifestVersion: VERSION,
        players: ['p1', 'p2'],
        initialState: { tick: 0 },
      })

      await engine.playerReady(id, 'p1')

      const match = await Match.findById(id)
      expect(match?.phase).toBe('lobby')
      expect((match?.lobbyReady as any).p1).toBe(true)
      expect((match?.lobbyReady as any).p2).toBeUndefined()
    })

    it('komplet rosteru (players ∪ guestIds) gotowy → Lobby przechodzi w Planning', async () => {
      const { engine } = await makeEngine(() => ({ kind: 'ok', response: makeResp() }))
      const id = await engine.createMatch({
        gameId: GAME,
        manifestVersion: VERSION,
        players: ['p1'],
        guestIds: ['g_2'],
        initialState: { tick: 0 },
      })

      await engine.playerReady(id, 'p1')
      let match = await Match.findById(id)
      expect(match?.phase).toBe('lobby')

      await engine.playerReady(id, 'g_2')
      match = await Match.findById(id)
      expect(match?.phase).toBe('planning')
      expect(match?.round).toBe(1)
    })

    it('ignoruje playerId spoza rosteru (no-op, mecz zostaje w lobby)', async () => {
      const { engine } = await makeEngine(() => ({ kind: 'ok', response: makeResp() }))
      const id = await engine.createMatch({
        gameId: GAME,
        manifestVersion: VERSION,
        players: ['p1', 'p2'],
        initialState: { tick: 0 },
      })

      await engine.playerReady(id, 'intruder')

      const match = await Match.findById(id)
      expect(match?.phase).toBe('lobby')
      expect(match?.lobbyReady ?? {}).toEqual({})
    })

    it('no-op poza fazą lobby (mecz już w planning)', async () => {
      const { engine } = await makeEngine(() => ({ kind: 'ok', response: makeResp() }))
      const id = await newMatch(engine) // helper wywołuje engine.start bezpośrednio → planning

      await engine.playerReady(id, 'p1')

      const match = await Match.findById(id)
      expect(match?.phase).toBe('planning')
      expect(match?.lobbyReady ?? {}).toEqual({})
    })

    it('wyścig dwóch „ready" naraz jest bezpieczny (start idempotentny)', async () => {
      const { engine } = await makeEngine(() => ({ kind: 'ok', response: makeResp() }))
      const id = await engine.createMatch({
        gameId: GAME,
        manifestVersion: VERSION,
        players: ['p1', 'p2'],
        initialState: { tick: 0 },
      })

      await Promise.all([engine.playerReady(id, 'p1'), engine.playerReady(id, 'p2')])

      const match = await Match.findById(id)
      expect(match?.phase).toBe('planning')
      expect(match?.round).toBe(1)
    })
  })

  describe('playerReady ustawia deadline (Etap 3B pkt 3)', () => {
    it('createMatch: lobby czeka BEZ limitu (deadline null) do 1. ready', async () => {
      const { engine } = await makeEngine(() => ({ kind: 'ok', response: makeResp() }))
      const id = await engine.createMatch({
        gameId: GAME, manifestVersion: VERSION, players: ['p1', 'p2'], initialState: { tick: 0 },
      })
      const match = await Match.findById(id)
      expect(match?.phase).toBe('lobby')
      expect(match?.deadline).toBeNull()
    })

    it('PIERWSZE ready uzbraja deadline = now + planningPhaseMs; kolejne ready tego samego gracza go nie przestawia', async () => {
      const { engine } = await makeEngine(() => ({ kind: 'ok', response: makeResp() }))
      const id = await engine.createMatch({
        gameId: GAME, manifestVersion: VERSION, players: ['p1', 'p2'],
        options: { planningPhaseMs: 5000 }, initialState: { tick: 0 },
      })
      const t0 = clock.t

      await engine.playerReady(id, 'p1')
      let match = await Match.findById(id)
      expect(match?.deadline).toBe(t0 + 5000)

      clock.t += 100
      await engine.playerReady(id, 'p1') // powtórka (idempotentna) — deadline JUŻ uzbrojony, bez zmian
      match = await Match.findById(id)
      expect(match?.deadline).toBe(t0 + 5000)
    })
  })

  describe('addPlayer — dołączenie do meczu w lobby (Etap 3B pkt 2)', () => {
    it('dopisuje gracza do players, re-init nadpisuje match_states rundy 1, faza zostaje lobby', async () => {
      const { engine } = await makeEngine(() => ({ kind: 'ok', response: makeResp() }))
      const id = await engine.createMatch({
        gameId: GAME, manifestVersion: VERSION, players: ['p1'], capacity: 2, initialState: { tick: 0 },
      })

      const result = await engine.addPlayer(id, 'p2', 'user', { tick: 99, reinit: true })
      expect(result).toBe('added')

      const match = await Match.findById(id)
      expect(match?.phase).toBe('lobby')
      expect(match?.players).toEqual(['p1', 'p2'])

      const state = await MatchState.findOne({ matchId: id, round: 1 })
      expect(state?.state).toEqual({ tick: 99, reinit: true })
      expect(state?.sealed).toBe(false)
    })

    it('dopisuje gościa do guestIds (kind=guest)', async () => {
      const { engine } = await makeEngine(() => ({ kind: 'ok', response: makeResp() }))
      const id = await engine.createMatch({
        gameId: GAME, manifestVersion: VERSION, players: ['p1'], capacity: 2, initialState: {},
      })
      await engine.addPlayer(id, 'g_2', 'guest', { tick: 1 })
      const match = await Match.findById(id)
      expect(match?.guestIds).toEqual(['g_2'])
      expect(match?.players).toEqual(['p1'])
    })

    it('guard: mecz nie istnieje → not-found', async () => {
      const { engine } = await makeEngine(() => ({ kind: 'ok', response: makeResp() }))
      expect(await engine.addPlayer('does-not-exist', 'p2', 'user', {})).toBe('not-found')
    })

    it('guard: mecz poza lobby (już planning) → not-lobby', async () => {
      const { engine } = await makeEngine(() => ({ kind: 'ok', response: makeResp() }))
      const id = await newMatch(engine) // helper: createMatch + start → planning
      expect(await engine.addPlayer(id, 'p3', 'user', {})).toBe('not-lobby')
    })

    it('guard: gracz już w składzie → duplicate (bez zmian w rosterze)', async () => {
      const { engine } = await makeEngine(() => ({ kind: 'ok', response: makeResp() }))
      const id = await engine.createMatch({
        gameId: GAME, manifestVersion: VERSION, players: ['p1', 'p2'], capacity: 2, initialState: {},
      })
      expect(await engine.addPlayer(id, 'p2', 'user', {})).toBe('duplicate')
      const match = await Match.findById(id)
      expect(match?.players).toEqual(['p1', 'p2'])
    })

    it('guard: brak wolnego slotu (capacity osiągnięta) → full', async () => {
      const { engine } = await makeEngine(() => ({ kind: 'ok', response: makeResp() }))
      const id = await engine.createMatch({
        gameId: GAME, manifestVersion: VERSION, players: ['p1', 'p2'], capacity: 2, initialState: {},
      })
      expect(await engine.addPlayer(id, 'p3', 'user', {})).toBe('full')
    })
  })

  describe('scheduler: auto-start lobby po planningPhaseMs, brak auto-cancel (Etap 3B pkt 3)', () => {
    it('deadline lobby minął i jest co najmniej jedno lobbyReady → auto-start mimo niekompletnego rosteru', async () => {
      const { engine, scheduler } = await makeEngine(() => ({ kind: 'ok', response: makeResp() }))
      const id = await engine.createMatch({
        gameId: GAME, manifestVersion: VERSION, players: ['p1', 'p2'],
        options: { planningPhaseMs: 1000 }, initialState: { tick: 0 },
      })
      await engine.playerReady(id, 'p1') // tylko jeden gotowy — uzbraja deadline

      let match = await Match.findById(id)
      expect(match?.phase).toBe('lobby')

      clock.t += 1000 + 10
      await scheduler.tick()

      match = await Match.findById(id)
      expect(match?.phase).toBe('planning') // auto-start mimo braku ready od p2
      expect(match?.round).toBe(1)
    })

    it('lobby bez żadnego ready nie ma deadline → scheduler nigdy go nie rusza (brak auto-cancel)', async () => {
      const { engine, scheduler } = await makeEngine(() => ({ kind: 'ok', response: makeResp() }))
      const id = await engine.createMatch({
        gameId: GAME, manifestVersion: VERSION, players: ['p1', 'p2'], initialState: { tick: 0 },
      })

      clock.t += 10_000_000
      await scheduler.tick()

      const match = await Match.findById(id)
      expect(match?.phase).toBe('lobby')
      expect(match?.endReason).toBeNull()
    })
  })
})
