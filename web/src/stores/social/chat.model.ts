import type { CollectionDoc } from '@/composables/useCollection'

/**
 * Model czatu (Etap 4b). Osobny od `social.model.ts` (A4) — czat ma własny
 * store i subskrypcję kolekcji `messages`. Kształt dokumentu lustrzany do
 * `gate/app/models/messages.schema.ts` (część publiczna, bez `members` —
 * to pole jest tylko po stronie serwera do egzekwowania row-level).
 */

/** Zakres czatu — pokój (lobby), mecz albo DM 1:1. Lustro `messages.scope` w gate. */
export type ChatScope = 'room' | 'match' | 'dm'

/**
 * Kanał DM = posortowana para userId złączona '_' (identyczny po OBU stronach,
 * więc obaj subskrybują ten sam `scopeId`). Serwer waliduje parę + znajomość.
 */
export function dmChannel(a: string, b: string): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`
}

/**
 * Dokument `messages` widziany przez klienta. Row-level: gate AND-uje politykę
 * `{ members: user._id }`, więc subskrybent dostaje TYLKO wiadomości pokoi/meczów,
 * których jest członkiem — filtr klienta `{ scope, scopeId }` może jedynie zawęzić.
 */
export interface ChatMessage extends CollectionDoc {
  scope: ChatScope
  scopeId: string
  authorId: string
  authorNick: string
  text: string
  ts: number
  createdAt?: number
}

/**
 * Maksymalna długość wiadomości. UWAGA: to tylko szybki feedback UX — limit jest
 * egzekwowany SERWEROWO (gate `MAX_CHAT_LEN`). Nie ufamy klientowi (I).
 */
export const MAX_CHAT_LEN = 500
