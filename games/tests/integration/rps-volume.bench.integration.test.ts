import { describe, it, expect } from 'vitest'
import { Server } from 'http'
import { performance } from 'perf_hooks'
import { serve } from 'sixseven-sdk'
import { rps } from 'sixseven-game-rps'

import { Match } from '../../app/models'
import { MatchEngine } from '../../app/engine/engine'
import { Scheduler } from '../../app/engine/scheduler'
import { callResolve } from '../../app/engine/resolve-client'
import { registerGame, createRegistrationResolver } from '../../app/services/register-game'
import { settings } from '../../app/settings'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * BENCHMARK WOLUMENU 2e — bramka przed Etapem 3.
 *
 * ~200 równoległych meczów RPS na PRAWDZIWYM serwisie gry (SDK `serve`) przez
 * realne HTTP + HMAC. Mierzy: łączny czas fazy rozgrywki, przepustowość
 * (mecze/s) i percentyle czasu /resolve (p50/p90/p99/max) — czy silnik nie łapie
 * zadyszki na wolumenie (CPU dopasowywania streamów, transakcje A2).
 *
 * Każdy mecz to best-of-1 = jeden /resolve (jednostka pomiaru przepustowości).
 * Zegar jest REALNY (Date.now) — podpisy HMAC mieszczą się w oknie serwisu;
 * reveal (1500 ms) domykamy DOPIERO po pomiarze, w osobnej fazie (revealDone nie
 * podpisuje niczego), żeby nie zaburzać wyniku ani okna podpisu.
 *
 * NIE odpala się w zwykłej suicie (guard `BENCH=1`); to celowo ciężki pomiar,
 * uruchamiany ręcznie przez Piotra na maszynie dev z replica setem.
 *
 * JAK URUCHOMIĆ (z katalogu `games`, wymaga mongo replica setu jak reszta
 * integracyjnych — patrz vitest.integration.config.ts / ETAP2.md „Jak uruchomić
 * testy"):
 *
 *   BENCH=1 npx vitest run --config vitest.integration.config.ts \
 *     tests/integration/rps-volume.bench.integration.test.ts
 *
 * Parametry (env, opcjonalne):
 *   BENCH_MATCHES      liczba meczów            (domyślnie 200)
 *   BENCH_CONCURRENCY  meczów naraz „w locie"   (domyślnie 50)
 *   BENCH_GATE_P99_MS  bramka p99 /resolve [ms] (domyślnie = RESOLVE_BUDGET_MS)
 *
 * Bramka (soft, konfigurowalna): wszystkie mecze się dograją, wszystkie /resolve
 * = `ok`, a p99 czasu /resolve poniżej progu. Progi to konfiguracja — kalibracja
 * z danych w Etapie 5 (UNKNOWNS.md).
 * ─────────────────────────────────────────────────────────────────────────────
 */

const SECRET = 'rps-bench-secret'
const N = Number(process.env.BENCH_MATCHES ?? 200)
const CONCURRENCY = Number(process.env.BENCH_CONCURRENCY ?? 50)
const GATE_P99_MS = Number(process.env.BENCH_GATE_P99_MS ?? settings.resolveBudgetMs)

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[Math.max(0, idx)]
}

/** Uruchamia `worker` dla każdego indeksu z ograniczeniem współbieżności. */
async function runPool<T>(count: number, concurrency: number, worker: (i: number) => Promise<T>): Promise<T[]> {
  const results: T[] = new Array(count)
  let next = 0
  async function lane() {
    while (true) {
      const i = next++
      if (i >= count) return
      results[i] = await worker(i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, count) }, () => lane()))
  return results
}

