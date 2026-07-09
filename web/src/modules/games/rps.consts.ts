import type { RpsMove } from '@/stores/games/games.model'

export interface RpsMoveMeta {
  move: RpsMove
  label: string
  icon: string // font-awesome (zarejestrowane w font-awesome.config.ts)
}

/** Kolejność = układ przycisków wyboru ruchu. */
export const RPS_MOVES: RpsMoveMeta[] = [
  { move: 'rock', label: 'Kamień', icon: 'hand-back-fist' },
  { move: 'paper', label: 'Papier', icon: 'hand' },
  { move: 'scissors', label: 'Nożyce', icon: 'hand-scissors' },
]

const BY_MOVE: Record<RpsMove, RpsMoveMeta> = RPS_MOVES.reduce(
  (acc, m) => ({ ...acc, [m.move]: m }),
  {} as Record<RpsMove, RpsMoveMeta>,
)

export function moveMeta(move: RpsMove): RpsMoveMeta {
  return BY_MOVE[move]
}

/** Czas animacji odsłonięcia (ms). Krótszy niż deadline revealu w silniku. */
export const REVEAL_MS = 1600

/** Skrócony identyfikator gracza do wyświetlenia (2c nie ma jeszcze nazw). */
export function shortId(id: string | null | undefined): string {
  if (!id) return '—'
  return id.length <= 8 ? id : `…${id.slice(-6)}`
}

/** Etykieta gracza: „Ty" dla siebie, skrócone id dla przeciwnika. */
export function playerLabel(id: string | null | undefined, meId: string | null): string {
  if (!id) return '—'
  return id === meId ? 'Ty' : shortId(id)
}

const PHASE_LABELS: Record<string, string> = {
  lobby: 'Gotowy do startu',
  planning: 'Trwa runda',
  resolving: 'Rozstrzyganie',
  revealing: 'Odsłona',
  paused: 'Wstrzymany',
  finished: 'Zakończony',
  cancelled: 'Anulowany',
}

export function phaseLabel(phase: string): string {
  return PHASE_LABELS[phase] ?? phase
}
