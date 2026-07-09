import { GameDefinition, ResolvedMove } from '../../src/contract'

/**
 * Fixtury gier do testów SDK: jedna poprawna (deterministyczny RPS) i dwie
 * celowo zepsute, na których harness ma zaświecić na czerwono.
 */

type Rps = 'rock' | 'paper' | 'scissors'
interface RpsState {
  round: number
  scores: Record<string, number>
}

function beats(a: Rps, b: Rps): boolean {
  return (
    (a === 'rock' && b === 'scissors') ||
    (a === 'scissors' && b === 'paper') ||
    (a === 'paper' && b === 'rock')
  )
}

function resolveRps(state: unknown, moves: ResolvedMove[]) {
  const s = state as RpsState
  const scores = { ...s.scores }
  const [a, b] = moves
  let winner: string | null = null
  if (a && b) {
    if (beats(a.move as Rps, b.move as Rps)) winner = a.playerId
    else if (beats(b.move as Rps, a.move as Rps)) winner = b.playerId
  }
  const points: Record<string, number> = {}
  if (winner) {
    points[winner] = 1
    scores[winner] = (scores[winner] ?? 0) + 1
  }
  const finished = Object.values(scores).some((v) => v >= 2)
  return {
    state: { round: s.round + 1, scores } as RpsState,
    events: [{ picks: moves.map((m) => ({ playerId: m.playerId, move: m.move, defaulted: m.defaulted })) }],
    points,
    views: moves.map((m) => ({ playerId: m.playerId, view: { scores, yourMove: m.move } })),
    finished,
    revealDurationMs: 1000,
  }
}

/** Poprawny, deterministyczny RPS (best of 3). */
export const rps: GameDefinition<RpsState, Rps> = {
  manifest: { id: 'rps', name: 'Rock Paper Scissors', version: '1.0.0', planningPhaseMs: 3000 },
  init: ({ playerIds }) => ({ round: 1, scores: Object.fromEntries(playerIds.map((p) => [p, 0])) }),
  validateMove: (m): m is Rps => m === 'rock' || m === 'paper' || m === 'scissors',
  defaultMove: () => 'rock',
  resolve: resolveRps,
}

/** Zepsuty: niedeterministyczny revealDurationMs — harness ma to złapać. */
export const badDeterminism: GameDefinition<RpsState, Rps> = {
  ...rps,
  resolve: (state, moves) => ({
    ...resolveRps(state, moves),
    revealDurationMs: Math.floor(Math.random() * 1000) + 1,
  }),
}

/** Zepsuty: odpowiedź poza schematem (ujemny revealDurationMs). */
export const badSchema: GameDefinition<RpsState, Rps> = {
  ...rps,
  resolve: (state, moves) => ({
    ...resolveRps(state, moves),
    revealDurationMs: -1,
  }),
}
