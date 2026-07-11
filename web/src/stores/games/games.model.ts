import type { CollectionDoc } from '@/composables/useCollection'

/** Fazy meczu — lustro `matches.phase` w silniku games (matches.schema.ts). */
export type MatchPhase =
  | 'lobby'
  | 'planning'
  | 'resolving'
  | 'revealing'
  | 'finished'
  | 'paused'
  | 'cancelled'

/**
 * Dokument `matches` widziany przez gracza (row-level: gate oddaje tylko mecze,
 * w których gracz uczestniczy, bez treści ruchów). `ready` to sam FAKT złożenia
 * ruchu — nigdy treść (I1/I3).
 */
export interface Match extends CollectionDoc {
  gameId: string
  players: string[]
  guestIds?: string[]
  ranked: boolean
  phase: MatchPhase
  round: number
  deadline: number | null
  ready: Record<string, boolean>
  /** Gotowość w fazie lobby (Etap 3 pkt 5) — mapa playerId->bool, brama startu Planning. */
  lobbyReady?: Record<string, boolean>
  score: Record<string, number>
  options: Record<string, unknown>
  endReason: string | null
  createdAt?: number
  updatedAt?: number
}

export type RpsMove = 'rock' | 'paper' | 'scissors'

/** Odsłonięty ruch po zamknięciu fazy (I2) — kształt z catalog/rps resolve(). */
export interface RpsRevealedMove {
  playerId: string
  move: RpsMove
  defaulted?: boolean
}

/** Zawartość `match_views.view` dla RPS (por. catalog/rps/src/rps.ts). */
export interface RpsRoundView {
  scores: Record<string, number>
  target: number
  yourMove: RpsMove
  moves: RpsRevealedMove[]
  roundWinner: string | null
}

/**
 * Dokument `match_views` — jeden na (mecz, gracz, runda). Row-level wymusza
 * `playerId == user`, więc gracz nigdy nie dostanie cudzego widoku.
 */
export interface MatchView extends CollectionDoc {
  matchId: string
  playerId: string
  round: number
  view: RpsRoundView | null
  updatedAt?: number
}

export const RPS_GAME_ID = 'rps'

/** Fazy, w których mecz jest „w toku" (widoczny w aktywnej sekcji lobby). */
export const ACTIVE_PHASES: MatchPhase[] = ['lobby', 'planning', 'resolving', 'revealing', 'paused']
export const DONE_PHASES: MatchPhase[] = ['finished', 'cancelled']