// Guard: bez BENCH=1 cały blok jest pomijany (także podczas zwykłego test:integration).
describe.runIf(process.env.BENCH === '1')('Benchmark wolumenu RPS (2e)', () => {
  it(`dograją ~${N} równoległych meczów RPS bez zadyszki (p99 /resolve < próg)`, async () => {
    const server: Server = serve(rps, { secret: SECRET, port: 0 })
    await new Promise<void>((r) => server.once('listening', () => r()))
    const port = (server.address() as any).port
    await registerGame({
      gameId: 'rps',
      version: rps.manifest.version,
      serviceUrl: `http://127.0.0.1:${port}`,
      hmacSecret: SECRET,
      manifest: rps.manifest as unknown as Record<string, unknown>,
    })

    // Telemetria /resolve: opakowujemy realny klient, mierząc czas HTTP+HMAC per próba.
    const resolveMs: number[] = []
    const outcomes: Record<string, number> = {}
    const timingCall: typeof callResolve = async (endpoint, request, options) => {
      const t0 = performance.now()
      const res = await callResolve(endpoint, request, options)
      resolveMs.push(performance.now() - t0)
      outcomes[res.outcome] = (outcomes[res.outcome] ?? 0) + 1
      return res
    }

    const engine = new MatchEngine({
      resolveEndpoint: createRegistrationResolver(),
      call: timingCall,
    })
    // batchSize duży: jeden tick domyka wszystkie mecze w revealing naraz.
    const scheduler = new Scheduler(engine, () => Date.now(), 0, Math.max(1000, N * 2))

    // Deterministyczne, wygrywające ruchy: paper bije rock → p1 wygrywa best-of-1.
    async function play(i: number): Promise<string> {
      const players = [`a${i}`, `b${i}`]
      const id = await engine.createMatch({
        gameId: 'rps',
        manifestVersion: rps.manifest.version,
        players,
        options: { target: 1 },
        initialState: rps.init({ playerIds: players, seed: `s${i}`, playerData: {}, options: { target: 1 } }),
      })
      await engine.start(id)
      await engine.submitMove(id, players[0], 'paper')
      await engine.submitMove(id, players[1], 'rock') // komplet → seal → /resolve → revealing
      return id
    }

    // ── Faza mierzona: wszystkie /resolve pod obciążeniem ──────────────────────
    const wall0 = performance.now()
    await runPool(N, CONCURRENCY, play)
    const wallMs = performance.now() - wall0

    // ── Faza domknięcia (po pomiarze): odczekaj reveal i dobij mecze ───────────
    await delay(1500 + settings.revealMarginMs + 300)
    for (let i = 0; i < 20; i++) {
      await scheduler.tick()
      const pending = await Match.countDocuments({ phase: { $nin: ['finished', 'cancelled'] } })
      if (pending === 0) break
      await delay(100)
    }

    const sorted = [...resolveMs].sort((a, b) => a - b)
    const finished = await Match.countDocuments({ phase: 'finished' })
    const summary = {
      matches: N,
      concurrency: CONCURRENCY,
      finished,
      resolves: resolveMs.length,
      outcomes,
      measuredWallMs: Math.round(wallMs),
      throughputMatchesPerSec: Number((N / (wallMs / 1000)).toFixed(1)),
      resolveMs: {
        p50: Math.round(pct(sorted, 50)),
        p90: Math.round(pct(sorted, 90)),
        p99: Math.round(pct(sorted, 99)),
        max: Math.round(sorted[sorted.length - 1] ?? 0),
      },
      gateP99Ms: GATE_P99_MS,
    }
    // eslint-disable-next-line no-console
    console.log('\n[BENCHMARK RPS 2e]\n' + JSON.stringify(summary, null, 2) + '\n')

    await new Promise<void>((r) => server.close(() => r()))

    // Bramka: wszystko dograne, wszystkie /resolve ok, p99 poniżej progu.
    expect(resolveMs.length).toBe(N)
    expect(outcomes.ok ?? 0).toBe(N)
    expect(finished).toBe(N)
    expect(summary.resolveMs.p99).toBeLessThan(GATE_P99_MS)
  }, 300_000)
})
