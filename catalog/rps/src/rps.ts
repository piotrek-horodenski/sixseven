import { GameDefinition, GameManifest, ResolvedMove, PlayerView } from 'sixseven-sdk'

/**
 * Papier-kamień-nożyce — pierwsza gra first-party sixseven (dogfooding wire
 * contract). Deterministyczna: ten sam stan + ruchy zawsze dają ten sam wynik
 * (wymóg replay-auditu). N graczy (2..N): punktacja rundy jest PAROWA — dla
 * każdej nieuporządkowanej pary graczy TYLKO zwycięzca dostaje +1 (przegrany 0,
 * remis 0); punkt rundy gracza = liczba wygranych par w tej rundzie. Wynik meczu
 * to skumulowane punkty rund (nieujemne, monotonicznie rosnące). Mecz kończy się,
 * gdy KTOKOLWIEK osiągnie `target` skumulowanych punktów (domyślnie 5).
 */

export type RpsMove = 'rock' | 'paper' | 'scissors'

/** Preferencja gracza: ruch awaryjny składany, gdy upłynie faza planowania. */
export type FallbackPref = RpsMove | 'random'

const MOVES: RpsMove[] = ['rock', 'paper', 'scissors']
const FALLBACK_VALUES: FallbackPref[] = ['rock', 'paper', 'scissors', 'random']

function isFallbackPref(v: unknown): v is FallbackPref {
  return typeof v === 'string' && (FALLBACK_VALUES as string[]).includes(v)
}

export interface RpsState {
  round: number
  target: number
  scores: Record<string, number>
  /** Seed meczu — paliwo dla deterministycznego fallbacku `random`. */
  seed: string
  /** Preferencja fallbacku per gracz (z playerData[pid].prefs.fallbackMove). */
  fallback: Record<string, FallbackPref>
}

/**
 * Schemat pola preferencji gracza — kształt uzgodniony z falą 2B (ekran
 * preferencji): `manifest.playerPrefs: PlayerPrefField[]`.
 */
export interface PlayerPrefField {
  key: string
  type: 'enum'
  values: string[]
  default: string
  label?: string
}

interface RpsManifest extends GameManifest {
  playerPrefs: PlayerPrefField[]
}

const BEATS: Record<RpsMove, RpsMove> = {
  rock: 'scissors',
  scissors: 'paper',
  paper: 'rock',
}

function beats(a: RpsMove, b: RpsMove): boolean {
  return BEATS[a] === b
}

/**
 * Deterministyczny hash string→liczba (FNV-1a, arytmetyka 32-bit przez
 * Math.imul — stabilna między platformami/silnikami JS). Używany do
 * wyliczenia ruchu `random` z `seed + playerId + round`, bez Math.random.
 */
function hashMove(seed: string, playerId: string, round: number): RpsMove {
  const input = `${seed}:${playerId}:${round}`
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const idx = Math.abs(h) % MOVES.length
  return MOVES[idx]
}

const manifest: RpsManifest = {
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
  // Preferencje gracza per gra (fala 2B: ekran preferencji je odczyta/zapisze
  // przez player_memory.prefs, klucz = `key` poniżej). Default dewelopera =
  // 'random', gdy gracz nic nie ustawił.
  playerPrefs: [
    {
      key: 'fallbackMove',
      type: 'enum',
      values: ['rock', 'paper', 'scissors', 'random'],
      default: 'random',
      label: 'Ruch awaryjny (gdy nie zdążysz zagrać)',
    },
  ],
}

export const rps: GameDefinition<RpsState, RpsMove> = {
  manifest,

  init: ({ playerIds, seed, playerData, options }) => ({
    round: 1,
    target: Math.max(1, Number((options as { target?: unknown })?.target) || 5),
    scores: Object.fromEntries(playerIds.map((p) => [p, 0])),
    seed,
    fallback: Object.fromEntries(
      playerIds.map((p) => {
        const pref = playerData?.[p]?.prefs?.fallbackMove
        return [p, isFallbackPref(pref) ? pref : 'random']
      }),
    ),
  }),

  validateMove: (m): m is RpsMove => m === 'rock' || m === 'paper' || m === 'scissors',

  // Spóźniony/nielegalny ruch: preferencja gracza (fallback), 'random' liczony
  // deterministycznie z seed+playerId+round (wymóg replay-auditu/harness).
  defaultMove: (state, playerId) => {
    const pref = state.fallback[playerId] ?? 'random'
    return pref === 'random' ? hashMove(state.seed, playerId, state.round) : pref
  },

  resolve: (state, moves: ResolvedMove<RpsMove>[]) => {
    const scores = { ...state.scores }

    // Punktacja parowa: dla każdej nieuporządkowanej pary graczy TYLKO zwycięzca
    // dostaje +1 (przegrany 0, remis 0). Punkt rundy gracza = liczba wygranych par.
    const roundPoints: Record<string, number> = Object.fromEntries(moves.map((m) => [m.playerId, 0]))
    for (let i = 0; i < moves.length; i++) {
      for (let j = i + 1; j < moves.length; j++) {
        const a = moves[i]
        const b = moves[j]
        if (beats(a.move, b.move)) {
          roundPoints[a.playerId] += 1
        } else if (beats(b.move, a.move)) {
          roundPoints[b.playerId] += 1
        }
      }
    }

    // Kumulacja — mecz to suma punktów rund; punkty są nieujemne (winner-only),
    // więc scores rosną monotonicznie i mecz zawsze zmierza do `target`.
    for (const m of moves) {
      scores[m.playerId] = (scores[m.playerId] ?? 0) + roundPoints[m.playerId]
    }

    const finished = Object.values(scores).some((v) => v >= state.target)

    // Zwycięzca rundy: gracz z UNIKALNIE najwyższym roundPoints. Remis na
    // szczycie (w tym pełny remis wszystkich na 0) → brak zwycięzcy (null).
    let roundWinner: string | null = null
    let maxPoints = -Infinity
    let maxCount = 0
    for (const m of moves) {
      const p = roundPoints[m.playerId]
      if (p > maxPoints) {
        maxPoints = p
        maxCount = 1
        roundWinner = m.playerId
      } else if (p === maxPoints) {
        maxCount += 1
      }
    }
    if (maxCount > 1) roundWinner = null

    // Reveal: po rundzie wszyscy gracze widzą wszystkie ruchy (jawne po zamknięciu fazy).
    const revealed = moves.map((m) => ({ playerId: m.playerId, move: m.move, defaulted: m.defaulted }))
    const views: PlayerView[] = moves.map((m) => ({
      playerId: m.playerId,
      view: {
        scores,
        target: state.target,
        yourMove: m.move,
        moves: revealed,
        roundPoints,
        roundWinner,
      },
    }))

    return {
      state: {
        round: state.round + 1,
        target: state.target,
        scores,
        seed: state.seed,
        fallback: state.fallback,
      },
      // Historia rundy: punkty parowe per gracz + zwycięzca rundy (unikalny lider
      // roundPoints; null przy remisie na szczycie). `winner` zachowany dla
      // historii/replay i zgodności (dla 2 graczy == dawny winner).
      events: [{ type: 'round', picks: revealed, points: roundPoints, winner: roundWinner }],
      points: roundPoints,
      views,
      finished,
      revealDurationMs: 1500,
    }
  },
}

export default rps
