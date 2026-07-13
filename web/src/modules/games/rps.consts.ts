import { t } from '@/i18n'
import type { RpsMove } from '@/stores/games/games.model'

export interface RpsMoveMeta {
  move: RpsMove
  /** Klucz i18n etykiety (prezentacja) — tłumacz przez t()/$t() przy renderze. */
  labelKey: string
  icon: string // font-awesome (zarejestrowane w font-awesome.config.ts)
}

/**
 * Kolejność = układ przycisków wyboru ruchu.
 * Determinizm: w stałych modułu trzymamy TYLKO klucze i18n, nigdy przetłumaczone
 * stringi — `move` (identyfikator do stanu/socketów) zostaje nietknięty.
 */
export const RPS_MOVES: RpsMoveMeta[] = [
  { move: 'rock', labelKey: 'games.moves.rock', icon: 'hand-back-fist' },
  { move: 'paper', labelKey: 'games.moves.paper', icon: 'hand' },
  { move: 'scissors', labelKey: 'games.moves.scissors', icon: 'hand-scissors' },
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

/** Prefiks id bota (Etap 4f) — spójny z games `BOT_ID_PREFIX`. */
export const BOT_ID_PREFIX = 'bot_'

/** Czy id należy do bota-zawodnika (niepodrabialny marker po prefiksie, nie po nicku). */
export function isBot(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.startsWith(BOT_ID_PREFIX)
}

/** Skrócony identyfikator gracza do wyświetlenia (2c nie ma jeszcze nazw). */
export function shortId(id: string | null | undefined): string {
  if (!id) return '—'
  return id.length <= 8 ? id : `…${id.slice(-6)}`
}

/**
 * Etykieta gracza: „Ty"/„You" dla siebie, skrócone id dla przeciwnika.
 * CZYSTA PREZENTACJA — wynik nie może trafić do stanu meczu ani na socket.
 * t() wołane przy każdym wywołaniu (bez cache), więc reaguje na zmianę locale.
 */
export function playerLabel(
  id: string | null | undefined,
  meId: string | null,
  nicks?: Record<string, string>,
): string {
  if (!id) return '—'
  if (id === meId) return t('games.you')
  // Denormalizowany nick z meczu (id→nick); fallback skrócone id.
  return nicks?.[id] || shortId(id)
}

/** Mapa faza → klucz i18n (same klucze w stałej — determinizm). */
const PHASE_LABEL_KEYS: Record<string, string> = {
  lobby: 'games.phase.lobby',
  planning: 'games.phase.planning',
  resolving: 'games.phase.resolving',
  revealing: 'games.phase.revealing',
  paused: 'games.phase.paused',
  finished: 'games.phase.finished',
  cancelled: 'games.phase.cancelled',
}

export function phaseLabel(phase: string): string {
  const key = PHASE_LABEL_KEYS[phase]
  return key ? t(key) : phase
}
