import { GameDefinition, ResolveRequest, ResolveResponse, PlayerMove } from './contract'
import { resolvePipeline } from './serve'

/**
 * Harness kontrakt-testów (`sixseven-sdk test`). Sprawdza, czy `GameDefinition`
 * spełnia wymagania, na których opiera się fair-play platformy — przede
 * wszystkim DETERMINIZM (replay-audit) i zgodność ze schematem odpowiedzi.
 *
 * Uruchamiany in-process na definicji gry (nie po HTTP), więc łapie błędy zanim
 * gra w ogóle wystartuje. Determinizm testujemy też po round-tripie przez JSON,
 * bo platforma przekazuje stan jako JSON — `resolve(state)` musi dać ten sam
 * wynik co `resolve(JSON.parse(JSON.stringify(state)))`.
 */

export interface HarnessScenario {
  playerIds: string[]
  seed: string
  options: Record<string, unknown>
  /** Ruchy tej jednej rundy: playerId → ruch. Brakujący gracz = spóźniony. */
  moves: Record<string, unknown>
}

export interface HarnessResult {
  name: string
  passed: boolean
  detail?: string
}

const DEFAULT_SCENARIO: HarnessScenario = {
  playerIds: ['p1', 'p2'],
  seed: 'harness-seed',
  options: {},
  moves: {},
}

/** Stabilna serializacja do porównań determinizmu (sortuje klucze). */
function stable(x: unknown): string {
  return JSON.stringify(x, (_k, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.keys(v as Record<string, unknown>)
        .sort()
        .reduce((acc, k) => {
          acc[k] = (v as Record<string, unknown>)[k]
          return acc
        }, {} as Record<string, unknown>)
    }
    return v
  })
}

function isValidResponse(x: ResolveResponse): { ok: boolean; detail?: string } {
  if (!Array.isArray(x.events)) return { ok: false, detail: 'events nie jest tablicą' }
  if (!Array.isArray(x.views)) return { ok: false, detail: 'views nie jest tablicą' }
  if (typeof x.finished !== 'boolean') return { ok: false, detail: 'finished nie jest boolean' }
  if (typeof x.revealDurationMs !== 'number' || x.revealDurationMs < 0 || !Number.isFinite(x.revealDurationMs)) {
    return { ok: false, detail: 'revealDurationMs musi być liczbą ≥ 0' }
  }
  if (typeof x.points !== 'object' || x.points === null || Array.isArray(x.points)) {
    return { ok: false, detail: 'points musi być obiektem' }
  }
  for (const v of x.views) {
    if (typeof v.playerId !== 'string') return { ok: false, detail: 'view bez playerId' }
  }
  return { ok: true }
}

function buildRequest(def: GameDefinition, s: HarnessScenario, state: unknown): ResolveRequest {
  const moves: PlayerMove[] = s.playerIds
    .filter((p) => p in s.moves)
    .map((p) => ({ playerId: p, move: s.moves[p] }))
  const latePlayers = s.playerIds.filter((p) => !(p in s.moves))
  return {
    matchId: 'harness',
    round: 1,
    idempotencyKey: 'harness:1',
    manifestVersion: def.manifest.version,
    state,
    moves,
    latePlayers,
  }
}

export function runContractTests(
  def: GameDefinition,
  scenario: Partial<HarnessScenario> = {},
): HarnessResult[] {
  const s: HarnessScenario = { ...DEFAULT_SCENARIO, ...scenario }
  const results: HarnessResult[] = []
  const check = (name: string, fn: () => string | null) => {
    try {
      const detail = fn()
      results.push({ name, passed: detail === null, detail: detail ?? undefined })
    } catch (e) {
      results.push({ name, passed: false, detail: `wyjątek: ${(e as Error).message}` })
    }
  }

  // Manifest: planningPhaseMs ≥ 2000 (walidacja rejestracji, ale łapmy wcześnie).
  check('manifest.planningPhaseMs ≥ 2000', () =>
    def.manifest.planningPhaseMs >= 2000 ? null : `jest ${def.manifest.planningPhaseMs}`,
  )

  // init deterministyczny.
  check('init jest deterministyczny', () => {
    const a = def.init({ playerIds: s.playerIds, seed: s.seed, playerData: {}, options: s.options })
    const b = def.init({ playerIds: s.playerIds, seed: s.seed, playerData: {}, options: s.options })
    return stable(a) === stable(b) ? null : 'dwa init dały różny stan'
  })

  const state = def.init({ playerIds: s.playerIds, seed: s.seed, playerData: {}, options: s.options })

  // defaultMove deterministyczny.
  check('defaultMove jest deterministyczny', () => {
    for (const p of s.playerIds) {
      if (stable(def.defaultMove(state, p)) !== stable(def.defaultMove(state, p))) {
        return `defaultMove dla ${p} niedeterministyczny`
      }
    }
    return null
  })

  // resolve deterministyczny (dwa przebiegi tego samego żądania).
  check('resolve jest deterministyczny', () => {
    const req = buildRequest(def, s, state)
    const a = resolvePipeline(def, req)
    const b = resolvePipeline(def, req)
    return stable(a) === stable(b) ? null : 'dwa resolve dały różny wynik'
  })

  // resolve deterministyczny po round-tripie przez JSON (jak przez drut).
  check('resolve deterministyczny po JSON round-trip', () => {
    const req = buildRequest(def, s, state)
    const reqJson = buildRequest(def, s, JSON.parse(JSON.stringify(state)))
    const a = resolvePipeline(def, req)
    const b = resolvePipeline(def, reqJson)
    return stable(a) === stable(b) ? null : 'wynik zależy od reprezentacji stanu (JSON)'
  })

  // Schemat odpowiedzi.
  check('odpowiedź resolve pasuje do schematu', () => {
    const resp = resolvePipeline(def, buildRequest(def, s, state))
    const v = isValidResponse(resp)
    return v.ok ? null : (v.detail ?? 'niezgodny schemat')
  })

  return results
}

/** true, gdy wszystkie testy przeszły. */
export function allPassed(results: HarnessResult[]): boolean {
  return results.every((r) => r.passed)
}
