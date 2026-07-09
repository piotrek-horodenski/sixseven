import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Server } from 'http'
import { serve } from 'sixseven-sdk'
import { rps } from 'sixseven-game-rps'

import { Match, MatchEvent, ResolveLog } from '../../app/models'
import { MatchEngine } from '../../app/engine/engine'
import { Scheduler } from '../../app/engine/scheduler'
import { registerGame, createRegistrationResolver } from '../../app/services/register-game'
import { startToggleProxy, ToggleProxy } from '../helpers/toggle-proxy'
import { settings } from '../../app/settings'

/**
 * Hartowanie 2e — scenariusze awaryjne na PRAWDZIWYM RPS (SDK `serve`), spięte
 * po realnym HTTP + HMAC przez rejestrację. Awarię serwisu gry symuluje proxy z
 * przełącznikiem (`tests/helpers/toggle-proxy.ts`): RPS biega cały czas, a proxy
 * odcina/przywraca dostęp, więc logika gry pozostaje prawdziwa, a port stabilny.
 *
 * Pokrywa (plan 2e „Testy do CI / pomiar"):
 *  - serwis gry pada w trakcie rundy → po N nieudanych /resolve mecz → Paused →
 *    powrót health → resume → mecz się dograją;
 *  - Paused po przekroczeniu progu → Cancelled (endReason `cancelled_paused`);
 *  - rehydracja: świeży proces (nowy engine+scheduler) dograją zapieczętowaną
 *    rundę po powrocie serwisu (restart games w trakcie → mecz dograny).
 *
 * Wymaga replica setu (transakcje A2). RESOLVE_ALLOW_PRIVATE=true (proxy i RPS na
 * 127.0.0.1) — ustawione w vitest.integration.config.ts. Zegar wstrzykiwany:
 * backoffy/timeouty przesuwamy ręcznie i wołamy scheduler.tick().
 * Odpala Piotr: `npm run test:integration --workspace games`.
 */

const SECRET = 'rps-hardening-secret'

