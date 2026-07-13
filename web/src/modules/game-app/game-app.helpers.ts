import type { MatchPhase } from '@/stores/games/games.model'

/**
 * Czyste helpery aplikacji gry (fixy z backlogu, kontrakt §4 „Fixy").
 * Zero zależności od Vue/socketów — testowalne w izolacji.
 */

/** Wariant wyjścia z gry — decyduje o treści modala i komendzie. */
export type ExitVariant =
  | 'lobby-host' // host w lobby → rooms:close (gra znika wszystkim)
  | 'lobby-guest' // nie-host w lobby → sama nawigacja (można wrócić)
  | 'casual' // mecz towarzyski w toku → nawigacja (defaultMove gra dalej)
  | 'ranked' // mecz rankingowy w toku → games:abandon (walkower, pełna kara)

/** Fazy, w których mecz jest „w toku" z punktu widzenia wyjścia. */
const IN_PROGRESS_PHASES: MatchPhase[] = ['planning', 'resolving', 'revealing', 'paused']

/**
 * Dobiera wariant wyjścia. `null` = brak trwałego przycisku (finished/cancelled
 * mają własne `goBack`, stany błędu też).
 */
export function exitVariantFor(
  phase: MatchPhase | undefined,
  ranked: boolean,
  isHost: boolean,
): ExitVariant | null {
  if (!phase) return null
  if (phase === 'lobby') return isHost ? 'lobby-host' : 'lobby-guest'
  if (IN_PROGRESS_PHASES.includes(phase)) return ranked ? 'ranked' : 'casual'
  return null
}

/**
 * Fix outcomeFor: etykieta rundy liczona z `roundWinner` eventu (unikalny lider
 * = win, remis na szczycie [roundWinner === null] = draw dla wszystkich, reszta
 * = lose) — NIE ze znaku punktów rundy, który przy ujemnych sumach parowych
 * potrafił kłamać.
 */
export function roundOutcomeFor(
  roundWinner: string | null | undefined,
  playerId: string,
): 'win' | 'draw' | 'lose' {
  if (roundWinner == null) return 'draw'
  return roundWinner === playerId ? 'win' : 'lose'
}
