import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Server } from 'http'
import { serve } from 'sixseven-sdk'
import { rps } from 'sixseven-game-rps'

import { Match, Rating, QueueEntry, GameCatalog } from '../../app/models'
import { MatchEngine } from '../../app/engine/engine'
import { Scheduler } from '../../app/engine/scheduler'
import { registerGame, createRegistrationResolver } from '../../app/services/register-game'
import { settings } from '../../app/settings'
import { startRealCommandApi, RealCommandApi } from '../helpers/real-command-router'

/**
 * INTEGRACJA RANKED (Etap 4e, kontrakt §5 GAMES integration, RS 27140):
 * pełny przepływ kolejki — queue-join ×2 → tick matchmakera (proposed) →
 * queue-accept ×2 → matched (matchId) → mecz ranked prawdziwym RPS → finish →
 * ratings zapisane (ELO idempotentnie) — oraz walkower przez abandon,
 * walkower z defaultedStreak, accept-timeout, sprzątanie matched, mecz z
 * gościem i cancelled bez ELO.
 *
 * Zegar jak w rps-flow.integration.test.ts: wstrzyknięty `clock.t`, skoki tylko
 * tam, gdzie nie kolidują z oknem HMAC ±30s realnego RPS. Odpala Piotr:
 *   npm run test:integration --workspace games
 */

const RPS_SECRET = 'ranked-queue-secret'
const INTERNAL_SECRET = 'internal-ranked-secret'

