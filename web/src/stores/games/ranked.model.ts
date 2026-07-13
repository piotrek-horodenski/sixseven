import type { CollectionDoc } from '@/composables/useCollection'

/**
 * Modele ranked (Etap 4e) — lustra kolekcji `ratings` (publiczna) i `queue`
 * (row-level: tylko własne wpisy). Pisze wyłącznie serwis games.
 * Kontrakt: docs/ETAP4_DE_CONTRACT.md §1.
 */

/** Dokument `ratings` — `_id = ${gameId}_${userId}` (deterministyczny upsert). */
export interface Rating extends CollectionDoc {
  gameId: string
  userId: string
  /** ELO; start 1200. */
  elo: number
  /** Rozegrane mecze rankingowe. */
  matches: number
  /** K użyte przy ostatniej aktualizacji (informacyjnie). */
  k: number
  updatedAt?: number
}

export type QueueStatus = 'waiting' | 'proposed' | 'matched'

/** Dokument `queue` — własny wpis kolejki szybkiego meczu. */
export interface QueueEntry extends CollectionDoc {
  gameId: string
  userId: string
  elo: number
  /** Epoch ms wejścia do kolejki („koniec kolejki" = nowy since). */
  since: number
  status: QueueStatus
  proposalId?: string
  /** now + 10 000 przy statusie 'proposed'. */
  proposalDeadline?: number
  /** Przy 'matched' — klient bierze handoff i wchodzi do gry. */
  matchId?: string
  updatedAt?: number
}

/** Limit wpisów rankingu gry (sort klientem, kontrakt §4). */
export const RATING_TOP_LIMIT = 50

/** ELO startowe — brak wpisu w ratings traktujemy jak tę wartość. */
export const DEFAULT_ELO = 1200
