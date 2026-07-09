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
})