describe('E2E ranked: kolejka + ELO + walkowery (realny RPS, realne Mongo)', () => {
  let rpsServer: Server
  let engine: MatchEngine
  let scheduler: Scheduler
  let api: RealCommandApi
  let clock: { t: number }

  beforeEach(async () => {
    clock = { t: Date.now() }
    rpsServer = serve(rps, { secret: RPS_SECRET, port: 0 })
    await new Promise<void>((r) => rpsServer.once('listening', () => r()))
    const rpsPort = (rpsServer.address() as any).port
    await registerGame({
      gameId: 'rps',
      version: rps.manifest.version,
      serviceUrl: `http://127.0.0.1:${rpsPort}`,
      hmacSecret: RPS_SECRET,
      manifest: rps.manifest as unknown as Record<string, unknown>,
    })
    // Seed katalogu builtin (jak register-rps.sh): published + rankedEligible.
    // defaultTarget:1 → mecz rankingowy z kolejki kończy się jedną rundą.
    await GameCatalog.create({
      _id: 'rps',
      name: 'Papier, kamień, nożyce',
      builtin: true,
      status: 'published',
      devAccountId: null,
      uiUrl: null,
      rankedEligible: true,
      manifest: {
        version: rps.manifest.version,
        minPlayers: 2,
        maxPlayers: 8,
        planningPhaseMs: rps.manifest.planningPhaseMs,
        defaultTarget: 1,
      },
      publishedAt: clock.t,
    })

    engine = new MatchEngine({ resolveEndpoint: createRegistrationResolver(), now: () => clock.t })
    scheduler = new Scheduler(engine, () => clock.t)
    api = await startRealCommandApi({ engine, secret: INTERNAL_SECRET, now: () => clock.t })
  })

  afterEach(async () => {
    await api.stop()
    await new Promise<void>((r) => rpsServer.close(() => r()))
  })

  function post(path: string, body: unknown) {
    return fetch(`${api.base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-sixseven-internal': INTERNAL_SECRET },
      body: JSON.stringify(body),
    }).then(async (res) => ({ status: res.status, body: await res.json() }))
  }

  /** Lobby → planning: obaj klikają start (roster pełny — capacity 2). */
  async function readyBoth(matchId: string, players: [string, string]) {
    await post('/start', { matchId, playerId: players[0] })
    await post('/start', { matchId, playerId: players[1] })
    expect((await Match.findById(matchId))?.phase).toBe('planning')
  }

  /** Domknij reveal (deterministycznie — sam DB, bez network calla). */
  async function advanceReveal() {
    clock.t += 1500 + settings.revealMarginMs + 50
    await scheduler.tick()
  }

  it('pełny przepływ: queue-join ×2 → proposed (tick) → accept ×2 → matched → mecz ranked → finish → ratings zapisane idempotentnie', async () => {
    // 1) Dwóch userów wchodzi do kolejki.
    expect((await post('/queue-join', { gameId: 'rps', userId: 'qa' })).status).toBe(200)
    expect((await post('/queue-join', { gameId: 'rps', userId: 'qb' })).status).toBe(200)

    let qa = await QueueEntry.findById('rps_qa')
    expect(qa?.status).toBe('waiting')
    expect(qa?.elo).toBe(1200) // brak ratingu = 1200

    // 2) Tick matchmakera: para FIFO → oba wpisy proposed ze wspólnym proposalId.
    await scheduler.tick()
    qa = await QueueEntry.findById('rps_qa')
    const qb = await QueueEntry.findById('rps_qb')
    expect(qa?.status).toBe('proposed')
    expect(qb?.status).toBe('proposed')
    expect(qa?.proposalId).toBeTruthy()
    expect(qa?.proposalId).toBe(qb?.proposalId)
    expect(qa?.proposalDeadline).toBe(clock.t + 10_000)
    const proposalId = qa!.proposalId as string

    // 3) Akcepty: pierwszy czeka, drugi zakłada mecz rankingowy.
    const acc1 = await post('/queue-accept', { gameId: 'rps', userId: 'qa', proposalId })
    expect(acc1.status).toBe(200)
    expect(acc1.body).toEqual({ ok: true, matchId: null })

    const acc2 = await post('/queue-accept', { gameId: 'rps', userId: 'qb', proposalId })
    expect(acc2.status).toBe(200)
    const matchId = (acc2.body as any).matchId as string
    expect(matchId).toBeTruthy()

    const qaM = await QueueEntry.findById('rps_qa')
    expect(qaM?.status).toBe('matched')
    expect(qaM?.matchId).toBe(matchId)
    expect((await QueueEntry.findById('rps_qb'))?.status).toBe('matched')

    // 4) Mecz: ranked WYŁĄCZNIE ze ścieżki kolejki; capacity 2; opcje z manifestu.
    let match = await Match.findById(matchId)
    expect(match?.ranked).toBe(true)
    expect(match?.capacity).toBe(2)
    expect(match?.players).toEqual(['qa', 'qb'])
    expect((match?.options as any).target).toBe(1)
    expect((match?.options as any).planningPhaseMs).toBe(rps.manifest.planningPhaseMs)

    // 5) Rozegranie: target=1 → jedna runda kończy mecz.
    await readyBoth(matchId, ['qa', 'qb'])
    await post('/submit-move', { matchId, playerId: 'qa', move: 'paper' })
    await post('/submit-move', { matchId, playerId: 'qb', move: 'rock' })
    match = await Match.findById(matchId)
    expect(match?.phase).toBe('revealing')
    expect(match?.pendingFinish).toBe(true)

    await advanceReveal()
    match = await Match.findById(matchId)
    expect(match?.phase).toBe('finished')
    expect(match?.endReason).toBe('finished')
    expect(match?.eloApplied).toBe(true)

    // 6) Ratings: świeży gracz K=32, wygrany +16, przegrany −16.
    const ra = await Rating.findById('rps_qa')
    const rb = await Rating.findById('rps_qb')
    expect(ra).toMatchObject({ gameId: 'rps', userId: 'qa', elo: 1216, matches: 1, k: 32 })
    expect(rb).toMatchObject({ gameId: 'rps', userId: 'qb', elo: 1184, matches: 1, k: 32 })

    // 7) Idempotencja: ponowne naliczenie (double trigger) nic nie zmienia.
    await engine.applyEloIfDue(matchId)
    expect((await Rating.findById('rps_qa'))?.elo).toBe(1216)
    expect((await Rating.findById('rps_qa'))?.matches).toBe(1)

    // 8) Watchdog matched: po 60 s wpisy kolejki znikają.
    clock.t += 61_000
    await scheduler.tick()
    expect(await QueueEntry.countDocuments({})).toBe(0)
  })

  it('accept-timeout: kto zaakceptował wraca BEZ zmiany since, kto nie — na koniec kolejki (since = now)', async () => {
    await post('/queue-join', { gameId: 'rps', userId: 'qa' })
    await post('/queue-join', { gameId: 'rps', userId: 'qb' })
    await scheduler.tick()

    const beforeQa = (await QueueEntry.findById('rps_qa'))!
    expect(beforeQa.status).toBe('proposed')
    const sinceQa = beforeQa.since as number

    // Tylko qa akceptuje; deadline (10 s) mija.
    await post('/queue-accept', { gameId: 'rps', userId: 'qa', proposalId: beforeQa.proposalId })
    clock.t += 10_100
    await scheduler.tick()

    // Ten sam tick najpierw wygasza propozycję (powrót do waiting wg reguły
    // since), a potem paruje ponownie — w 2-osobowej kolejce od razu powstaje
    // NOWA propozycja. Regułę „koniec kolejki" widać po `since`:
    const qa = (await QueueEntry.findById('rps_qa'))!
    const qb = (await QueueEntry.findById('rps_qb'))!
    expect(qa.proposalId).not.toBe(beforeQa.proposalId) // stara propozycja umarła
    expect(qa.accepted).toBe(false)                     // akcept nie przenosi się na nową
    expect(qa.since).toBe(sinceQa)  // akceptujący NIE traci miejsca (bez zmiany since)
    expect(qb.since).toBe(clock.t)  // nieakceptujący idzie na koniec kolejki (since = now)
  })

  it('walkower przez abandon: ranked w toku → finished/walkover + ELO (pełne K przegranego, pół K wygranego)', async () => {
    const created = await post('/create-match', {
      gameId: 'rps', players: ['wa', 'wb'], capacity: 2, ranked: true, options: { target: 5 },
    })
    const matchId = (created.body as any).matchId as string
    await readyBoth(matchId, ['wa', 'wb'])

    const res = await post('/abandon', { matchId, playerId: 'wb' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true, walkover: true })

    const match = await Match.findById(matchId)
    expect(match?.phase).toBe('finished')
    expect(match?.endReason).toBe('walkover')
    expect(match?.walkover).toEqual({ loserId: 'wb', winnerId: 'wa', reason: 'abandoned' })
    expect(match?.eloApplied).toBe(true)

    // Wygrany: K/2 (32/2=16 → +8); porzucający: pełne K (32 → −16).
    expect(await Rating.findById('rps_wa')).toMatchObject({ elo: 1208, matches: 1, k: 16 })
    expect(await Rating.findById('rps_wb')).toMatchObject({ elo: 1184, matches: 1, k: 32 })

    // Idempotencja także dla ścieżki walkoweru.
    await engine.applyEloIfDue(matchId)
    expect((await Rating.findById('rps_wa'))?.elo).toBe(1208)
  })

  it('abandon w meczu casual → noop: mecz gra dalej, zero ELO', async () => {
    const created = await post('/create-match', {
      gameId: 'rps', players: ['ca', 'cb'], capacity: 2, options: { target: 5 },
    })
    const matchId = (created.body as any).matchId as string
    await readyBoth(matchId, ['ca', 'cb'])

    const res = await post('/abandon', { matchId, playerId: 'cb' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true, noop: true })

    const match = await Match.findById(matchId)
    expect(match?.phase).toBe('planning') // mecz trwa (defaultMove pogra za cb)
    expect(match?.walkover).toBeNull()
    expect(await Rating.countDocuments({})).toBe(0)
  })

  it('defaultedStreak: 2 kolejne rundy bez ruchu w ranked → walkower disconnected + ELO', async () => {
    const created = await post('/create-match', {
      gameId: 'rps', players: ['da', 'db'], capacity: 2, ranked: true, options: { target: 5 },
    })
    const matchId = (created.body as any).matchId as string
    await readyBoth(matchId, ['da', 'db'])

    // Runda 1: tylko da gra; db defaultuje (seal bez jego ruchu).
    await post('/submit-move', { matchId, playerId: 'da', move: 'rock' })
    await engine.closePhase(matchId) // wymuszenie deadline'u (patrz rps-flow — okno HMAC)

    let match = await Match.findById(matchId)
    expect((match?.defaultedStreak as any).da).toBe(0) // własny ruch → reset/0
    expect((match?.defaultedStreak as any).db).toBe(1)
    expect(match?.phase).toBe('revealing') // streak=1 < 2 → mecz gra dalej

    await advanceReveal()
    expect((await Match.findById(matchId))?.phase).toBe('planning')

    // Runda 2: db znowu bez ruchu → streak 2 → walkower po zastosowaniu wyniku.
    await post('/submit-move', { matchId, playerId: 'da', move: 'rock' })
    await engine.closePhase(matchId)

    match = await Match.findById(matchId)
    expect(match?.phase).toBe('finished')
    expect(match?.endReason).toBe('walkover')
    expect(match?.walkover).toMatchObject({ loserId: 'db', winnerId: 'da', reason: 'disconnected' })
    expect((match?.defaultedStreak as any).db).toBe(2)
    expect(match?.eloApplied).toBe(true)

    expect(await Rating.findById('rps_da')).toMatchObject({ elo: 1208, matches: 1, k: 16 })
    expect(await Rating.findById('rps_db')).toMatchObject({ elo: 1184, matches: 1, k: 32 })
  })

  it('mecz ranked z gościem NIGDY nie dotyka ELO (podwójna gwarancja)', async () => {
    const created = await post('/create-match', {
      gameId: 'rps', players: ['gu'], guestIds: ['g_x'], capacity: 2, ranked: true, options: { target: 1 },
    })
    const matchId = (created.body as any).matchId as string
    await readyBoth(matchId, ['gu', 'g_x'])
    await post('/submit-move', { matchId, playerId: 'gu', move: 'paper' })
    await post('/submit-move', { matchId, playerId: 'g_x', move: 'rock' })
    await advanceReveal()

    const match = await Match.findById(matchId)
    expect(match?.phase).toBe('finished')
    expect(match?.eloApplied).toBe(false) // garda: guestIds.length > 0
    expect(await Rating.countDocuments({})).toBe(0)
  })

  it('mecz cancelled nie dotyka ELO', async () => {
    const created = await post('/create-match', {
      gameId: 'rps', players: ['xa', 'xb'], capacity: 2, ranked: true, options: { target: 1 },
    })
    const matchId = (created.body as any).matchId as string
    await readyBoth(matchId, ['xa', 'xb'])
    await post('/cancel-match', { matchId, reason: 'cancelled' })

    let match = await Match.findById(matchId)
    expect(match?.phase).toBe('cancelled')
    await engine.applyEloIfDue(matchId) // nawet jawny trigger nic nie liczy
    match = await Match.findById(matchId)
    expect(match?.eloApplied).toBe(false)
    expect(await Rating.countDocuments({})).toBe(0)
  })

  it('queue-leave w stanie proposed: partner wraca do waiting bez zmiany since i paruje się dalej', async () => {
    await post('/queue-join', { gameId: 'rps', userId: 'qa' })
    await post('/queue-join', { gameId: 'rps', userId: 'qb' })
    await scheduler.tick()
    const qbBefore = (await QueueEntry.findById('rps_qb'))!
    expect(qbBefore.status).toBe('proposed')

    await post('/queue-leave', { gameId: 'rps', userId: 'qa' })
    expect(await QueueEntry.findById('rps_qa')).toBeNull()
    const qb = (await QueueEntry.findById('rps_qb'))!
    expect(qb.status).toBe('waiting')
    expect(qb.since).toBe(qbBefore.since)

    // Nowy gracz dołącza → następny tick paruje qb (FIFO działa dalej).
    await post('/queue-join', { gameId: 'rps', userId: 'qc' })
    clock.t += 2_100 // dławik ticku matchmakera (~2 s)
    await scheduler.tick()
    expect((await QueueEntry.findById('rps_qb'))?.status).toBe('proposed')
    expect((await QueueEntry.findById('rps_qc'))?.status).toBe('proposed')
  })
})
