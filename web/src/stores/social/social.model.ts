import type { CollectionDoc } from '@/composables/useCollection'

/**
 * Modele społecznościowe (Etap 4a). Lustro kolekcji gate:
 *  - `friendships` — relacje znajomości (para znormalizowana `a<b`,
 *    `invitedBy` rozróżnia kierunek zaproszenia),
 *  - `presence`    — status obecności widoczny WYŁĄCZNIE znajomym
 *    (gate filtruje po `visibleTo`; klient nie da się nim poszerzyć).
 *
 * Row-level bezpieczeństwo jest po stronie serwera — subskrybujemy z pustym
 * filtrem, a gate AND-uje politykę (`friendships`: a|b == ja; `presence`:
 * ja ∈ visibleTo). Por. `docs/ETAP4_ABC_CONTRACT.md`, obszar A1/A4.
 */

/** Status relacji: zaproszony (oczekuje) albo zaakceptowany (obopólny). */
export type FriendshipStatus = 'invited' | 'accepted'

/** Status obecności znajomego (agregat sesji po stronie gate). */
export type PresenceStatus = 'online' | 'lobby' | 'match'

/** Status prezentowany w UI — presence + syntetyczny `offline` (brak dokumentu). */
export type FriendPresence = PresenceStatus | 'offline'

/**
 * Dokument `friendships`. Para jest znormalizowana (`a < b` leksykalnie), więc
 * NIE zakładaj, że `a` to inicjator — kierunek trzyma `invitedBy`.
 */
export interface Friendship extends CollectionDoc {
  a: string
  b: string
  status: FriendshipStatus
  invitedBy: string
  /** Denormalizowane nazwy stron (id→username) do wyświetlenia. */
  nicks?: Record<string, string>
  createdAt?: number
  updatedAt?: number
}

/**
 * Dokument `presence`. `currentMatchId` bywa pominięty (tryb niewidzialny gate),
 * a `status` zdegradowany do `online` — klient nie musi tego wiedzieć.
 */
export interface Presence extends CollectionDoc {
  userId: string
  status: PresenceStatus
  lastSeen?: number
  currentMatchId?: string | null
  visibleTo?: string[]
  updatedAt?: number
}

/** Znajomy gotowy do wyświetlenia — druga strona relacji + wyliczony presence. */
export interface Friend {
  userId: string
  /** Nazwa do wyświetlenia (username; fallback = userId). */
  nick: string
  friendshipId: string
  status: FriendPresence
  currentMatchId: string | null
}

/** Zaproszenie (przychodzące lub wychodzące) w widoku UI. */
export interface PendingInvite {
  userId: string
  /** Nazwa do wyświetlenia (username; fallback = userId). */
  nick: string
  friendshipId: string
  invitedBy: string
}