describe('Hartowanie 2e — awarie na prawdziwym RPS', () => {
  let rpsServer: Server
  let proxy: ToggleProxy
  let clock: { t: number }

  beforeEach(async () => {
    clock = { t: Date.now() }
    rpsServer = serve(rps, { secret: SECRET, port: 0 })
    await new Promise<void>((r) => rpsServer.once('listening', () => r()))
    const rpsPort = (rpsServer.address() as any).port
    proxy = await startToggleProxy(`http://127.0.0.1:${rpsPort}`)
    // Rejestracja wskazuje na PROXY (bazowy URL) — silnik dokleja /resolve.
    await registerGame({
      gameId: 'rps',
      version: rps.manifest.version,
      serviceUrl: proxy.url,
      hmacSecret: SECRET,
      manifest: rps.manifest as unknown as Record<string, unknown>,
    })
  })

  afterEach(async () => {
    await proxy.stop()
    await new Promise<void>((r) => rpsServer.close(() => r()))
  })

  function makeEngine() {
    return new MatchEngine({
      resolveEndpoint: createRegistrationResolver(),
      now: () => clock.t,
    })
  }

  async function startBestOf1(engine: MatchEngine) {
    const id = await engine.createMatch({
      gameId: 'rps',
      manifestVersion: rps.manifest.version,
      players: ['p1', 'p2'],
      options: { target: 1 },
      initialState: rps.init({ playerIds: ['p1', 'p2'], seed: 's', playerData: {}, options: { target: 1 } }),
    })
    await engine.start(id)
    return id
  }

  /** Doprowadza mecz do Paused: serwis odcięty w trakcie sealu + wszystkie retry. */
  async function driveToPaused(engine: MatchEngine, scheduler: Scheduler, id: string) {
    proxy.setMode('down503')
    await engine.submitMove(id, 'p1', 'paper')
    await engine.submitMove(id, 'p2', 'rock') // komplet → seal → /resolve (503) → fail #1

    let match = await Match.findById(id)
    expect(match?.phase).toBe('resolving')
    expect(match?.failCount).toBe(1)

    // Kolejne próby przez scheduler (backoff), aż retryMax → Paused.
    for (let i = 0; i < settings.resolveRetryMax; i++) {
      clock.t += (settings.resolveBackoffMs[0] ?? 2000) + settings.resolveBudgetMs + 50
      await scheduler.tick()
      match = await Match.findById(id)
      if (match?.phase === 'paused') break
    }

    match = await Match.findById(id)
    expect(match?.phase).toBe('paused')
    // Każda próba zalogowana (A4/I5), żadna nie „użyta".
    const logs = await ResolveLog.find({ matchId: id, round: 1 })
    expect(logs.length).toBe(settings.resolveRetryMax)
    expect(logs.every((l: any) => l.used === false && l.outcome !== 'ok')).toBe(true)
    return id
  }

  it('serwis pada w trakcie → Paused → powrót health → resume → mecz dograny', async () => {
    const engine = makeEngine()
    const scheduler = new Scheduler(engine, () => clock.t)
    const id = await startBestOf1(engine)

    await driveToPaused(engine, scheduler, id)

    // Health wraca: proxy przepuszcza do prawdziwego RPS.
    proxy.setMode('up')
    await engine.resume(id) // ponowny /resolve zapieczętowanymi ruchami → sukces

    let match = await Match.findById(id)
    expect(match?.phase).toBe('revealing')
    expect(match?.pendingFinish).toBe(true)
    expect((match?.score as any).p1).toBe(1) // paper bije rock — punkt policzony przez PRAWDZIWY RPS

    // Timeout revealu → Finished.
    clock.t += 1500 + settings.revealMarginMs + 50
    await scheduler.tick()
    match = await Match.findById(id)
    expect(match?.phase).toBe('finished')
    expect(match?.endReason).toBe('finished')

    // Runda dograją zapieczętowanymi ruchami: jedna próba „ok/used", reszta błędy.
    const used = await ResolveLog.find({ matchId: id, round: 1, used: true })
    expect(used).toHaveLength(1)
    expect(used[0].outcome).toBe('ok')

    const ev = await MatchEvent.findOne({ matchId: id, round: 1 })
    expect((ev!.events as any[])[0].winner).toBe('p1')
    expect(ev!.cancelled).toBe(false)
  })

  it('Paused po przekroczeniu progu → Cancelled (cancelled_paused), historia oznaczona', async () => {
    const engine = makeEngine()
    const scheduler = new Scheduler(engine, () => clock.t)
    const id = await startBestOf1(engine)

    await driveToPaused(engine, scheduler, id)

    // Serwis nie wraca. Po minięciu deadline pauzy scheduler anuluje mecz.
    clock.t += settings.pausedTimeoutMs + 50
    await scheduler.tick()

    const match = await Match.findById(id)
    expect(match?.phase).toBe('cancelled')
    expect(match?.endReason).toBe('cancelled_paused')
    expect(match?.deadline).toBeNull()

    // Runda nigdy nie została rozstrzygnięta — brak wpisu w historii.
    expect(await MatchEvent.countDocuments({ matchId: id, round: 1 })).toBe(0)
  })

  it('rehydracja: świeży proces dograją zapieczętowaną rundę po powrocie serwisu', async () => {
    const engine = makeEngine()
    const scheduler = new Scheduler(engine, () => clock.t)
    const id = await startBestOf1(engine)

    // Awaria dokładnie na /resolve: seal zapisany, pierwsza próba pada — mecz
    // zostaje w `resolving` z zapieczętowaną rundą (jak po restarcie w trakcie).
    proxy.setMode('down503')
    await engine.submitMove(id, 'p1', 'paper')
    await engine.submitMove(id, 'p2', 'rock')

    let match = await Match.findById(id)
    expect(match?.phase).toBe('resolving')

    // „Restart games": zupełnie nowy engine + scheduler (bez stanu w pamięci).
    proxy.setMode('up')
    const engine2 = makeEngine()
    const scheduler2 = new Scheduler(engine2, () => clock.t)

    // Watchdog fazy resolving mija → nowy scheduler ponawia resolveOnce (rehydracja).
    for (let i = 0; i < 5; i++) {
      clock.t += settings.resolveBudgetMs + settings.revealMarginMs + 50
      await scheduler2.tick()
      match = await Match.findById(id)
      if (match?.phase === 'revealing' || match?.phase === 'finished') break
    }
    expect(match?.phase).toBe('revealing')

    clock.t += 1500 + settings.revealMarginMs + 50
    await scheduler2.tick()
    match = await Match.findById(id)
    expect(match?.phase).toBe('finished')

    const ev = await MatchEvent.findOne({ matchId: id, round: 1 })
    expect((ev!.events as any[])[0].winner).toBe('p1') // te same zapieczętowane ruchy
  })
})
