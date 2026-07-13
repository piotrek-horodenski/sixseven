import type { CollectionDoc } from '@/composables/useCollection'

/**
 * Modele katalogu gier (Etap 4d) — lustro PUBLICZNEJ kolekcji `games`
 * (docs/ETAP4_DE_CONTRACT.md §1). Pisze wyłącznie serwis games; web tylko
 * subskrybuje. `serviceUrl` i `hmacSecret` NIGDY tu nie występują — żyją w
 * prywatnej kolekcji `registrations` po stronie games.
 */

export type CatalogGameStatus = 'registered' | 'published' | 'unpublished'

export type BadgeSentiment = 'positive' | 'neutral' | 'negative'

/** Publiczna definicja odznaki z manifestu gry. */
export interface CatalogBadgeDef {
  badgeId: string
  sentiment: BadgeSentiment
  labelKey?: string
}

/** Publiczny podzbiór manifestu gry — bez sekretów. */
export interface CatalogManifest {
  version: string
  minPlayers: number
  maxPlayers: number
  planningPhaseMs: number
  defaultTarget?: number
  badges?: CatalogBadgeDef[]
  playerPrefs?: unknown
}

/**
 * Dokument `games` (katalog). Polityka gate (row-level): published dla
 * wszystkich, własne (devAccountId == user) dla deweloperów, całość dla
 * uprawnienia `manage-games`.
 */
export interface CatalogGame extends CollectionDoc {
  name: string
  builtin: boolean
  status: CatalogGameStatus
  devAccountId: string | null
  /** Baza UI gry zewnętrznej (http(s)); null dla builtin. */
  uiUrl: string | null
  /** true TYLKO builtin (ADR „gry zewnętrzne = tylko towarzyskie"). */
  rankedEligible: boolean
  manifest: CatalogManifest
  createdAt?: number
  updatedAt?: number
  publishedAt?: number
}

/** Payload formularza rejestracji gry (dev:register-game). */
export interface RegisterGameForm {
  gameId: string
  name: string
  serviceUrl: string
  uiUrl: string
  manifest: {
    version: string
    minPlayers: number
    maxPlayers: number
    planningPhaseMs: number
  }
}

/** Slug gry — lustro walidacji games (kontrakt §1). */
export const GAME_ID_PATTERN = /^[a-z0-9-]{3,32}$/

/** Twarde minimum fazy planowania (ms) — lustro walidacji games. */
export const MIN_PLANNING_PHASE_MS = 2000
