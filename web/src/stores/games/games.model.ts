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
  /** Denormalizowane nazwy graczy (id→nick) do wyświetlenia w grze (Etap 4). */
  nicks?: Record<string, string>
  /** Kod pokoju — link zaproszenia gościa (`/r/CODE`) przy niepełnym rosterze. */
  roomCode?: string | null
  /** Docelowa liczba graczy (RPS=2). Mecz jest „otwarty" (czeka na przeciwnika), gdy
   *  `players.length + (guestIds?.length||0) < capacity`. Backend Etap 3 pkt 1. */
  capacity?: number
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
  /** Walkower (4e): kto poddał/rozłączył się i kto wygrywa — pisze games. */
  walkover?: { loserId: string; winnerId: string; reason: 'abandoned' | 'disconnected' } | null
  /** Idempotencja naliczenia ELO po stronie games (informacyjnie). */
  eloApplied?: boolean
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
  /** Skumulowane punkty po tej rundzie, wszyscy gracze (mogą być UJEMNE). */
  scores: Record<string, number>
  target: number
  yourMove: RpsMove
  /** Ruchy WSZYSTKICH graczy, jawne po zamknięciu rundy (I2). */
  moves: RpsRevealedMove[]
  /** Punkty TEJ rundy per gracz (suma parowa; suma po wszystkich = 0). */
  roundPoints: Record<string, number>
  /** Lider rundy (unikalnie najwyższe roundPoints) lub `null` przy remisie na szczycie. */
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
