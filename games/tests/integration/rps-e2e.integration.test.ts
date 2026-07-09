import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Server } from 'http'
import { serve } from 'sixseven-sdk'
import { rps } from 'sixseven-game-rps'

import { Match, MatchView, MatchEvent, ResolveLog } from '../../app/models'
import { MatchEngine } from '../../app/engine/engine'
import { Scheduler } from '../../app/engine/scheduler'
import { callInit } from '../../app/engine/init-client'
import { registerGame, createRegistrationResolver } from '../../app/services/register-game'

/**
 * E2E: silnik platformy (2a) ↔ prawdziwy serwis RPS na SDK (2b) przez REALNE
 * HTTP + HMAC, z endpointem z rejestracji (2c). Spina cały stos: submit-move →
 * seal → podpisane /resolve po sieci → RPS liczy → transakcyjny zapis → wynik.
 *
 * Wymaga replica setu (jak reszta integracyjnych games). RPS biega na 127.0.0.1,
 * więc RESOLVE_ALLOW_PRIVATE=true (config integracyjny).
 */

const SECRET = 'e2e-rps-secret'

describe('E2E: silnik ↔ prawdziwy RPS', () => {
  let server: Server
  let port: number
  let clock: { t: number }

  beforeEach(async () => {
    clock = { t: Date.now() }
    server = serve(rps, { secret: SECRET, port: 0 })
    await new Promise<void>((r) => server.once('listening', () => r()))
    port = (server.address() as any).port
    await registerGame({
      gameId: 'rps',
      version: rps.manifest.version,
      serviceUrl: `http://127.0.0.1:${port}`, // bazowy URL (klient dokleja /resolve, /init)
      hmacSecret: SECRET,
      manifest: rps.manifest as unknown as Record<string, unknown>,
    })
  })

  afterEach(async () => {
    await new Promise<void>((r) => server.close(() => r()))
  })

  function makeEngine() {
    return new MatchEngine({
      resolveEndpoint: createRegistrationResolver(),
      now: () => clock.t,
    })
  }

  it('rozgrywa pełny mecz best-of-1 do zakończenia (przez sieć + HMAC)', async () => {
    const engine = makeEngine()
    const id = await engine.createMatch({
      gameId: 'rps',
      manifestVersion: rps.manifest.version,
      players: ['p1', 'p2'],
      options: { target: 1 },
      initialState: rps.init({ playerIds: ['p1', 'p2'], seed: 's', playerData: {}, options: { target: 1 } }),
    })
    await engine.start(id)

    // I2 / brak wywołania w planowaniu: dopóki nie ma kompletu ruchów,
    // serwis RPS nie jest wołany (brak wpisów w resolve_log).
    await engine.submitMove(id, 'p1', 'paper')
    expect(await ResolveLog.countDocuments({ matchId: id })).toBe(0)

    await engine.submitMove(id, 'p2', 'rock') // komplet → seal → /resolve po HTTP

    // RPS zwraca revealDurationMs=1500 także w rundzie kończącej → najpierw
    // Revealing (z pendingFinish), wynik zapisany, dopiero timeout revealu kończy.
    let match = await Match.findById(id)
    expect(match?.phase).toBe('revealing')
    expect(match?.pendingFinish).toBe(true)
    expect((match?.score as any).p1).toBe(1)       // paper bije rock — punkt już policzony

    // Widoki per gracz zapisane w transakcji (row-level: każdy ma swój).
    const p1 = await MatchView.find({ matchId: id, playerId: 'p1' })
    const p2 = await MatchView.find({ matchId: id, playerId: 'p2' })
    expect(p1).toHaveLength(1)
    expect(p2).toHaveLength(1)
    expect((p1[0].view as any).yourMove).toBe('paper')

    // Timeout revealu przez scheduler → Finished.
    const scheduler = new Scheduler(engine, () => clock.t)
    clock.t += 1500 + 5000
    await scheduler.tick()
    match = await Match.findById(id)
    expect(match?.phase).toBe('finished')
    expect(match?.endReason).toBe('finished')

    // Log rundy: jedna udana próba, ruchy w żądaniu (opuściły platformę po sealu).
    const logs = await ResolveLog.find({ matchId: id, round: 1 })
    expect(logs).toHaveLength(1)
    expect(logs[0].outcome).toBe('ok')
    expect(logs[0].used).toBe(true)
    const sentMoves = (logs[0].request as any).moves.map((m: any) => m.playerId).sort()
    expect(sentMoves).toEqual(['p1', 'p2'])

    // Historia rundy.
    const ev = await MatchEvent.findOne({ matchId: id, round: 1 })
    expect(ev).not.toBeNull()
    expect((ev!.events as any[])[0].winner).toBe('p1')
  })

  it('callInit zwraca stan początkowy z RPS przez HTTP (/init + HMAC)', async () => {
    const endpoint = { url: `http://127.0.0.1:${port}`, secret: SECRET }
    const res = await callInit(endpoint, {
      matchId: 'm-init',
      manifestVersion: rps.manifest.version,
      playerIds: ['p1', 'p2'],
      seed: 'seed',
      playerData: {},
      options: { target: 3 },
    }, { now: clock.t })
    expect(res.ok).toBe(true)
    const state = res.state as { round: number; target: number; scores: Record<string, number> }
    expect(state.round).toBe(1)
    expect(state.target).toBe(3)
    expect(state.scores).toEqual({ p1: 0, p2: 0 })
  })

  it('nieznana gra → resolver rzuca (rejestracja wymagana)', async () => {
    const resolve = createRegistrationResolver()
    await expect(resolve('nieistnieje')).rejects.toThrow(/not registered/)
  })
})
