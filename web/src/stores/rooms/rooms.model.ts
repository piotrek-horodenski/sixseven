import type { CollectionDoc } from '@/composables/useCollection'

/** Rodzaj widoczności pokoju — lustro `rooms.visibility` (gate rooms.schema). */
export type RoomVisibility = 'public' | 'private'

/** Status pokoju — 'open' (można dołączać/startować), 'matched' (mecz gotowy), 'closed'. */
export type RoomStatus = 'open' | 'matched' | 'closed'

/** Rodzaj uczestnika — zalogowany user albo gość (sesja z linku). */
export type MemberKind = 'user' | 'guest'

export interface RoomMember {
  id: string
  kind: MemberKind
  nick: string
}

/**
 * Dokument `rooms` (Etap 2d). Row-level: gate oddaje publiczne otwarte LUB te,
 * w których jesteś członkiem (por. subscriptions/policies.ts). Nie da się
 * podejrzeć cudzego prywatnego pokoju filtrem klienta.
 */
export interface Room extends CollectionDoc {
  code: string
  gameId: string
  name: string
  hostId: string
  hostKind: MemberKind
  visibility: RoomVisibility
  status: RoomStatus
  members: RoomMember[]
  matchId: string | null
  createdAt?: number
  updatedAt?: number
  /** Date (TTL 24h) — serwer serializuje jako string/ISO albo number. */
  expiresAt?: string | number
}

export const RPS_GAME_ID = 'rps'

/** Domyślny cel meczu RPS zakładanego z grą (mecz powstaje od razu przy `rooms:create`). */
export const DEFAULT_TARGET = 2
