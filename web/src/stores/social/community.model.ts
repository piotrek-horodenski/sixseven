import type { CollectionDoc } from '@/composables/useCollection'

/**
 * Modele współdzielone przez widoki „community" (Etap 4b): publiczny profil,
 * historia meczów i adnotacje/odznaki. Osobny plik od `social.model.ts` (A4)
 * i `chat.model.ts`, żeby nie dotykać cudzych hotspotów.
 */

/** Sentyment adnotacji — lustro `annotations.sentiment` w games. */
export type AnnotationSentiment = 'positive' | 'neutral' | 'negative'

/**
 * Dokument `annotations` (kolekcja należy do games, `exposed`). Widoczność
 * egzekwuje POLITYKA gate: `{ $or: [{ sentiment:'positive' }, { playerId: user._id }] }`
 * — pozytywne są publiczne, neutralne/negatywne widzi tylko właściciel. Klient
 * NIE może tego poszerzyć (filtr subskrypcji tylko zawęża).
 */
export interface Annotation extends CollectionDoc {
  playerId: string
  gameId: string
  badgeId: string
  sentiment: AnnotationSentiment
  params?: Record<string, unknown>
  earnedAt: number
  createdAt?: number
}

/** Wynik pojedynczego meczu z perspektywy gracza. */
export type MatchResult = 'win' | 'loss' | 'draw'

/** Agregat rozgrywek gracza w jednej grze (win/loss/draw). */
export interface PlayerHistoryGame {
  gameId: string
  played: number
  wins: number
  losses: number
  draws: number
}

/** Pozycja listy ostatnich meczów. */
export interface PlayerHistoryRecent {
  matchId: string
  gameId: string
  finishedAt: number | null
  result: MatchResult
  score?: Record<string, number>
}

/** Historia meczów gracza — kształt z `games` /command/player-history (A3). */
export interface PlayerHistory {
  games: PlayerHistoryGame[]
  recent: PlayerHistoryRecent[]
}

/** Publiczny profil zwracany przez `profile:get` (A2). Bez email/roles/sessions. */
export interface PublicProfile {
  userId: string
  display: string
  history: PlayerHistory
}
