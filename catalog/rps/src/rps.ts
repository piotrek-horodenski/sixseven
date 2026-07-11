import { GameDefinition, ResolvedMove, PlayerView } from 'sixseven-sdk'

/**
 * Papier-kamień-nożyce — pierwsza gra first-party sixseven (dogfooding wire
 * contract). Deterministyczna: ten sam stan + ruchy zawsze dają ten sam wynik
 * (wymóg replay-auditu). Best-of-N: pierwszy do `target` zwycięstw wygrywa mecz.
 */

export type RpsMove = 'rock' | 'paper' | 'scissors'

export interface RpsState {
  round: number
  target: number
  scores: Record<string, number>
}

const BEATS: Record<RpsMove, RpsMove> = {
  rock: 'scissors',
  scissors: 'paper',
  paper: 'rock',
}

function beats(a: RpsMove, b: RpsMove): boolean {
  return BEATS[a] === b
}

export const rps: GameDefinition<RpsState, RpsMove> = {
  manifest: {
    id: 'rps',
    name: 'Papier-kamień-nożyce',
    version: '1.0.0',
    // Czas fazy planowania ustawia TWÓRCA gry w manifeście. Platforma przenosi
    // to do opcji meczu (via /init), a silnik używa przy otwieraniu każdej rundy.
    planningPhaseMs: 15000,
    badges: [
      { id: 'flawless', sentiment: 'positive' },
      { id: 'mind-reader', sentiment: 'positive' },
    ],
  },

  init: ({ playerIds, options }) => ({
    round: 1,
    target: Math.max(1, Number((options as { target?: unknown })?.target) || 2),
    scores: Object.fromEntries(playerIds.map((p) => [p, 0])),
  }),

  validateMove: (m): m is RpsMove => m === 'rock' || m === 'paper' || m === 'scissors',

  // Deterministyczny: brak ruchu = kamień.
  defaultMove: () => 'rock',

  resolve: (state, moves: ResolvedMove<RpsMove>[]) => {
    const scores = { ...state.scores }
    const [a, b] = moves

    let winner: string | null = null
    if (a && b) {
      if (beats(a.move, b.move)) winner = a.playerId
      else if (beats(b.move, a.move)) winner = b.playerId
    }

    const points: Record<string, number> = {}
    if (winner) {
      points[winner] = 1
      scores[winner] = (scores[winner] ?? 0) + 1
    }

    const finished = Object.values(scores).some((v) => v >= state.target)

    // Reveal: po rundzie obaj gracze widzą oba ruchy (jawne po zamknięciu fazy).
    const revealed = moves.map((m) => ({ playerId: m.playerId, move: m.move, defaulted: m.defaulted }))
    const views: PlayerView[] = moves.map((m) => ({
      playerId: m.playerId,
      view: {
        scores,
        target: state.target,
        yourMove: m.move,
        moves: revealed,
        roundWinner: winner,
      },
    }))

    return {
      state: { round: state.round + 1, target: state.target, scores },
      events: [{ type: 'round', picks: revealed, winner }],
      points,
      views,
      finished,
      revealDurationMs: 1500,
    }
  },
}

export default rps
